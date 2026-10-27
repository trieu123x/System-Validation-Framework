package phanphoi.client;

import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.web.OriginGuard;

import java.net.InetSocketAddress;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Giám sát an ninh ở máy chi nhánh (client.jar). Phát hiện trang web lạ gọi API cục bộ (CSRF, DNS rebinding),
 * gọi API dồn dập, nhiều server cùng trả lời discovery (giả mạo), server đổi địa chỉ và tin lạ từ server.
 *
 * <p>Giữ 100 sự kiện gần nhất cho trang /branch. Mỗi sự kiện được báo lên server bằng SECURITY_REPORT khi đã
 * đăng nhập, tối đa 1 tin/giây; lúc offline xếp tối đa 50 tin, gửi tiếp sau LOGIN_OK.
 */
final class ClientSecurity {

    record Event(String thoiGian, String loai, String muc, String chiTiet) {
    }

    private static final int KEEP = 100;
    private static final int PENDING = 50;
    private static final int DETAIL_MAX = 500;

    private final List<String> allowedOrigins;
    private final int apiMaxPerSecond;
    private final Deque<Event> recent = new ArrayDeque<>();
    private final Deque<Event> pending = new ArrayDeque<>();
    private long apiSecond = -1;
    private int apiCount;
    private long lastFloodEventAt;
    private long lastReportAt;
    /** Danh sách server cùng trả lời một lượt discovery gần nhất (≥ 2 thì có thể bị giả mạo). */
    private List<String> discoveryResponders = List.of();
    private String serverChanged;

    ClientSecurity(List<String> allowedOrigins, int apiMaxPerSecond) {
        this.allowedOrigins = allowedOrigins;
        this.apiMaxPerSecond = apiMaxPerSecond;
    }

    /**
     * Kiểm tra một request tới API cục bộ. @return false nếu phải trả 403 (đã ghi sự kiện).
     */
    synchronized boolean checkHttp(String method, String path, String origin, String host, long now) {
        countApi(now);
        OriginGuard.Verdict v = OriginGuard.check(origin, host, allowedOrigins);
        if (v == OriginGuard.Verdict.OK) {
            return true;
        }
        String loai = v == OriginGuard.Verdict.CSRF ? "CLIENT_CSRF" : "CLIENT_DNS_REBIND";
        add(loai, "HIGH", method + " " + path + " Origin=" + origin + " Host=" + host, now);
        return false;
    }

    synchronized void scrapingReport(String detail, long now) { add("CLIENT_SCRAPING", "MEDIUM", detail, now); }

    private void countApi(long now) {
        long sec = now / 1000;
        if (sec != apiSecond) {
            apiSecond = sec;
            apiCount = 0;
        }
        if (++apiCount == apiMaxPerSecond + 1 && now - lastFloodEventAt >= 10_000) {
            lastFloodEventAt = now;
            add("CLIENT_API_FLOOD", "MEDIUM", "> " + apiMaxPerSecond + " request/s toi API cuc bo", now);
        }
    }

    /**
     * Kết quả một lượt discovery. Gộp HERE theo máy gửi: server cùng máy trả lời cả qua 127.0.0.1 lẫn IP LAN
     * (nhiều card mạng) là một server. ≥ 2 máy khác nhau, hoặc một máy báo ≥ 2 cổng, thì cảnh báo giả mạo;
     * vẫn dùng server trả lời trước.
     */
    synchronized void onDiscovery(List<Discovery.Here> responders, long now) {
        Set<String> machines = machines(responders);
        if (machines.size() >= 2) {
            Set<String> addrs = new LinkedHashSet<>();
            responders.forEach(h -> addrs.add(h.server().getHostString() + ":" + h.server().getPort()));
            discoveryResponders = new ArrayList<>(addrs);
            add("CLIENT_DISCOVERY_SPOOF", "HIGH", machines.size() + " server cung tra loi discovery: " + addrs
                    + "; dung " + discoveryResponders.get(0), now);
        } else {
            discoveryResponders = List.of();
        }
    }

    /** Khóa "máy + cổng" của mỗi HERE; mọi HERE gửi từ chính máy này coi là một máy. */
    static Set<String> machines(List<Discovery.Here> responders) {
        Set<String> out = new LinkedHashSet<>();
        for (Discovery.Here h : responders) {
            out.add((h.local() ? "may-nay" : h.source()) + ":" + h.server().getPort());
        }
        return out;
    }

    /** Lần nối lại vào ip:port khác lần trước (đổi giữa 127.0.0.1 và IP LAN của chính máy này thì không tính). */
    synchronized void onConnected(InetSocketAddress previous, InetSocketAddress current, long now) {
        if (previous == null || previous.equals(current)) {
            return;
        }
        if (previous.getPort() == current.getPort() && previous.getAddress() != null && current.getAddress() != null
                && Discovery.isLocal(previous.getAddress()) && Discovery.isLocal(current.getAddress())) {
            return;
        }
        serverChanged = previous.getHostString() + ":" + previous.getPort() + " → "
                + current.getHostString() + ":" + current.getPort();
        add("CLIENT_SERVER_CHANGED", "MEDIUM", "Server doi dia chi: " + serverChanged, now);
    }

    /** Server gửi dòng không giải mã được, hoặc lệnh sai chiều (chỉ chi nhánh mới gửi). */
    synchronized void onBadServerMessage(String line, String why, long now) {
        add("CLIENT_BAD_SERVER_MSG", "MEDIUM", why + ": " + line, now);
    }

    private void add(String loai, String muc, String chiTiet, long now) {
        String d = chiTiet.length() > DETAIL_MAX ? chiTiet.substring(0, DETAIL_MAX) : chiTiet;
        Event e = new Event(BranchState.now(), loai, muc, d);
        recent.addFirst(e);
        while (recent.size() > KEEP) {
            recent.removeLast();
        }
        pending.addLast(e);
        while (pending.size() > PENDING) {
            pending.removeFirst();
        }
    }

    /** Tin SECURITY_REPORT kế tiếp được phép gửi lúc này (tối đa 1 tin/giây), hoặc null. */
    synchronized Message nextReport(long now) {
        if (pending.isEmpty() || now - lastReportAt < 1000) {
            return null;
        }
        lastReportAt = now;
        Event e = pending.removeFirst();
        return Message.of(Command.SECURITY_REPORT, e.loai(), e.chiTiet());
    }

    /** Gửi không được (mất kết nối): trả lại đầu hàng đợi. */
    synchronized void requeue(Message m) {
        pending.addFirst(new Event(BranchState.now(), m.param(0), "", m.param(1)));
    }

    synchronized Map<String, Object> snapshot() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("suKien", new ArrayList<>(recent));
        m.put("choGui", pending.size());
        m.put("discovery", discoveryResponders);
        m.put("serverDoi", serverChanged);
        return m;
    }
}
