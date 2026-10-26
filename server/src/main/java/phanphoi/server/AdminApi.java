package phanphoi.server;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpServer;
import phanphoi.common.web.Http;
import phanphoi.common.web.OriginGuard;
import phanphoi.common.web.Router;
import phanphoi.common.web.StaticFiles;
import phanphoi.server.db.Db;
import phanphoi.server.service.NoticeService;
import phanphoi.server.service.StockService;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
    private final phanphoi.server.mail.PasswordRecovery recovery;
    private final phanphoi.server.security.RateCounter monitoringReads = new phanphoi.server.security.RateCounter(60);
    private final Object loginLock = new Object();

    /** Không cần đăng nhập: trang đăng nhập cần biết vai trò và trạng thái phiên. */
    private static final Set<String> PUBLIC = Set.of("/api/role", "/api/auth/login", "/api/auth/me", "/api/auth/logout", "/api/auth/recovery/request", "/api/auth/recovery/confirm");

    public AdminApi(ServerContext ctx, String host, int port, Path uiDir, Map<String, Object> info,
                    boolean experimentApi, AdminAuth auth, phanphoi.server.mail.PasswordRecovery recovery) throws IOException {
        this.ctx = ctx;
        this.info = info;
        this.auth = auth;
        this.recovery = recovery;
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
            if (!originAllowed(ex)) {
                Http.error(ex, 403, "Origin/Host khong hop le");
                return;
            }
            // API thực nghiệm (trình giả lập tải) chỉ bật khi experiment.api=true và chỉ nghe trên localhost
            boolean open = PUBLIC.contains(path) || (experimentApi && path.startsWith("/api/experiment/"));
            if (!open && !auth.valid(ex)) {
                Http.error(ex, 401, "Chua dang nhap");
                return;
            }
            if (!open && ex.getRequestMethod().equals("GET") && (path.startsWith("/api/security/") || path.equals("/api/mail/status"))) {
                long now = System.currentTimeMillis();
                monitoringReads.add(now);
                if (monitoringReads.sum(now, 60) > 600) {
                    ex.getResponseHeaders().set("Retry-After", "60");
                    Http.error(ex, 429, "Vuot quota giam sat (600/phut)"); return;
                }
            }
            // Monitoring/control routes remain accessible to resolve blocks. No query string is logged.
            if (!open && ex.getRequestMethod().equals("GET") && !path.startsWith("/api/security/")
                    && !path.equals("/api/mail/status") && !path.equals("/api/info")) {
                String resource = path.replaceAll("/[0-9]+(?=/|$)", "/{id}");
                var decision = ctx.security().onHttpRead(auth.user(), clientIp(ex), resource.length() > 100 ? resource.substring(0,100) : resource, System.currentTimeMillis());
                if (decision.denied()) {
                    ex.getResponseHeaders().set("Retry-After", Integer.toString(decision.retryAfter()));
                    Http.error(ex, 429, "Truy xuat qua muc. Thu lai sau " + decision.retryAfter() + " giay");
                    return;
                }
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
        r.get("/api/mail/status", (ex, p) -> Http.ok(ex, ctx.email().status()));

        // Public password recovery. All request responses are identical to avoid account enumeration.
        r.post("/api/auth/recovery/request", (ex,p) -> {
            JsonObject b = Http.body(ex);
            recovery.request(Http.str(b,"scope"), Http.str(b,"email"), Http.str(b,"branchHint"), clientIp(ex));
            Http.ok(ex, Map.of("ok",true,"message","Neu email hop le, ban se nhan duoc lien ket dat lai mat khau."));
        });
        r.post("/api/auth/recovery/confirm", (ex,p) -> {
            JsonObject b = Http.body(ex);
            try {
                if (!recovery.confirm(Http.str(b,"scope"),Http.str(b,"token"),Http.str(b,"password")))
                    throw new Http.ApiException(400,"Lien ket khong hop le, da dung hoac het han");
                Http.ok(ex,Map.of("ok",true));
            } catch (IllegalArgumentException bad) {
                throw new Http.ApiException(400,bad.getMessage());
            } catch (java.sql.SQLException err) {
                throw new Http.ApiException(503,"Khong the dat lai mat khau luc nay");
            }
        });
        // ---- đăng nhập công ty ----
        r.get("/api/auth/me", (ex, p) -> {
            boolean in = auth.valid(ex);
            Http.ok(ex, Map.of("loggedIn", in, "user", in ? auth.user() : ""));
        });
        r.post("/api/auth/login", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String token;
            // ADMIN_BRUTE_FORCE: sai admin.lock.fails lần thì khóa đăng nhập, kể cả khi sau đó nhập đúng.
            // Tuần tự hoá kiểm tra khóa → xác thực → đếm lần sai, để nhiều request song song không vượt quá số lần thử.
            synchronized (loginLock) {
                long locked = ctx.security().adminLockedUntil(System.currentTimeMillis());
                if (locked > 0) {
                    throw new Http.ApiException(429, "Dang nhap bi khoa den "
                            + java.time.LocalTime.ofInstant(java.time.Instant.ofEpochMilli(locked), java.time.ZoneId.systemDefault())
                            .withNano(0) + " vi sai mat khau nhieu lan");
                }
                token = auth.login(Http.str(b, "user"), Http.str(b, "matKhau"));
                if (token == null) {
                    ctx.security().onAdminLoginFail(clientIp(ex), System.currentTimeMillis());
                    throw new Http.ApiException(401, "Sai ten dang nhap/email hoac mat khau");
                }
            }
            ctx.security().onSuccessfulLogin(null, clientIp(ex), System.currentTimeMillis());
            ex.getResponseHeaders().add("Set-Cookie", AdminAuth.setCookie(token));
            Http.ok(ex, Map.of("loggedIn", true, "user", auth.user()));
        });
        r.post("/api/auth/logout", (ex, p) -> {
            auth.logout(ex);
            ex.getResponseHeaders().add("Set-Cookie", AdminAuth.clearCookie());
            Http.ok(ex, Map.of("loggedIn", false));
        });
        r.get("/api/events", (ex, p) -> ctx.events().hub().open(ex,
                () -> new String[]{Events.BRANCHES, Http.GSON.toJson(Map.of("online", ctx.registry().onlineIds()))}, () -> auth.valid(ex)));

        // ---- chi nhánh (FR-03) ----
        r.get("/api/branches", (ex, p) -> Http.ok(ex, ctx.stock().branches(ctx.registry().onlineIds())));

        // ---- sản phẩm, kho tổng (FR-07..09) ----
        r.get("/api/categories", (ex, p) -> Http.ok(ex, ctx.stock().categories()));
        r.get("/api/products", (ex, p) -> Http.ok(ex, ctx.stock().products()));
        r.post("/api/products", (ex, p) -> {
            JsonObject b = Http.body(ex);
            ctx.stock().addProduct(product(Http.str(b, "maSp"), b));
            Http.ok(ex, Map.of("ok", true));
        });
        r.put("/api/products/{id}", (ex, p) -> {
            ctx.stock().updateProduct(product(p.get(0), Http.body(ex)));
            Http.ok(ex, Map.of("ok", true));
        });
        r.delete("/api/products/{id}", (ex, p) -> {
            ctx.stock().deleteProduct(p.get(0));
            Http.ok(ex, Map.of("ok", true));
        });
        r.get("/api/imports", (ex, p) -> Http.ok(ex, ctx.stock().imports(100)));
        r.post("/api/imports", (ex, p) -> {
            JsonObject b = Http.body(ex);
            Long donGia = Http.str(b, "donGia").isEmpty() ? null : money(b, "donGia");
            int ton = ctx.stock().importStock(Http.str(b, "maSp"), Http.integer(b, "soLuong"), Http.str(b, "maNcc"), donGia);
            Http.ok(ex, Map.of("tonTong", ton));
        });
        r.get("/api/suppliers", (ex, p) -> Http.ok(ex, ctx.stock().suppliers()));
        r.post("/api/suppliers", (ex, p) -> {
            JsonObject b = Http.body(ex);
            ctx.stock().addSupplier(Http.str(b, "maNcc"), Http.str(b, "ten"), Http.str(b, "mst"),
                    Http.str(b, "diaChi"), Http.str(b, "dienThoai"));
            Http.ok(ex, Map.of("ok", true));
        });
        r.get("/api/stock/branches", (ex, p) ->
                Http.ok(ex, ctx.stock().branchStock(Http.query(ex).getOrDefault("maCn", ""))));
        r.get("/api/reconcile", (ex, p) -> Http.ok(ex, ctx.stock().reconcile()));

        // ---- quản lý kho chi nhánh ----
        r.get("/api/warehouses", (ex, p) -> Http.ok(ex, ctx.stock().warehouses(ctx.registry().onlineIds())));
        r.get("/api/warehouses/{maCn}", (ex, p) ->
                Http.ok(ex, ctx.stock().warehouse(p.get(0), ctx.registry().onlineIds())));
        r.post("/api/warehouses/{maCn}/replenish", (ex, p) -> {
            JsonObject b = Http.body(ex);
            int maYc = ctx.requests().replenish(p.get(0), Http.str(b, "maSp"), Http.integer(b, "soLuong"));
            Http.ok(ex, Map.of("maYc", maYc));
        });

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

        // ---- công nợ ----
        r.get("/api/debts/summary", (ex, p) -> Http.ok(ex, ctx.debts().summary()));
        r.get("/api/debts/branches", (ex, p) -> {
            Map<String, String> q = Http.query(ex);
            Http.ok(ex, ctx.debts().branchSummary(q.getOrDefault("trangThai", ""), "true".equals(q.get("sim"))));
        });
        r.get("/api/debts/branches/{maCn}", (ex, p) -> Http.ok(ex, ctx.debts().branchLedger(p.get(0))));
        r.get("/api/debts/branches/{maCn}/check", (ex, p) -> {
            JsonObject q = new JsonObject();
            q.addProperty("soTien", Http.query(ex).getOrDefault("soTien", ""));
            Http.ok(ex, ctx.debts().check(p.get(0), money(q, "soTien")));
        });
        r.post("/api/debts/branches/{maCn}/payments", (ex, p) -> {
            JsonObject b = Http.body(ex);
            long con = ctx.debts().recordPayment(p.get(0), money(b, "soTien"), Http.str(b, "ghiChu"));
            Http.ok(ex, Map.of("conNo", con));
        });
        r.put("/api/branches/{maCn}/credit-limit", (ex, p) -> {
            JsonObject b = Http.body(ex);
            if (Http.str(b, "hanMuc").isEmpty()) {
                throw new Http.ApiException(400, "Thieu han muc");
            }
            ctx.debts().setCreditLimit(p.get(0), money(b, "hanMuc"));
            Http.ok(ex, Map.of("ok", true));
        });
        r.get("/api/debts/suppliers", (ex, p) -> Http.ok(ex, ctx.debts().supplierSummary()));
        r.get("/api/debts/suppliers/{maNcc}", (ex, p) -> Http.ok(ex, ctx.debts().supplierLedger(p.get(0))));
        r.post("/api/debts/suppliers/{maNcc}/payments", (ex, p) -> {
            JsonObject b = Http.body(ex);
            long con = ctx.debts().paySupplier(p.get(0), money(b, "soTien"), Http.str(b, "ghiChu"));
            Http.ok(ex, Map.of("conNo", con));
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
        // thông báo có phản hồi: chiNhanh null = tất cả, hoặc [{maCn, deXuat?}]
        r.post("/api/notices", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String soLuong = Http.str(b, "soLuongDeXuat");
            List<NoticeService.Target> targets = null;
            if (b.has("chiNhanh") && b.get("chiNhanh").isJsonArray()) {
                targets = new ArrayList<>();
                for (JsonElement e : b.getAsJsonArray("chiNhanh")) {
                    JsonObject t = e.getAsJsonObject();
                    String deXuat = Http.str(t, "deXuat");
                    targets.add(new NoticeService.Target(Http.str(t, "maCn"), deXuat.isEmpty() ? null : Http.integer(t, "deXuat")));
                }
            }
            Http.ok(ex, ctx.notices().create(Http.str(b, "loai"), Http.str(b, "tieuDe"), Http.str(b, "noiDung"),
                    Http.str(b, "maSp"), soLuong.isEmpty() ? null : Http.integer(b, "soLuongDeXuat"), targets));
        });
        r.get("/api/notices", (ex, p) -> Http.ok(ex, ctx.notices().list(100)));
        r.get("/api/notices/suggest", (ex, p) ->
                Http.ok(ex, ctx.notices().suggest(Http.query(ex).getOrDefault("maSp", ""))));
        r.get("/api/notices/{id}", (ex, p) -> Http.ok(ex, ctx.notices().detail(Long.parseLong(p.get(0)))));

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

        // ---- giám sát an ninh ----
        r.get("/api/security/overview", (ex, p) -> {
            long now = System.currentTimeMillis();
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("ketNoi", ctx.registry().connections().size());
            s.put("tinGiay", ctx.security().msgsPerSecond(now));
            s.put("ipBiChan", ctx.security().bans().active(now).size());
            s.put("suKien24h", ctx.db().read(c -> Db.one(c, """
                    SELECT count(*) FILTER (WHERE muc = 'HIGH') AS high, count(*) FILTER (WHERE muc = 'MEDIUM') AS medium,
                           count(*) FILTER (WHERE muc = 'LOW') AS low
                    FROM su_kien_bao_mat WHERE thoi_gian > CURRENT_TIMESTAMP - INTERVAL '24 hours'""", Db::toMap)));
            s.put("mode", ctx.settings().securityMode.name());
            s.put("scraping", ctx.security().scraping().summary(now));
            s.put("mail", ctx.email().status());
            s.put("scrapingPersistence", ctx.scrapingStore().status());
            s.put("realtimeDropped", ctx.securityLog().realtimeDropped());
            s.put("suKienBiBo", ctx.security().droppedEvents());
            Http.ok(ex, s);
        });
        r.get("/api/security/events", (ex, p) -> {
            Map<String, String> q = Http.query(ex);
            String muc = q.getOrDefault("muc", "");
            String loai = q.getOrDefault("loai", "");
            String nguon = q.getOrDefault("nguon", "");
            String ip = q.getOrDefault("ip", "");
            String maCn = q.getOrDefault("maCn", "");
            int limit = Math.max(1, Math.min(Integer.parseInt(q.getOrDefault("limit", "300")), 2000));
            int offset = Math.max(0, Math.min(Integer.parseInt(q.getOrDefault("offset", "0")), 1000000));
            Http.ok(ex, ctx.db().read(c -> Db.rows(c, """
                    SELECT id, thoi_gian, nguon, loai, muc, ip, ma_cn, chi_tiet, hanh_dong, event_key, metadata, review, review_reason,
                    (SELECT string_agg(DISTINCT status, ',') FROM security_email_delivery d WHERE d.event_key=e.event_key) AS email_status
                    FROM su_kien_bao_mat e
                    WHERE (? = '' OR muc = ?) AND (? = '' OR loai = ?) AND (? = '' OR nguon = ?)
                      AND (? = '' OR ip = ?) AND (? = '' OR ma_cn = ?)
                    ORDER BY id DESC LIMIT ? OFFSET ?""", muc, muc, loai, loai, nguon, nguon, ip, ip, maCn, maCn, limit, offset)));
        });
        r.get("/api/security/scraping/summary", (ex, p) -> Http.ok(ex, ctx.security().scraping().summary(System.currentTimeMillis())));
        r.get("/api/security/scraping/blocks", (ex, p) -> Http.ok(ex, ctx.security().scraping().blocks(System.currentTimeMillis())));
        r.post("/api/security/scraping/blocks/revoke", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String subject = Http.str(b, "subject"), reason = Http.str(b, "reason").trim();
            if (subject.length() > 160 || reason.isEmpty() || reason.length() > 500) throw new Http.ApiException(400, "Can doi tuong va ly do (1..500 ky tu)");
            boolean had = ctx.security().scraping().revoke(subject);
            ctx.security().record("ADMIN", "SCRAPING_REVOKE", "LOW", clientIp(ex), null,
                    "actor=" + auth.user() + "; subject=" + subject + "; reason=" + reason, "GHI_NHAN", System.currentTimeMillis());
            Http.ok(ex, Map.of("ok", had));
        });
        r.post("/api/security/scraping/events/{id}/review", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String verdict = Http.str(b, "verdict"), reason = Http.str(b, "reason").trim();
            if (!Set.of("TRUE_POSITIVE", "FALSE_POSITIVE").contains(verdict) || reason.isEmpty() || reason.length() > 500)
                throw new Http.ApiException(400, "Danh gia hoac ly do khong hop le");
            long id = Long.parseLong(p.get(0));
            int changed = ctx.db().tx(c -> {
                int n = Db.update(c, "UPDATE su_kien_bao_mat SET review=?, review_reason=? WHERE id=? AND loai IN ('SCRAPING','CLIENT_SCRAPING')", verdict, reason, id);
                if (n > 0) Db.update(c, "INSERT INTO su_kien_bao_mat(nguon,loai,muc,ip,chi_tiet,hanh_dong) VALUES('ADMIN','SCRAPING_REVIEW','LOW',?,?,'GHI_NHAN')",
                        clientIp(ex), "actor=" + auth.user() + "; event=" + id + "; " + verdict + "; " + reason);
                return n;
            });
            if (changed == 0) throw new Http.ApiException(404, "Khong tim thay su kien scraping");
            Http.ok(ex, Map.of("ok", true));
        });
        r.get("/api/security/ips", (ex, p) -> Http.ok(ex, ctx.security().ipTable(System.currentTimeMillis())));
        r.get("/api/security/sessions", (ex, p) -> {
            long now = System.currentTimeMillis();
            java.util.List<Map<String, Object>> rows = new java.util.ArrayList<>();
            for (phanphoi.server.net.ClientHandler h : ctx.registry().connections()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", h.id());
                m.put("maCn", h.maCn());
                m.put("ip", h.ip());
                m.put("moLuc", java.time.LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(h.stats().openedAt()),
                        java.time.ZoneId.systemDefault()).format(Db.TIME_FORMAT).substring(0, 19));
                m.put("tinVao", h.stats().in());
                m.put("tinRa", h.stats().out());
                m.put("tinGiay", h.stats().msgsPerSecond(now));
                m.put("lenhCuoi", h.stats().lastCmd());
                rows.add(m);
            }
            rows.sort(java.util.Comparator.comparing(m -> (Long) m.get("id")));
            Http.ok(ex, rows);
        });
        r.post("/api/security/bans", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String ip = Http.str(b, "ip");
            int phut = Http.integer(b, "phut");
            if (!ip.matches("[0-9A-Fa-f.:]{2,45}")) {
                throw new Http.ApiException(400, "IP khong hop le");
            }
            if (phut < 1 || phut > 1440) {
                throw new Http.ApiException(400, "So phut chan phai tu 1 den 1440");
            }
            long until = ctx.security().banManually(ip, phut, System.currentTimeMillis());
            // ngắt luôn các kết nối đang mở từ IP này
            for (phanphoi.server.net.ClientHandler h : ctx.registry().connections()) {
                if (ip.equals(h.ip())) {
                    h.close();
                }
            }
            Http.ok(ex, Map.of("until", java.time.LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(until),
                    java.time.ZoneId.systemDefault()).format(Db.TIME_FORMAT).substring(0, 19)));
        });
        r.delete("/api/security/bans/{ip}", (ex, p) ->
                Http.ok(ex, Map.of("ok", ctx.security().unban(p.get(0), System.currentTimeMillis()))));
        r.post("/api/security/sessions/{id}/kick", (ex, p) -> {
            long id = Long.parseLong(p.get(0));
            for (phanphoi.server.net.ClientHandler h : ctx.registry().connections()) {
                if (h.id() == id) {
                    ctx.security().record("ADMIN", "ADMIN_KICK", "LOW", h.ip(), h.maCn(),
                            "Admin ngat phien #" + id, "NGAT", System.currentTimeMillis());
                    h.close();
                    Http.ok(ex, Map.of("ok", true));
                    return;
                }
            }
            throw new Http.ApiException(404, "Khong tim thay phien " + id);
        });
        return r;
    }

    /** Kiểm tra Origin/Host (ADMIN_CSRF, ADMIN_DNS_REBIND); false thì trả 403. */
    private boolean originAllowed(com.sun.net.httpserver.HttpExchange ex) {
        String origin = ex.getRequestHeaders().getFirst("Origin");
        String host = ex.getRequestHeaders().getFirst("Host");
        OriginGuard.Verdict v = OriginGuard.check(origin, host, ctx.settings().securityRules.allowedOrigins);
        if (v == OriginGuard.Verdict.OK) {
            return true;
        }
        String loai = v == OriginGuard.Verdict.CSRF ? "ADMIN_CSRF" : "ADMIN_DNS_REBIND";
        String detail = ex.getRequestMethod() + " " + ex.getRequestURI().getPath() + " Origin=" + origin + " Host=" + host;
        ctx.security().onHttpViolation(loai, clientIp(ex), detail, System.currentTimeMillis());
        return false;
    }

    private static String clientIp(com.sun.net.httpserver.HttpExchange ex) {
        return ex.getRemoteAddress().getAddress().getHostAddress();
    }

    private static StockService.Product product(String maSp, JsonObject b) {
        return new StockService.Product(maSp, Http.str(b, "ten"), Http.str(b, "donVi"), Http.str(b, "model"),
                Http.str(b, "maDm"), money(b, "giaNhap"), money(b, "giaXuat"), money(b, "giaBanLe"));
    }

    private static final BigDecimal MAX_MONEY = BigDecimal.TEN.pow(12);

    /** Số tiền nguyên đồng trong [0, 10^12]; để trống thì 0. */
    static long money(JsonObject b, String key) {
        String s = Http.str(b, key);
        if (s.isEmpty()) {
            return 0;
        }
        try {
            BigDecimal v = new BigDecimal(s);
            if (v.signum() < 0 || v.compareTo(MAX_MONEY) > 0 || v.stripTrailingZeros().scale() > 0) {
                throw new Http.ApiException(400, "Truong '" + key + "' phai la so nguyen dong tu 0 den 10^12");
            }
            return v.longValueExact();
        } catch (NumberFormatException | ArithmeticException e) {
            throw new Http.ApiException(400, "Truong '" + key + "' khong hop le");
        }
    }

    @Override
    public void close() {
        http.stop(0);
    }
}
