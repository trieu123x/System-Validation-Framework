package phanphoi.client;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Dữ liệu chi nhánh nhận từ server, hiển thị trên giao diện. Client không truy cập CSDL. */
final class BranchState {

    static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    enum Status { DISCONNECTED, CONNECTING, CONNECTED, ONLINE }

    static final class Item {
        String maHang;
        String tenHang;
        int soLuong;
        int nguong;
        // server cũ không gửi 4 trường sau: để rỗng / null
        String model = "";
        String danhMuc = "";
        Long giaXuat;
        Long giaBanLe;
        // tham chiếu ảnh Cloudinary (phần sau /image/upload/), rỗng = chưa có ảnh
        String anh = "";
        // thông số nhận qua tin SPECS; null = chưa có (hoặc server cũ không hỗ trợ SPECS_GET)
        Integer congSuatW;
        Integer dienApV;
        Double trongLuongKg;
    }

    /** Một bản ghi của tin SPECS. */
    record Spec(Integer congSuatW, Integer dienApV, Double trongLuongKg) {
    }

    static final class Request {
        int maYc;
        String maHang;
        Integer soLuongDeXuat;
        Integer soLuongCoThe;
        Integer soLuongGiao;
        Integer soLuongNhan;
        String trangThai;
        String capNhat;
    }

    static final class Transfer {
        int maDc;
        String maHang;
        int soLuong;
        String chiNhanhNhan;
        String trangThai;
        String capNhat;
    }

    record Notice(String time, String level, String text) {
    }

    /** Thông báo có phản hồi (tin NOTICE), trạng thái do server quyết định. */
    static final class InboxItem {
        long id;
        String loai;
        String trangThai;
        String taoLuc;
        String tieuDe;
        String noiDung;
        String maSp = "";
        Integer deXuat;
        Integer soLuong;
        Integer maYc;
        String anh = "";
    }

    Status status = Status.DISCONNECTED;
    String statusDetail = "Chua dang nhap";
    String server = "";
    String maCn;
    String tenCn;
    final Map<String, Item> inventory = new TreeMap<>();
    /** Tin SPECS gần nhất; giữ lại để gán cho INVENTORY về sau (hai tin có thể tới theo thứ tự bất kỳ). */
    final Map<String, Spec> specs = new HashMap<>();
    /** Đã nhận ít nhất một tin SPECS trong phiên này (server cũ không hỗ trợ thì giao diện ẩn chip và bộ lọc công suất). */
    boolean specsReceived;
    final Map<Integer, Request> requests = new TreeMap<>(Comparator.reverseOrder());
    final Map<Integer, Transfer> transfers = new TreeMap<>(Comparator.reverseOrder());
    final Deque<Notice> broadcasts = new ArrayDeque<>();
    final Deque<Notice> notices = new ArrayDeque<>();
    /** Hộp thư thông báo, mới nhất trước. */
    final TreeMap<Long, InboxItem> inbox = new TreeMap<>(Comparator.reverseOrder());
    List<Map<String, Object>> history = new ArrayList<>();
    String historyRange = "";
    /** Tin DEBT gần nhất: tongNhan, daTra, conNo, hanMuc, butToan, capNhat. */
    Map<String, Object> debt;

    void clearBranchData() {
        maCn = null;
        tenCn = null;
        inventory.clear();
        specs.clear();
        specsReceived = false;
        requests.clear();
        transfers.clear();
        broadcasts.clear();
        notices.clear();
        inbox.clear();
        history = new ArrayList<>();
        historyRange = "";
        debt = null;
    }

    /** Gán thông số cho mọi mặt hàng đang có; mã không có trong {@link #specs} (hoặc bị cắt khỏi tin) thì để null. */
    void applySpecs() {
        for (Item it : inventory.values()) {
            Spec s = specs.get(it.maHang);
            it.congSuatW = s == null ? null : s.congSuatW();
            it.dienApV = s == null ? null : s.dienApV();
            it.trongLuongKg = s == null ? null : s.trongLuongKg();
        }
    }

    Request request(int maYc) {
        return requests.computeIfAbsent(maYc, id -> {
            Request r = new Request();
            r.maYc = id;
            return r;
        });
    }

    Transfer transfer(int maDc) {
        return transfers.computeIfAbsent(maDc, id -> {
            Transfer t = new Transfer();
            t.maDc = id;
            return t;
        });
    }

    void addBroadcast(String text) {
        broadcasts.addFirst(new Notice(now(), "info", text));
        while (broadcasts.size() > 50) {
            broadcasts.removeLast();
        }
    }

    /** Ghi đè theo id; giữ tối đa 100 thông báo mới nhất. @return true nếu là thông báo chưa từng nhận. */
    boolean putInbox(InboxItem it) {
        boolean fresh = inbox.put(it.id, it) == null;
        while (inbox.size() > 100) {
            inbox.remove(inbox.lastKey());
        }
        return fresh;
    }

    Notice notice(String level, String text) {
        Notice n = new Notice(now(), level, text);
        notices.addFirst(n);
        while (notices.size() > 100) {
            notices.removeLast();
        }
        return n;
    }

    static String now() {
        return LocalDateTime.now().format(TIME);
    }

    Map<String, Object> snapshot() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", status.name());
        m.put("statusDetail", statusDetail);
        m.put("server", server);
        m.put("maCn", maCn);
        m.put("tenCn", tenCn);
        m.put("slug", BranchSlug.of(tenCn));
        m.put("inventory", new ArrayList<>(inventory.values()));
        m.put("coThongSo", specsReceived);
        m.put("requests", new ArrayList<>(requests.values()));
        m.put("transfers", new ArrayList<>(transfers.values()));
        m.put("broadcasts", new ArrayList<>(broadcasts));
        m.put("notices", new ArrayList<>(notices));
        m.put("inbox", new ArrayList<>(inbox.values()));
        m.put("history", history);
        m.put("historyRange", historyRange);
        m.put("debt", debt);
        return m;
    }
}
