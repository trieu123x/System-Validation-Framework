package phanphoi.server.security;

import phanphoi.common.Command;
import phanphoi.server.security.SecurityRules.Mode;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

import static phanphoi.server.security.SecurityEvent.*;

/**
 * Giám sát an ninh phía server: đếm theo IP và theo phiên bằng cửa sổ trượt trong bộ nhớ (không gọi CSDL trên
 * đường đọc tin), phát sinh sự kiện và, ở chế độ block, chặn IP tạm thời / ngắt phiên / giới hạn tần suất.
 *
 * <p>Quy tắc theo IP không bao giờ chặn IP đang có phiên đã đăng nhập hợp lệ (nhiều chi nhánh sau một NAT).
 * CMD_FLOOD và IDOR_PROBE theo phiên: luôn ngắt đúng phiên vi phạm, kể cả khi IP có phiên hợp lệ khác; CMD_FLOOD
 * chặn thêm IP chỉ khi IP không còn phiên hợp lệ nào khác. Mọi phương thức nhận thời điểm
 * {@code nowMs} để unit test điều khiển được đồng hồ.
 */
public final class SecurityMonitor {

    /** Kết quả cho ClientHandler: không làm gì, trả ERROR|E06 cho tin này, hoặc ngắt phiên. */
    public enum Action { NONE, REJECT, KICK }

    /** Lệnh đụng tới YC/điều chuyển/thông báo theo mã: E04 ở đây là đoán mã của chi nhánh khác (IDOR_PROBE). */
    public static final Set<Command> ID_COMMANDS = EnumSet.of(Command.ACCEPT, Command.REJECT, Command.RECEIVED,
            Command.TRANSFER_ACCEPT, Command.TRANSFER_REJECT, Command.NOTICE_REPLY);

    /** Một loại sự kiện cho cùng một IP/phiên tối đa mỗi 10 giây, để tấn công kéo dài không làm ngập bảng. */
    private static final long DEDUPE_MS = 10_000;
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
    private static final int MAX_TRACKED = 50_000;

    static final class IpStats {
        final AtomicInteger conns = new AtomicInteger();
        final AtomicInteger authed = new AtomicInteger();
        final RateCounter connRate = new RateCounter(10);
        final RateCounter loginFail = new RateCounter(60);
        final RateCounter fuzz = new RateCounter(60);
        final RateCounter msgs = new RateCounter(60);
        final RateCounter prelogin = new RateCounter(60);
        volatile long lastSeen;
    }

    /**
     * Quá MAX_TRACKED IP: mọi IP mới dồn chung vào một mục, không thêm vào bảng (chặn làm tràn bộ nhớ bằng IP giả).
     * Mục chung không có phiên hợp lệ và không bị chặn theo IP vì không biết IP thật là ai.
     */
    private final IpStats overflow = new IpStats();
    /** DISCOVER đếm theo nhóm băm cố định: IP nguồn UDP giả mạo được nên không tạo mục theo IP. */
    private final RateCounter[] discoveryBuckets = new RateCounter[1024];

    private final SecurityRules rules;
    private final Supplier<Mode> mode;
    private final EventSink sink;
    private final BanList bans = new BanList();
    private final Map<String, IpStats> ips = new ConcurrentHashMap<>();
    /** maCn → (ip → lần đăng nhập sai cuối) cho CRED_STUFFING. */
    private final Map<String, Map<String, Long>> failsByBranch = new ConcurrentHashMap<>();
    private final Map<String, Long> lastEmit = new ConcurrentHashMap<>();
    private final RateCounter allMsgs = new RateCounter(10);
    /** Login failures are tracked per browser token, not for the whole Admin account or proxy IP. */
    private static final class AdminFailureState {
        final ArrayDeque<Long> failures = new ArrayDeque<>();
        long lockedUntil;
        long lastSeen;
    }
    private final Map<String, AdminFailureState> adminFailures = new ConcurrentHashMap<>();
    private final AtomicLong serverFull = new AtomicLong();
    private volatile long lastFullFlush;

