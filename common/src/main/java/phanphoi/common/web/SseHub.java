package phanphoi.common.web;

import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/** Server-Sent Events: đẩy sự kiện realtime xuống trình duyệt (popup cảnh báo, online/offline...). */
public final class SseHub {

    private final List<HttpExchange> clients = new CopyOnWriteArrayList<>();
    private final ScheduledExecutorService keepAlive = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "sse-keepalive");
        t.setDaemon(true);
        return t;
    });

    public SseHub() {
        keepAlive.scheduleAtFixedRate(() -> writeAll(": ping\n\n"), 15, 15, TimeUnit.SECONDS);
    }

    /** Mở luồng SSE; initial (có thể null) là sự kiện gửi ngay cho người mới vào. */
    public void open(HttpExchange ex, Supplier<String[]> initial) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.getResponseHeaders().set("X-Accel-Buffering", "no");
        ex.sendResponseHeaders(200, 0);
        if (initial != null) {
            String[] ev = initial.get();
            if (ev != null && !write(ex, frame(ev[0], ev[1]))) {
                return;
            }
        } else if (!write(ex, ": open\n\n")) {
            return;
        }
        clients.add(ex);
    }

    public void publish(String event, Object data) {
        writeAll(frame(event, Http.GSON.toJson(data)));
    }

    public int size() {
        return clients.size();
    }

    private static String frame(String event, String json) {
        return "event: " + event + "\ndata: " + json + "\n\n";
    }

    private void writeAll(String frame) {
        for (HttpExchange ex : clients) {
            if (!write(ex, frame)) {
                clients.remove(ex);
            }
        }
    }

    private static boolean write(HttpExchange ex, String frame) {
        try {
            OutputStream os = ex.getResponseBody();
            synchronized (ex) {
                os.write(frame.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }
            return true;
        } catch (IOException e) {
            ex.close();
            return false;
        }
    }
}
