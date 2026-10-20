package phanphoi.common.web;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Tiện ích JSON cho HTTP API cục bộ phục vụ giao diện Next.js. */
public final class Http {

    public static final Gson GSON = new GsonBuilder().serializeNulls().create();

    private Http() {
    }

    /** Lỗi trả về cho giao diện kèm mã HTTP. */
    public static class ApiException extends RuntimeException {
        private final int status;

        public ApiException(int status, String message) {
            super(message);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    public static void json(HttpExchange ex, int status, Object body) throws IOException {
        byte[] bytes = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    public static void ok(HttpExchange ex, Object body) throws IOException {
        json(ex, 200, body);
    }

    public static void error(HttpExchange ex, int status, String message) throws IOException {
        json(ex, status, Map.of("error", message == null ? "Loi khong xac dinh" : message));
    }

    public static JsonObject body(HttpExchange ex) throws IOException {
        try (InputStream in = ex.getRequestBody()) {
            String s = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            if (s.isBlank()) {
                return new JsonObject();
            }
            return GSON.fromJson(s, JsonObject.class);
        } catch (JsonParseException | ClassCastException e) {
            throw new ApiException(400, "JSON khong hop le");
        }
    }

    public static String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString().trim() : "";
    }

    public static int integer(JsonObject o, String key) {
        try {
            return Integer.parseInt(str(o, key));
        } catch (NumberFormatException e) {
            throw new ApiException(400, "Truong '" + key + "' phai la so nguyen");
        }
    }

    public static Map<String, String> query(HttpExchange ex) {
        Map<String, String> m = new HashMap<>();
        String q = ex.getRequestURI().getRawQuery();
        if (q == null || q.isEmpty()) {
            return m;
        }
        for (String pair : q.split("&")) {
            int eq = pair.indexOf('=');
            String k = eq < 0 ? pair : pair.substring(0, eq);
            String v = eq < 0 ? "" : pair.substring(eq + 1);
            m.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8).trim());
        }
        return m;
    }
}
