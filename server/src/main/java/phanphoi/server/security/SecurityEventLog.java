package phanphoi.server.security;

import phanphoi.server.Events;
import phanphoi.server.db.Db;

import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Ghi sự kiện an ninh vào su_kien_bao_mat bất đồng bộ theo lô (như MessageLog) và đẩy SSE "security".
 * Hàng đợi 10 000 sự kiện; đầy thì bỏ sự kiện mới và đếm số bỏ, không bao giờ chặn luồng Selector.
 */
public final class SecurityEventLog implements EventSink, AutoCloseable {

    private static final int BATCH = 500;

    private final Db db;
    private final Events events;
    private final BlockingQueue<SecurityEvent> queue = new ArrayBlockingQueue<>(10_000);
    private final java.util.concurrent.ThreadPoolExecutor realtime = new java.util.concurrent.ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(1000), r -> { Thread t = new Thread(r, "security-sse"); t.setDaemon(true); return t; },
            new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
    private final AtomicLong realtimeDropped = new AtomicLong();
    public long realtimeDropped() { return realtimeDropped.get(); }
    private final AtomicLong dropped = new AtomicLong();
    private final Thread writer;
    private volatile boolean running = true;

    public SecurityEventLog(Db db, Events events) {
        this.db = db;
        this.events = events;
        this.writer = new Thread(this::loop, "su-kien-writer");
        this.writer.setDaemon(true);
        this.writer.start();
    }

    @Override
    public void emit(SecurityEvent e) {
        if (!queue.offer(e)) {
            dropped.incrementAndGet();
            return;
        }
        // The writer publishes only after commit: dashboard snapshots can see the same event. 
    }

    @Override
    public long dropped() {
        return dropped.get();
    }

    private void loop() {
        List<SecurityEvent> batch = new ArrayList<>(BATCH);
        while (running || !queue.isEmpty()) {
            try {
                SecurityEvent first = queue.poll(500, TimeUnit.MILLISECONDS);
                if (first == null) {
                    continue;
                }
                batch.add(first);
                queue.drainTo(batch, BATCH - 1);
                write(batch);
                for (SecurityEvent event : batch) {
                    try { realtime.execute(() -> events.publish(Events.SECURITY, event.toMap())); }
                    catch (java.util.concurrent.RejectedExecutionException e) { realtimeDropped.incrementAndGet(); }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                running = false;
            } catch (Exception e) {
                dropped.addAndGet(batch.size());
                System.err.println("[su_kien_bao_mat] loi ghi: " + e.getMessage());
            } finally {
                batch.clear();
            }
        }
    }

    private void write(List<SecurityEvent> batch) throws Exception {
        db.tx(c -> {
            try (PreparedStatement ps = c.prepareStatement("""
                    INSERT INTO su_kien_bao_mat (thoi_gian, nguon, loai, muc, ip, ma_cn, chi_tiet, hanh_dong, event_key, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")) {
                for (SecurityEvent e : batch) {
                    ps.setTimestamp(1, Timestamp.valueOf(e.thoiGian()));
                    ps.setString(2, e.nguon());
                    ps.setString(3, e.loai());
                    ps.setString(4, e.muc());
                    ps.setString(5, e.ip());
                    ps.setString(6, e.maCn());
                    ps.setString(7, e.chiTiet());
                    ps.setString(8, e.hanhDong());
                    ps.setString(9, e.eventKey());
                    ps.setString(10, phanphoi.common.web.Http.GSON.toJson(e.metadata()));
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            return null;
        });
    }

    @Override
    public void close() throws InterruptedException {
        running = false;
        writer.join(3000);
        realtime.shutdownNow();
    }
}