    public SecurityMonitor(SecurityRules rules, Supplier<Mode> mode, EventSink sink) {
        this.rules = rules;
        this.mode = mode;
        this.sink = sink;
        for (int i = 0; i < discoveryBuckets.length; i++) {
            discoveryBuckets[i] = new RateCounter(2);
        }
    }

    public SecurityRules rules() {
        return rules;
    }

    public Mode mode() {
        return mode.get();
    }

    public BanList bans() {
        return bans;
    }

    public long droppedEvents() {
        return sink.dropped();
    }

    private boolean off() {
        return mode.get() == Mode.OFF;
    }

    private boolean blocking() {
        return mode.get() == Mode.BLOCK;
    }

    private IpStats ip(String ip, long now) {
        IpStats s = ips.get(ip);
        if (s == null) {
            // không dọn bảng trên đường accept/đọc tin (luồng Selector); tick() dọn mỗi phút
            if (ips.size() >= MAX_TRACKED) {
                return overflow;
            }
            s = ips.computeIfAbsent(ip, k -> new IpStats());
        }
        s.lastSeen = now;
        return s;
    }

    private boolean hasValidSession(String ip) {
        IpStats s = ips.get(ip);
        return s != null && s.authed.get() > 0;
    }

    // ================= sự kiện =================

    /**
     * Ghi sự kiện, trừ khi cùng loại + khóa vừa ghi trong 10 giây. Chặn IP, ngắt phiên, khóa tài khoản luôn được ghi;
     * ghi nhận và giới hạn tần suất (lặp lại theo từng tin) thì gộp.
     */
    private void emit(String key, long now, String nguon, String loai, String muc, String ip, String maCn,
                      String chiTiet, String hanhDong) {
        boolean always = CHAN_IP.equals(hanhDong) || NGAT.equals(hanhDong) || KHOA_TK.equals(hanhDong);
        String k = loai + "|" + key;
        Long last = lastEmit.get(k);
        if (!always && last != null && now - last < DEDUPE_MS) {
            return;
        }
        lastEmit.put(k, now);
        record(nguon, loai, muc, ip, maCn, chiTiet, hanhDong, now);
    }

    /** Ghi một sự kiện không qua bộ gộp (AdminApi: ADMIN_CSRF, thao tác chặn tay...). */
    public void record(String nguon, String loai, String muc, String ip, String maCn, String chiTiet, String hanhDong,
                       long now) {
        sink.emit(new SecurityEvent(LocalDateTime.ofInstant(Instant.ofEpochMilli(now), ZoneId.systemDefault()),
                nguon, loai, muc, ip, maCn, chiTiet, hanhDong));
    }

    /** Chặn IP (chỉ gọi khi block, hoặc admin chặn tay); @return thời điểm hết chặn. */
    private long ban(String ip, int minutes, long now) {
        return bans.ban(ip, minutes, now);
    }

