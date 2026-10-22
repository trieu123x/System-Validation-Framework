package phanphoi.common.web;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.regex.Pattern;

/** Phục vụ bản build tĩnh của giao diện Next.js (thư mục ui/out). */
public final class StaticFiles implements HttpHandler {

    private static final Map<String, String> TYPES = Map.ofEntries(
            Map.entry("html", "text/html; charset=utf-8"),
            Map.entry("js", "text/javascript; charset=utf-8"),
            Map.entry("css", "text/css; charset=utf-8"),
            Map.entry("json", "application/json"),
            Map.entry("txt", "text/plain; charset=utf-8"),
            Map.entry("svg", "image/svg+xml"),
            Map.entry("png", "image/png"),
            Map.entry("ico", "image/x-icon"),
            Map.entry("woff2", "font/woff2"),
            Map.entry("map", "application/json"));

    private final Path root;
    private final Pattern fallbackPaths;
    private final String fallbackPage;

    public StaticFiles(Path root) {
        this(root, null, null);
    }

    /**
     * Đường dẫn không có file mà khớp {@code fallbackPaths} thì trả trang {@code fallbackPage}
     * (vd client.jar: /da-nang/ → branch/index.html).
     */
    public StaticFiles(Path root, Pattern fallbackPaths, String fallbackPage) {
        this.root = root.toAbsolutePath().normalize();
        this.fallbackPaths = fallbackPaths;
        this.fallbackPage = fallbackPage;
    }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        try (ex) {
            if (!"GET".equals(ex.getRequestMethod()) && !"HEAD".equals(ex.getRequestMethod())) {
                ex.sendResponseHeaders(405, -1);
                return;
            }
            String path = ex.getRequestURI().getPath();
            Path file = resolve(path);
            if (file == null && fallbackPaths != null && fallbackPaths.matcher(path).matches()) {
                file = resolve(fallbackPage);
            }
            if (file == null) {
                if (!Files.isDirectory(root)) {
                    send(ex, 404, "text/plain; charset=utf-8", ("Chua build giao dien. Chay: cd ui && npm install && npm run build\n"
                            + "(dang tim o " + root + ")").getBytes(StandardCharsets.UTF_8));
                    return;
                }
                Path notFound = root.resolve("404.html");
                byte[] body = Files.exists(notFound) ? Files.readAllBytes(notFound) : "404".getBytes(StandardCharsets.UTF_8);
                send(ex, 404, TYPES.get("html"), body);
                return;
            }
            String name = file.getFileName().toString();
            String ext = name.substring(name.lastIndexOf('.') + 1);
            send(ex, 200, TYPES.getOrDefault(ext, "application/octet-stream"), Files.readAllBytes(file));
        }
    }

    private Path resolve(String uriPath) {
        if (uriPath.contains("..")) {
            return null;
        }
        Path p = root.resolve(uriPath.replaceFirst("^/+", "")).normalize();
        if (!p.startsWith(root)) {
            return null;
        }
        if (Files.isDirectory(p)) {
            p = p.resolve("index.html");
        } else if (!Files.exists(p) && Files.exists(Path.of(p + ".html"))) {
            p = Path.of(p + ".html");
        }
        return Files.isRegularFile(p) ? p : null;
    }

    private static void send(HttpExchange ex, int status, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        boolean head = "HEAD".equals(ex.getRequestMethod());
        ex.sendResponseHeaders(status, head ? -1 : body.length);
        if (!head) {
            try (OutputStream os = ex.getResponseBody()) {
                os.write(body);
            }
        }
    }
}
