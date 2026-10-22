package phanphoi.common;

/** Mã lỗi SRS mục 4.3. */
public enum ErrorCode {
    /** Sai định dạng, sai số tham số, dòng quá dài. */
    E01,
    /** Chưa đăng nhập. */
    E02,
    /** Lệnh không hợp lệ ở trạng thái hiện tại. */
    E03,
    /** Không tìm thấy mã hàng hoặc mã YC. */
    E04,
    /** Số lượng không hợp lệ. */
    E05,
    /** Bị giới hạn tần suất hoặc IP đang bị chặn (giám sát an ninh). */
    E06
}
