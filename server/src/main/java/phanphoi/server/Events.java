package phanphoi.server;

import phanphoi.common.web.SseHub;

import java.util.Map;

/** Sự kiện đẩy lên giao diện admin qua SSE. */
public final class Events {

    public static final String BRANCHES = "branches";
    public static final String ALERT = "alert";
    public static final String REQUEST = "request";
    public static final String STOCK = "stock";
    public static final String TRANSFER = "transfer";
    public static final String MESSAGE = "message";
    public static final String PRODUCTS = "products";
    /** Sổ công nợ đổi: {maCn} hoặc {maNcc}. */
    public static final String DEBT = "debt";
    /** Thông báo mới hoặc chi nhánh vừa trả lời: {id} hoặc {id, maCn}. */
    public static final String NOTICE = "notice";
    /** Một sự kiện an ninh (su_kien_bao_mat). */
    public static final String SECURITY = "security";
    /** Chỉ tiêu doanh thu đổi: {maCn, thang}. */
    public static final String BUSINESS = "business";

    private final SseHub hub = new SseHub();

    public SseHub hub() {
        return hub;
    }

    public void publish(String event, Object data) {
        hub.publish(event, data == null ? Map.of() : data);
    }
}
