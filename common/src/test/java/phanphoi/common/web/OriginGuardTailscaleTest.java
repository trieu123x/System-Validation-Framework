package phanphoi.common.web;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.assertEquals;

/** Regression tests for a public client gateway on Tailscale HTTPS :8443. */
class OriginGuardTailscaleTest {
    private final List<String> allowed = List.of("http://localhost:3000",
            "https://desktop-flfkcet-1.tailab761f.ts.net:8443");

    @Test
    void foreignOriginIsForbiddenEvenForAnUnauthenticatedRequest() {
        assertEquals(OriginGuard.Verdict.CSRF, OriginGuard.check(
                "https://evil.example", "desktop-flfkcet-1.tailab761f.ts.net:8443", allowed));
    }

    @Test
    void sameOriginIsAllowed() {
        assertEquals(OriginGuard.Verdict.OK, OriginGuard.check(
                "https://desktop-flfkcet-1.tailab761f.ts.net:8443",
                "desktop-flfkcet-1.tailab761f.ts.net:8443", allowed));
    }

    @Test
    void untrustedHostIsNotAccepted() {
        assertEquals(OriginGuard.Verdict.DNS_REBIND, OriginGuard.check(
                "https://evil.example", "evil.example", allowed));
    }
}
