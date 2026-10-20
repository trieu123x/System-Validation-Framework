package phanphoi.common;

import java.util.Random;

/**
 * Thời gian chờ trước lần kết nối lại thứ n (n bắt đầu từ 0).
 *
 * <ul>
 *   <li>{@code fixed}: luôn chờ đúng {@code capMs} (baseline SRS FR-05: mỗi 5 giây).
 *       Mọi client mất kết nối cùng lúc sẽ thử lại cùng lúc → dồn cục (thundering herd).</li>
 *   <li>{@code backoff}: exponential backoff với full jitter, chờ ngẫu nhiên trong
 *       [0, min(capMs, baseMs·2^n)]. Rải đều client nhưng thử dày khi server tắt lâu.</li>
 *   <li>{@code jitter} (đề xuất): lần đầu chờ ngẫu nhiên trong [0, capMs], các lần sau trong
 *       [capMs/2, capMs]. Các client lệch pha nhau (không dồn cục), số lần thử gần bằng fixed,
 *       và không bao giờ chờ quá capMs nên vẫn giữ "nối lại ≤ 5 giây sau khi server lên".</li>
 * </ul>
 */
public final class ReconnectPolicy {

    public enum Kind { FIXED, BACKOFF, JITTER }

    private final Kind kind;
    private final long baseMs;
    private final long capMs;
    private final Random random;

    public ReconnectPolicy(Kind kind, long baseMs, long capMs, Random random) {
        this.kind = kind;
        this.baseMs = baseMs;
        this.capMs = capMs;
        this.random = random;
    }

    public static ReconnectPolicy parse(String name, long baseMs, long capMs) {
        Kind k = Kind.valueOf(name.trim().toUpperCase());
        return new ReconnectPolicy(k, baseMs, capMs, new Random());
    }

    public Kind kind() {
        return kind;
    }

    public long delayMs(int attempt) {
        if (kind == Kind.FIXED) {
            return capMs;
        }
        if (kind == Kind.JITTER) {
            long low = attempt == 0 ? 0 : capMs / 2;
            return low + (long) (random.nextDouble() * (capMs - low + 1));
        }
        int shift = Math.min(attempt, 20);
        long ceiling = Math.min(capMs, baseMs << shift);
        return (long) (random.nextDouble() * (ceiling + 1));
    }
}
