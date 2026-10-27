package phanphoi.server.net;

import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.LineReader;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.common.ProtocolException;
import phanphoi.server.MessageLog;
import phanphoi.server.ServerContext;
import phanphoi.server.ServiceException;
import phanphoi.server.security.SecurityMonitor;
import phanphoi.server.security.SessionStats;

import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Phiên làm việc của một chi nhánh: tách tin, kiểm tra trạng thái đăng nhập, gọi nghiệp vụ, heartbeat.
 * Một kết nối dùng chung cho request và push (SRS 2.4). Vận chuyển byte do {@link Transport} đảm nhiệm,
 * nên cùng một lớp này chạy được trên server BIO và NIO.
 *
 * <p>Các dòng của một kết nối luôn được xử lý tuần tự theo thứ tự đến (BIO: chính luồng đọc;
 * NIO: hàng đợi tuần tự riêng của kết nối trên worker pool).
 */
public final class ClientHandler {

    /** Lệnh được phép trước khi đăng nhập (SRS 4.1). */
    private static final Set<Command> BEFORE_LOGIN = EnumSet.of(Command.LOGIN, Command.PING, Command.PONG);

    /** Lệnh chỉ đi từ chi nhánh lên server. */
    private static final Set<Command> FROM_CLIENT = EnumSet.of(
            Command.LOGIN, Command.INVENTORY_GET, Command.SALE, Command.SET_THRESHOLD, Command.LOW_STOCK,
            Command.ACCEPT, Command.REJECT, Command.RECEIVED, Command.HISTORY_GET, Command.PING, Command.PONG,
            Command.LOGOUT, Command.TRANSFER_ACCEPT, Command.TRANSFER_REJECT, Command.DEBT_GET, Command.SECURITY_REPORT,
            Command.NOTICE_REPLY);

    private static final AtomicLong SEQ = new AtomicLong();

    private final ServerContext ctx;
    private final Transport transport;
    /** Mã phiên tăng dần, để trang Giám sát ngắt đúng phiên. */
    private final long id = SEQ.incrementAndGet();
    private final SessionStats stats = new SessionStats(System.currentTimeMillis());

    private volatile String maCn;
    private volatile long lastReadAt = System.currentTimeMillis();
    /** Hạn chót nhận PONG (ms); 0 = không chờ. */
    private volatile long pongDeadline;
    private volatile boolean closed;

    public ClientHandler(ServerContext ctx, Transport transport) {
        this.ctx = ctx;
        this.transport = transport;
    }

    public String maCn() {
        return maCn;
    }

    public String remote() {
        return transport.remote();
    }

    public String ip() {
        return transport.ip();
    }

    public long id() {
        return id;
    }

    public SessionStats stats() {
        return stats;
    }

    /** Dòng ERROR|E06 cho kết nối bị từ chối vì IP đang bị chặn. */
    static byte[] bannedLine(String description) {
        return line(Message.of(Command.ERROR, ErrorCode.E06.name(), description));
    }

    /** Gọi khi kết nối vừa mở. */
    void onOpen() {
        ctx.registry().opened(this);
        ctx.security().onOpen(stats, ip(), System.currentTimeMillis());
    }

    /** Dòng ERROR gửi cho kết nối bị từ chối vì server đã đủ maxClients kết nối. */
    static byte[] serverFullLine(int maxClients) {
        return line(Message.of(Command.ERROR, ErrorCode.E03.name(), "Server da du " + maxClients + " ket noi"));
    }

    /** Một dòng vừa đọc được (không gồm \n), hoặc {@link LineReader#TOO_LONG}. */
    void onLine(String line) {
        long now = System.currentTimeMillis();
        lastReadAt = now;
        pongDeadline = 0;
        if (line == LineReader.TOO_LONG) {
            ctx.log().log(maCn, MessageLog.IN, "?", "<dong dai hon " + Protocol.MAX_LINE_BYTES + " byte>");
            sendError(ErrorCode.E01, "Dong tin dai qua " + Protocol.MAX_LINE_BYTES + " byte");
            malformed("<dong dai hon " + Protocol.MAX_LINE_BYTES + " byte>", now);
            return;
        }
        Message msg;
        try {
            msg = Protocol.decode(line);
        } catch (ProtocolException e) {
            ctx.log().log(maCn, MessageLog.IN, firstToken(line), line);
            sendError(ErrorCode.E01, e.getMessage());
            malformed(line, now);
            return;
        }
        ctx.log().log(maCn, MessageLog.IN, msg.command().name(), line);
        if (ctx.security().onMessage(stats, ip(), maCn, msg.command(), now) == SecurityMonitor.Action.KICK) {
            sendError(ErrorCode.E06, "Gui lenh don dap, ngat phien");
            close();
            return;
        }
        try {
            dispatch(msg);
        } catch (ServiceException e) {
            sendError(e.code(), e.getMessage());
            if (e.code() == ErrorCode.E01) {
                malformed(line, now);
            } else if (e.code() == ErrorCode.E04
                    && ctx.security().onNotFound(stats, ip(), maCn, msg.command(), now) == SecurityMonitor.Action.KICK) {
                sendError(ErrorCode.E06, "Do ma yeu cau cua chi nhanh khac, ngat phien");
                close();
            }
        } catch (ProtocolException e) {
            sendError(ErrorCode.E01, e.getMessage());
            malformed(line, now);
        } catch (SQLException e) {
            System.err.println("[" + who() + "] loi CSDL: " + e.getMessage());
            sendError(ErrorCode.E03, "Loi CSDL, thu lai sau");
        } catch (RuntimeException e) {
            e.printStackTrace();
            sendError(ErrorCode.E03, "Loi server: " + e.getMessage());
        }
    }

