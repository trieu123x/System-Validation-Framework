package phanphoi.server;

import phanphoi.server.db.Db;

import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/** Connection lifecycle log for authenticated branch sessions (not a proof of Internet outages). */
public final class NetworkLog implements AutoCloseable {
    private record Entry(LocalDateTime at, String branch, String event, String reason, String ip,
                         long sessionId, Long downtimeMs, String browserId) { }

    private final Db db;
    private final boolean quiet;
    private final BlockingQueue<Entry> queue = new ArrayBlockingQueue<>(20_000);
    private final Map<String, Long> disconnectedAt = new ConcurrentHashMap<>();
    private final Thread writer;
    private volatile boolean running = true;

    public static void ensure(Db db) throws java.sql.SQLException {
        db.read(c -> {
            try (var st = c.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS network_events (
                        id BIGSERIAL PRIMARY KEY,
                        thoi_gian TIMESTAMP(3) NOT NULL,
                        ma_cn VARCHAR(40) NOT NULL,
                        su_kien VARCHAR(24) NOT NULL,
                        ly_do VARCHAR(40) NOT NULL,
                        ip VARCHAR(64),
                        session_id BIGINT NOT NULL,
                        gian_doan_ms BIGINT
                    )
                    """);
                st.execute("ALTER TABLE network_events ADD COLUMN IF NOT EXISTS browser_id VARCHAR(40)");
                st.execute("CREATE INDEX IF NOT EXISTS idx_network_events_time ON network_events(thoi_gian DESC)");
                st.execute("CREATE INDEX IF NOT EXISTS idx_network_events_branch ON network_events(ma_cn, id DESC)");
                st.execute("CREATE INDEX IF NOT EXISTS idx_network_events_browser ON network_events(ma_cn, browser_id, id DESC)");
            }
            return null;
        });
    }

    public NetworkLog(Db db, boolean quiet) {
        this.db = db;
        this.quiet = quiet;
        writer = new Thread(this::writeLoop, "network-event-writer");
        writer.setDaemon(true);
        writer.start();
    }

    public void connected(String branch, String ip, long sessionId) {
        long now = System.currentTimeMillis();
        Long offlineAt = disconnectedAt.remove(branch);
        if (offlineAt == null) {
            record(branch, "CONNECTED", "LOGIN_SUCCESS", ip, sessionId, null);
        } else {
            record(branch, "RECONNECTED", "CONNECTION_RESTORED", ip, sessionId,
                    Math.max(0, now - offlineAt));
        }
    }

    public void disconnected(String branch, String ip, long sessionId, String reason) {
        if (reason == null || reason.isBlank()) reason = "REMOTE_CLOSED";
        // Deliberate logout, administrative actions and shutdown are not network incidents.
        if (!reason.equals("CLIENT_LOGOUT") && !reason.equals("ADMIN_KICK")
                && !reason.equals("IP_BANNED") && !reason.equals("SECURITY_KICK")
                && !reason.equals("SERVER_SHUTDOWN") && !reason.equals("SERVER_CLOSE")) {
            disconnectedAt.putIfAbsent(branch, System.currentTimeMillis());
        } else {
            disconnectedAt.remove(branch);
        }
        if (reason.equals("PONG_TIMEOUT")) record(branch, "TIMEOUT", reason, ip, sessionId, null);
        record(branch, "DISCONNECTED", reason, ip, sessionId, null);
    }

    /** Store only lifecycle transitions, never every browser heartbeat. */
    public void browser(String branch, String browserId, String event, String reason,
                        String ip, long sessionId, Long downtimeMs) {
        if (browserId == null || !browserId.matches("[0-9a-f]{32}")) return;
        record(branch, event, reason, ip, sessionId, downtimeMs, browserId);
    }

    private void record(String branch, String event, String reason, String ip, long sessionId, Long downtimeMs) {
        record(branch, event, reason, ip, sessionId, downtimeMs, null);
    }

    private void record(String branch, String event, String reason, String ip, long sessionId, Long downtimeMs, String browserId) {
        if (branch == null || !branch.matches("[A-Za-z0-9_-]{1,40}")) return;
        String safeIp = ip == null ? "" : ip.replaceAll("[^A-Za-z0-9.:]", "");
        if (safeIp.length() > 64) safeIp = safeIp.substring(0, 64);
        Entry entry = new Entry(LocalDateTime.now(), branch, event, reason, safeIp, sessionId, downtimeMs, browserId);
        if (!queue.offer(entry)) {
            System.err.println("[NETWORK] queue full, dropped event for " + branch);
            return;
        }
        if (!quiet) {
            System.out.printf("[NETWORK] %s | %s | %s | source=%s | session=%d | offlineMs=%s | ip=%s%n",
                    entry.branch, entry.event, entry.reason, entry.browserId == null ? "TCP" : "BROWSER",
                    entry.sessionId, entry.downtimeMs == null ? "-" : entry.downtimeMs, entry.ip);
        }
    }

    private void writeLoop() {
        List<Entry> batch = new ArrayList<>(200);
        while (running || !queue.isEmpty()) {
            try {
                Entry e = queue.poll(250, TimeUnit.MILLISECONDS);
                if (e == null) continue;
                batch.add(e);
                queue.drainTo(batch, 199);
                db.tx(c -> {
                    try (PreparedStatement ps = c.prepareStatement("""
                            INSERT INTO network_events(thoi_gian,ma_cn,su_kien,ly_do,ip,session_id,gian_doan_ms,browser_id)
                            VALUES(?,?,?,?,?,?,?,?)""")) {
                        for (Entry row : batch) {
                            ps.setTimestamp(1, Timestamp.valueOf(row.at));
                            ps.setString(2, row.branch);
                            ps.setString(3, row.event);
                            ps.setString(4, row.reason);
                            ps.setString(5, row.ip);
                            ps.setLong(6, row.sessionId);
                            if (row.downtimeMs == null) ps.setNull(7, java.sql.Types.BIGINT);
                            else ps.setLong(7, row.downtimeMs);
                            ps.setString(8, row.browserId);
                            ps.addBatch();
                        }
                        ps.executeBatch();
                    }
                    return null;
                });
            } catch (InterruptedException e) {
                // The shutdown path will drain the queue (bounded by the join timeout).
            } catch (Exception e) {
                System.err.println("[NETWORK] database write failed: " + e.getMessage());
            } finally {
                batch.clear();
            }
        }
    }

    @Override public void close() throws InterruptedException {
        running = false;
        writer.join(5000);
    }
}
