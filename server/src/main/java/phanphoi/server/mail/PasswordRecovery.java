package phanphoi.server.mail;

import phanphoi.server.AdminAuth;
import phanphoi.server.db.Db;
import phanphoi.server.net.SessionRegistry;
import phanphoi.server.service.AuthService;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Email-based password recovery for admin and individual branches. All reset secrets are hashed in DB. */
public final class PasswordRecovery implements AutoCloseable {
    public static final int EXPIRES_MINUTES = 15;
    private static final long COOLDOWN_MS = 120_000;
    private static final long WINDOW_MS = 900_000;
    private static final SecureRandom RNG = new SecureRandom();
    private final Db db;
    private final AdminAuth admin;
    private final SessionRegistry registry;
    private final boolean enabled;
    private final EmailSender sender;
    private final ThreadPoolExecutor mailQueue;
    private final String adminUrl;
    private final String branchUrl;
    private final Map<String, Long> recentRequests = new ConcurrentHashMap<>();
    private final Map<String, Integer> perIpCounts = new ConcurrentHashMap<>();
    private volatile long windowStarted = System.currentTimeMillis();

    public PasswordRecovery(Db db, AdminAuth admin, SessionRegistry registry, MailSettings settings) {
        this.db = db;
        this.admin = admin;
        this.registry = registry;
        this.enabled = settings.enabled;
        sender = settings.enabled ? new SmtpEmailSender(settings) : null;
        mailQueue = settings.enabled ? new ThreadPoolExecutor(1, 1, 0L, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(100), r -> { Thread t = new Thread(r, "password-recovery-email"); t.setDaemon(true); return t; },
                new ThreadPoolExecutor.AbortPolicy()) : null;
        adminUrl = siteUrl(System.getenv("PASSWORD_RESET_ADMIN_URL"),
                System.getenv("TAILSCALE_ADMIN_ORIGIN"), "http://localhost:8080/admin/");
        branchUrl = siteUrl(System.getenv("PASSWORD_RESET_CLIENT_URL"),
                System.getenv("TAILSCALE_CLIENT_ORIGIN"), "http://localhost:8081/branch/");
    }

    private static String siteUrl(String explicit, String origin, String fallback) {
        String value = explicit != null && !explicit.isBlank() ? explicit.trim()
                : origin != null && !origin.isBlank() ? origin.trim() + (fallback.contains("/admin/") ? "/admin/" : "/branch/") : fallback;
        if (!(value.startsWith("https://") || value.startsWith("http://localhost:") || value.startsWith("http://127.0.0.1:"))
                || value.contains("#") || value.contains("?") || value.contains("\r") || value.contains("\n"))
            throw new IllegalArgumentException("Invalid password recovery URL. Use HTTPS for remote sites.");
        return value.endsWith("/") ? value : value + "/";
    }

    /** Always returns silently, regardless of whether an account exists. */
    public void request(String kind, String email, String hint, String ip) {
        if (!enabled || kind == null || !List.of("admin","branch").contains(kind) || email == null || email.length() > 254 || !email.contains("@")) return;
        String address = email.trim().toLowerCase(Locale.ROOT);
        String branchCode = hint == null ? "" : hint.trim().toUpperCase(Locale.ROOT);
        if (!branchCode.isEmpty() && !branchCode.matches("[A-Z0-9_-]{1,32}")) return;
        long now = System.currentTimeMillis();
        if (!ipAllowed(ip, now)) return;
        String throttleKey = kind + ":" + address + ":" + branchCode;
        synchronized (recentRequests) {
            Long last = recentRequests.get(throttleKey);
            if (last != null && now - last < COOLDOWN_MS) return;
            recentRequests.put(throttleKey, now);
            if (recentRequests.size() > 10000) recentRequests.entrySet().removeIf(e -> now - e.getValue() > WINDOW_MS);
        }
        try {
            String principal;
            if (kind.equals("admin")) {
                String configured = db.read(c -> Db.one(c, "SELECT email FROM mail_admin_config WHERE singleton=TRUE", rs -> rs.getString(1)));
                if (configured == null || !configured.equalsIgnoreCase(address)) return;
                principal = "admin";
            } else {
                List<String> ids = db.read(c -> Db.list(c,
                        "SELECT ma_cn FROM chi_nhanh WHERE LOWER(email)=? AND NOT gia_lap AND (?='' OR UPPER(ma_cn)=?) LIMIT 2",
                        rs -> rs.getString(1), address, branchCode, branchCode));
                // Two branches share one address: code is mandatory in that case.
                if (ids.size() != 1) return;
                principal = ids.get(0);
            }
            byte[] raw = new byte[32]; RNG.nextBytes(raw);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
            String hashed = sha256(token);
            db.tx(c -> {
                Db.update(c, "DELETE FROM password_reset_token WHERE expires_at < NOW() - INTERVAL '1 day'");
                Db.update(c, "UPDATE password_reset_token SET used_at=NOW() WHERE principal_type=? AND principal_id=? AND used_at IS NULL", kind, principal);
                Db.update(c, "INSERT INTO password_reset_token(token_hash,principal_type,principal_id,requested_email,expires_at) VALUES (?,?,?,?,NOW() + INTERVAL '15 minutes')",
                        hashed, kind, principal, address);
                return null;
            });
            String url = (kind.equals("admin") ? adminUrl : branchUrl) + "#reset=" + token;
            String subject = "[TOBOKI] Dat lai mat khau " + (kind.equals("admin") ? "Admin" : principal);
            String body = "Yeu cau dat lai mat khau cho " + (kind.equals("admin") ? "Admin" : principal) + ".\n\n"
                    + "Mo lien ket sau trong vong " + EXPIRES_MINUTES + " phut:\n" + url
                    + "\n\nLien ket chi su dung mot lan. Neu ban khong yeu cau, hay bo qua email.\n";
            mailQueue.execute(() -> {
                try { sender.send(new EmailMessage(address, subject, body)); }
                catch (Exception e) { System.err.println("[password-reset] SMTP delivery failed (no token logged): " + e.getClass().getSimpleName()); }
            });
        } catch (SQLException | java.util.concurrent.RejectedExecutionException e) {
            System.err.println("[password-reset] Request failed: " + e.getClass().getSimpleName());
        }
    }

