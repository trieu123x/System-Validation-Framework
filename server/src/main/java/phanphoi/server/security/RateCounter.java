package phanphoi.server.security;

import java.util.concurrent.atomic.AtomicLongArray;

/**
 * Bộ đếm cửa sổ trượt theo giây, không khóa: mảng vòng {@code slots} ô, mỗi ô giữ số đếm của một giây.
 * Hai luồng cùng sang giây mới có thể làm mất vài lần đếm ở ranh giới giây; với việc phát hiện bất thường
 * (ngưỡng hàng chục) sai số này không đáng kể, đổi lại không có khóa trên đường đọc tin.
 */
public final class RateCounter {

    private final int slots;
    private final AtomicLongArray counts;
    private final AtomicLongArray seconds;

    /** @param slots độ dài cửa sổ dài nhất cần hỏi (giây). */
    public RateCounter(int slots) {
        this.slots = slots;
        this.counts = new AtomicLongArray(slots);
        this.seconds = new AtomicLongArray(slots);
        for (int i = 0; i < slots; i++) {
            seconds.set(i, -1);
        }
    }

    /** Đếm thêm một lần; @return số lần trong giây hiện tại. */
    public long add(long nowMs) {
        long sec = nowMs / 1000;
        int i = (int) (sec % slots);
        long stamp = seconds.get(i);
        if (stamp != sec && seconds.compareAndSet(i, stamp, sec)) {
            counts.set(i, 0);
        }
        return counts.incrementAndGet(i);
    }

    /** Tổng số lần trong {@code windowSec} giây gần nhất (kể cả giây hiện tại). */
    public long sum(long nowMs, int windowSec) {
        long sec = nowMs / 1000;
        long total = 0;
        for (int i = 0; i < slots; i++) {
            long stamp = seconds.get(i);
            if (stamp > sec - Math.min(windowSec, slots) && stamp <= sec) {
                total += counts.get(i);
            }
        }
        return total;
    }

    /** Số lần trong đúng giây {@code sec} (epoch giây), 0 nếu ô đã bị giây khác ghi đè. */
    public long at(long sec) {
        int i = (int) (sec % slots);
        return seconds.get(i) == sec ? counts.get(i) : 0;
    }
}
