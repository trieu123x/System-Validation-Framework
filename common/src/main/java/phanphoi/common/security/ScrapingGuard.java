package phanphoi.common.security;

import java.util.*;
import java.util.function.BiConsumer;

/** Bounded, synchronized sliding buckets: no DB, SMTP, sleeping or network I/O in evaluate(). */
public final class ScrapingGuard {
    public record Decision(String subject, String channel, String resource, long count, int windowSeconds,
            int risk, String action, int retryAfter, List<String> signals, boolean emit) {
        public boolean denied() { return action.equals("THROTTLE") || action.equals("TEMP_BLOCK"); }
        public Map<String, Object> metadata() {
            return Map.of("subject", subject, "channel", channel, "resource", resource, "requestCount", count,
                    "windowSeconds", windowSeconds, "riskScore", risk, "action", action,
                    "retryAfter", retryAfter, "signals", signals);
        }
    }
    public record Block(String subject, long expiresAt, String reason) {}
    private static final class Window {
        final long[] times, counts;
        Window(int size) { times = new long[size]; counts = new long[size]; Arrays.fill(times, -1); }
        long add(long now) { long sec = now / 1000; int i = (int)(sec % times.length);
            if (times[i] != sec) { times[i] = sec; counts[i] = 0; } counts[i]++; return sum(now); }
        long sum(long now) { long sec = now / 1000, n = 0;
            for (int i = 0; i < times.length; i++) if (times[i] > sec-times.length && times[i] <= sec) n += counts[i];
            return n; }
    }
    private static final class State {
        final Window tcp, http, denied;
        final Map<String, Window> resources = new HashMap<>();
        final Map<String, Long> ips = new HashMap<>();
        long lastSeen, lastEmit = -10000;
        int lastRisk;
        State(int n) { tcp = new Window(n); http = new Window(n); denied = new Window(n); }
    }
    private final ScrapingPolicy policy;
    private final Map<String, State> subjects = new HashMap<>();
    private final Map<String, Block> blocks = new HashMap<>();
    private long lastCleanup, requests, limited, alerts, capacityMisses;
    // Persistence listener MUST enqueue only. Never perform disk/DB work while this lock is held.
    private BiConsumer<String, Block> blockListener = (subject, block) -> {};
    public ScrapingGuard(ScrapingPolicy policy) { this.policy = policy; }
    public ScrapingPolicy policy() { return policy; }
    public synchronized void onBlockChange(BiConsumer<String, Block> listener) { blockListener = listener; }
    public synchronized void restore(Block b, long now) {
        if (b.expiresAt > now && blocks.size() < policy.maxSubjects()) blocks.put(b.subject, b);
    }
    public synchronized Decision evaluate(String subject, String ip, String channel, String resource, long historyDays, long now) {
        return evaluate(subject, ip, channel, resource, historyDays, now, false);
    }
    public synchronized Decision evaluate(String subject, String ip, String channel, String resource, long historyDays, long now, boolean legacyReject) {
        boolean active = policy.enabled() && !policy.mode().equals("off") && (channel.equals("TCP") ? policy.tcpEnabled() : policy.httpEnabled());
        if (!active && !legacyReject) return result(subject, channel, resource, 0, 0, "ALLOW", 0, List.of(), false);
        cleanup(now);
        requests++;
        State s = subjects.get(subject);
        if (s == null) {
            if (subjects.size() >= policy.maxSubjects()) {
                capacityMisses++;
                Block existing = blocks.get(subject);
                if (active && policy.mode().equals("block") && existing != null && existing.expiresAt > now) {
                    limited++;
                    return result(subject, channel, resource, 0, policy.blockRisk(), "TEMP_BLOCK",
                            (int)Math.max(1, (existing.expiresAt-now+999)/1000), List.of("ACTIVE_BLOCK"), false);
                }
                // No global overflow bucket: never punish an unrelated account for another account's traffic.
                return result(subject, channel, resource, 0, 0, legacyReject ? "THROTTLE" : "ALLOW", legacyReject ? 60 : 0, List.of("CAPACITY"), false);
            }
            s = new State(policy.windowSeconds()); subjects.put(subject, s);
        }
        s.lastSeen = now;
        s.ips.values().removeIf(t -> now - t >= policy.windowSeconds()*1000L);
        if (s.ips.size() < 8 || s.ips.containsKey(ip)) s.ips.put(ip, now);
        Window w = channel.equals("TCP") ? s.tcp : s.http;
        long count = w.add(now);
        int limit = channel.equals("TCP") ? policy.tcpLimit() : policy.httpLimit();
        // Aggregate authenticated account traffic across transports using normalized quotas.
        boolean over = s.tcp.sum(now)/(double)policy.tcpLimit() + s.http.sum(now)/(double)policy.httpLimit() > 1;
        Integer resourceQuota = policy.resourceQuotas().get(resource);
        boolean resourceOver = resourceQuota != null && s.resources.computeIfAbsent(resource, k -> new Window(policy.windowSeconds())).add(now) > resourceQuota;
        List<String> signals = new ArrayList<>();
        int risk = 0;
        if (over || legacyReject) { signals.add("ACCOUNT_QUOTA"); risk += 25; }
        if (resourceOver) { signals.add("RESOURCE_QUOTA"); if (!over && !legacyReject) risk += 25; }
        if (count > limit * 2L) { signals.add("HIGH_RATE"); risk += 25; }
        if (historyDays > policy.historyDays()) { signals.add("BROAD_HISTORY"); risk += 45; }
        if (s.ips.size() >= 3 && over) { signals.add("MULTIPLE_IPS"); risk += 15; }
        if (s.denied.sum(now) >= 3) { signals.add("REPEATED_AFTER_LIMIT"); risk += 30; }
        risk = Math.min(100, risk);
        boolean enforcing = active && policy.mode().equals("block");
        Block b = blocks.get(subject);
        String action = signals.isEmpty() ? "ALLOW" : "OBSERVE";
        int retry = 0;
        if (enforcing && b != null && b.expiresAt > now) {
            action = "TEMP_BLOCK"; retry = (int)Math.max(1, (b.expiresAt-now+999)/1000);
            risk = Math.max(risk, policy.blockRisk()); signals.add("ACTIVE_BLOCK");
        } else if (enforcing && risk >= policy.blockRisk()) {
            b = new Block(subject, now + policy.blockSeconds()*1000L, String.join(",", signals));
            blocks.put(subject, b); blockListener.accept(subject, b);
            action = "TEMP_BLOCK"; retry = policy.blockSeconds();
        } else if (legacyReject || enforcing && (over || resourceOver || historyDays > policy.historyDays())) {
            action = "THROTTLE"; retry = policy.windowSeconds();
        }
        if (action.equals("THROTTLE") || action.equals("TEMP_BLOCK")) { s.denied.add(now); limited++; }
        boolean emit = !signals.isEmpty() && (now-s.lastEmit >= 10000 || risk >= policy.blockRisk() && s.lastRisk < policy.blockRisk());
        if (emit) { s.lastEmit = now; s.lastRisk = risk; alerts++; }
        return result(subject, channel, resource, count, risk, action, retry, List.copyOf(signals), emit);
    }
    private Decision result(String subject, String channel, String resource, long count, int risk, String action, int retry, List<String> signals, boolean emit) {
        return new Decision(subject, channel, resource, count, policy.windowSeconds(), risk, action, retry, signals, emit);
    }
    private void cleanup(long now) {
        if (now-lastCleanup < 60000) return;
        lastCleanup = now;
        subjects.values().removeIf(s -> now-s.lastSeen > Math.max(600000L, policy.windowSeconds()*2000L));
        blocks.values().removeIf(b -> b.expiresAt <= now);
    }
    public synchronized boolean revoke(String subject) {
        boolean had = blocks.remove(subject) != null;
        subjects.remove(subject); // Reset evidence so an approved account is not immediately blocked again.
        blockListener.accept(subject, null);
        return had;
    }
    public synchronized List<Block> blocks(long now) { cleanup(now); return blocks.values().stream().filter(b -> b.expiresAt > now).toList(); }
    public synchronized Map<String, Object> summary(long now) {
        cleanup(now);
        return Map.of("mode", policy.mode(), "enabled", policy.enabled(), "requests", requests, "limited", limited,
                "alerts", alerts, "subjects", subjects.size(), "activeBlocks", blocks(now).size(), "capacityMisses", capacityMisses);
    }
}