    private static String hhmm(long ms) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(ms), ZoneId.systemDefault()).format(HHMM);
    }

    // ================= kết nối =================

    /**
     * Gọi khi accept, sau kiểm tra max.clients: IP bị chặn, hoặc CONN_FLOOD (kết nối đồng thời tính cả kết nối
     * này, tốc độ mở kết nối). Chưa tính là một kết nối: {@link #onOpen} mới tính, khi phiên đã tạo xong.
     * @return null nếu cho vào; ngược lại mô tả lỗi E06.
     */
    public String onAccept(String ip, long now) {
        if (off()) {
            return null;
        }
        long until = bans.bannedUntil(ip, now);
        if (until > 0) {
            return "IP bi chan den " + hhmm(until);
        }
        IpStats s = ip(ip, now);
        if (s == overflow) {
            return null; // bảng IP đã đầy: không theo dõi được IP này
        }
        int conns = s.conns.get() + 1;
        s.connRate.add(now);
        long rate10 = s.connRate.sum(now, 10);
        if (conns > rules.connMaxPerIp || rate10 > rules.connRatePer10s) {
            String detail = conns + " ket noi dong thoi, " + rate10 + " ket noi moi trong 10 s";
            if (blocking() && !hasValidSession(ip)) {
                long u = ban(ip, rules.banMinutes, now);
                emit(ip, now, SERVER, "CONN_FLOOD", HIGH, ip, null, detail + "; chan den " + hhmm(u), CHAN_IP);
                return "IP bi chan den " + hhmm(u);
            }
            emit(ip, now, SERVER, "CONN_FLOOD", HIGH, ip, null, detail, GHI_NHAN);
        }
        return null;
    }

    /**
     * Phiên đã tạo xong: tính một kết nối đồng thời của IP. Ghi vào phiên là đã tính, để {@link #onClose} chỉ trừ
     * đúng phần đã cộng (đổi security.mode lúc đang chạy không làm lệch bộ đếm).
     */
    public void onOpen(SessionStats st, String ip, long now) {
        if (off()) {
            return;
        }
        IpStats s = ip(ip, now);
        if (s != overflow) {
            s.conns.incrementAndGet();
            st.connCounted = true;
        }
    }

    /** Phiên đóng: trả lại kết nối đồng thời và phiên hợp lệ mà phiên này đã được tính. */
    public void onClose(SessionStats st, String ip) {
        IpStats s = ips.get(ip);
        if (s == null) {
            return;
        }
        if (st.connCounted) {
            s.conns.updateAndGet(n -> Math.max(0, n - 1));
        }
        if (st.authCounted) {
            s.authed.updateAndGet(n -> Math.max(0, n - 1));
        }
    }

    /** Từ chối vì đủ max.clients: gộp lại, mỗi phút ghi một sự kiện trong {@link #tick}. */
    public void onServerFull(long now) {
        if (!off()) {
            serverFull.incrementAndGet();
        }
    }

    /** LOGIN_OK: IP có thêm một phiên hợp lệ (quy tắc theo IP không chặn IP này). */
    public void onLogin(SessionStats st, String ip, long now) {
        if (off()) {
            return;
        }
        IpStats s = ip(ip, now);
        if (s != overflow) {
            s.authed.incrementAndGet();
            st.authCounted = true;
        }
    }

    /**
     * LOGIN_FAIL: BRUTE_FORCE theo IP, CRED_STUFFING theo mã chi nhánh.
     * @return true nếu IP vừa bị chặn (đóng kết nối này).
     */
    public boolean onLoginFail(String ip, String maCn, long now) {
        if (off()) {
            return false;
        }
        IpStats s = ip(ip, now);
        s.loginFail.add(now);
        long n = s.loginFail.sum(now, rules.loginFailWindowSec);
        String cn = maCn == null ? "" : maCn.length() > 10 ? maCn.substring(0, 10) : maCn;
        // CRED_STUFFING: một mã chi nhánh đăng nhập sai từ nhiều IP
        if (!cn.isEmpty() && failsByBranch.size() < MAX_TRACKED) {
            Map<String, Long> byIp = failsByBranch.computeIfAbsent(cn, k -> new ConcurrentHashMap<>());
            if (byIp.size() < 1000) {
                byIp.put(ip, now);
            }
            byIp.values().removeIf(t -> now - t > rules.credStuffingWindowSec * 1000L);
            Long last = lastEmit.get("CRED_STUFFING|" + cn);
            if (byIp.size() >= rules.credStuffingIps && (last == null || now - last >= DEDUPE_MS)) {
                // chỉ dựng chuỗi chi tiết khi thật sự ghi, và giới hạn 10 IP đầu
                emit(cn, now, SERVER, "CRED_STUFFING", HIGH, ip, cn, "Ma " + cn + " dang nhap sai tu " + byIp.size()
                        + " IP: " + byIp.keySet().stream().sorted().limit(10).toList(), GHI_NHAN);
            }
        }
        if (n < rules.loginFailMax) {
            return false;
        }
        String detail = n + " lan LOGIN_FAIL trong " + rules.loginFailWindowSec + " s, ma thu gan nhat " + cn;
        if (blocking() && !hasValidSession(ip)) {
            long u = ban(ip, rules.banMinutes, now);
            emit(ip, now, SERVER, "BRUTE_FORCE", HIGH, ip, cn, detail + "; chan den " + hhmm(u), CHAN_IP);
            return true;
        }
        emit(ip, now, SERVER, "BRUTE_FORCE", HIGH, ip, cn,
                detail + (hasValidSession(ip) ? "; IP co phien hop le nen khong chan" : ""), GHI_NHAN);
        return false;
    }

    /**
     * Kết nối mở quá security.prelogin.timeout.seconds mà chưa LOGIN.
     * @return true nếu nên đóng kết nối (chỉ khi block).
     */
    public boolean onPreloginTimeout(SessionStats st, String ip, long now) {
        if (off() || st.preloginHandled || now - st.openedAt < rules.preloginTimeoutSec * 1000L) {
            return false;
        }
        st.preloginHandled = true;
        IpStats s = ip(ip, now);
        s.prelogin.add(now);
        long n = s.prelogin.sum(now, 60);
        boolean block = blocking();
        if (n >= rules.preloginMaxPerMinute) {
            if (block && !hasValidSession(ip)) {
                long u = ban(ip, rules.shortBanMinutes, now);
                emit(ip, now, SERVER, "PRELOGIN_IDLE", MEDIUM, ip, null,
                        n + " ket noi khong LOGIN trong 1 phut; chan den " + hhmm(u), CHAN_IP);
            } else {
                emit(ip, now, SERVER, "PRELOGIN_IDLE", MEDIUM, ip, null, n + " ket noi khong LOGIN trong 1 phut", GHI_NHAN);
            }
        } else {
            emit(ip, now, SERVER, "PRELOGIN_IDLE", LOW, ip, null,
                    "Ket noi " + rules.preloginTimeoutSec + " s khong LOGIN" + (block ? ", da dong" : ""), block ? NGAT : GHI_NHAN);
        }
        return block;
    }

    // ================= tin =================

    /**
     * Mỗi dòng đã giải mã: đếm tin/giây của phiên (CMD_FLOOD: vượt ngưỡng liên tục floodSeconds giây).
     * @return KICK khi block và phiên đang flood.
     */
    public Action onMessage(SessionStats st, String ip, String maCn, Command cmd, long now) {
        st.in.incrementAndGet();
        st.lastCmd = cmd.name();
        if (off()) {
            return Action.NONE;
        }
        allMsgs.add(now);
        IpStats s = ip(ip, now);
        s.msgs.add(now);
        long inSecond = st.msgs.add(now);
        if (inSecond != rules.floodMsgsPerSecond + 1) {
            return Action.NONE;
        }
        // giây này vừa vượt ngưỡng: nối chuỗi giây liên tiếp
        long sec = now / 1000;
        st.floodStreak = st.lastOverSec == sec - 1 ? st.floodStreak + 1 : 1;
        st.lastOverSec = sec;
        if (st.floodStreak < rules.floodSeconds) {
            return Action.NONE;
        }
        String detail = "> " + rules.floodMsgsPerSecond + " tin/s lien tuc " + st.floodStreak + " s, lenh " + cmd;
        if (blocking()) {
            // luôn ngắt đúng phiên đang flood; chỉ chặn cả IP khi IP không còn phiên hợp lệ nào khác (NAT dùng chung IP)
            int others = s.authed.get() - (maCn != null ? 1 : 0);
            if (others <= 0) {
                long u = ban(ip, rules.shortBanMinutes, now);
                emit(ip, now, SERVER, "CMD_FLOOD", MEDIUM, ip, maCn, detail + "; ngat phien, chan IP den " + hhmm(u), NGAT);
            } else {
                emit(ip, now, SERVER, "CMD_FLOOD", MEDIUM, ip, maCn,
                        detail + "; ngat phien (IP con " + others + " phien hop le nen khong chan IP)", NGAT);
            }
            return Action.KICK;
        }
        emit(ip, now, SERVER, "CMD_FLOOD", MEDIUM, ip, maCn, detail, GHI_NHAN);
        return Action.NONE;
    }

    /**
     * INVENTORY_GET / HISTORY_GET (SCRAPING): quá scrapeMaxPerMinute trong 60 giây của một phiên, hoặc HISTORY_GET
     * xin khoảng dài hơn scrapeHistoryMaxDays ngày. @return REJECT (trả E06) khi block.
     */
    public Action onRead(SessionStats st, String ip, String maCn, Command cmd, long historyDays, long now) {
        if (off()) {
            return Action.NONE;
        }
        st.reads.add(now);
        long n = st.reads.sum(now, 60);
        String why = null;
        if (n > rules.scrapeMaxPerMinute) {
            why = n + " lenh doc du lieu trong 60 s";
        } else if (cmd == Command.HISTORY_GET && historyDays > rules.scrapeHistoryMaxDays) {
            why = "HISTORY_GET khoang " + (historyDays == Long.MAX_VALUE ? "khong gioi han" : historyDays + " ngay");
        }
        if (why == null) {
            return Action.NONE;
        }
        boolean block = blocking();
        emit(ip + "|" + maCn, now, SERVER, "SCRAPING", MEDIUM, ip, maCn, why + (block ? "; tu choi tin vuot muc" : ""),
                block ? GIOI_HAN : GHI_NHAN);
        return block ? Action.REJECT : Action.NONE;
    }

    /**
     * E01 / dòng quá dài từ một IP (FUZZING). @return true nếu IP vừa bị chặn (đóng kết nối).
     */
    public boolean onMalformed(String ip, String maCn, String sample, long now) {
        if (off()) {
            return false;
        }
        IpStats s = ip(ip, now);
        s.fuzz.add(now);
        long n = s.fuzz.sum(now, 60);
        if (n < rules.fuzzMaxPerMinute) {
            return false;
        }
        String detail = n + " dong sai dinh dang trong 60 s, mau: " + abbreviate(sample, 80);
        if (blocking() && !hasValidSession(ip)) {
            long u = ban(ip, rules.shortBanMinutes, now);
            emit(ip, now, SERVER, "FUZZING", MEDIUM, ip, maCn, detail + "; chan den " + hhmm(u), CHAN_IP);
            return true;
        }
        emit(ip, now, SERVER, "FUZZING", MEDIUM, ip, maCn, detail, GHI_NHAN);
        return false;
    }

    /** E04 cho lệnh theo mã YC/điều chuyển (IDOR_PROBE). @return KICK khi block và vượt ngưỡng. */
    public Action onNotFound(SessionStats st, String ip, String maCn, Command cmd, long now) {
        if (off() || !ID_COMMANDS.contains(cmd)) {
            return Action.NONE;
        }
        st.notFound.add(now);
        long n = st.notFound.sum(now, 60);
        if (n < rules.idorMaxPerMinute) {
            return Action.NONE;
        }
        String detail = n + " lan E04 voi ma YC/dieu chuyen khong thuoc chi nhanh trong 60 s, lenh " + cmd;
        if (blocking()) {
            emit(ip + "|" + maCn, now, SERVER, "IDOR_PROBE", MEDIUM, ip, maCn, detail + "; ngat phien", NGAT);
            return Action.KICK;
        }
        emit(ip + "|" + maCn, now, SERVER, "IDOR_PROBE", MEDIUM, ip, maCn, detail, GHI_NHAN);
        return Action.NONE;
    }

    /** UDP DISCOVER (DISCOVERY_FLOOD). @return false nếu nên bỏ qua gói này (chỉ khi block). */
    public boolean allowDiscovery(String ip, long now) {
        if (off()) {
            return true;
        }
        // IP nguồn UDP giả mạo được: đếm theo nhóm băm cố định (không tạo mục theo IP), sự kiện gộp chung cả server
        long n = discoveryBuckets[ip.hashCode() & (discoveryBuckets.length - 1)].add(now);
        if (n <= rules.discoveryPerSecond) {
            return true;
        }
        boolean block = blocking();
        emit("udp", now, SERVER, "DISCOVERY_FLOOD", LOW, ip, null, "> " + rules.discoveryPerSecond + " DISCOVER/s"
                + (block ? "; bo qua goi vuot muc" : ""), block ? GIOI_HAN : GHI_NHAN);
        return !block;
    }

    /**
     * SECURITY_REPORT từ client (dữ liệu không đáng tin): cắt chiTiet 500 ký tự, tối đa 1 tin/giây/phiên,
     * mã chi nhánh lấy từ phiên. @return false nếu bị bỏ vì vượt tần suất.
     */
    public boolean onClientReport(SessionStats st, String ip, String maCn, String loai, String chiTiet, long now) {
        if (off()) {
            return true;
        }
        if (now - st.lastReportAt < 1000) {
            return false;
        }
        st.lastReportAt = now;
        String type = clientType(loai);
        record(CLIENT, type, clientLevel(type), ip, maCn, abbreviate(chiTiet, 500), GHI_NHAN, now);
        return true;
    }

    /** Chuẩn hoá loại sự kiện client gửi lên: chỉ A-Z0-9_, tiền tố CLIENT_, tối đa 30 ký tự. */
    static String clientType(String loai) {
        String t = loai == null ? "" : loai.trim().toUpperCase().replaceAll("[^A-Z0-9_]", "_");
        if (!t.startsWith("CLIENT_")) {
            t = "CLIENT_" + t;
        }
        return t.length() > 30 ? t.substring(0, 30) : t;
    }

    static String clientLevel(String type) {
        return switch (type) {
            case "CLIENT_CSRF", "CLIENT_DNS_REBIND", "CLIENT_DISCOVERY_SPOOF" -> HIGH;
            case "CLIENT_SERVER_CHANGED", "CLIENT_BAD_SERVER_MSG", "CLIENT_API_FLOOD" -> MEDIUM;
            default -> LOW;
        };
    }

    /**
     * Request tới HTTP API admin có Origin/Host lạ (ADMIN_CSRF, ADMIN_DNS_REBIND). Request luôn bị trả 403
     * ở mọi chế độ (đây là bảo vệ, không phải thực nghiệm); security.mode chỉ quyết định có ghi sự kiện không.
     */
    public void onHttpViolation(String loai, String ip, String detail, long now) {
        if (!off()) {
            emit(ip, now, ADMIN, loai, HIGH, ip, null, abbreviate(detail, 300) + "; tra 403", GIOI_HAN);
        }
    }

    // ================= đăng nhập trang công ty =================

    /** @return thời điểm hết khóa của một trình duyệt, 0 nếu chưa bị khóa. */
    public long adminLockedUntil(String browserKey, long now) {
        if (off()) {
            return 0;
        }
        AdminFailureState s = adminFailures.get(browserKey);
        if (s == null) {
            return 0;
        }
        synchronized (s) {
            s.lastSeen = now;
            return s.lockedUntil > now ? s.lockedUntil : 0;
        }
    }

    /** Sai Admin đủ ngưỡng -> chỉ khóa browserKey này; vẫn áp dụng cả ở mode=detect. */
    public void onAdminLoginFail(String ip, String browserKey, long now) {
        if (off()) {
            return;
        }
        // Guard against unbounded memory use if very many unique browser cookies arrive.
        if (!adminFailures.containsKey(browserKey) && adminFailures.size() >= MAX_TRACKED) {
            throw new IllegalStateException("Too many tracked admin browsers; temporarily refusing new login attempts");
        }
        AdminFailureState s = adminFailures.computeIfAbsent(browserKey, k -> new AdminFailureState());
        synchronized (s) {
            s.lastSeen = now;
            if (s.lockedUntil > now) {
                return;
            }
            long cutoff = now - rules.adminLockWindowSec * 1000L;
            while (!s.failures.isEmpty() && s.failures.peekFirst() <= cutoff) {
                s.failures.removeFirst();
            }
            s.failures.addLast(now);
            if (s.failures.size() >= rules.adminLockFails) {
                s.lockedUntil = now + rules.adminLockMinutes * 60_000L;
                s.failures.clear();
                // Avoid storing the full browser credential in logs; only a short correlation prefix.
                String shortKey = browserKey.substring(0, Math.min(browserKey.length(), 8));
                emit("admin-browser-" + shortKey, now, ADMIN, "ADMIN_BRUTE_FORCE", HIGH, ip, null,
                        "Browser " + shortKey + ": sai mat khau " + rules.adminLockFails
                                + " lan trong " + rules.adminLockWindowSec + " s; khoa den "
                                + hhmm(s.lockedUntil), KHOA_TK);
            }
        }
    }

    /** Đăng nhập đúng: xóa các lỗi trước đó của đúng trình duyệt này. */
    public void onAdminLoginSuccess(String browserKey) {
        adminFailures.remove(browserKey);
    }

    // ================= quản trị =================

    /** Admin chặn tay (hiệu lực khi mode khác off). */
    public long banManually(String ip, int minutes, long now) {
        long u = bans.ban(ip, minutes, now);
        record(ADMIN, "ADMIN_BAN", MEDIUM, ip, null, "Admin chan IP " + minutes + " phut, den " + hhmm(u), CHAN_IP, now);
        return u;
    }

    public boolean unban(String ip, long now) {
        boolean had = bans.unban(ip);
        if (had) {
            record(ADMIN, "ADMIN_UNBAN", LOW, ip, null, "Admin bo chan IP", GHI_NHAN, now);
        }
        return had;
    }

    /** Mỗi giây (bộ hẹn giờ heartbeat): gộp SERVER_FULL theo phút, dọn bộ đếm cũ. */
    public void tick(long now) {
        if (now - lastFullFlush >= 60_000) {
            lastFullFlush = now;
            long n = serverFull.getAndSet(0);
            if (n > 0) {
                emit("full", now, SERVER, "SERVER_FULL", LOW, null, null, "Tu choi " + n + " ket noi vi du max.clients", GHI_NHAN);
            }
            cleanup(now);
        }
    }

    private void cleanup(long now) {
        ips.entrySet().removeIf(e -> e.getValue().conns.get() == 0 && now - e.getValue().lastSeen > 600_000);
        lastEmit.values().removeIf(t -> now - t > 600_000);
        failsByBranch.values().forEach(m -> m.values().removeIf(t -> now - t > rules.credStuffingWindowSec * 1000L));
        failsByBranch.values().removeIf(Map::isEmpty);
        long keepMs = Math.max(600_000L, (long) (rules.adminLockWindowSec + rules.adminLockMinutes * 60) * 1000L);
        adminFailures.entrySet().removeIf(e -> {
            AdminFailureState state = e.getValue();
            synchronized (state) {
                return state.lockedUntil <= now && now - state.lastSeen > keepMs;
            }
        });
    }

    /** Tin/giây toàn server, trung bình 10 giây. */
    public double msgsPerSecond(long now) {
        return allMsgs.sum(now, 10) / 10.0;
    }

    /** Bảng IP cho trang Giám sát: gồm IP đang theo dõi và IP đang bị chặn. */
    public List<Map<String, Object>> ipTable(long now) {
        Map<String, Long> banned = bans.active(now);
        Set<String> all = new TreeSet<>(ips.keySet());
        all.addAll(banned.keySet());
        List<Map<String, Object>> out = new ArrayList<>();
        for (String ip : all) {
            IpStats s = ips.get(ip);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ip", ip);
            m.put("ketNoi", s == null ? 0 : s.conns.get());
            m.put("phienHopLe", s == null ? 0 : s.authed.get());
            m.put("tinPhut", s == null ? 0 : s.msgs.sum(now, 60));
            m.put("loginFail", s == null ? 0 : s.loginFail.sum(now, 60));
            m.put("e01", s == null ? 0 : s.fuzz.sum(now, 60));
            Long until = banned.get(ip);
            String st;
            if (until != null) {
                st = "BI_CHAN";
            } else if (s != null && (s.loginFail.sum(now, 60) > 0 || s.fuzz.sum(now, 60) > 0
                    || s.prelogin.sum(now, 60) > 0 || s.conns.get() > rules.connMaxPerIp / 2)) {
                st = "NGHI_VAN";
            } else {
                st = "BINH_THUONG";
            }
            m.put("trangThai", st);
            m.put("chanDen", until == null ? null : LocalDateTime.ofInstant(Instant.ofEpochMilli(until), ZoneId.systemDefault())
                    .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            out.add(m);
        }
        return out;
    }

    static String abbreviate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max);
    }
}
