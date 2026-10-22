package phanphoi.client;

import org.junit.jupiter.api.Test;
import phanphoi.common.Command;
import phanphoi.common.Message;

import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ClientSecurityTest {

    private static final long T0 = 1_800_000_000_000L;
    private static final List<String> DEV = List.of("http://localhost:3000", "http://localhost:3001");

    private static ClientSecurity sec() {
        return new ClientSecurity(DEV, 30);
    }

    @SuppressWarnings("unchecked")
    private static List<ClientSecurity.Event> events(ClientSecurity s) {
        return (List<ClientSecurity.Event>) s.snapshot().get("suKien");
    }

    // ---------- Origin / Host ----------

    @Test
    void sameOriginAndNoOriginAllowed() {
        ClientSecurity s = sec();
        assertTrue(s.checkHttp("POST", "/api/sale", "http://127.0.0.1:8081", "127.0.0.1:8081", T0));
        assertTrue(s.checkHttp("POST", "/api/sale", "http://localhost:8082", "localhost:8082", T0));
        assertTrue(s.checkHttp("GET", "/api/state", null, "127.0.0.1:8081", T0));
        // curl không gửi Origin
        assertTrue(s.checkHttp("POST", "/api/sale", "", "127.0.0.1:8081", T0));
        // next dev giữ Origin http://localhost:3000
        assertTrue(s.checkHttp("POST", "/api/sale", "http://localhost:3000", "127.0.0.1:8081", T0));
        assertTrue(events(s).isEmpty());
    }

    @Test
    void foreignOriginIsCsrf() {
        ClientSecurity s = sec();
        assertFalse(s.checkHttp("POST", "/api/sale", "http://evil.example", "127.0.0.1:8081", T0));
        // trang của chi nhánh khác trên cùng máy (cổng khác) cũng là khác origin
        assertFalse(s.checkHttp("POST", "/api/sale", "http://127.0.0.1:8082", "127.0.0.1:8081", T0));
        assertFalse(s.checkHttp("POST", "/api/sale", "null", "127.0.0.1:8081", T0));
        assertEquals(3, events(s).size());
        assertEquals("CLIENT_CSRF", events(s).get(0).loai());
        assertEquals("HIGH", events(s).get(0).muc());
    }

    @Test
    void foreignHostIsDnsRebinding() {
        ClientSecurity s = sec();
        assertFalse(s.checkHttp("GET", "/api/state", null, "evil.example:8081", T0));
        assertFalse(s.checkHttp("GET", "/api/state", "http://evil.example:8081", "evil.example:8081", T0));
        assertTrue(s.checkHttp("GET", "/api/state", null, "[::1]:8081", T0));
        assertEquals("CLIENT_DNS_REBIND", events(s).get(0).loai());
    }

    @Test
    void apiFloodRecordedOncePerTenSeconds() {
        ClientSecurity s = sec();
        for (int i = 0; i < 40; i++) {
            s.checkHttp("GET", "/api/state", null, "127.0.0.1:8081", T0 + i);
        }
        assertEquals(1, events(s).size());
        assertEquals("CLIENT_API_FLOOD", events(s).get(0).loai());
        for (int i = 0; i < 40; i++) {
            s.checkHttp("GET", "/api/state", null, "127.0.0.1:8081", T0 + 1000 + i);
        }
        assertEquals(1, events(s).size());
    }

    // ---------- discovery, đổi server, tin lạ ----------

    /** HERE từ một máy khác trong LAN (địa chỉ TEST-NET, không bao giờ là của máy chạy test). */
    private static Discovery.Here remote(String ip, int port) {
        return new Discovery.Here(new InetSocketAddress(ip, port), ip, false);
    }

    @Test
    void twoDifferentMachinesIsSpoof() {
        ClientSecurity s = sec();
        s.onDiscovery(List.of(remote("203.0.113.10", 5000), remote("203.0.113.66", 5000)), T0);
        assertEquals("CLIENT_DISCOVERY_SPOOF", events(s).get(0).loai());
        assertEquals(List.of("203.0.113.10:5000", "203.0.113.66:5000"), s.snapshot().get("discovery"));
    }

    @Test
    void sameServerTwiceOrOnceIsNotSpoof() {
        ClientSecurity s = sec();
        s.onDiscovery(List.of(remote("203.0.113.10", 5000), remote("203.0.113.10", 5000)), T0);
        s.onDiscovery(List.of(remote("203.0.113.10", 5000)), T0 + 1);
        assertTrue(events(s).isEmpty());
        // cùng máy nhưng khác cổng là hai server khác nhau
        s.onDiscovery(List.of(remote("203.0.113.10", 5000), remote("203.0.113.10", 5001)), T0 + 2);
        assertEquals(1, events(s).size());
    }

    @Test
    void serverOnThisMachineAnsweringOnLoopbackAndLanIsNotSpoof() {
        // server cùng máy trả lời cả broadcast (IP LAN) lẫn gói gửi 127.0.0.1: hai HERE khác nhau nhưng cùng một máy
        ClientSecurity s = sec();
        s.onDiscovery(List.of(new Discovery.Here(new InetSocketAddress("127.0.0.1", 5000), "127.0.0.1", true),
                new Discovery.Here(new InetSocketAddress("192.168.1.103", 5000), "192.168.1.103", true)), T0);
        assertTrue(events(s).isEmpty());
        assertEquals(List.of(), s.snapshot().get("discovery"));
        // thêm một máy lạ cùng trả lời thì cảnh báo
        s.onDiscovery(List.of(new Discovery.Here(new InetSocketAddress("127.0.0.1", 5000), "127.0.0.1", true),
                remote("203.0.113.66", 5000)), T0 + 1);
        assertEquals("CLIENT_DISCOVERY_SPOOF", events(s).get(0).loai());
    }

    @Test
    void serverChangedOnlyWhenAddressDiffers() {
        ClientSecurity s = sec();
        InetSocketAddress a = new InetSocketAddress("203.0.113.10", 5000);
        s.onConnected(null, a, T0);
        s.onConnected(a, new InetSocketAddress("203.0.113.10", 5000), T0 + 1);
        // đổi giữa hai địa chỉ của chính máy này (loopback IPv4/IPv6) không phải đổi server
        s.onConnected(new InetSocketAddress("127.0.0.1", 5000), new InetSocketAddress("::1", 5000), T0 + 1);
        assertTrue(events(s).isEmpty());
        s.onConnected(a, new InetSocketAddress("203.0.113.66", 5000), T0 + 2);
        assertEquals("CLIENT_SERVER_CHANGED", events(s).get(0).loai());
        assertNotNull(s.snapshot().get("serverDoi"));
    }

    // ---------- báo lên server ----------

    @Test
    void reportsAreRateLimitedAndQueuedWhileOffline() {
        ClientSecurity s = sec();
        for (int i = 0; i < 60; i++) {
            s.onBadServerMessage("RAC|" + i, "Lenh sai chieu", T0);
        }
        Map<String, Object> snap = s.snapshot();
        assertEquals(50, snap.get("choGui"));
        Message first = s.nextReport(T0);
        assertEquals(Command.SECURITY_REPORT, first.command());
        assertEquals("CLIENT_BAD_SERVER_MSG", first.param(0));
        // tin cũ nhất bị bỏ khi hàng đợi offline vượt 50
        assertTrue(first.param(1).endsWith("RAC|10"));
        assertNull(s.nextReport(T0 + 500));
        assertNotNull(s.nextReport(T0 + 1000));
        s.requeue(first);
        assertEquals(first.param(1), s.nextReport(T0 + 2000).param(1));
    }

    @Test
    void detailIsTruncatedTo500() {
        ClientSecurity s = sec();
        s.onBadServerMessage("x".repeat(3000), "Dong sai", T0);
        assertEquals(500, s.nextReport(T0).param(1).length());
    }
}
