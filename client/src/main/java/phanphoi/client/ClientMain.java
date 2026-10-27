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

    private static final class Session {
        final BranchAgent agent;
        final Router routes;
        final String browserId = java.util.UUID.randomUUID().toString().replace("-", "");
        final java.util.concurrent.atomic.AtomicLong forwardedAt = new java.util.concurrent.atomic.AtomicLong();
        Session(BranchAgent agent, Router routes) { this.agent = agent; this.routes = routes; }
        // Bound a compromised authenticated browser to at most one TCP heartbeat / 5 seconds.
        boolean shouldForward(long now) {
            while (true) {
                long prior = forwardedAt.get();
                if (prior != 0 && now - prior < 5_000) return false;
                if (forwardedAt.compareAndSet(prior, now)) return true;
            }
        }
    }

    public static void main(String[] args) throws Exception {
        Config cfg = Config.load("config/client.properties", args);
        String host = cfg.get("http.host", "127.0.0.1");
        int port = cfg.getInt("http.port", 8081);
        String serverSetting = cfg.get("server", "auto");
        int defaultPort = cfg.getInt("server.port", Protocol.DEFAULT_TCP_PORT);
        int discoveryPort = cfg.getInt("discovery.port", Protocol.DEFAULT_DISCOVERY_PORT);
        var allowedOrigins = Arrays.stream(cfg.get("security.allowed.origins", "http://localhost:3000,http://localhost:3001")
                .split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        var browserSessions = new phanphoi.common.web.BrowserSessions(port);
        var live = new java.util.concurrent.ConcurrentHashMap<String, Session>();
        var cleanup = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread th = new Thread(r, "branch-session-cleanup"); th.setDaemon(true); return th;
        });
        cleanup.scheduleWithFixedDelay(() -> {
            long current = System.currentTimeMillis();
            live.forEach((id, s) -> {
                if (!browserSessions.validToken(id, current) && live.remove(id, s)) {
                    s.agent.browserExit(s.browserId, "SESSION_EXPIRED");
                    s.agent.stop();
                }
            });
        }, 60, 60, java.util.concurrent.TimeUnit.SECONDS);
        var scraping = new phanphoi.common.security.ScrapingGuard(phanphoi.common.security.ScrapingPolicy.from(cfg));
        boolean allowOverride = cfg.getBool("http.allow.server.override", false);
        Object loginLock = new Object();
        HttpServer http = HttpServer.create(new InetSocketAddress(host, port), 50);
        http.setExecutor(Executors.newCachedThreadPool(r -> {
            Thread th = new Thread(r, "branch-http"); th.setDaemon(true); return th;
        }));
        http.createContext("/api/", ex -> {
            String path = ex.getRequestURI().getPath().replaceAll("/+$", "");
            // Reject cross-site requests BEFORE looking up the browser session: 403, not 401.
            // Tailscale Funnel must forward the original Origin header unchanged.
            var origin = ex.getRequestHeaders().getFirst("Origin");
            var requestHost = ex.getRequestHeaders().getFirst("Host");
            var originVerdict = phanphoi.common.web.OriginGuard.check(origin, requestHost, allowedOrigins);
            if (originVerdict != phanphoi.common.web.OriginGuard.Verdict.OK) {
                String category = originVerdict == phanphoi.common.web.OriginGuard.Verdict.CSRF
                        ? "CLIENT_CSRF" : "CLIENT_DNS_REBIND";
                // Header fields are untrusted: sanitize before printing to Docker logs.
                System.err.println("[SECURITY] " + category + " | "
                        + safeLog(ex.getRequestMethod()) + " " + safeLog(path)
                        + " | HTTP_403 | Origin=" + safeLog(origin)
                        + " | Host=" + safeLog(requestHost));
                Http.error(ex, 403, "Origin/Host khong hop le"); return;
            }
            if (path.equals("/api/password/forgot") || path.equals("/api/password/reset")) {
                if (!"POST".equals(ex.getRequestMethod())) { Http.error(ex, 405, "Method not allowed"); return; }
                try {
                    JsonObject b = Http.body(ex);
                    JsonObject outgoing = new JsonObject();
                    outgoing.addProperty("scope", "branch");
                    if (path.endsWith("/forgot")) {
                        outgoing.addProperty("email", Http.str(b, "email"));
                        outgoing.addProperty("branchHint", Http.str(b, "branchHint"));
                    } else {
                        outgoing.addProperty("token", Http.str(b, "token"));
                        outgoing.addProperty("password", Http.str(b, "password"));
                    }
                    String target = "http://" + System.getenv().getOrDefault("PASSWORD_RESET_BACKEND_HOST", serverSetting.startsWith("server:") ? "server" : "127.0.0.1") + ":8080"
                            + (path.endsWith("/forgot") ? "/api/auth/recovery/request" : "/api/auth/recovery/confirm");
                    var req = java.net.http.HttpRequest.newBuilder(java.net.URI.create(target))
                            .timeout(java.time.Duration.ofSeconds(8)).header("Content-Type", "application/json")
                            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(Http.GSON.toJson(outgoing))).build();
                    var res = java.net.http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(3)).build()
                            .send(req, java.net.http.HttpResponse.BodyHandlers.ofString());
                    ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                    ex.getResponseHeaders().set("Cache-Control", "no-store");
                    byte[] response = res.body().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    ex.sendResponseHeaders(res.statusCode(), response.length);
                    try (var out = ex.getResponseBody()) { out.write(response); }
                } catch (Exception err) {
                    Http.error(ex, 503, "Khong ket noi duoc Server dat lai mat khau");
                }
                return;
            }
            long now = System.currentTimeMillis();
            String token = browserSessions.sessionToken(ex);
            Session session = live.get(token);
            if (session != null && !browserSessions.valid(ex, now, session.agent.branchIdentity())) {
                if (live.remove(token, session)) {
                    session.agent.browserExit(session.browserId, "SESSION_EXPIRED");
                    session.agent.stop();
                }
                session = null;
            }
            boolean authenticated = session != null;
            String clientIp = ex.getRemoteAddress().getAddress().getHostAddress();
            if (Set.of("/api/state", "/api/events", "/api/debt", "/api/history", "/api/inventory/refresh", "/api/login").contains(path)) {
                String subject = authenticated ? "branch:" + session.agent.branchIdentity() + ":" + clientIp : "unauth:" + clientIp;
                var d = scraping.evaluate(subject, clientIp, "HTTP", path, 0, now);
                if (authenticated && d.emit() && (d.denied() || d.risk() >= scraping.policy().blockRisk()))
                    session.agent.scrapingReport(Http.GSON.toJson(d.metadata()));
                if (d.denied()) {
                    ex.getResponseHeaders().set("Retry-After", Integer.toString(d.retryAfter()));
                    Http.error(ex, 429, "Truy xuat qua muc. Thu lai sau " + d.retryAfter() + " giay"); return;
                }
            }
            if (path.equals("/api/login")) {
                if (!ex.getRequestMethod().equals("POST")) { Http.error(ex, 405, "Method not allowed"); return; }
                if (authenticated) { Http.error(ex, 409, "Hay dang xuat truoc"); return; }
                com.google.gson.JsonObject body;
                try { body = Http.body(ex); }
                catch (Http.ApiException e) { Http.error(ex,e.status(),e.getMessage()); return; }
                String chosenServer = Http.str(body, "server");
                if (!allowOverride && !chosenServer.isBlank() && !chosenServer.equals(serverSetting)) {
                    Http.error(ex, 400, "Dia chi server duoc quan tri cau hinh"); return;
                }
                String login = Http.str(body, "maCn").trim();
                String hint = Http.str(body, "branchHint").trim();
                if (!hint.isBlank()) login = login + "#" + hint.toUpperCase(java.util.Locale.ROOT);
                BranchAgent agent = new BranchAgent(serverSetting, defaultPort, discoveryPort,
                        ReconnectPolicy.parse(cfg.get("reconnect.strategy", "jitter"),
                                cfg.getInt("reconnect.base.ms", 500), cfg.getInt("reconnect.cap.ms", 5000)),
                        new ClientSecurity(allowedOrigins, cfg.getInt("security.api.max.per.second", 30)));
                agent.start();
                synchronized (loginLock) {
                    try {
                        var snapshot = agent.login(login, Http.str(body, "matKhau"), chosenServer);
                        String issued = browserSessions.issue(ex, System.currentTimeMillis(), agent.branchIdentity());
                        live.put(issued, new Session(agent, routes(agent, browserSessions)));
                        Http.ok(ex, snapshot);
                    } catch (Exception e) {
                        agent.stop();
                        if (e instanceof Http.ApiException apiError) Http.error(ex, apiError.status(), apiError.getMessage());
                        else Http.error(ex, 503, "Dang nhap that bai");
                    }
                }
                return;
            }
            if (path.equals("/api/role")) { Http.ok(ex, Map.of("role", "branch")); return; }
            if (path.equals("/api/config")) { Http.ok(ex, Map.of("server", serverSetting)); return; }
            if (!authenticated) {
                if (path.equals("/api/state") && ex.getRequestMethod().equals("GET")) {
                    Http.ok(ex, Map.of("status", "DISCONNECTED", "statusDetail", "Dang nhap de xem du lieu", "server", serverSetting));
                } else Http.error(ex, 401, "Chua dang nhap trinh duyet");
                return;
            }
            // Authenticated browser heartbeat, derived from secure session cookie (no browser-supplied branch ID).
            if (path.equals("/api/browser/heartbeat")) {
                if (!"POST".equals(ex.getRequestMethod())) { Http.error(ex, 405, "Method not allowed"); return; }
                if (!session.agent.allowHttp(ex.getRequestMethod(), path,
                        ex.getRequestHeaders().getFirst("Origin"), ex.getRequestHeaders().getFirst("Host"))) {
                    Http.error(ex, 403, "Origin/Host khong hop le"); return;
                }
                if (session.shouldForward(now)) {
                    try { session.agent.browserPresence(session.browserId, clientIp); }
                    catch (Http.ApiException e) { Http.error(ex, e.status(), e.getMessage()); return; }
                }
                Http.ok(ex, Map.of("ok", true)); return;
            }
            if (path.equals("/api/logout")) {
                if (!ex.getRequestMethod().equals("POST")) { Http.error(ex, 405, "Method not allowed"); return; }
                live.remove(token);
                session.agent.browserExit(session.browserId, "USER_LOGOUT");
                browserSessions.revoke(ex);
                session.agent.stop();
                Http.ok(ex, Map.of("ok", true)); return;
            }
            if (!session.agent.allowHttp(ex.getRequestMethod(), path,
                    ex.getRequestHeaders().getFirst("Origin"), ex.getRequestHeaders().getFirst("Host"))) {
                Http.error(ex, 403, "Origin/Host khong hop le"); return;
            }
            session.routes.handle(ex);
        });
        http.createContext("/", new StaticFiles(Path.of(cfg.get("ui.dir", "ui/out")), BranchSlug.PATH, "/branch/"));
        http.start();
        System.out.println("[client] Gateway chung: http://localhost:" + port + "/branch/");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            http.stop(0); cleanup.shutdownNow(); live.values().forEach(s -> s.agent.stop());
        }, "shutdown"));
        if (cfg.getBool("open.browser", true) && Desktop.isDesktopSupported()
                && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
            try { Desktop.getDesktop().browse(URI.create("http://localhost:" + port + "/branch/")); }
            catch (Exception ignored) { }
        }
    }

    /** Prevent log forging with header values and keep diagnostics concise. */
    private static String safeLog(String input) {
        if (input == null) return "(none)";
        String value = input.replaceAll("[\\r\\n\\t\\p{Cntrl}]", "_");
        return value.length() > 160 ? value.substring(0, 160) : value;
    }

    private static Router routes(BranchAgent agent, phanphoi.common.web.BrowserSessions browserSessions) {
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
            agent.received(Integer.parseInt(p.get(0)), Http.integer(Http.body(ex), "soLuongNhan"));
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
