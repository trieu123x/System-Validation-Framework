package phanphoi.server.security;

import phanphoi.common.security.ScrapingGuard;
import phanphoi.server.db.Db;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** Ordered bounded persistence queue. Failures are visible; request threads never call JDBC. */
public final class ScrapingStore implements AutoCloseable {
    private final Db db;
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(2000), r -> { Thread t = new Thread(r, "scraping-audit"); t.setDaemon(true); return t; },
            new ThreadPoolExecutor.AbortPolicy());
    private final AtomicLong failures = new AtomicLong();
    public ScrapingStore(Db db, ScrapingGuard guard) {
        this.db = db;
        try {
            // Migration is explicit: deployment must apply db/migrate_anti_scraping.sql before starting this version.
            var saved = db.read(c -> Db.list(c, "SELECT subject, expires_at, reason FROM security_scraping_blocks WHERE expires_at > ?",
                    rs -> new ScrapingGuard.Block(rs.getString(1), rs.getLong(2), rs.getString(3)), System.currentTimeMillis()));
            saved.forEach(b -> guard.restore(b, System.currentTimeMillis()));
            // RAM queue is not an outbox: do not pretend pre-restart queued mail is still being delivered.
            db.read(c -> Db.update(c, "UPDATE security_email_delivery SET status='INTERRUPTED', updated_at=CURRENT_TIMESTAMP WHERE status='QUEUED'"));
        } catch (Exception e) {
            worker.shutdown();
            throw new IllegalStateException("Apply db/migrate_anti_scraping.sql before starting the server", e);
        }
        guard.onBlockChange((subject, block) -> submit(() -> db.read(c -> block == null
                ? Db.update(c, "DELETE FROM security_scraping_blocks WHERE subject = ?", subject)
                : Db.update(c, "INSERT INTO security_scraping_blocks(subject, expires_at, reason) VALUES(?,?,?) ON CONFLICT(subject) DO UPDATE SET expires_at=EXCLUDED.expires_at, reason=EXCLUDED.reason",
                    subject, block.expiresAt(), block.reason()))));
    }
    public void email(String eventKey, String recipient, String status, int attempts) {
        submit(() -> db.read(c -> Db.update(c, """
            INSERT INTO security_email_delivery(event_key, recipient, status, attempts) VALUES(?,?,?,?)
            ON CONFLICT(event_key, recipient) DO UPDATE SET status=EXCLUDED.status, attempts=EXCLUDED.attempts, updated_at=CURRENT_TIMESTAMP
            WHERE security_email_delivery.status NOT IN ('SENT', 'FAILED') OR EXCLUDED.status <> 'SUPPRESSED'
            """, eventKey, recipient, status, attempts)));
    }
    @FunctionalInterface private interface Work { Object run() throws Exception; }
    private void submit(Work work) {
        try { worker.execute(() -> { try { work.run(); } catch (Exception e) { failures.incrementAndGet();
            System.err.println("[scraping-audit] write failed: " + e.getClass().getSimpleName()); } }); }
        catch (RejectedExecutionException e) { failures.incrementAndGet(); }
    }
    public Map<String, Object> status() { return Map.of("pending", worker.getQueue().size(), "failures", failures.get()); }
    @Override public void close() {
        worker.shutdown();
        try { if (!worker.awaitTermination(5, TimeUnit.SECONDS)) failures.addAndGet(worker.shutdownNow().size()); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