    /** E01 / dòng quá dài: FUZZING theo IP; IP vừa bị chặn thì đóng kết nối. */
    private void malformed(String sample, long now) {
        if (ctx.security().onMalformed(ip(), maCn, sample, now)) {
            close();
        }
    }

    /** Kết nối đã đóng (do client, do lỗi hoặc do server): dọn phiên. */
    void onClosed() {
        closed = true;
        ctx.registry().closed(this);
        ctx.security().onClose(stats, ip());
    }

    private void dispatch(Message m) throws ProtocolException, SQLException {
        Command cmd = m.command();
        if (!FROM_CLIENT.contains(cmd)) {
            throw new ServiceException(ErrorCode.E01, "Lenh " + cmd + " chi di tu server xuong chi nhanh");
        }
        if (maCn == null && !BEFORE_LOGIN.contains(cmd)) {
            throw new ServiceException(ErrorCode.E02, "Chua dang nhap");
        }
        // Từ đây mã CN luôn lấy từ phiên, không lấy từ tham số (NFR-07).
        String cn = maCn;
        if (cmd == Command.INVENTORY_GET || cmd == Command.HISTORY_GET) {
            long days = cmd == Command.HISTORY_GET ? historyDays(m.param(0), m.param(1)) : 0;
            if (ctx.security().onRead(stats, ip(), cn, cmd, days, System.currentTimeMillis())
                    == SecurityMonitor.Action.REJECT) {
                throw new ServiceException(ErrorCode.E06, "Vuot gioi han doc du lieu, thu lai sau");
            }
        }
        switch (cmd) {
            case LOGIN -> login(m.param(0).trim(), m.param(1));
            case PING -> send(Message.of(Command.PONG));
            case PONG -> { } // đã cập nhật lastReadAt
            case LOGOUT -> logout();
            case INVENTORY_GET -> send(ctx.stock().inventoryMessage(cn));
            case SALE -> send(ctx.stock().sale(cn, m.param(0).trim(), m.intParam(1)));
            case SET_THRESHOLD -> {
                ctx.stock().setThreshold(cn, m.param(0).trim(), m.intParam(1));
                send(ctx.stock().inventoryMessage(cn));
            }
            case LOW_STOCK -> ctx.requests().lowStock(cn, m.param(0).trim(), m.intParam(1), m.intParam(2));
            case ACCEPT -> ctx.requests().accept(cn, m.intParam(0), m.intParam(1)).forEach(this::send);
            case REJECT -> ctx.requests().reject(cn, m.intParam(0));
            case RECEIVED -> {
                send(ctx.requests().received(cn, m.intParam(0), m.intParam(1)));
                send(ctx.stock().inventoryMessage(cn));
            }
            case HISTORY_GET -> send(ctx.stock().historyMessage(cn, m.param(0), m.param(1)));
            case TRANSFER_ACCEPT -> send(ctx.transfers().accept(cn, m.intParam(0)));
            case TRANSFER_REJECT -> ctx.transfers().reject(cn, m.intParam(0));
            case DEBT_GET -> {
                Message debt = ctx.debts().debtMessage(cn);
                if (debt != null) {
                    send(debt);
                }
            }
            case NOTICE_REPLY -> send(ctx.notices().reply(cn, m.intParam(0), m.param(1), m.intParam(2)));
            case SECURITY_REPORT ->
                    ctx.security().onClientReport(stats, ip(), cn, m.param(0), m.param(1), System.currentTimeMillis());
            default -> throw new ServiceException(ErrorCode.E01, "Lenh khong ho tro: " + cmd);
        }
    }

    /** Độ dài khoảng ngày của HISTORY_GET; để trống một đầu là không giới hạn. Sai định dạng thì 0 (lỗi E01 sau). */
    static long historyDays(String tu, String den) {
        if (tu == null || tu.isBlank() || den == null || den.isBlank()) {
            return Long.MAX_VALUE;
        }
        try {
            return ChronoUnit.DAYS.between(LocalDate.parse(tu.trim()), LocalDate.parse(den.trim())) + 1;
        } catch (DateTimeParseException e) {
            return 0;
        }
    }

