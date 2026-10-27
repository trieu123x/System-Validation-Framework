package phanphoi.server;

import com.sun.net.httpserver.HttpExchange;
import phanphoi.common.Config;
import phanphoi.server.service.AuthService;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;
import java.util.function.LongSupplier;

/**
 * Đăng nhập giao diện công ty. Một tài khoản quản trị trong server.properties
 * (admin.password.hash = hex SHA-256(admin.salt + mật khẩu), cùng quy tắc với chi nhánh);
 * phiên là token ngẫu nhiên trong cookie HttpOnly, tối đa một phiên Admin hoạt động.
 * Phiên tự giải phóng nếu trình duyệt không gửi heartbeat trong khoảng thời gian cấu hình.
 */
public final class AdminAuth {

    static final String COOKIE = "pp_admin";
    private static final int DEFAULT_IDLE_SECONDS = 300;
    private static final String DEFAULT_SALT = "pp-admin-2026";
    private static final String DEFAULT_PASSWORD = "admin123";

    private final String user;
    private final phanphoi.server.db.Db db;
    private final String salt;
    private final String hash;
    private final boolean defaultPassword;
    private final SecureRandom random = new SecureRandom();
    private final LongSupplier clock;
    private final long idleMs;
    private String activeToken;
    private long activeUntil;

    public enum LoginStatus { SUCCESS, INVALID_CREDENTIALS, ALREADY_ACTIVE }
    public record LoginResult(LoginStatus status, String token) {}

    public AdminAuth(Config cfg) { this(cfg, null); }

    public AdminAuth(Config cfg, phanphoi.server.db.Db db) {
        this(cfg, db, System::currentTimeMillis);
    }

    AdminAuth(Config cfg, phanphoi.server.db.Db db, LongSupplier clock) {
        this.db = db;
        this.clock = clock;
        this.idleMs = Math.max(60, cfg.getInt("admin.session.idle.seconds", DEFAULT_IDLE_SECONDS)) * 1000L;
        this.user = cfg.get("admin.user", "admin");
        this.salt = cfg.get("admin.salt", DEFAULT_SALT);
        String h = cfg.get("admin.password.hash", "");
        this.hash = h.isBlank() ? AuthService.hash(salt, DEFAULT_PASSWORD) : h.trim().toLowerCase();
        this.defaultPassword = hash.equals(AuthService.hash(salt, DEFAULT_PASSWORD));
    }

    public String user() {
        return user;
    }

    public boolean usesDefaultPassword() {
        if (!defaultPassword) return false;
        if (db == null) return true;
        try {
            return db.read(c -> phanphoi.server.db.Db.one(c,
                    "SELECT NOT EXISTS(SELECT 1 FROM admin_password_override WHERE singleton=TRUE)",
                    rs -> rs.getBoolean(1)));
        } catch (java.sql.SQLException e) {
            return false;
        }
    }

    /** Only one active Admin cookie can exist at once. Same-browser logins reuse their token. */
    synchronized LoginResult login(String u, String password, String browserToken) {
        String identifier = u == null ? "" : u.trim();
        String effectiveSalt = salt;
        String effectiveHash = hash;
        if (db != null) {
            try {
                String[] current = db.read(c -> phanphoi.server.db.Db.one(c,
                        "SELECT salt,password_hash FROM admin_password_override WHERE singleton=TRUE",
                        rs -> new String[]{rs.getString(1),rs.getString(2)}));
                if (current != null) { effectiveSalt = current[0]; effectiveHash = current[1]; }
            } catch (java.sql.SQLException e) {
                // A database error must not silently enable the fallback password.
                return new LoginResult(LoginStatus.INVALID_CREDENTIALS, null);
            }
        }
        byte[] expected = effectiveHash.getBytes(StandardCharsets.US_ASCII);
        byte[] actual = AuthService.hash(effectiveSalt, password == null ? "" : password).getBytes(StandardCharsets.US_ASCII);
        boolean allowed = user.equalsIgnoreCase(identifier);
        if (!allowed && db != null) {
            try {
                String configured = db.read(c -> phanphoi.server.db.Db.one(c,
                        "SELECT email FROM mail_admin_config WHERE singleton = TRUE", rs -> rs.getString(1)));
                allowed = configured != null && configured.trim().equalsIgnoreCase(identifier);
            } catch (java.sql.SQLException ignored) { allowed = false; }
        }
        boolean ok = MessageDigest.isEqual(expected, actual) & allowed;
        if (!ok) {
            try {
                Thread.sleep(400); // làm chậm dò mật khẩu
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return new LoginResult(LoginStatus.INVALID_CREDENTIALS, null);
        }
        long now = clock.getAsLong();
        if (activeToken != null && activeUntil <= now) activeToken = null;
        if (activeToken != null) {
            if (!activeToken.equals(browserToken)) {
                return new LoginResult(LoginStatus.ALREADY_ACTIVE, null);
            }
            activeUntil = now + idleMs;
            return new LoginResult(LoginStatus.SUCCESS, activeToken);
        }
        byte[] b = new byte[24];
        random.nextBytes(b);
        String token = HexFormat.of().formatHex(b);
        activeToken = token;
        activeUntil = now + idleMs;
        return new LoginResult(LoginStatus.SUCCESS, token);
    }

    public synchronized void invalidateAll() {
        activeToken = null;
        activeUntil = 0;
    }

    /** HTTP requests and /api/auth/me heartbeat refresh this session's lease. */
    synchronized boolean valid(HttpExchange ex) { return validToken(token(ex), true); }

    /** SSE needs to verify the session but must never keep an abandoned browser alive. */
    synchronized boolean isCurrent(HttpExchange ex) { return validToken(token(ex), false); }

    synchronized boolean validToken(String token, boolean refresh) {
        long now = clock.getAsLong();
        if (activeToken == null || activeUntil <= now) {
            activeToken = null;
            return false;
        }
        if (token == null || !activeToken.equals(token)) return false;
        if (refresh) activeUntil = now + idleMs;
        return true;
    }

    void logout(HttpExchange ex) { logoutToken(token(ex)); }

    synchronized void logoutToken(String token) {
        if (token != null && token.equals(activeToken)) invalidateAll();
    }

    static String setCookie(String token) {
        return COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Strict";
    }

    static String clearCookie() {
        return COOKIE + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
    }

    static String token(HttpExchange ex) {
        List<String> headers = ex.getRequestHeaders().get("Cookie");
        if (headers == null) {
            return null;
        }
        for (String header : headers) {
            for (String part : header.split(";")) {
                String p = part.trim();
                if (p.startsWith(COOKIE + "=")) {
                    String v = p.substring(COOKIE.length() + 1);
                    return v.isEmpty() ? null : v;
                }
            }
        }
        return null;
    }
}
