package phanphoi.common.web;

import org.junit.jupiter.api.Test;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

class LoginAttemptsTest {
    @Test void fifthFailureBlocksOnlyIpAndBranchForSixtySeconds() {
        var now = new AtomicLong(1_000_000);
        var attempts = new LoginAttempts(5, 60, 60, now::get);
        for (int i = 0; i < 4; i++) assertEquals(0, attempts.failed("192.0.2.1", "CN06"));
        assertEquals(60, attempts.failed("192.0.2.1", " cn06 "));
        assertEquals(429, assertThrows(Http.ApiException.class, () -> attempts.check("192.0.2.1", "CN06")).status());
        assertDoesNotThrow(() -> attempts.check("192.0.2.2", "CN06"));
        assertDoesNotThrow(() -> attempts.check("192.0.2.1", "CN04"));
        attempts.succeeded("192.0.2.1", "CN04");
        now.addAndGet(1000);
        assertEquals(59, attempts.retryAfter("192.0.2.1", "CN06"));
        assertThrows(Http.ApiException.class, () -> attempts.failed("192.0.2.1", "CN06"));
        now.addAndGet(59000);
        assertDoesNotThrow(() -> attempts.check("192.0.2.1", "CN06"));
        assertEquals(0, attempts.failed("192.0.2.1", "CN06"));
    }

    @Test void successfulLoginAndExpiredWindowClearFailures() {
        var now = new AtomicLong(1_000_000);
        var attempts = new LoginAttempts(5, 60, 60, now::get);
        for (int i = 0; i < 4; i++) attempts.failed("192.0.2.1", "CN06");
        attempts.succeeded("192.0.2.1", "CN06");
        assertEquals(0, attempts.failed("192.0.2.1", "CN06"));
        now.addAndGet(60000);
        for (int i = 0; i < 4; i++) assertEquals(0, attempts.failed("192.0.2.1", "CN06"));
        assertEquals(60, attempts.failed("192.0.2.1", "CN06"));
    }
}