    private void login(String id, String password) throws SQLException {
        if (maCn != null) {
            throw new ServiceException(ErrorCode.E03, "Da dang nhap voi ma " + maCn);
        }
        var branch = ctx.auth().verify(id, password);
        if (branch != null && branch.ambiguous()) {
            send(Message.of(Command.LOGIN_FAIL, "Email dung chung. Hay nhap ma CN trong o xac dinh chi nhanh (CN01/CN02)."));
            return;
        }
        if (branch == null) {
            send(Message.of(Command.LOGIN_FAIL, Protocol.LOGIN_FAIL_WRONG));
            if (ctx.security().onLoginFail(ip(), id.substring(0, Math.min(id.length(), 10)), System.currentTimeMillis())) {
                sendError(ErrorCode.E06, "Dang nhap sai qua nhieu lan, IP bi chan"); close();
            }
            return;
        }
        String canonical = branch.code();
        if (!ctx.registry().login(canonical, this)) {
            // Thông tin đã xác thực đúng nhưng chi nhánh còn phiên hoạt động khác.
            // Không đẩy phiên cũ ra, không gửi dữ liệu hay tạo phiên cho người đăng nhập sau.
            long now = System.currentTimeMillis();
            ClientHandler active = ctx.registry().get(canonical);
            if (active != null) {
                active.send(Message.of(Command.DUPLICATE_LOGIN_ALERT,
                        java.time.LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(now),
                                java.time.ZoneId.systemDefault()).toString(), ip()));
            }
            ctx.security().record("SERVER", "DUPLICATE_LOGIN", "HIGH", ip(), canonical,
                    "Da tu choi ket noi dang nhap thu hai; phien dang hoat dong duoc giu nguyen", "NGAT", now);
            send(Message.of(Command.LOGIN_FAIL, Protocol.LOGIN_FAIL_ONLINE));
            return;
        }
        maCn = canonical;
        ctx.security().onLogin(stats, ip(), System.currentTimeMillis());
        ctx.security().onSuccessfulLogin(canonical, ip(), System.currentTimeMillis());
        if (!ctx.quiet()) {
            System.out.println("[server] " + canonical + " dang nhap tu " + remote());
        }
        send(Message.of(Command.LOGIN_OK, canonical, branch.name()));
        ctx.outbox().deliverOnLogin(canonical, this);
    }

    private void logout() {
        String id = maCn;
        if (id != null) {
            ctx.registry().logout(id, this);
            if (!ctx.quiet()) {
                System.out.println("[server] " + id + " dang xuat");
            }
        }
        close();
    }

    /** Gửi một tin; false nếu kết nối đã hỏng (bên gọi có thể xếp hàng lại). */
    public boolean send(Message m) {
        if (closed) {
            return false;
        }
        if (!transport.write(line(m))) {
            return false;
        }
        stats.sent();
        ctx.log().log(maCn, MessageLog.OUT, m.command().name(), m.toLine());
        return true;
    }

    private static byte[] line(Message m) {
        return (m.toLine() + "\n").getBytes(StandardCharsets.UTF_8);
    }

    private void sendError(ErrorCode code, String description) {
        send(Message.of(Command.ERROR, code.name(), description));
    }

    /** Gọi định kỳ bởi bộ hẹn giờ heartbeat (FR-04). */
    void checkHeartbeat(long now, long idleMs, long pongTimeoutMs) {
        if (closed) {
            return;
        }
        // PRELOGIN_IDLE: mở kết nối mà không LOGIN (chiếm chỗ max.clients)
        if (maCn == null && ctx.security().onPreloginTimeout(stats, ip(), now)) {
            sendError(ErrorCode.E06, "Qua thoi gian dang nhap");
            close();
            return;
        }
        long deadline = pongDeadline;
        if (deadline > 0 && now >= deadline) {
            System.out.println("[server] " + who() + " khong tra PONG, dong ket noi");
            close();
            return;
        }
        if (deadline == 0 && now - lastReadAt >= idleMs) {
            pongDeadline = now + pongTimeoutMs;
            send(Message.of(Command.PING));
        }
    }

    /** Kiểm tra ngay kết nối còn sống không: gửi PING, chờ PONG tối đa 5 giây. */
    void probe() {
        long deadline = System.currentTimeMillis() + 5_000;
        if (pongDeadline == 0 || pongDeadline > deadline) {
            pongDeadline = deadline;
        }
        send(Message.of(Command.PING));
    }

    public void close() {
        if (closed) {
            return;
        }
        closed = true;
        transport.close();
    }

    private String who() {
        return maCn != null ? maCn : remote();
    }

    private static String firstToken(String line) {
        int bar = line.indexOf('|');
        String t = (bar < 0 ? line : line.substring(0, bar)).trim();
        return t.isEmpty() ? "?" : t;
    }
}
