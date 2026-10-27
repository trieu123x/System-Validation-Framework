package phanphoi.server;

import org.junit.jupiter.api.Test;
import phanphoi.common.Config;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

class AdminAuthSingleSessionTest {
    private static AdminAuth instance(AtomicLong time) throws Exception {
        return new AdminAuth(Config.load("/nonexistent-admin-single-session.properties", new String[0]), null, time::get);
    }

    @Test void secondBrowserDeniedWithoutKickingOriginal() throws Exception {
        AtomicLong time = new AtomicLong(1000);
        AdminAuth auth = instance(time);
        var first = auth.login("admin", "admin123", null);
        assertEquals(AdminAuth.LoginStatus.SUCCESS, first.status());
        var other = auth.login("admin", "admin123", null);
        assertEquals(AdminAuth.LoginStatus.ALREADY_ACTIVE, other.status());
        assertNull(other.token());
        assertTrue(auth.validToken(first.token(), false));
        assertEquals(first.token(), auth.login("admin", "admin123", first.token()).token());
        assertEquals(AdminAuth.LoginStatus.INVALID_CREDENTIALS,
                auth.login("admin", "wrong", null).status());
    }

    @Test void unrelatedLogoutCannotReleaseFirstSession() throws Exception {
        AtomicLong time = new AtomicLong(1000);
        AdminAuth auth = instance(time);
        String token = auth.login("admin", "admin123", null).token();
        auth.logoutToken("fake-browser-token");
        assertTrue(auth.validToken(token, false));
        auth.logoutToken(token);
        assertFalse(auth.validToken(token, false));
        assertEquals(AdminAuth.LoginStatus.SUCCESS, auth.login("admin", "admin123", null).status());
    }

    @Test void leaseExpiresWithoutHeartbeatAndOnlyActiveRequestsRefreshIt() throws Exception {
        AtomicLong time = new AtomicLong(1000);
        AdminAuth auth = instance(time);
        String token = auth.login("admin", "admin123", null).token();
        time.addAndGet(290_000);
        assertTrue(auth.validToken(token, false)); // SSE does not refresh
        time.addAndGet(11_000);
        assertFalse(auth.validToken(token, false));
        String second = auth.login("admin", "admin123", null).token();
        assertNotEquals(token, second);
        time.addAndGet(290_000);
        assertTrue(auth.validToken(second, true)); // /api/auth/me heartbeat
        time.addAndGet(290_000);
        assertTrue(auth.validToken(second, false));
    }

    @Test void passwordResetClearsSession() throws Exception {
        AtomicLong time = new AtomicLong(1000);
        AdminAuth auth = instance(time);
        String first = auth.login("admin", "admin123", null).token();
        auth.invalidateAll();
        assertFalse(auth.validToken(first, true));
        assertEquals(AdminAuth.LoginStatus.SUCCESS, auth.login("admin", "admin123", null).status());
    }

    @Test void racingLoginsCannotBothSucceed() throws Exception {
        AtomicLong time = new AtomicLong(1000);
        AdminAuth auth = instance(time);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(8);
        try {
            var tasks = new java.util.ArrayList<java.util.concurrent.Callable<AdminAuth.LoginStatus>>();
            for (int i = 0; i < 30; i++) tasks.add(() -> auth.login("admin", "admin123", null).status());
            var results = pool.invokeAll(tasks);
            int success = 0;
            for (var r : results) if (r.get() == AdminAuth.LoginStatus.SUCCESS) success++;
            assertEquals(1, success);
        } finally { pool.shutdownNow(); }
    }
}
