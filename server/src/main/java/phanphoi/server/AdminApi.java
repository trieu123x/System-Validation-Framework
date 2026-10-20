package phanphoi.server;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpServer;
import phanphoi.common.web.Http;
import phanphoi.common.web.Router;
import phanphoi.common.web.StaticFiles;
import phanphoi.server.db.Db;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;

/**
 * Giao diện admin chạy trong chính ứng dụng server (SRS 2.2): HTTP API + SSE cho trang Next.js /admin.
 * Chỉ dùng cho giao diện quản trị; chi nhánh vẫn nói chuyện với server qua TCP.
 * Mọi /api/* trừ vài đường công khai đòi phiên đăng nhập công ty (AdminAuth).
 */
public final class AdminApi implements AutoCloseable {

    private final ServerContext ctx;
    private final HttpServer http;
    private final Map<String, Object> info;
    private final AdminAuth auth;

    /** Không cần đăng nhập: trang đăng nhập cần biết vai trò và trạng thái phiên. */
    private static final Set<String> PUBLIC = Set.of("/api/role", "/api/auth/login", "/api/auth/me", "/api/auth/logout");

    public AdminApi(ServerContext ctx, String host, int port, Path uiDir, Map<String, Object> info,
                    boolean experimentApi, AdminAuth auth) throws IOException {
        this.ctx = ctx;
        this.info = info;
        this.auth = auth;
        this.http = HttpServer.create(new InetSocketAddress(host, port), 50);
        http.setExecutor(Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "admin-http");
            t.setDaemon(true);
            return t;
        }));
        Router r = routes();
        if (experimentApi) {
            ExperimentApi.register(r, ctx);
        }
        http.createContext("/api/", ex -> {
            String path = ex.getRequestURI().getPath().replaceAll("/+$", "");
            // API thực nghiệm (trình giả lập tải) chỉ bật khi experiment.api=true và chỉ nghe trên localhost
            boolean open = PUBLIC.contains(path) || (experimentApi && path.startsWith("/api/experiment/"));
            if (!open && !auth.valid(ex)) {
                Http.error(ex, 401, "Chua dang nhap");
                return;
            }
            r.handle(ex);
        });
        http.createContext("/", new StaticFiles(uiDir));
    }

    public void start() {
        http.start();
    }

    private Router routes() {
        Router r = new Router();
        r.get("/api/role", (ex, p) -> Http.ok(ex, Map.of("role", "admin")));
        r.get("/api/info", (ex, p) -> Http.ok(ex, info));

        // ---- đăng nhập công ty ----
        r.get("/api/auth/me", (ex, p) -> {
            boolean in = auth.valid(ex);
            Http.ok(ex, Map.of("loggedIn", in, "user", in ? auth.user() : ""));
        });
        r.post("/api/auth/login", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String token = auth.login(Http.str(b, "user"), Http.str(b, "matKhau"));
            if (token == null) {
                throw new Http.ApiException(401, "Sai ten dang nhap hoac mat khau");
            }
            ex.getResponseHeaders().add("Set-Cookie", AdminAuth.setCookie(token));
            Http.ok(ex, Map.of("loggedIn", true, "user", auth.user()));
        });
        r.post("/api/auth/logout", (ex, p) -> {
            auth.logout(ex);
            ex.getResponseHeaders().add("Set-Cookie", AdminAuth.clearCookie());
            Http.ok(ex, Map.of("loggedIn", false));
        });
        r.get("/api/events", (ex, p) -> ctx.events().hub().open(ex,
                () -> new String[]{Events.BRANCHES, Http.GSON.toJson(Map.of("online", ctx.registry().onlineIds()))}));

        // ---- chi nhánh (FR-03) ----
        r.get("/api/branches", (ex, p) -> Http.ok(ex, ctx.stock().branches(ctx.registry().onlineIds())));

        // ---- sản phẩm, kho tổng (FR-07..09) ----
        r.get("/api/products", (ex, p) -> Http.ok(ex, ctx.stock().products()));
        r.post("/api/products", (ex, p) -> {
            JsonObject b = Http.body(ex);
            ctx.stock().addProduct(Http.str(b, "maSp"), Http.str(b, "ten"), Http.str(b, "donVi"), money(b));
            Http.ok(ex, Map.of("ok", true));
        });
        r.put("/api/products/{id}", (ex, p) -> {
            JsonObject b = Http.body(ex);
            ctx.stock().updateProduct(p.get(0), Http.str(b, "ten"), Http.str(b, "donVi"), money(b));
            Http.ok(ex, Map.of("ok", true));
        });
        r.delete("/api/products/{id}", (ex, p) -> {
            ctx.stock().deleteProduct(p.get(0));
            Http.ok(ex, Map.of("ok", true));
        });
        r.get("/api/imports", (ex, p) -> Http.ok(ex, ctx.stock().imports(100)));
        r.post("/api/imports", (ex, p) -> {
            JsonObject b = Http.body(ex);
            int ton = ctx.stock().importStock(Http.str(b, "maSp"), Http.integer(b, "soLuong"), Http.str(b, "nhaCungCap"));
            Http.ok(ex, Map.of("tonTong", ton));
        });
        r.get("/api/stock/branches", (ex, p) ->
                Http.ok(ex, ctx.stock().branchStock(Http.query(ex).getOrDefault("maCn", ""))));
        r.get("/api/reconcile", (ex, p) -> Http.ok(ex, ctx.stock().reconcile()));

        // ---- cảnh báo, cấp hàng (FR-15, FR-16, FR-23) ----
        r.get("/api/alerts", (ex, p) -> Http.ok(ex, ctx.requests().pendingAlerts()));
        r.get("/api/requests", (ex, p) -> {
            Map<String, String> q = Http.query(ex);
            Http.ok(ex, ctx.requests().search(q.getOrDefault("maCn", ""), q.getOrDefault("maSp", ""),
                    q.getOrDefault("trangThai", ""), q.getOrDefault("tu", ""), q.getOrDefault("den", "")));
        });
        r.post("/api/requests/{id}/offer", (ex, p) -> {
            ctx.requests().offer(Integer.parseInt(p.get(0)), Http.integer(Http.body(ex), "soLuong"));
            Http.ok(ex, Map.of("ok", true));
        });
        r.post("/api/requests/{id}/ship", (ex, p) -> {
            ctx.requests().ship(Integer.parseInt(p.get(0)), Http.integer(Http.body(ex), "soLuong"));
            Http.ok(ex, Map.of("ok", true));
        });
        r.post("/api/requests/{id}/shortage", (ex, p) -> {
            ctx.requests().reportShortage(Integer.parseInt(p.get(0)), Http.integer(Http.body(ex), "soLuong"));
            Http.ok(ex, Map.of("ok", true));
        });

        // ---- điều chuyển (7.2-B) ----
        r.get("/api/transfers", (ex, p) -> Http.ok(ex, ctx.transfers().list()));

        // ---- thông báo (FR-22) ----
        r.post("/api/broadcast", (ex, p) -> {
            String noiDung = Http.str(Http.body(ex), "noiDung");
            if (noiDung.isEmpty()) {
                throw new Http.ApiException(400, "Noi dung trong");
            }
            int sent = ctx.outbox().broadcast(noiDung);
            Http.ok(ex, Map.of("guiNgay", sent));
        });

        // ---- nhật ký (FR-25) ----
        r.get("/api/logs", (ex, p) -> {
            Map<String, String> q = Http.query(ex);
            String maCn = q.getOrDefault("maCn", "");
            String lenh = q.getOrDefault("lenh", "");
            int limit = Math.min(Integer.parseInt(q.getOrDefault("limit", "200")), 2000);
            Http.ok(ex, ctx.db().read(c -> Db.rows(c, """
                    SELECT id, ma_cn, chieu, lenh, noi_dung, thoi_gian FROM nhat_ky
                    WHERE (? = '' OR ma_cn = ?) AND (? = '' OR lenh = ?)
                    ORDER BY id DESC LIMIT ?""", maCn, maCn, lenh, lenh, limit)));
        });
        r.get("/api/stats", (ex, p) -> Http.ok(ex, ctx.db().read(c -> {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("online", ctx.registry().onlineIds().size());
            s.put("ketNoi", ctx.registry().connections().size());
            s.put("ycMo", Db.one(c, "SELECT count(*) FROM yeu_cau WHERE trang_thai NOT IN ('HOAN_TAT','TU_CHOI')",
                    rs -> rs.getLong(1)));
            s.put("canhBaoCho", Db.one(c, "SELECT count(*) FROM yeu_cau WHERE trang_thai = 'CHO'", rs -> rs.getLong(1)));
            s.put("tinPhutQua", Db.one(c,
                    "SELECT count(*) FROM nhat_ky WHERE thoi_gian > CURRENT_TIMESTAMP - INTERVAL '1 minute'",
                    rs -> rs.getLong(1)));
            s.put("runtime", ExperimentApi.runtime(ctx));
            return s;
        })));
        return r;
    }

    private static BigDecimal money(JsonObject b) {
        String s = Http.str(b, "gia");
        try {
            return s.isEmpty() ? BigDecimal.ZERO : new BigDecimal(s);
        } catch (NumberFormatException e) {
            throw new Http.ApiException(400, "Gia khong hop le");
        }
    }

    @Override
    public void close() {
        http.stop(0);
    }
}
