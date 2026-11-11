package phanphoi.common.security;
import org.junit.jupiter.api.Test;
import phanphoi.common.Config;
import java.util.ArrayList;
import static org.junit.jupiter.api.Assertions.*;
class ScrapingGuardTest {
    @Test void acceptance() throws Exception { ScrapingAcceptance.main(new String[0]); }

    private ScrapingGuard guard() throws Exception {
        return new ScrapingGuard(ScrapingPolicy.from(Config.load("__missing_test_config__.properties", new String[]{
                "scraping.mode=block", "scraping.tcp.max.per.window=10", "scraping.http.max.per.window=10"})));
    }

    @Test void blockedRetriesDoNotExtendExpiryOrImmediatelyReblockAfterSixtySeconds() throws Exception {
        ScrapingGuard guard = guard();
        long now = 1_000_000;
        for (int i = 0; i < 40 && guard.blocks(now).isEmpty(); i++)
            guard.evaluate("branch:CN01", "192.0.2.1", "TCP", "INVENTORY_GET", 0, now);
        assertEquals(1, guard.blocks(now).size());
        long until = guard.blocks(now).get(0).expiresAt();
        assertEquals(now + 60_000, until);
        for (long retry = now + 10_000; retry < until; retry += 10_000) {
            assertTrue(guard.evaluate("branch:CN01", "192.0.2.1", "TCP", "INVENTORY_GET", 0, retry).denied());
            assertEquals(until, guard.blocks(retry).get(0).expiresAt());
        }
        assertEquals(1, guard.evaluate("branch:CN01", "192.0.2.1", "TCP", "INVENTORY_GET", 0, until - 1).retryAfter());
        var resumed = guard.evaluate("branch:CN01", "192.0.2.1", "TCP", "INVENTORY_GET", 0, until);
        assertFalse(resumed.denied());
        assertEquals(1, resumed.count());
        assertTrue(guard.blocks(until).isEmpty());
    }

    @Test void restoredLongBlockIsShortenedAndPersistedToCurrentPolicy() throws Exception {
        ScrapingGuard guard = guard();
        var changes = new ArrayList<ScrapingGuard.Block>();
        guard.onBlockChange((subject, block) -> changes.add(block));
        long now = 1_000_000;
        guard.restore(new ScrapingGuard.Block("branch:CN01", now + 900_000, "old block"), now);
        assertEquals(now + 60_000, guard.blocks(now).get(0).expiresAt());
        assertEquals(now + 60_000, changes.get(0).expiresAt());
        guard.summary(now + 60_000); // Cleanup must also reset evidence and persisted state.
        assertTrue(guard.blocks(now + 60_000).isEmpty());
        assertNull(changes.get(changes.size() - 1));
        assertFalse(guard.evaluate("branch:CN01", "192.0.2.1", "HTTP", "/api/state", 0, now + 60_000).denied());
    }
}
