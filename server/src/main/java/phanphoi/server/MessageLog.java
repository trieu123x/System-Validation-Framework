package phanphoi.server;

import phanphoi.server.db.Db;

import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * FR-25: ghi mọi tin vào nhat_ky với thời điểm tới mili-giây.
 * Ghi bất đồng bộ theo lô để ClientHandler không phải chờ CSDL (NFR-02).
 */
public final class MessageLog implements AutoCloseable {

    public static final String IN = "IN";
    public static final String OUT = "OUT";

    private record Entry(String maCn, String chieu, String lenh, String noiDung, LocalDateTime at) {
    }

    private final Db db;
    private final Events events;
    private static final int BATCH = 2000;
    private final BlockingQueue<Entry> queue = new LinkedBlockingQueue<>(100_000);
    private final Thread writer;
    private volatile boolean running = true;

    public MessageLog(Db db, Events events) {
        this.db = db;
        this.events = events;
        this.writer = new Thread(this::loop, "nhat-ky-writer");
        this.writer.setDaemon(true);
        this.writer.start();
    }

    public void log(String maCn, String chieu, String lenh, String noiDung) {
        LocalDateTime now = LocalDateTime.now();
        if (noiDung != null && noiDung.length() > 4096) {
            noiDung = noiDung.substring(0, 4096);
        }
        if (lenh != null && lenh.length() > 30) {
            lenh = lenh.substring(0, 30);
        }
        Entry e = new Entry(maCn, chieu, lenh == null ? "?" : lenh, noiDung, now);
        if (!queue.offer(e)) {
            System.err.println("[nhat_ky] hang doi day, bo 1 ban ghi");
        }
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("maCn", maCn);
        ev.put("chieu", chieu);
        ev.put("lenh", e.lenh);
        ev.put("noiDung", noiDung);
        ev.put("thoiGian", now.format(Db.TIME_FORMAT));
        events.publish(Events.MESSAGE, ev);
    }

    private void loop() {
        List<Entry> batch = new ArrayList<>(BATCH);
        while (running || !queue.isEmpty()) {
            try {
                Entry first = queue.poll(500, TimeUnit.MILLISECONDS);
                if (first == null) {
                    continue;
                }
                batch.add(first);
                queue.drainTo(batch, BATCH - 1);
                write(batch);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                running = false;
            } catch (Exception e) {
                System.err.println("[nhat_ky] loi ghi: " + e.getMessage());
            } finally {
                batch.clear();
            }
        }
    }

    private void write(List<Entry> batch) throws Exception {
        db.tx(c -> {
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO nhat_ky (ma_cn, chieu, lenh, noi_dung, thoi_gian) VALUES (?, ?, ?, ?, ?)")) {
                for (Entry e : batch) {
                    ps.setString(1, e.maCn);
                    ps.setString(2, e.chieu);
                    ps.setString(3, e.lenh);
                    ps.setString(4, e.noiDung);
                    ps.setTimestamp(5, Timestamp.valueOf(e.at));
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
    }
}
