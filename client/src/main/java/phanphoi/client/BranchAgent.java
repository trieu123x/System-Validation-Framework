package phanphoi.client;

import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.common.ProtocolException;
import phanphoi.common.ReconnectPolicy;
import phanphoi.common.web.Http;
import phanphoi.common.web.SseHub;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import phanphoi.client.BranchState.Status;

/**
 * Logic phía chi nhánh: giữ kết nối, tự đăng nhập lại (FR-05), heartbeat (FR-04),
 * tự gửi LOW_STOCK sau khi bán (FR-13), áp tin push vào trạng thái và đẩy lên giao diện qua SSE.
 */
final class BranchAgent implements ServerLink.Handler {

    private static final long IDLE_MS = 30_000;
    private static final long PONG_TIMEOUT_MS = 10_000;
    private static final Set<String> OPEN_STATES = Set.of("DA_DE_XUAT", "THIEU_HANG", "DA_GIAO");

    private final Object lock = new Object();
    private final BranchState state = new BranchState();
    private final SseHub hub = new SseHub();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "reconnect-heartbeat");
        t.setDaemon(true);
        return t;
    });

    private volatile String serverSetting;
    private final int defaultPort;
    private final int discoveryPort;
    private InetSocketAddress lastAddress;

    private volatile ServerLink link;
    private volatile boolean wantOnline;
    private String credId;
    private String credPw;
    private String attemptId;
    private String attemptPw;
    private CompletableFuture<Message> pendingLogin;
    private long nextAttemptAt;
    /** Số lần thử kết nối lại liên tiếp đã thất bại (đặt lại khi LOGIN_OK). */
    private int attempt;
    private final ReconnectPolicy policy;
    /** Mặt hàng đã gửi LOW_STOCK và YC chưa đóng: tối đa một cảnh báo mở mỗi mặt hàng (FR-13). */
    private final Set<String> alerted = new HashSet<>();

    BranchAgent(String serverSetting, int defaultPort, int discoveryPort, ReconnectPolicy policy) {
        this.policy = policy;
        this.serverSetting = serverSetting;
        this.defaultPort = defaultPort;
        this.discoveryPort = discoveryPort;
    }

    void start() {
        timer.scheduleWithFixedDelay(this::tick, 200, 200, TimeUnit.MILLISECONDS);
    }

    SseHub hub() {
        return hub;
    }

    String serverSetting() {
        return serverSetting;
    }

    Map<String, Object> snapshot() {
        synchronized (lock) {
            return snap();
        }
    }

    /** Trạng thái cho giao diện, kèm các mặt hàng đã báo thiếu mà công ty chưa trả lời. */
    private Map<String, Object> snap() {
        Map<String, Object> m = state.snapshot();
        m.put("daBao", new ArrayList<>(alerted));
        return m;
    }

    // ================= kết nối =================

    private InetSocketAddress resolve() throws IOException {
        String s = serverSetting;
        if (s == null || s.isBlank() || "auto".equalsIgnoreCase(s)) {
            setStatus(Status.CONNECTING, "Dang tim server trong LAN (UDP " + discoveryPort + ")...");
            InetSocketAddress found = Discovery.find(discoveryPort, 1500);
            if (found != null) {
                return found;
            }
            if (lastAddress != null) {
                return lastAddress;
            }
            throw new IOException("Khong tim thay server trong LAN");
        }
        int colon = s.lastIndexOf(':');
        if (colon > 0) {
            return new InetSocketAddress(s.substring(0, colon).trim(), Integer.parseInt(s.substring(colon + 1).trim()));
        }
        return new InetSocketAddress(s.trim(), defaultPort);
    }

    private ServerLink connect() throws IOException {
        setStatus(Status.CONNECTING, "Dang ket noi server...");
        InetSocketAddress addr = resolve();
        ServerLink l = ServerLink.open(addr, 3000, this);
        synchronized (lock) {
            lastAddress = addr;
            link = l;
            state.server = addr.getHostString() + ":" + addr.getPort();
            state.status = Status.CONNECTED;
            state.statusDetail = "Da ket noi, dang dang nhap...";
            publish();
        }
        return l;
    }

    /** Chạy mỗi 200 ms: heartbeat và tự kết nối lại theo ReconnectPolicy. */
    private void tick() {
        try {
            long now = System.currentTimeMillis();
            ServerLink l = link;
            if (l != null && !l.isClosed()) {
                if (l.pongDeadline > 0 && now >= l.pongDeadline) {
                    notice("error", "Server khong tra PONG, dong ket noi");
                    l.close();
                } else if (l.pongDeadline == 0 && now - l.lastReadAt >= IDLE_MS) {
                    l.pongDeadline = now + PONG_TIMEOUT_MS;
                    l.send(Message.of(Command.PING));
                }
                return;
            }
            if (!wantOnline || now < nextAttemptAt) {
                return;
            }
            nextAttemptAt = now + policy.delayMs(attempt++);
            try {
                ServerLink nl = connect();
                synchronized (lock) {
                    attemptId = credId;
                    attemptPw = credPw;
                }
                nl.send(Message.of(Command.LOGIN, credId, credPw));
            } catch (IOException | RuntimeException e) {
                setStatus(Status.DISCONNECTED, "Mat ket noi: " + e.getMessage() + ". Thu lai sau 5 giay");
            }
        } catch (RuntimeException e) {
            e.printStackTrace();
        }
    }

    // ================= thao tác từ giao diện =================

    Map<String, Object> login(String maCn, String matKhau, String server) throws Exception {
        if (maCn.isEmpty() || matKhau.isEmpty()) {
            throw new Http.ApiException(400, "Nhap ma chi nhanh va mat khau");
        }
        synchronized (lock) {
            if (state.status == Status.ONLINE) {
                if (maCn.equals(state.maCn)) {
                    return snap();
                }
                throw new Http.ApiException(409, "Dang dang nhap " + state.maCn + ", hay dang xuat truoc");
            }
        }
        if (server != null && !server.isBlank() && !server.equals(serverSetting)) {
            serverSetting = server.trim();
            ServerLink old = link;
            if (old != null) {
                old.close();
            }
        }
        ServerLink l = link;
        if (l == null || l.isClosed()) {
            try {
                l = connect();
            } catch (IOException | RuntimeException e) {
                setStatus(Status.DISCONNECTED, "Khong ket noi duoc server: " + e.getMessage());
                throw new Http.ApiException(503, "Khong ket noi duoc server: " + e.getMessage());
            }
        }
        CompletableFuture<Message> f = new CompletableFuture<>();
        synchronized (lock) {
            pendingLogin = f;
            attemptId = maCn;
            attemptPw = matKhau;
        }
        if (!l.send(Message.of(Command.LOGIN, maCn, matKhau))) {
            throw new Http.ApiException(503, "Mat ket noi khi gui LOGIN");
        }
        Message reply;
        try {
            reply = f.get(5, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            throw new Http.ApiException(504, "Server khong tra loi LOGIN");
        } catch (ExecutionException e) {
            throw new Http.ApiException(503, "Mat ket noi khi dang nhap");
        } finally {
            synchronized (lock) {
                if (pendingLogin == f) {
                    pendingLogin = null;
                }
            }
        }
        if (reply.command() == Command.LOGIN_FAIL) {
            throw new Http.ApiException(Protocol.LOGIN_FAIL_ONLINE.equals(reply.param(0)) ? 409 : 401, reply.param(0));
        }
        return snapshot();
    }

    void logout() {
        ServerLink l;
        synchronized (lock) {
            wantOnline = false;
            credId = null;
            credPw = null;
            l = link;
            link = null;
            alerted.clear();
            state.clearBranchData();
            state.status = Status.DISCONNECTED;
            state.statusDetail = "Da dang xuat";
            publish();
        }
        if (l != null) {
            l.send(Message.of(Command.LOGOUT));
            l.close();
        }
    }

    void refreshInventory() {
        send(Message.of(Command.INVENTORY_GET));
    }

    void sale(String maHang, int soLuong) {
        if (soLuong <= 0) {
            throw new Http.ApiException(400, "So luong ban phai > 0");
        }
        send(Message.of(Command.SALE, maHang, soLuong));
    }

    void setThreshold(String maHang, int nguong) {
        if (nguong < 0) {
            throw new Http.ApiException(400, "Nguong phai >= 0");
        }
        send(Message.of(Command.SET_THRESHOLD, maHang, nguong));
    }

    void accept(int maYc, int soLuong) {
        if (soLuong <= 0) {
            throw new Http.ApiException(400, "So luong phai > 0");
        }
        send(Message.of(Command.ACCEPT, maYc, soLuong));
    }

    void reject(int maYc) {
        send(Message.of(Command.REJECT, maYc));
        synchronized (lock) {
            BranchState.Request r = state.requests.get(maYc);
            if (r != null) {
                r.trangThai = "TU_CHOI";
                r.capNhat = BranchState.now();
                alerted.remove(r.maHang);
            }
            publish();
        }
    }

    void received(int maYc) {
        send(Message.of(Command.RECEIVED, maYc));
        synchronized (lock) {
            BranchState.Request r = state.requests.get(maYc);
            if (r != null) {
                r.trangThai = "HOAN_TAT";
                r.capNhat = BranchState.now();
                alerted.remove(r.maHang);
            }
            publish();
        }
    }

    void transferAnswer(int maDc, boolean agree) {
        send(Message.of(agree ? Command.TRANSFER_ACCEPT : Command.TRANSFER_REJECT, maDc));
        synchronized (lock) {
            BranchState.Transfer t = state.transfers.get(maDc);
            if (t != null) {
                t.trangThai = agree ? "DANG_CHUYEN" : "TU_CHOI";
                t.capNhat = BranchState.now();
            }
            publish();
        }
    }

    void history(String tu, String den) {
        synchronized (lock) {
            state.historyRange = tu + " → " + den;
        }
        send(Message.of(Command.HISTORY_GET, tu, den));
    }

    private void send(Message m) {
        ServerLink l = link;
        synchronized (lock) {
            if (state.status != Status.ONLINE || l == null) {
                throw new Http.ApiException(409, "Chua ket noi toi server");
            }
        }
        if (!l.send(m)) {
            throw new Http.ApiException(503, "Mat ket noi khi gui " + m.command());
        }
    }

    // ================= tin từ server (luồng Listener) =================

    @Override
    public void onMessage(ServerLink l, Message m) {
        if (l != link) {
            return;
        }
        try {
            synchronized (lock) {
                handle(l, m);
                publish();
            }
        } catch (ProtocolException | RuntimeException e) {
            notice("error", "Tin tu server khong hop le: " + m + " (" + e.getMessage() + ")");
        }
    }

    private void handle(ServerLink l, Message m) throws ProtocolException {
        switch (m.command()) {
            case PING -> l.send(Message.of(Command.PONG));
            case PONG -> { }
            case LOGIN_OK -> onLoginOk(l, m.param(0));
            case LOGIN_FAIL -> onLoginFail(l, m);
            case INVENTORY -> {
                state.inventory.clear();
                for (List<String> r : m.listParam(0)) {
                    BranchState.Item it = new BranchState.Item();
                    it.maHang = r.get(0);
                    it.tenHang = r.get(1);
                    it.soLuong = Integer.parseInt(r.get(2));
                    it.nguong = Integer.parseInt(r.get(3));
                    state.inventory.put(it.maHang, it);
                }
                state.inventory.values().forEach(it -> checkLowStock(l, it));
            }
            case SALE_OK -> {
                BranchState.Item it = state.inventory.get(m.param(0));
                if (it != null) {
                    it.soLuong = m.intParam(1);
                    addNotice("info", "Da ban " + it.tenHang + ", con " + it.soLuong);
                    checkLowStock(l, it);
                }
            }
            case OFFER -> {
                BranchState.Request r = state.request(m.intParam(0));
                r.maHang = m.param(1);
                r.soLuongDeXuat = m.intParam(2);
                if (r.trangThai == null || "DA_DE_XUAT".equals(r.trangThai)) {
                    r.trangThai = "DA_DE_XUAT";
                    toast("offer", "Công ty đề xuất cấp " + r.soLuongDeXuat + " " + tenHang(r.maHang)
                            + " (YC #" + r.maYc + "), vào mục Nhận hàng để xác nhận");
                }
                r.capNhat = BranchState.now();
                alerted.add(r.maHang);
            }
            case OUT_OF_STOCK -> {
                BranchState.Request r = state.request(m.intParam(0));
                boolean fresh = !"THIEU_HANG".equals(r.trangThai);
                r.soLuongCoThe = m.intParam(1);
                r.maHang = m.param(2);
                r.trangThai = "THIEU_HANG";
                r.capNhat = BranchState.now();
                alerted.add(r.maHang);
                if (fresh) {
                    toast("warn", "Công ty báo không đủ " + tenHang(r.maHang) + " (YC #" + r.maYc + "), kho tổng chỉ còn "
                            + r.soLuongCoThe);
                }
            }
            case DELIVERED -> {
                BranchState.Request r = state.request(m.intParam(0));
                r.maHang = m.param(1);
                r.soLuongGiao = m.intParam(2);
                if (!"HOAN_TAT".equals(r.trangThai) && !"DA_GIAO".equals(r.trangThai)) {
                    r.trangThai = "DA_GIAO";
                    toast("success", "Công ty đã gửi " + r.soLuongGiao + " " + tenHang(r.maHang) + " (YC #" + r.maYc
                            + "). Bấm \"Đã nhận hàng\" khi hàng tới");
                }
                r.capNhat = BranchState.now();
                alerted.add(r.maHang);
            }
            case HISTORY -> {
                List<Map<String, Object>> rows = new ArrayList<>();
                for (List<String> r : m.listParam(0)) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("maYc", r.get(0));
                    row.put("maHang", r.get(1));
                    row.put("tenHang", r.get(2));
                    row.put("soLuong", Integer.parseInt(r.get(3)));
                    row.put("thoiGian", r.get(4));
                    row.put("nguon", r.size() > 5 ? r.get(5) : "KHO_TONG");
                    rows.add(row);
                }
                state.history = rows;
            }
            case BROADCAST -> {
                state.addBroadcast(m.param(0));
                hub.publish("toast", new BranchState.Notice(BranchState.now(), "broadcast", m.param(0)));
            }
            case ERROR -> toast("error", m.param(0) + ": " + m.param(1));
            case TRANSFER_REQ -> {
                BranchState.Transfer t = state.transfer(m.intParam(0));
                t.maHang = m.param(1);
                t.soLuong = m.intParam(2);
                t.chiNhanhNhan = m.param(3);
                if (t.trangThai == null) {
                    t.trangThai = "CHO";
                    toast("offer", "Yeu cau dieu chuyen #" + t.maDc + ": chuyen " + t.soLuong + " " + t.maHang
                            + " cho " + t.chiNhanhNhan);
                }
                t.capNhat = BranchState.now();
            }
            case TRANSFER_DONE -> {
                BranchState.Transfer t = state.transfer(m.intParam(0));
                t.maHang = m.param(1);
                t.trangThai = "HOAN_TAT";
                t.capNhat = BranchState.now();
                BranchState.Item it = state.inventory.get(t.maHang);
                if (it != null) {
                    it.soLuong = m.intParam(2);
                }
                addNotice("success", "Da chuyen hang cho dieu chuyen #" + t.maDc);
            }
            default -> addNotice("error", "Lenh khong mong doi tu server: " + m.command());
        }
    }

    private void onLoginOk(ServerLink l, String tenCn) {
        attempt = 0;
        String id = attemptId;
        if (!id.equals(state.maCn)) {
            state.clearBranchData();
            alerted.clear();
        }
        credId = id;
        credPw = attemptPw;
        wantOnline = true;
        state.maCn = id;
        state.tenCn = tenCn;
        state.status = Status.ONLINE;
        state.statusDetail = "Da dang nhap";
        addNotice("success", "Dang nhap thanh cong: " + tenCn);
        l.send(Message.of(Command.INVENTORY_GET));
        if (pendingLogin != null) {
            pendingLogin.complete(Message.of(Command.LOGIN_OK, tenCn));
        }
    }

    private void onLoginFail(ServerLink l, Message m) {
        String reason = m.param(0);
        if (pendingLogin != null) {
            state.status = Status.CONNECTED;
            state.statusDetail = "Dang nhap that bai: " + reason;
            pendingLogin.complete(m);
            return;
        }
        if (Protocol.LOGIN_FAIL_ONLINE.equals(reason)) {
            // phiên cũ trên server chưa bị dọn: đóng và thử lại sau 5 giây
            state.status = Status.DISCONNECTED;
            state.statusDetail = "Server con giu phien cu, thu lai sau 5 giay";
            l.close();
        } else {
            wantOnline = false;
            state.status = Status.DISCONNECTED;
            state.statusDetail = "Tu dang nhap lai that bai: " + reason;
            l.close();
        }
    }

    /** FR-13: tồn < ngưỡng → gửi LOW_STOCK, tối đa một cảnh báo mở cho mỗi mặt hàng. */
    private void checkLowStock(ServerLink l, BranchState.Item it) {
        if (it.nguong <= 0 || it.soLuong >= it.nguong || alerted.contains(it.maHang)) {
            return;
        }
        boolean open = state.requests.values().stream()
                .anyMatch(r -> it.maHang.equals(r.maHang) && OPEN_STATES.contains(r.trangThai));
        if (open) {
            return;
        }
        alerted.add(it.maHang);
        l.send(Message.of(Command.LOW_STOCK, it.maHang, it.soLuong, it.nguong));
        toast("warn", "Tồn " + it.tenHang + " còn " + it.soLuong + ", dưới ngưỡng " + it.nguong
                + ": đã tự báo công ty cần hàng");
    }

    @Override
    public void onBadLine(ServerLink l, String line, String error) {
        notice("error", "Tin sai dinh dang tu server: " + error);
    }

    @Override
    public void onClosed(ServerLink l) {
        synchronized (lock) {
            if (l != link) {
                return;
            }
            link = null;
            if (pendingLogin != null) {
                pendingLogin.completeExceptionally(new IOException("closed"));
            }
            if (state.status == Status.ONLINE) {
                addNotice("error", "Mat ket noi toi server");
            }
            state.status = Status.DISCONNECTED;
            if (wantOnline) {
                state.statusDetail = "Mat ket noi, tu ket noi lai moi 5 giay...";
                // FR-05: thử lại theo ReconnectPolicy (fixed 5 giây hoặc backoff + jitter, tối đa 5 giây)
                nextAttemptAt = Math.max(nextAttemptAt, System.currentTimeMillis() + policy.delayMs(attempt));
            } else if (!"Da dang xuat".equals(state.statusDetail)) {
                state.statusDetail = "Da ngat ket noi";
            }
            publish();
        }
    }

    // ================= tiện ích =================

    private void setStatus(Status s, String detail) {
        synchronized (lock) {
            state.status = s;
            state.statusDetail = detail;
            publish();
        }
    }

    private void addNotice(String level, String text) {
        state.notice(level, text);
    }

    private void toast(String level, String text) {
        BranchState.Notice n = state.notice(level, text);
        hub.publish("toast", n);
    }

    private void notice(String level, String text) {
        synchronized (lock) {
            toast(level, text);
            publish();
        }
    }

    private String tenHang(String maHang) {
        BranchState.Item it = state.inventory.get(maHang);
        return it == null ? maHang : it.tenHang;
    }

    private void publish() {
        hub.publish("state", snap());
    }
}
