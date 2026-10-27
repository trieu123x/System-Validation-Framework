package phanphoi.server;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Monitors actual browser heartbeat, independent of TCP gateway heartbeat. */
public final class BrowserMonitor implements AutoCloseable {
    public static final long TIMEOUT_MS = 35_000; // browser posts every 10s
    private static final long RETAIN_MS = 60 * 60_000;
    private static final int MAX_TRACKED = 2000;
    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private static final class Presence {
        final String branch, browserId;
        String ip;
        long tcpSession, lastSeenAt, offlineAt;
        boolean online = true;
        Presence(String branch, String browserId, String ip, long session, long time) {
            this.branch = branch; this.browserId = browserId; this.ip = ip;
            tcpSession = session; lastSeenAt = time;
        }
    }

    private final Map<String, Presence> sessions = new LinkedHashMap<>();
    private final NetworkLog log;
    private final ScheduledExecutorService check = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "browser-presence-check"); t.setDaemon(true); return t;
    });

    public BrowserMonitor(NetworkLog log) {
        this.log = log;
        check.scheduleWithFixedDelay(() -> {
            try { expire(System.currentTimeMillis()); }
            catch (RuntimeException ex) { System.err.println("[NETWORK] browser monitor: " + ex.getMessage()); }
        }, 5, 5, TimeUnit.SECONDS);
    }

    public synchronized void heartbeat(String branch, long tcpSession, String browserId, String ip, long now) {
        if (!valid(branch, browserId)) return;
        String key = branch + ":" + browserId;
        Presence p = sessions.get(key);
        if (p == null) {
            if (sessions.size() >= MAX_TRACKED) prune(now);
            if (sessions.size() >= MAX_TRACKED) return;
            p = new Presence(branch, browserId, ip, tcpSession, now);
            sessions.put(key, p);
            log.browser(branch, browserId, "BROWSER_CONNECTED", "HEARTBEAT_START", ip, tcpSession, null);
        } else {
            if (p.online && now - p.lastSeenAt >= TIMEOUT_MS) offline(p, "HEARTBEAT_TIMEOUT", now);
            if (!p.online) {
                long downtime = p.offlineAt == 0 ? 0 : Math.max(0, now - p.offlineAt);
                log.browser(branch, browserId, "BROWSER_RECONNECTED", "HEARTBEAT_RESTORED", ip, tcpSession, downtime);
                p.online = true;
                p.offlineAt = 0;
            }
            p.ip = ip;
            p.tcpSession = tcpSession;
            p.lastSeenAt = now;
        }
    }

    public synchronized void exit(String branch, String browserId, String reason, long now) {
        if (!valid(branch, browserId)) return;
        Presence p = sessions.remove(branch + ":" + browserId);
        if (p != null && p.online) offline(p, reason.equals("USER_LOGOUT") ? reason : "SESSION_EXPIRED", now);
    }

    public synchronized void gatewayDisconnected(String branch, long tcpSession, long now) {
        for (Presence p : sessions.values()) {
            if (p.online && p.branch.equals(branch) && p.tcpSession == tcpSession)
                offline(p, "GATEWAY_DISCONNECTED", now);
        }
    }

    /** Public for deterministic unit testing; scheduler also invokes this. */
    public synchronized void expire(long now) {
        for (Presence p : sessions.values())
            if (p.online && now - p.lastSeenAt >= TIMEOUT_MS) offline(p, "HEARTBEAT_TIMEOUT", now);
        prune(now);
    }

    private void offline(Presence p, String reason, long now) {
        p.online = false;
        p.offlineAt = now;
        log.browser(p.branch, p.browserId, "BROWSER_OFFLINE", reason, p.ip, p.tcpSession, null);
    }

    private void prune(long now) {
        sessions.values().removeIf(p -> !p.online && now - p.offlineAt >= RETAIN_MS);
    }

    public synchronized List<Map<String, Object>> snapshot() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Presence p : sessions.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("maCn", p.branch);
            row.put("browserId", p.browserId.substring(0, 8)); // no cookie, no secret token
            row.put("trangThai", p.online ? "ONLINE" : "OFFLINE");
            row.put("ip", p.ip);
            row.put("lanCuoi", format(p.lastSeenAt));
            row.put("offlineTu", p.online ? null : format(p.offlineAt));
            rows.add(row);
        }
        rows.sort(Comparator.comparing(r -> (String) r.get("maCn")));
        return rows;
    }

    private static String format(long ms) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(ms), ZoneId.systemDefault()).format(FORMAT);
    }

    private static boolean valid(String branch, String id) {
        return branch != null && branch.matches("[A-Za-z0-9_-]{1,40}")
                && id != null && id.matches("[0-9a-f]{32}");
    }

    @Override public void close() { check.shutdownNow(); }
}
