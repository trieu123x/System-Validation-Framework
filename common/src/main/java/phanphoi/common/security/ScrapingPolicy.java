package phanphoi.common.security;

import phanphoi.common.Config;
import java.util.Locale;

/** Shared, validated policy. No externally supplied identity or HTTP header is trusted. */
public record ScrapingPolicy(boolean enabled, boolean httpEnabled, boolean tcpEnabled, String mode,
        int windowSeconds, int tcpLimit, int httpLimit, int warningRisk, int blockRisk,
        int blockSeconds, int historyDays, int maxSubjects, java.util.Map<String, Integer> resourceQuotas) {
    public ScrapingPolicy {
        resourceQuotas = java.util.Map.copyOf(resourceQuotas);
        if ((long)windowSeconds * maxSubjects * (3 + resourceQuotas.size()) > 9_000_000L)
            throw new IllegalArgumentException("Configured scraping state exceeds memory budget; reduce max.subjects/window/resource quotas");
    }
    public static ScrapingPolicy from(Config c) {
        String mode = c.get("scraping.mode", "detect").toLowerCase(Locale.ROOT);
        if (!mode.matches("off|detect|block")) throw new IllegalArgumentException("scraping.mode: off | detect | block");
        int warning = number(c, "scraping.risk.warning", 40, 1, 99);
        return new ScrapingPolicy(c.getBool("scraping.enabled", true), c.getBool("scraping.http.enabled", true),
                c.getBool("scraping.tcp.enabled", true), mode,
                number(c, "scraping.window.seconds", 60, 10, 600),
                number(c, "scraping.tcp.max.per.window", 60, 1, 100000),
                number(c, "scraping.http.max.per.window", 120, 1, 100000), warning,
                number(c, "scraping.risk.block", 70, warning + 1, 100),
                number(c, "scraping.block.duration.seconds", 900, 1, 86400),
                number(c, "security.scrape.history.max.days", 366, 1, 3650),
                number(c, "scraping.max.subjects", 10000, 10, 50000), quotas(c.get("scraping.resource.quotas", "")));
    }
    private static java.util.Map<String, Integer> quotas(String raw) {
        var result = new java.util.LinkedHashMap<String, Integer>();
        for (String entry : raw.split(",")) {
            if (entry.isBlank()) continue;
            int split = entry.lastIndexOf('=');
            if (split < 1) throw new IllegalArgumentException("scraping.resource.quotas: RESOURCE=limit,...");
            String key = entry.substring(0, split).trim();
            int limit = Integer.parseInt(entry.substring(split+1).trim());
            if (!key.matches("[A-Z_]{1,40}|/api/[A-Za-z0-9_/{}/-]{1,90}") || limit < 1 || limit > 100000
                    || result.putIfAbsent(key, limit) != null || result.size() > 16)
                throw new IllegalArgumentException("Invalid or duplicate resource quota (max 16)");
        }
        return result;
    }
    private static int number(Config c, String key, int fallback, int min, int max) {
        int n = c.getInt(key, fallback);
        if (n < min || n > max) throw new IllegalArgumentException(key + " must be in " + min + ".." + max);
        return n;
    }
}
