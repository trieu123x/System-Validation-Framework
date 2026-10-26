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
        var browserSessions = new phanphoi.common.web.BrowserSessions(httpPort);
        var scraping = new phanphoi.common.security.ScrapingGuard(phanphoi.common.security.ScrapingPolicy.from(cfg));
        Object loginLock = new Object();
        Router api = routes(agent, browserSessions, loginLock, cfg.getBool("http.allow.server.override", false));
        // API chỉ nghe localhost nhưng trang web lạ trong trình duyệt vẫn gọi được: chặn Origin/Host lạ (CSRF, DNS rebinding)
        http.createContext("/api/", ex -> {
            if (!agent.allowHttp(ex.getRequestMethod(), ex.getRequestURI().getPath(),
                    ex.getRequestHeaders().getFirst("Origin"), ex.getRequestHeaders().getFirst("Host"))) {
                Http.error(ex, 403, "Origin/Host khong hop le");
                return;
            }
            String path = ex.getRequestURI().getPath().replaceAll("/+$", "");
            long now = System.currentTimeMillis();
            boolean authenticated = browserSessions.valid(ex, now, agent.branchIdentity());
            if (!authenticated && path.equals("/api/state") && ex.getRequestMethod().equals("GET")) {
                Http.ok(ex, agent.publicSnapshot()); return;
            }
            if (!authenticated && !Set.of("/api/role", "/api/config", "/api/login").contains(path)) {
                Http.error(ex, 401, "Chua dang nhap trinh duyet"); return;
            }
            boolean read = Set.of("/api/state", "/api/events", "/api/debt", "/api/history", "/api/inventory/refresh").contains(path);
            if (read || path.equals("/api/login")) {
                String ip = ex.getRemoteAddress().getAddress().getHostAddress();
                String branch = agent.branchIdentity();
                String subject = authenticated && branch != null ? "branch:" + branch : "unauth:" + ip;
                var d = scraping.evaluate(subject, ip, "HTTP", path, 0, now);
                if (d.emit() && authenticated && (d.denied() || d.risk() >= scraping.policy().blockRisk())) agent.scrapingReport(phanphoi.common.web.Http.GSON.toJson(d.metadata()));
                if (d.denied()) {
                    ex.getResponseHeaders().set("Retry-After", Integer.toString(d.retryAfter()));
                    Http.error(ex, 429, "Truy xuat qua muc. Thu lai sau " + d.retryAfter() + " giay"); return;
                }
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

    private static Router routes(BranchAgent agent, phanphoi.common.web.BrowserSessions browserSessions, Object loginLock, boolean allowServerOverride) {
        Router r = new Router();
        Map<String, Object> ok = Map.of("ok", true);
        r.get("/api/role", (ex, p) -> Http.ok(ex, Map.of("role", "branch")));
        r.get("/api/state", (ex, p) -> Http.ok(ex, agent.snapshot()));
        r.get("/api/events", (ex, p) -> agent.hub().open(ex,
                () -> new String[]{"state", Http.GSON.toJson(agent.snapshot())}, () -> browserSessions.valid(ex, System.currentTimeMillis(), agent.branchIdentity())));
        r.get("/api/config", (ex, p) -> Http.ok(ex, Map.of("server", agent.serverSetting())));
        r.get("/api/security", (ex, p) -> Http.ok(ex, agent.securitySnapshot()));
        r.get("/api/debt", (ex, p) -> {
            Map<String, Object> d = agent.debt();
            Http.ok(ex, d == null ? Map.of() : d);
        });
        r.post("/api/login", (ex, p) -> {
            JsonObject b = Http.body(ex);
            synchronized (loginLock) {
                String requestedServer = Http.str(b, "server");
                if (!allowServerOverride && !requestedServer.isBlank() && !requestedServer.equals(agent.serverSetting()))
                    throw new Http.ApiException(400, "Dia chi server duoc quan tri cau hinh; khong doi qua HTTP");
                String previous = agent.branchIdentity();
                var snapshot = agent.login(Http.str(b, "maCn"), Http.str(b, "matKhau"), Http.str(b, "server"));
                if (!java.util.Objects.equals(previous, agent.branchIdentity())) { browserSessions.clear(ex); agent.hub().closeAll(); }
                browserSessions.issue(ex, System.currentTimeMillis(), agent.branchIdentity());
                Http.ok(ex, snapshot);
            }
        });
        r.post("/api/logout", (ex, p) -> {
            synchronized (loginLock) {
                browserSessions.clear(ex);
                agent.hub().closeAll();
                agent.logout();
            }
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
