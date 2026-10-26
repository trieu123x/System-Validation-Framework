package phanphoi.client;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpServer;
import phanphoi.common.Config;
import phanphoi.common.Protocol;
import phanphoi.common.ReconnectPolicy;
import phanphoi.common.web.Http;
import phanphoi.common.web.Router;
import phanphoi.common.web.StaticFiles;

import java.awt.Desktop;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;

/**
 * Ứng dụng chi nhánh. Giữ kết nối TCP tới server và mở giao diện Next.js /branch trên máy này.
 * Chạy: java -jar client/target/client.jar [--config=config/client.properties] [http.port=8082 ...]
 */
public final class ClientMain {

    public static void main(String[] args) throws Exception {
        Config cfg = Config.load("config/client.properties", args);
        String host = cfg.get("http.host", "127.0.0.1");
        int httpPort = cfg.getInt("http.port", 8081);
        // Optional: lock one deployed client instance to one branch ID.
        // Blank means an independent client.jar may log in to any permitted branch.
        String fixedBranchId = cfg.get("branch.id", "").trim().toUpperCase(Locale.ROOT);

        BranchAgent agent = new BranchAgent(
                cfg.get("server", "auto"),
                cfg.getInt("server.port", Protocol.DEFAULT_TCP_PORT),
                cfg.getInt("discovery.port", Protocol.DEFAULT_DISCOVERY_PORT),
                ReconnectPolicy.parse(cfg.get("reconnect.strategy", "jitter"),
                        cfg.getInt("reconnect.base.ms", 500), cfg.getInt("reconnect.cap.ms", 5000)),
                new ClientSecurity(
                        Arrays.stream(cfg.get("security.allowed.origins", "http://localhost:3000,http://localhost:3001")
                                .split(",")).map(String::trim).filter(x -> !x.isEmpty()).toList(),
                        cfg.getInt("security.api.max.per.second", 30)));
        agent.start();

        HttpServer http = HttpServer.create(new InetSocketAddress(host, httpPort), 50);
        http.setExecutor(Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "branch-http");
            t.setDaemon(true);
            return t;
        }));
        Router api = routes(agent, fixedBranchId);
        // API chỉ nghe localhost nhưng trang web lạ trong trình duyệt vẫn gọi được: chặn Origin/Host lạ (CSRF, DNS rebinding)
        http.createContext("/api/", ex -> {
            if (!agent.allowHttp(ex.getRequestMethod(), ex.getRequestURI().getPath(),
                    ex.getRequestHeaders().getFirst("Origin"), ex.getRequestHeaders().getFirst("Host"))) {
                Http.error(ex, 403, "Origin/Host khong hop le");
                return;
            }
            api.handle(ex);
        });
        // trang chi nhánh mở theo tên: /da-nang/ phục vụ bản build của /branch/; đã đăng nhập thì / và /branch/ → 302 sang tên
        StaticFiles ui = new StaticFiles(Path.of(cfg.get("ui.dir", "ui/out")), BranchSlug.PATH, "/branch/");
        http.createContext("/", ex -> {
            String path = ex.getRequestURI().getPath();
            String slug = agent.slug();
            if (slug != null && !"branch".equals(slug) && Set.of("/", "/branch", "/branch/").contains(path)) {
                try (ex) {
                    ex.getResponseHeaders().set("Location", "/" + slug + "/");
                    ex.sendResponseHeaders(302, -1);
                }
                return;
            }
            ui.handle(ex);
        });
        http.start();

        String url = "http://" + ("0.0.0.0".equals(host) ? "localhost" : host) + ":" + httpPort + "/branch/";
        System.out.println("[client] giao dien chi nhanh: " + url);
        if (cfg.getBool("open.browser", true) && Desktop.isDesktopSupported()
                && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
            try {
                Desktop.getDesktop().browse(URI.create(url));
            } catch (Exception ignored) {
                // tự mở trình duyệt
            }
        }
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            agent.logout();
            http.stop(0);
        }, "shutdown"));
    }

    private static Router routes(BranchAgent agent, String fixedBranchId) {
        Router r = new Router();
        Map<String, Object> ok = Map.of("ok", true);
        r.get("/api/role", (ex, p) -> Http.ok(ex, Map.of("role", "branch")));
        r.get("/api/state", (ex, p) -> Http.ok(ex, agent.snapshot()));
        r.get("/api/events", (ex, p) -> agent.hub().open(ex,
                () -> new String[]{"state", Http.GSON.toJson(agent.snapshot())}));
        r.get("/api/config", (ex, p) -> Http.ok(ex, Map.of(
                "server", agent.serverSetting(), "branchId", fixedBranchId)));
        r.get("/api/security", (ex, p) -> Http.ok(ex, agent.securitySnapshot()));
        r.get("/api/debt", (ex, p) -> {
            Map<String, Object> d = agent.debt();
            Http.ok(ex, d == null ? Map.of() : d);
        });
        r.post("/api/login", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String requestedBranchId = Http.str(b, "maCn").trim().toUpperCase(Locale.ROOT);
            // Enforce on the server-side; a read-only input alone is not security.
            if (!fixedBranchId.isEmpty() && !fixedBranchId.equals(requestedBranchId)) {
                throw new Http.ApiException(403, "Trang nay chi cho phep dang nhap " + fixedBranchId);
            }
            Http.ok(ex, agent.login(requestedBranchId, Http.str(b, "matKhau"), Http.str(b, "server")));
        });
        r.post("/api/logout", (ex, p) -> {
            agent.logout();
            Http.ok(ex, ok);
        });
        r.post("/api/inventory/refresh", (ex, p) -> {
            agent.refreshInventory();
            Http.ok(ex, ok);
        });
        r.post("/api/sale", (ex, p) -> {
            JsonObject b = Http.body(ex);
            agent.sale(Http.str(b, "maHang"), Http.integer(b, "soLuong"));
            Http.ok(ex, ok);
        });
        r.post("/api/threshold", (ex, p) -> {
            JsonObject b = Http.body(ex);
            agent.setThreshold(Http.str(b, "maHang"), Http.integer(b, "nguong"));
            Http.ok(ex, ok);
        });
        r.post("/api/requests/{id}/accept", (ex, p) -> {
            agent.accept(Integer.parseInt(p.get(0)), Http.integer(Http.body(ex), "soLuong"));
            Http.ok(ex, ok);
        });
        r.post("/api/requests/{id}/reject", (ex, p) -> {
            agent.reject(Integer.parseInt(p.get(0)));
            Http.ok(ex, ok);
        });
        r.post("/api/requests/{id}/received", (ex, p) -> {
            agent.received(Integer.parseInt(p.get(0)));
            Http.ok(ex, ok);
        });
        r.post("/api/transfers/{id}/accept", (ex, p) -> {
            agent.transferAnswer(Integer.parseInt(p.get(0)), true);
            Http.ok(ex, ok);
        });
        r.post("/api/transfers/{id}/reject", (ex, p) -> {
            agent.transferAnswer(Integer.parseInt(p.get(0)), false);
            Http.ok(ex, ok);
        });
        r.post("/api/inbox/{id}/reply", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String soLuong = Http.str(b, "soLuong");
            agent.replyNotice(Long.parseLong(p.get(0)), Http.str(b, "traLoi"), soLuong.isEmpty() ? 0 : Http.integer(b, "soLuong"));
            Http.ok(ex, ok);
        });
        r.post("/api/history", (ex, p) -> {
            JsonObject b = Http.body(ex);
            agent.history(Http.str(b, "tu"), Http.str(b, "den"));
            Http.ok(ex, ok);
        });
        return r;
    }
}
