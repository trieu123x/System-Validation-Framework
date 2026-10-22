package phanphoi.server.security;

import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Danh sách IP bị chặn tạm thời, chỉ giữ trong bộ nhớ (khởi động lại server thì mất; sự kiện vẫn nằm trong CSDL).
 * Chặn lại một IP đang bị chặn thì cộng dồn hạn.
 */
public final class BanList {

    private final Map<String, Long> until = new ConcurrentHashMap<>();

    /** @return thời điểm hết chặn (epoch ms). */
    public long ban(String ip, long minutes, long nowMs) {
        long add = minutes * 60_000L;
        return until.merge(ip, nowMs + add, (old, fresh) -> Math.max(old, nowMs) + add);
    }

    /** @return thời điểm hết chặn nếu IP đang bị chặn, ngược lại 0 (mục đã hết hạn bị xoá luôn). */
    public long bannedUntil(String ip, long nowMs) {
        Long u = until.get(ip);
        if (u == null) {
            return 0;
        }
        if (u <= nowMs) {
            until.remove(ip, u);
            return 0;
        }
        return u;
    }

    public boolean isBanned(String ip, long nowMs) {
        return bannedUntil(ip, nowMs) > 0;
    }

    public boolean unban(String ip) {
        return until.remove(ip) != null;
    }

    /** Các IP còn bị chặn → hạn chặn, sắp theo IP. */
    public Map<String, Long> active(long nowMs) {
        until.entrySet().removeIf(e -> e.getValue() <= nowMs);
        return new TreeMap<>(until);
    }
}
