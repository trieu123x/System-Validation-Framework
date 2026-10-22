package phanphoi.loadsim;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import phanphoi.common.web.Http;

import java.io.IOException;
import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Iterator;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.stream.Stream;

/**
 * Gọi API của server như giao diện admin: API thực nghiệm (chỉ mở trên localhost) và,
 * sau {@link #login}, các API cần phiên công ty (cookie) cùng luồng sự kiện SSE.
 */
final class AdminClient {

    /** Lỗi HTTP khác 200, giữ mã để phân biệt "kho không đủ" (400) với lỗi khác. */
    static final class HttpError extends IOException {
        final int status;

        HttpError(int status, String body) {
            super("HTTP " + status + ": " + body);
            this.status = status;
        }
    }

    private final String base;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .cookieHandler(new CookieManager())
            .build();

    AdminClient(String base) {
        this.base = base;
    }

    JsonObject login(String user, String password) throws IOException, InterruptedException {
        return post("/api/auth/login", Map.of("user", user, "matKhau", password));
    }

    JsonObject get(String path) throws IOException, InterruptedException {
        return send(HttpRequest.newBuilder(URI.create(base + path)).GET(), 30);
    }

    /** GET trả về mảng JSON (vd /api/security/events). */
    JsonArray getArray(String path) throws IOException, InterruptedException {
        HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(base + path)).GET()
                .timeout(Duration.ofSeconds(30)).build(), HttpResponse.BodyHandlers.ofString());
        if (r.statusCode() != 200) {
            throw new HttpError(r.statusCode(), r.body());
        }
        return Http.GSON.fromJson(r.body(), JsonArray.class);
    }

    JsonObject post(String path, Object body) throws IOException, InterruptedException {
        return post(path, body, 30);
    }

    JsonObject post(String path, Object body, int timeoutSeconds) throws IOException, InterruptedException {
        return send(HttpRequest.newBuilder(URI.create(base + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(Http.GSON.toJson(body))), timeoutSeconds);
    }

    /**
     * Nghe /api/events trên luồng hiện tại cho tới khi luồng bị ngắt hoặc server đóng.
     * handler nhận (tên sự kiện, JSON) theo đúng thứ tự server gửi.
     */
    void events(BiConsumer<String, JsonObject> handler) throws IOException, InterruptedException {
        HttpResponse<Stream<String>> r = http.send(HttpRequest.newBuilder(URI.create(base + "/api/events")).GET().build(),
                HttpResponse.BodyHandlers.ofLines());
        if (r.statusCode() != 200) {
            throw new HttpError(r.statusCode(), "SSE");
        }
        String event = null;
        try (Stream<String> lines = r.body()) {
            Iterator<String> it = lines.iterator();
            while (it.hasNext() && !Thread.currentThread().isInterrupted()) {
                String line = it.next();
                if (line.startsWith("event: ")) {
                    event = line.substring(7);
                } else if (line.startsWith("data: ") && event != null) {
                    String data = line.substring(6);
                    if (data.startsWith("{")) {
                        handler.accept(event, Http.GSON.fromJson(data, JsonObject.class));
                    }
                    event = null;
                }
            }
        }
    }

    private JsonObject send(HttpRequest.Builder b, int timeoutSeconds) throws IOException, InterruptedException {
        HttpResponse<String> r = http.send(b.timeout(Duration.ofSeconds(timeoutSeconds)).build(),
                HttpResponse.BodyHandlers.ofString());
        if (r.statusCode() != 200) {
            throw new HttpError(r.statusCode(), r.body());
        }
        return Http.GSON.fromJson(r.body(), JsonObject.class);
    }
}
