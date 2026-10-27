package phanphoi.server;

import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.server.db.Db;

import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

/** Business audit: one record per completed operation; no credentials or free-form payloads. */
public final class AuditLog implements AutoCloseable {
    private record Entry(LocalDateTime at, String source, String actor, String action,
                         String detail, String status, String ip) { }

    private final Db db;
    private final boolean quiet;
    private final BlockingQueue<Entry> queue = new ArrayBlockingQueue<>(20_000);
    private final Thread writer;
    private volatile boolean running = true;

    /** Schema is installed on startup, including on existing PostgreSQL volumes. */
    public static void ensure(Db db) throws java.sql.SQLException {
        db.read(c -> {
            try (var s = c.createStatement()) {
                s.execute("""
                    CREATE TABLE IF NOT EXISTS audit_log (
                        id BIGSERIAL PRIMARY KEY,
                        thoi_gian TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        nguon VARCHAR(12) NOT NULL,
                        actor VARCHAR(80) NOT NULL,
                        hanh_dong VARCHAR(80) NOT NULL,
                        chi_tiet VARCHAR(500) NOT NULL,
                        ket_qua VARCHAR(20) NOT NULL,
                        ip VARCHAR(64)
                    )
                    """);
                s.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(thoi_gian DESC)");
                s.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_actor_time ON audit_log(actor, thoi_gian DESC)");
            }
            return null;
        });
    }

    public AuditLog(Db db, boolean quiet) {
        this.db = db;
        this.quiet = quiet;
        writer = new Thread(this::loop, "audit-log-writer");
        writer.setDaemon(true);
        writer.start();
    }

    public void record(String source, String actor, String action, String detail, String status, String ip) {
        Entry e = new Entry(LocalDateTime.now(), clean(source, 12), clean(actor, 80),
                clean(action, 80), clean(detail, 500), clean(status, 20), clean(ip, 64));
        if (!queue.offer(e)) {
            System.err.println("[AUDIT] queue full; audit record dropped: " + e.action);
            return;
        }
        if (!quiet) {
            System.out.printf("[AUDIT] %s | %s | %s | %s | %s | ip=%s%n",
                    e.source, e.actor, e.action, e.detail, e.status, e.ip);
        }
    }

    private static String clean(String value, int maxLength) {
        if (value == null) return "-";
        // Never allow CR/LF/control injection into Docker logs.
        String s = value.replaceAll("[\\p{Cntrl}]", " ").trim();
        return s.length() > maxLength ? s.substring(0, maxLength) : s;
    }

    /** Whitelisted field summaries only. Never log LOGIN passwords or free-text comments. */
    public static String tcpDetail(Message m) {
        Command cmd = m.command();
        return switch (cmd) {
            case SALE, LOW_STOCK, SET_THRESHOLD ->
                    "maSp=" + safeParam(m, 0) + "; soLuong=" + safeParam(m, 1)
                            + (cmd == Command.LOW_STOCK ? "; ton=" + safeParam(m, 2) : "");
            case ACCEPT, RECEIVED -> "maYc=" + safeParam(m, 0) + "; soLuong=" + safeParam(m, 1);
            case REJECT, TRANSFER_ACCEPT, TRANSFER_REJECT -> "id=" + safeParam(m, 0);
            case NOTICE_REPLY -> "noticeId=" + safeParam(m, 0) + "; soLuong=" + safeParam(m, 2);
            case HISTORY_GET -> "tu=" + safeParam(m, 0) + "; den=" + safeParam(m, 1);
            case INVENTORY_GET -> "xem ton kho";
            case DEBT_GET -> "xem cong no";
            default -> "";
        };
    }

    private static String safeParam(Message m, int pos) {
        if (pos >= m.params().size()) return "?";
        String s = m.params().get(pos);
        if (s == null || s.isBlank()) return "-";
        // Numeric IDs, stock codes and ISO dates only; otherwise suppress the value.
        return s.matches("[A-Za-z0-9_-]{1,40}") ? s : "[redacted]";
    }

    /** Normalize dynamic IDs without exposing password-reset tokens or query-string data. */
    public static String routeDetail(String template, List<String> pathParams) {
        if (pathParams.isEmpty()) return template;
        StringBuilder b = new StringBuilder(template);
        for (String p : pathParams) {
            String safe = p != null && p.matches("[A-Za-z0-9_-]{1,40}") ? p : "[redacted]";
            b.append(" id=").append(safe);
        }
        return b.toString();
    }

    private void loop() {
        List<Entry> batch = new ArrayList<>(200);
        while (running || !queue.isEmpty()) {
            try {
                Entry first = queue.poll(500, TimeUnit.MILLISECONDS);
                if (first == null) continue;
                batch.add(first);
                queue.drainTo(batch, 199);
                write(batch);
            } catch (InterruptedException e) {
                // Continue draining already queued events before exit.
                running = false;
            } catch (Exception e) {
                System.err.println("[AUDIT] database write failed: " + e.getMessage());
            } finally {
                batch.clear();
            }
        }
    }

    private void write(List<Entry> entries) throws java.sql.SQLException {
        db.tx(c -> {
            try (PreparedStatement p = c.prepareStatement("""
                    INSERT INTO audit_log (thoi_gian, nguon, actor, hanh_dong, chi_tiet, ket_qua, ip)
                    VALUES (?, ?, ?, ?, ?, ?, ?)""")) {
                for (Entry e : entries) {
                    p.setTimestamp(1, Timestamp.valueOf(e.at));
                    p.setString(2, e.source);
                    p.setString(3, e.actor);
                    p.setString(4, e.action);
                    p.setString(5, e.detail);
                    p.setString(6, e.status);
                    p.setString(7, e.ip);
                    p.addBatch();
                }
                p.executeBatch();
            }
            return null;
        });
    }

    @Override public void close() throws InterruptedException {
        running = false;
        writer.join(5000);
    }
}
