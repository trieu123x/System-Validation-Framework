package phanphoi.common.web;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Chặn trang web lạ gọi HTTP API cục bộ (chỉ nghe localhost) từ trình duyệt của người dùng.
 *
 * <ul>
 *   <li>DNS rebinding: tên miền của kẻ tấn công trỏ về 127.0.0.1 thì header Host mang tên miền đó,
 *       nên chỉ nhận Host là localhost / 127.0.0.1 / [::1] (cổng nào cũng được, vì Docker có thể đổi cổng).</li>
 *   <li>CSRF: request từ trang khác mang Origin khác trang của chính ứng dụng. Chỉ nhận Origin trùng
 *       "http://" + Host, hoặc nằm trong danh sách cho phép (next dev ở cổng 3000/3001).
 *       Không có Origin (curl, GET cùng trang) thì cho qua.</li>
 * </ul>
 */
public final class OriginGuard {

    public enum Verdict { OK, CSRF, DNS_REBIND }

    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "::1");

    private OriginGuard() {
    }

    public static Verdict check(String origin, String host, List<String> allowedOrigins) {
        if (host != null && !host.isBlank() && !LOOPBACK.contains(hostName(host))) {
            return Verdict.DNS_REBIND;
        }
        if (origin == null || origin.isBlank()) {
            return Verdict.OK;
        }
        String o = origin.trim().toLowerCase(Locale.ROOT);
        if (host != null && o.equals("http://" + host.trim().toLowerCase(Locale.ROOT))) {
            return Verdict.OK;
        }
        for (String a : allowedOrigins) {
            if (o.equals(a.trim().toLowerCase(Locale.ROOT))) {
                return Verdict.OK;
            }
        }
        return Verdict.CSRF;
    }

    /** "localhost:8080" → "localhost", "[::1]:8080" → "::1". */
    static String hostName(String host) {
        String h = host.trim().toLowerCase(Locale.ROOT);
        if (h.startsWith("[")) {
            int end = h.indexOf(']');
            return end > 0 ? h.substring(1, end) : h;
        }
        int colon = h.indexOf(':');
        return colon >= 0 ? h.substring(0, colon) : h;
    }
}
