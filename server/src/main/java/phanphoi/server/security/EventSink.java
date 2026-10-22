package phanphoi.server.security;

/** Nơi nhận sự kiện an ninh: CSDL + SSE khi chạy thật, danh sách trong bộ nhớ khi unit test. */
public interface EventSink {

    void emit(SecurityEvent e);

    /** Số sự kiện bị bỏ vì hàng đợi ghi đầy. */
    default long dropped() {
        return 0;
    }
}
