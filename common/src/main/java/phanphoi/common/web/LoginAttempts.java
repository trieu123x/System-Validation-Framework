package phanphoi.common.web;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/** Server-side sign-in limits keyed by IP and branch; browser cookies never reset them. */
public final class LoginAttempts {
    private static final int MAX_KEYS = 50_000;
    private record Key(String ip, String branch) {
        Key { branch = branch.trim().toLowerCase(java.util.Locale.ROOT); }
    }
    private static final class State {
        final ArrayDeque<Long> failures = new ArrayDeque<>();
        long until;
    }
    private final Map<Key, State> states = new HashMap<>();
    private final int maxFailures;
    private final long windowMs;
    private final long blockMs;
    private final LongSupplier clock;

    public LoginAttempts(int maxFailures, int windowSeconds, int blockSeconds) {
        this(maxFailures, windowSeconds, blockSeconds, System::currentTimeMillis);
    }
    public LoginAttempts(int maxFailures, int windowSeconds, int blockSeconds, LongSupplier clock) {
        if (maxFailures < 1 || windowSeconds < 1 || blockSeconds < 1) throw new IllegalArgumentException("Invalid login limits");
        this.maxFailures = maxFailures;
        this.windowMs = windowSeconds * 1000L;
        this.blockMs = blockSeconds * 1000L;
        this.clock = clock;
    }
    private void prune(State state, long now) {
        if (state.until != 0 && state.until <= now) { state.until = 0; state.failures.clear(); }
        while (!state.failures.isEmpty() && state.failures.peekFirst() <= now - windowMs) state.failures.removeFirst();
    }
    public int retryAfter(String ip, String branch) { return retryAfter(ip, branch, clock.getAsLong()); }
    public synchronized int retryAfter(String ip, String branch, long now) {
        State state = states.get(new Key(ip, branch));
        if (state == null) return 0;
        prune(state, now);
        return (int) Math.max(0, (state.until - now + 999) / 1000);
    }
    public void check(String ip, String branch) { check(ip, branch, clock.getAsLong()); }
    public synchronized void check(String ip, String branch, long now) {
        int seconds = retryAfter(ip, branch, now);
        if (seconds > 0) throw blocked(seconds);
        if (!states.containsKey(new Key(ip, branch)) && states.size() >= MAX_KEYS) {
            states.values().removeIf(state -> { prune(state, now); return state.until == 0 && state.failures.isEmpty(); });
            if (states.size() >= MAX_KEYS) throw new Http.ApiException(503, "Chưa thể đăng nhập lúc này. Vui lòng thử lại sau.");
        }
    }
    /** Returns seconds until unblocked, including the attempt that reaches the threshold. */
    public int failed(String ip, String branch) { return failed(ip, branch, clock.getAsLong()); }
    public synchronized int failed(String ip, String branch, long now) {
        check(ip, branch, now);
        State state = states.computeIfAbsent(new Key(ip, branch), ignored -> new State());
        prune(state, now);
        state.failures.addLast(now);
        if (state.failures.size() >= maxFailures) { state.until = now + blockMs; state.failures.clear(); }
        return retryAfter(ip, branch, now);
    }
    public synchronized void succeeded(String ip, String branch) { states.remove(new Key(ip, branch)); }
    public static Http.ApiException blocked(int seconds) {
        return new Http.ApiException(429, "Đăng nhập chi nhánh này trên IP hiện tại bị khóa. Thử lại sau " + seconds + " giây.");
    }
}
