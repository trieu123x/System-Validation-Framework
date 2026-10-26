package phanphoi.server;

import com.sun.net.httpserver.HttpExchange;
import phanphoi.common.Config;
import phanphoi.server.service.AuthService;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Đăng nhập giao diện công ty. Một tài khoản quản trị trong server.properties
 * (admin.password.hash = hex SHA-256(admin.salt + mật khẩu), cùng quy tắc với chi nhánh);
 * phiên là token ngẫu nhiên trong cookie HttpOnly, hết hạn sau 12 giờ không dùng.
 */
public final class AdminAuth {

    static final String COOKIE = "pp_admin";
    private static final long TTL_MS = 12 * 60 * 60 * 1000L;
    private static final String DEFAULT_SALT = "pp-admin-2026";
    private static final String DEFAULT_PASSWORD = "admin123";

    private final String user;
    private final phanphoi.server.db.Db db;
    private final String salt;
    private final String hash;
    private final boolean defaultPassword;
    private final Map<String, Long> sessions = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();

    public AdminAuth(Config cfg) { this(cfg, null); }

    public AdminAuth(Config cfg, phanphoi.server.db.Db db) {
        this.db = db;
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
        return defaultPassword;
    }

    /** @return token phiên mới, hoặc null nếu sai tài khoản/mật khẩu. */
    String login(String u, String password) {
        byte[] expected = hash.getBytes(StandardCharsets.US_ASCII);
        byte[] actual = AuthService.hash(salt, password).getBytes(StandardCharsets.US_ASCII);
        boolean allowed = user.equalsIgnoreCase(u);
        if (!allowed && db != null) {
            try {
                String configured = db.read(c -> phanphoi.server.db.Db.one(c,
                        "SELECT email FROM mail_admin_config WHERE singleton = TRUE", rs -> rs.getString(1)));
                allowed = configured != null && configured.equalsIgnoreCase(u.trim());
            } catch (java.sql.SQLException ignored) { allowed = false; }
        }
        boolean ok = MessageDigest.isEqual(expected, actual) & allowed;
        if (!ok) {
            try {
                Thread.sleep(400); // làm chậm dò mật khẩu
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return null;
        }
        byte[] b = new byte[24];
        random.nextBytes(b);
        String token = HexFormat.of().formatHex(b);
        sessions.put(token, System.currentTimeMillis() + TTL_MS);
        return token;
    }

    /** Phiên còn hạn thì gia hạn thêm 12 giờ. */
    boolean valid(HttpExchange ex) {
        String token = token(ex);
        if (token == null) {
            return false;
        }
        long now = System.currentTimeMillis();
        Long exp = sessions.get(token);
        if (exp == null || exp < now) {
            sessions.remove(token);
            return false;
        }
        sessions.put(token, now + TTL_MS);
        return true;
    }

    void logout(HttpExchange ex) {
        String token = token(ex);
        if (token != null) {
            sessions.remove(token);
        }
    }

    static String setCookie(String token) {
        return COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Strict";
    }

    static String clearCookie() {
        return COOKIE + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
    }

    private static String token(HttpExchange ex) {
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
