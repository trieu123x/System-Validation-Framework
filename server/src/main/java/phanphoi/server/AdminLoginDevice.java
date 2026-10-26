package phanphoi.server;

import com.sun.net.httpserver.HttpExchange;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;

/**
 * Unauthenticated, non-tracking browser token used ONLY to isolate Admin login-failure counters.
 * It is not an authorization credential. Clearing cookies creates a new token (and resets this limit),
 * so this MUST NOT replace network-level anti-abuse controls on a public service.
 */
final class AdminLoginDevice {
    private static final String COOKIE_NAME = "pp_login_device";
    private static final String HMAC_ALGO = "HmacSHA256";
    private static final long MAX_AGE = 30L * 24 * 60 * 60;
    private final SecureRandom random = new SecureRandom();
    private final byte[] secret = new byte[32];

    AdminLoginDevice() {
        random.nextBytes(secret);
    }

    String identify(HttpExchange ex) {
        String provided = cookie(ex);
        if (valid(provided)) {
            return provided;
        }
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        String nonce = HexFormat.of().formatHex(bytes);
        String value = nonce + mac(nonce);
        String origin = ex.getRequestHeaders().getFirst("Origin");
        boolean https = origin != null && origin.startsWith("https://");
        ex.getResponseHeaders().add("Set-Cookie", COOKIE_NAME + "=" + value
                + "; Path=/; Max-Age=" + MAX_AGE + "; HttpOnly; SameSite=Strict"
                + (https ? "; Secure" : ""));
        return value;
    }

    private boolean valid(String value) {
        if (value == null || !value.matches("[0-9a-f]{96}")) {
            return false;
        }
        String expected = mac(value.substring(0, 32));
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
                value.substring(32).getBytes(StandardCharsets.US_ASCII));
    }

    private String mac(String message) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGO);
            mac.init(new SecretKeySpec(secret, HMAC_ALGO));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.US_ASCII)));
        } catch (Exception e) {
            throw new IllegalStateException("Cannot sign admin browser cookie", e);
        }
    }

    private static String cookie(HttpExchange ex) {
        List<String> headers = ex.getRequestHeaders().get("Cookie");
        if (headers == null) {
            return null;
        }
        for (String h : headers) {
            for (String item : h.split(";")) {
                String p = item.trim();
                if (p.startsWith(COOKIE_NAME + "=")) {
                    return p.substring(COOKIE_NAME.length() + 1);
                }
            }
        }
        return null;
    }
}