    public boolean confirm(String kind, String token, String newPassword) throws SQLException {
        if (kind == null || !List.of("admin","branch").contains(kind) || token == null || !token.matches("[A-Za-z0-9_-]{43}")) return false;
        if (newPassword == null || newPassword.length() < 12 || newPassword.length() > 128 || newPassword.isBlank())
            throw new IllegalArgumentException("Mat khau moi phai tu 12 den 128 ky tu");
        String[] target = db.tx(c -> {
            String[] result = Db.one(c, """
                    UPDATE password_reset_token SET used_at=NOW()
                    WHERE token_hash=? AND principal_type=? AND used_at IS NULL AND expires_at > NOW()
                    RETURNING principal_type, principal_id, requested_email
                    """, rs -> new String[]{rs.getString(1),rs.getString(2),rs.getString(3)}, sha256(token), kind);
            if (result == null) return null;
            // If a mailbox has been reassigned, the old owner must not reset its password.
            String currentEmail = kind.equals("admin")
                    ? Db.one(c,"SELECT email FROM mail_admin_config WHERE singleton=TRUE",rs -> rs.getString(1))
                    : Db.one(c,"SELECT email FROM chi_nhanh WHERE ma_cn=?",rs -> rs.getString(1),result[1]);
            if (currentEmail == null || !currentEmail.equalsIgnoreCase(result[2])) return null;
            String salt = AuthService.newSalt();
            String hash = AuthService.hash(salt,newPassword);
            if (kind.equals("admin")) {
                Db.update(c, """
                        INSERT INTO admin_password_override(singleton,salt,password_hash)
                        VALUES (TRUE,?,?) ON CONFLICT(singleton) DO UPDATE
                        SET salt=EXCLUDED.salt,password_hash=EXCLUDED.password_hash,changed_at=NOW()
                        """,salt,hash);
            } else {
                if (Db.update(c,"UPDATE chi_nhanh SET salt=?,mat_khau_hash=? WHERE ma_cn=?", salt,hash,result[1]) != 1)
                    throw new SQLException("Branch no longer exists");
            }
            Db.update(c,"UPDATE password_reset_token SET used_at=NOW() WHERE principal_type=? AND principal_id=? AND used_at IS NULL",kind,result[1]);
            return result;
        });
        if (target == null) return false;
        if (kind.equals("admin")) admin.invalidateAll();
        else {
            var active = registry.get(target[1]);
            if (active != null) active.close();
        }
        return true;
    }

    private synchronized boolean ipAllowed(String ip, long now) {
        if (now - windowStarted >= WINDOW_MS) { perIpCounts.clear(); windowStarted=now; }
        String key = ip == null ? "unknown" : ip;
        int n = perIpCounts.getOrDefault(key,0);
        if (n >= 60) return false; // gateway requests may share one internal IP
        perIpCounts.put(key,n+1);
        return true;
    }

    private static String sha256(String s) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    @Override public void close() { if (mailQueue != null) mailQueue.shutdown(); }
}
