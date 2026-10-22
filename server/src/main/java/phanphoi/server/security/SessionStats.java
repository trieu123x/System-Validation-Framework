package phanphoi.server.security;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Bộ đếm theo phiên (một kết nối TCP). Các dòng của một kết nối được xử lý tuần tự, nên các trường không phải
 * atomic chỉ do một luồng ghi tại một thời điểm; trang Giám sát chỉ đọc.
 */
public final class SessionStats {

    final long openedAt;
    /** Tin/giây, giữ 10 giây để tính tốc độ hiện tại và phát hiện CMD_FLOOD. */
    final RateCounter msgs = new RateCounter(10);
    /** INVENTORY_GET + HISTORY_GET trong 60 giây (SCRAPING). */
    final RateCounter reads = new RateCounter(60);
    /** E04 khi đụng YC/điều chuyển của chi nhánh khác (IDOR_PROBE). */
    final RateCounter notFound = new RateCounter(60);
    final AtomicLong in = new AtomicLong();
    final AtomicLong out = new AtomicLong();
    volatile String lastCmd = "";
    long floodStreak;
    long lastOverSec = -1;
    long lastReportAt;
    /** Đã xử lý quá hạn đăng nhập (PRELOGIN_IDLE) cho kết nối này. */
    boolean preloginHandled;
    /** Đã được tính vào số kết nối / số phiên hợp lệ của IP (để lúc đóng chỉ trừ đúng phần đã cộng). */
    volatile boolean connCounted;
    volatile boolean authCounted;

    public SessionStats(long nowMs) {
        this.openedAt = nowMs;
    }

    public long openedAt() {
        return openedAt;
    }

    public long in() {
        return in.get();
    }

    public long out() {
        return out.get();
    }

    public String lastCmd() {
        return lastCmd;
    }

    public void sent() {
        out.incrementAndGet();
    }

    /** Tốc độ tin vào trung bình 5 giây gần nhất. */
    public double msgsPerSecond(long nowMs) {
        return msgs.sum(nowMs, 5) / 5.0;
    }
}
