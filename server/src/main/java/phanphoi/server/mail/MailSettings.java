package phanphoi.server.mail;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import phanphoi.common.Config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** SMTP chỉ nằm trên server; không đưa mật khẩu vào biến VITE_* hoặc API. */
public final class MailSettings {
    final boolean enabled;
    final String host;
    final int port;
    final String security;
    final String username;
    final String password;
    final String from;
    final List<String> admins;
    final Map<String, String> branches;
    final int timeoutMs;
    final int queueSize;
    final int attempts;
    final long cooldownMs;
    final boolean scrapingEnabled;
    final long scrapingCooldownMs;
    final int maxPerHour;

    private MailSettings() {
        enabled = false;
        host = "";
        port = 587;
        security = "starttls";
        username = "";
        password = "";
        from = "noreply@phanphoi.test";
        admins = List.of();
        branches = Map.of();
        timeoutMs = 5000;
        queueSize = 200;
        attempts = 3;
        cooldownMs = 300000;
        scrapingEnabled = false;
        scrapingCooldownMs = 900000;
        maxPerHour = 20;
    }

    private MailSettings(Config cfg, Map<String, String> env) {
        enabled = Boolean.parseBoolean(value(cfg, env, "mail.enabled", "MAIL_ENABLED", "false"));
        host = value(cfg, env, "mail.smtp.host", "MAIL_SMTP_HOST", "");
        security = value(cfg, env, "mail.smtp.security", "MAIL_SMTP_SECURITY", "starttls").toLowerCase(java.util.Locale.ROOT);
        port = enabled ? number(value(cfg, env, "mail.smtp.port", "MAIL_SMTP_PORT", security.equals("ssl") ? "465" : "587"), 1, 65535) : 587;
        username = value(cfg, env, "mail.smtp.username", "MAIL_SMTP_USERNAME", "");
        // Không trim mật khẩu: khoảng trắng có thể là một phần của thông tin đăng nhập.
        password = env.containsKey("MAIL_SMTP_PASSWORD") ? env.get("MAIL_SMTP_PASSWORD") : cfg.get("mail.smtp.password", "");
        from = enabled ? mailbox(value(cfg, env, "mail.from", "MAIL_FROM", "noreply@phanphoi.test")) : "noreply@phanphoi.test";
        admins = enabled ? addresses(value(cfg, env, "mail.admin.recipients", "MAIL_ADMIN_RECIPIENTS", "")) : List.of();
        branches = enabled ? branchAddresses(value(cfg, env, "mail.branch.recipients", "MAIL_BRANCH_RECIPIENTS", "")) : Map.of();
        timeoutMs = enabled ? number(cfg.get("mail.timeout.ms", "5000"), 100, 60000) : 5000;
        queueSize = enabled ? number(cfg.get("mail.queue.size", "200"), 1, 10000) : 200;
        attempts = enabled ? number(cfg.get("mail.attempts", "3"), 1, 5) : 3;
        cooldownMs = enabled ? number(cfg.get("mail.alert.cooldown.seconds", "300"), 1, 86400) * 1000L : 300000L;
        scrapingEnabled = cfg.getBool("scraping.email.enabled", true);
        scrapingCooldownMs = number(cfg.get("scraping.email.cooldown.seconds", "900"), 1, 86400) * 1000L;
        maxPerHour = number(cfg.get("scraping.email.max.per.recipient.hour", "20"), 1, 1000);
        if (enabled) {
            if (host.isBlank() || host.contains("\r") || host.contains("\n")) throw new IllegalArgumentException("Can mail.smtp.host hop le");
            if (!List.of("starttls", "ssl", "none").contains(security)) throw new IllegalArgumentException("mail.smtp.security: starttls | ssl | none");
            if (security.equals("none") && !username.isEmpty()) throw new IllegalArgumentException("SMTP co xac thuc phai dung STARTTLS hoac SSL");
            if (!username.isEmpty() && password.isEmpty()) throw new IllegalArgumentException("Thieu mat khau SMTP");
        }
    }

    public static MailSettings from(Config cfg) {
        return from(cfg, System.getenv());
    }

    static MailSettings from(Config cfg, Map<String, String> env) {
        return new MailSettings(cfg, env);
    }

    public static MailSettings disabled() {
        return new MailSettings();
    }

    private static String value(Config cfg, Map<String, String> env, String key, String envKey, String fallback) {
        return env.containsKey(envKey) ? env.get(envKey).trim() : cfg.get(key, fallback);
    }

    private static int number(String value, int min, int max) {
        int n = Integer.parseInt(value);
        if (n < min || n > max) throw new IllegalArgumentException("Gia tri SMTP nam ngoai gioi han " + min + ".." + max);
        return n;
    }

    static String mailbox(String value) {
        if (value.contains("\r") || value.contains("\n")) throw new IllegalArgumentException("Email chua ky tu xuong dong");
        try {
            InternetAddress[] parsed = InternetAddress.parse(value, true);
            if (parsed.length != 1 || parsed[0].isGroup()) throw new AddressException("Can mot dia chi email");
            parsed[0].validate();
            if (!parsed[0].getAddress().contains("@")) throw new AddressException("Thieu ten mien");
            return parsed[0].getAddress();
        } catch (AddressException e) {
            throw new IllegalArgumentException("Dia chi email khong hop le", e);
        }
    }

    private static List<String> addresses(String value) {
        List<String> result = new ArrayList<>();
        for (String address : value.split(",")) {
            if (!address.isBlank()) {
                String email = mailbox(address.strip());
                if (!result.contains(email)) result.add(email);
            }
        }
        return List.copyOf(result);
    }

    private static Map<String, String> branchAddresses(String value) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String entry : value.split(";")) {
            if (entry.isBlank()) continue;
            int eq = entry.indexOf('=');
            if (eq < 1) throw new IllegalArgumentException("mail.branch.recipients: CN01=email;CN02=email");
            String branch = entry.substring(0, eq).strip();
            if (!branch.matches("[A-Za-z0-9_-]{1,10}")) throw new IllegalArgumentException("Ma chi nhanh email khong hop le");
            if (result.putIfAbsent(branch, mailbox(entry.substring(eq + 1).strip())) != null) throw new IllegalArgumentException("Trung ma chi nhanh email");
        }
        return Map.copyOf(result);
    }
}
