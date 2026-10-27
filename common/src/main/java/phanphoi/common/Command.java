package phanphoi.common;

import java.util.HashMap;
import java.util.Map;

/**
 * Bảng lệnh SRS mục 4.2 (cộng các lệnh điều chuyển và discovery của mục 7.2).
 * paramCount là số tham số bắt buộc; sai số tham số → ERROR|E01.
 */
public enum Command {
    LOGIN(2),
    LOGIN_OK(2),
    LOGIN_FAIL(1),
    // Thông báo tới phiên đang hoạt động khi có thiết bị khác đăng nhập cùng chi nhánh.
    DUPLICATE_LOGIN_ALERT(2),
    INVENTORY_GET(0),
    INVENTORY(1),
    SALE(2),
    SALE_OK(2),
    SET_THRESHOLD(2),
    LOW_STOCK(3),
    OFFER(3),
    ACCEPT(2),
    REJECT(1),
    DELIVERED(3),
    // maYC, soLuongCoThe, maHang (maHang để CN hiển thị được YC do admin báo thiếu mà chưa từng nhận OFFER)
    OUT_OF_STOCK(3),
    // maYC, soLuongThucNhan (0 khi thiếu toàn bộ). Cần nâng cấp server và client cùng phiên bản.
    RECEIVED(2),
    // Server xác nhận sau commit: maYC, maHang, soLuongGiao, soLuongNhan.
    RECEIVED_OK(4),
    HISTORY_GET(2),
    HISTORY(1),
    BROADCAST(1),
    ERROR(2),
    PING(0),
    PONG(0),
    LOGOUT(0),
    // 7.2-B: điều chuyển hàng giữa chi nhánh
    TRANSFER_REQ(4),
    TRANSFER_ACCEPT(1),
    TRANSFER_REJECT(1),
    TRANSFER_DONE(3),
    // 7.2-A: tự tìm server qua UDP
    DISCOVER(0),
    HERE(2),
    // công nợ: tongNhan, daTra, conNo, hanMuc, danh sách id,loai,soTien,thoiGian,ghiChu (50 bút toán mới nhất)
    DEBT_GET(0),
    DEBT(5),
    // client báo sự kiện an ninh phát hiện ở máy chi nhánh: loai, chiTiet (≤ 500 ký tự); chỉ sau khi đăng nhập
    SECURITY_REPORT(2),
    // thông báo có phản hồi (trạng thái mới nhất, CN ghi đè theo id):
    // id, loai, trangThai, taoLuc, tieuDe, noiDung, maSp, deXuat, soLuong, maYc, anh (trường không áp dụng để rỗng)
    NOTICE(11),
    // CN trả lời thông báo: id, traLoi (XEM | CAN_HANG | KHONG_CAN | MUON_NHAP | BO_QUA), soLuong (0 khi không cần)
    NOTICE_REPLY(3),
    // Authenticated browser heartbeat relayed by the branch gateway (not a user operation).
    BROWSER_PRESENCE(2), // opaque browser session id, observed browser IP
    BROWSER_EXIT(2);     // opaque browser session id, USER_LOGOUT or SESSION_EXPIRED


    private static final Map<String, Command> BY_NAME = new HashMap<>();

    static {
        for (Command c : values()) {
            BY_NAME.put(c.name(), c);
        }
    }

    private final int paramCount;

    Command(int paramCount) {
        this.paramCount = paramCount;
    }

    public int paramCount() {
        return paramCount;
    }

    /** Trả null nếu không phải lệnh hợp lệ. */
    public static Command of(String name) {
        return BY_NAME.get(name);
    }
}
