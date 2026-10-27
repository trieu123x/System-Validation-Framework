package phanphoi.server.security;

import phanphoi.common.Config;

import java.util.Arrays;
import java.util.List;

/** Ngưỡng các quy tắc giám sát an ninh, đọc từ config/server.properties (khóa security.*, admin.lock.*). */
public final class SecurityRules {

    /** off: không làm gì; detect: chỉ ghi sự kiện; block: ghi sự kiện và chặn/ngắt/giới hạn (thực nghiệm E8). */
    public enum Mode { OFF, DETECT, BLOCK }

    /** Chặn IP vì BRUTE_FORCE, CONN_FLOOD (phút). */
    public final phanphoi.common.security.ScrapingPolicy scraping;
    public final int banMinutes;
    /** Chặn IP vì CMD_FLOOD, FUZZING, PRELOGIN_IDLE (phút). */
    public final int shortBanMinutes;
    public final int loginFailMax;
    public final int loginFailWindowSec;
    public final int credStuffingIps;
    public final int credStuffingWindowSec;
    public final int floodMsgsPerSecond;
    public final int floodSeconds;
    public final int scrapeMaxPerMinute;
    public final int scrapeHistoryMaxDays;
    public final int fuzzMaxPerMinute;
    public final int idorMaxPerMinute;
    public final int connMaxPerIp;
    public final int connRatePer10s;
    public final int preloginTimeoutSec;
    public final int preloginMaxPerMinute;
    public final int discoveryPerSecond;
    public final int adminLockFails;
    public final int adminLockMinutes;
    public final int adminLockWindowSec;
    /** Origin được phép ngoài chính trang (mặc định: next dev ở cổng 3000/3001). */
    public final List<String> allowedOrigins;

    public SecurityRules(Config cfg) {
        scraping = phanphoi.common.security.ScrapingPolicy.from(cfg);
        banMinutes = cfg.getInt("security.ban.minutes", 10);
        shortBanMinutes = cfg.getInt("security.short.ban.minutes", 5);
        loginFailMax = cfg.getInt("security.login.fail.max", 5);
        loginFailWindowSec = cfg.getInt("security.login.fail.window.seconds", 60);
        credStuffingIps = cfg.getInt("security.cred.stuffing.ips", 3);
        credStuffingWindowSec = cfg.getInt("security.cred.stuffing.window.seconds", 300);
        floodMsgsPerSecond = cfg.getInt("security.flood.msgs.per.second", 50);
        floodSeconds = cfg.getInt("security.flood.seconds", 3);
        scrapeMaxPerMinute = cfg.getInt("security.scrape.max.per.minute", 30);
        scrapeHistoryMaxDays = cfg.getInt("security.scrape.history.max.days", 366);
        fuzzMaxPerMinute = cfg.getInt("security.fuzz.max.per.minute", 10);
        idorMaxPerMinute = cfg.getInt("security.idor.max.per.minute", 5);
        connMaxPerIp = cfg.getInt("security.conn.max.per.ip", 20);
        connRatePer10s = cfg.getInt("security.conn.rate.per.10s", 30);
        preloginTimeoutSec = cfg.getInt("security.prelogin.timeout.seconds", 10);
        preloginMaxPerMinute = cfg.getInt("security.prelogin.max.per.minute", 20);
        discoveryPerSecond = cfg.getInt("security.discovery.per.second", 20);
        adminLockFails = cfg.getInt("admin.lock.fails", 5);
        adminLockMinutes = cfg.getInt("admin.lock.minutes", 5);
        adminLockWindowSec = cfg.getInt("admin.lock.window.seconds", 300);
        allowedOrigins = parseList(cfg.get("security.allowed.origins", "http://localhost:3000,http://localhost:3001"));
    }

    public static Mode parseMode(String s) {
        return Mode.valueOf(s.trim().toUpperCase());
    }

    static List<String> parseList(String s) {
        return Arrays.stream(s.split(",")).map(String::trim).filter(x -> !x.isEmpty()).toList();
    }
}
