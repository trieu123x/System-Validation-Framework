package phanphoi.server.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import phanphoi.common.Command;
import phanphoi.common.Config;
import phanphoi.server.security.SecurityMonitor.Action;
import phanphoi.server.security.SecurityRules.Mode;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/** Các quy tắc của SecurityMonitor với ngưỡng mặc định, đồng hồ do test điều khiển. */
class SecurityRulesTest {

    private static final long T0 = 1_800_000_000_000L;
    private static final String EVIL = "10.0.0.66";

    private final List<SecurityEvent> events = new ArrayList<>();
    private final AtomicReference<Mode> mode = new AtomicReference<>(Mode.BLOCK);
    private SecurityMonitor m;

    @BeforeEach
    void setUp() throws Exception {
        Config cfg = Config.load("khong-co-file.properties", new String[0]);
        m = new SecurityMonitor(new SecurityRules(cfg), mode::get, events::add);
    }

    private List<SecurityEvent> of(String loai) {
        return events.stream().filter(e -> e.loai().equals(loai)).toList();
    }

    /** Mở một kết nối như server: onAccept cho vào rồi onOpen tính vào bộ đếm. */
    private SessionStats open(String ip, long now) {
        assertNull(m.onAccept(ip, now), "kết nối từ " + ip + " bị từ chối");
        SessionStats st = new SessionStats(now);
        m.onOpen(st, ip, now);
        return st;
    }

    @Test
    void sessionCountsSurviveModeSwitch() {
        String nat = "192.168.1.1";
        mode.set(Mode.OFF);
        SessionStats a = new SessionStats(T0);
        m.onOpen(a, nat, T0);
        m.onLogin(a, nat, T0);       // phiên A đăng nhập lúc off: không được tính
        mode.set(Mode.BLOCK);
        SessionStats b = open(nat, T0 + 1);
        m.onLogin(b, nat, T0 + 1);   // phiên B đăng nhập lúc block
        m.onClose(a, nat);           // A đóng: không được trừ phần của B
        for (int i = 0; i < 5; i++) {
            m.onLoginFail(nat, "CN09", T0 + 10 + i);
        }
        assertFalse(m.bans().isBanned(nat, T0 + 100), "IP còn phiên B hợp lệ thì không bị chặn");
    }

    // ---------- BRUTE_FORCE, CRED_STUFFING ----------

    @Test
    void bruteForceBansAtThresholdInBlock() {
        for (int i = 0; i < 4; i++) {
            assertFalse(m.onLoginFail(EVIL, "CN01", T0 + i * 1000));
        }
        assertTrue(of("BRUTE_FORCE").isEmpty());
        assertTrue(m.onLoginFail(EVIL, "CN01", T0 + 5000));
        assertEquals(SecurityEvent.CHAN_IP, of("BRUTE_FORCE").get(0).hanhDong());
        assertEquals(SecurityEvent.HIGH, of("BRUTE_FORCE").get(0).muc());
        String deny = m.onAccept(EVIL, T0 + 6000);
        assertNotNull(deny);
        assertTrue(deny.startsWith("IP bi chan den"));
    }

    @Test
    void bruteForceOnlyRecordsInDetect() {
        mode.set(Mode.DETECT);
        for (int i = 0; i < 5; i++) {
            assertFalse(m.onLoginFail(EVIL, "CN01", T0 + i * 1000));
        }
        assertEquals(1, of("BRUTE_FORCE").size());
        assertEquals(SecurityEvent.GHI_NHAN, of("BRUTE_FORCE").get(0).hanhDong());
        assertNull(m.onAccept(EVIL, T0 + 6000));
    }

    @Test
    void offDoesNothing() {
        mode.set(Mode.OFF);
        for (int i = 0; i < 20; i++) {
            assertFalse(m.onLoginFail(EVIL, "CN01", T0 + i));
            assertFalse(m.onMalformed(EVIL, null, "rac", T0 + i));
        }
        assertTrue(events.isEmpty());
        assertNull(m.onAccept(EVIL, T0));
    }

    @Test
    void bruteForceWindowExpires() {
        for (int i = 0; i < 4; i++) {
            m.onLoginFail(EVIL, "CN01", T0 + i * 1000);
        }
        // lần thứ 5 đến sau khi 4 lần đầu đã ra khỏi cửa sổ 60 s
        assertFalse(m.onLoginFail(EVIL, "CN01", T0 + 65_000));
        assertTrue(of("BRUTE_FORCE").isEmpty());
    }

    @Test
    void ipWithValidSessionIsNeverBannedByIpRules() {
        String nat = "192.168.1.1";
        SessionStats a = open(nat, T0);
        m.onLogin(a, nat, T0);
        for (int i = 0; i < 5; i++) {
            assertFalse(m.onLoginFail(nat, "CN02", T0 + i));
        }
        for (int i = 0; i < 10; i++) {
            assertFalse(m.onMalformed(nat, null, "rac", T0 + i));
        }
        assertFalse(m.bans().isBanned(nat, T0 + 100));
        assertEquals(SecurityEvent.GHI_NHAN, of("BRUTE_FORCE").get(0).hanhDong());
        assertTrue(of("BRUTE_FORCE").get(0).chiTiet().contains("phien hop le"));
        // phiên đăng xuất thì IP không còn được miễn
        m.onClose(a, nat);
        for (int i = 0; i < 5; i++) {
            m.onLoginFail(nat, "CN02", T0 + 20_000 + i);
        }
        assertTrue(m.bans().isBanned(nat, T0 + 20_010));
    }

    @Test
    void credentialStuffingFromThreeIps() {
        m.onLoginFail("10.0.0.1", "CN03", T0);
        m.onLoginFail("10.0.0.2", "CN03", T0 + 1000);
        assertTrue(of("CRED_STUFFING").isEmpty());
        m.onLoginFail("10.0.0.3", "CN03", T0 + 2000);
        assertEquals(1, of("CRED_STUFFING").size());
        assertEquals("CN03", of("CRED_STUFFING").get(0).maCn());
        assertEquals(SecurityEvent.GHI_NHAN, of("CRED_STUFFING").get(0).hanhDong());
    }

    // ---------- CMD_FLOOD ----------

    private Action burst(SessionStats s, long secondStart, int n) {
        Action last = Action.NONE;
        for (int i = 0; i < n; i++) {
            Action a = m.onMessage(s, EVIL, null, Command.PING, secondStart + i);
            if (a != Action.NONE) {
                last = a;
            }
        }
        return last;
    }

    @Test
    void floodKicksAfterThreeSecondsAboveLimit() {
        SessionStats s = new SessionStats(T0);
        assertEquals(Action.NONE, burst(s, T0, 51));
        assertEquals(Action.NONE, burst(s, T0 + 1000, 51));
        assertEquals(Action.KICK, burst(s, T0 + 2000, 51));
        assertEquals(SecurityEvent.NGAT, of("CMD_FLOOD").get(0).hanhDong());
        assertTrue(m.bans().isBanned(EVIL, T0 + 2100));
    }

    @Test
    void floodKicksSessionButSparesIpSharedWithValidSessions() {
        String nat = "192.168.1.1";
        m.onLogin(open(nat, T0), nat, T0);   // chi nhánh thật sau cùng NAT
        SessionStats s = open(nat, T0);
        m.onLogin(s, nat, T0);               // phiên flood cũng đã đăng nhập
        Action last = Action.NONE;
        for (int sec = 0; sec < 3; sec++) {
            for (int i = 0; i < 51; i++) {
                Action a = m.onMessage(s, nat, "SIM900", Command.INVENTORY_GET, T0 + sec * 1000L + i);
                if (a != Action.NONE) {
                    last = a;
                }
            }
        }
        assertEquals(Action.KICK, last);
        assertFalse(m.bans().isBanned(nat, T0 + 3000));
        assertTrue(of("CMD_FLOOD").get(0).chiTiet().contains("khong chan IP"));
    }

    @Test
    void floodAtLimitOrWithGapIsAllowed() {
        SessionStats s = new SessionStats(T0);
        burst(s, T0, 50);
        burst(s, T0 + 1000, 50);
        burst(s, T0 + 2000, 50);
        burst(s, T0 + 3000, 51);
        burst(s, T0 + 4000, 51);
        burst(s, T0 + 5000, 10); // hạ xuống: chuỗi bị ngắt
        assertEquals(Action.NONE, burst(s, T0 + 6000, 51));
        assertTrue(of("CMD_FLOOD").isEmpty());
    }

    @Test
    void floodOnlyRecordsInDetect() {
        mode.set(Mode.DETECT);
        SessionStats s = new SessionStats(T0);
        burst(s, T0, 51);
        burst(s, T0 + 1000, 51);
        assertEquals(Action.NONE, burst(s, T0 + 2000, 51));
        assertEquals(1, of("CMD_FLOOD").size());
        assertFalse(m.bans().isBanned(EVIL, T0 + 2100));
    }

    // ---------- SCRAPING ----------

    @Test
    void scrapingRejectsReadsOverLimit() {
        SessionStats s = new SessionStats(T0);
        for (int i = 0; i < 30; i++) {
            assertEquals(Action.NONE, m.onRead(s, EVIL, "CN01", Command.INVENTORY_GET, 0, T0 + i * 100));
        }
        assertEquals(Action.REJECT, m.onRead(s, EVIL, "CN01", Command.HISTORY_GET, 30, T0 + 3100));
        assertEquals(SecurityEvent.GIOI_HAN, of("SCRAPING").get(0).hanhDong());
        // sau 60 s cửa sổ trượt hết hạn
        assertEquals(Action.NONE, m.onRead(s, EVIL, "CN01", Command.INVENTORY_GET, 0, T0 + 70_000));
    }

    @Test
    void scrapingHistoryRangeTooLong() {
        SessionStats s = new SessionStats(T0);
        assertEquals(Action.NONE, m.onRead(s, EVIL, "CN01", Command.HISTORY_GET, 366, T0));
        assertEquals(Action.REJECT, m.onRead(s, EVIL, "CN01", Command.HISTORY_GET, 400, T0 + 1));
        mode.set(Mode.DETECT);
        assertEquals(Action.NONE, m.onRead(s, EVIL, "CN01", Command.HISTORY_GET, Long.MAX_VALUE, T0 + 20_000));
        assertEquals(2, of("SCRAPING").size());
    }

    // ---------- FUZZING, IDOR_PROBE ----------

    @Test
    void fuzzingBansIp() {
        for (int i = 0; i < 9; i++) {
            assertFalse(m.onMalformed(EVIL, null, "XYZ|" + i, T0 + i));
        }
        assertTrue(m.onMalformed(EVIL, null, "XYZ|9", T0 + 9));
        assertTrue(m.bans().isBanned(EVIL, T0 + 10));
        assertEquals(SecurityEvent.MEDIUM, of("FUZZING").get(0).muc());
    }

    @Test
    void idorProbeKicksSessionOnly() {
        SessionStats s = new SessionStats(T0);
        for (int i = 0; i < 4; i++) {
            assertEquals(Action.NONE, m.onNotFound(s, EVIL, "CN01", Command.ACCEPT, T0 + i));
        }
        // E04 của lệnh không theo mã YC (vd SALE mã hàng sai) không tính
        assertEquals(Action.NONE, m.onNotFound(s, EVIL, "CN01", Command.SALE, T0 + 5));
        assertEquals(Action.KICK, m.onNotFound(s, EVIL, "CN01", Command.RECEIVED, T0 + 6));
        assertFalse(m.bans().isBanned(EVIL, T0 + 7));
    }

    // ---------- CONN_FLOOD, PRELOGIN_IDLE ----------

    @Test
    void connFloodConcurrent() {
        for (int i = 0; i < 20; i++) {
            assertNotNull(open(EVIL, T0 + i * 1000L));
        }
        String deny = m.onAccept(EVIL, T0 + 21_000);
        assertNotNull(deny);
        assertEquals(SecurityEvent.CHAN_IP, of("CONN_FLOOD").get(0).hanhDong());
    }

    @Test
    void connFloodRateWithClosedConnections() {
        for (int i = 0; i < 30; i++) {
            m.onClose(open(EVIL, T0 + i * 100L), EVIL);
        }
        assertNotNull(m.onAccept(EVIL, T0 + 3100));
    }

    @Test
    void connFloodNotBlockedWhenIpHasSession() {
        m.onLogin(open(EVIL, T0), EVIL, T0);
        for (int i = 1; i < 25; i++) {
            assertNotNull(open(EVIL, T0 + i * 1000L));
        }
        assertFalse(of("CONN_FLOOD").isEmpty());
        assertEquals(SecurityEvent.GHI_NHAN, of("CONN_FLOOD").get(0).hanhDong());
    }

    @Test
    void preloginTimeoutClosesOnlyInBlock() {
        SessionStats s = new SessionStats(T0);
        assertFalse(m.onPreloginTimeout(s, EVIL, T0 + 9_999));
        assertTrue(m.onPreloginTimeout(s, EVIL, T0 + 10_000));
        // mỗi kết nối chỉ xử lý một lần
        assertFalse(m.onPreloginTimeout(s, EVIL, T0 + 11_000));
        mode.set(Mode.DETECT);
        assertFalse(m.onPreloginTimeout(new SessionStats(T0), "10.0.0.7", T0 + 10_000));
        assertEquals(2, of("PRELOGIN_IDLE").size());
    }

    @Test
    void preloginBanAfterTwentyPerMinute() {
        for (int i = 0; i < 19; i++) {
            m.onPreloginTimeout(new SessionStats(T0), EVIL, T0 + 10_000 + i * 100L);
        }
        assertFalse(m.bans().isBanned(EVIL, T0 + 12_000));
        m.onPreloginTimeout(new SessionStats(T0), EVIL, T0 + 12_000);
        assertTrue(m.bans().isBanned(EVIL, T0 + 12_001));
    }

    // ---------- trang công ty, client, discovery ----------

    @Test
    void adminLockAfterFiveFailsEvenInDetect() {
        mode.set(Mode.DETECT);
        for (int i = 0; i < 4; i++) {
            m.onAdminLoginFail("127.0.0.1", T0 + i * 1000);
        }
        assertEquals(0, m.adminLockedUntil(T0 + 4000));
        m.onAdminLoginFail("127.0.0.1", T0 + 5000);
        assertEquals(T0 + 5000 + 300_000, m.adminLockedUntil(T0 + 6000));
        assertEquals(0, m.adminLockedUntil(T0 + 5000 + 300_000));
        assertEquals(SecurityEvent.KHOA_TK, of("ADMIN_BRUTE_FORCE").get(0).hanhDong());
    }

    @Test
    void adminNoLockWhenOff() {
        mode.set(Mode.OFF);
        for (int i = 0; i < 10; i++) {
            m.onAdminLoginFail("127.0.0.1", T0 + i);
        }
        assertEquals(0, m.adminLockedUntil(T0 + 20));
    }

    @Test
    void clientReportRateLimitedAndSanitized() {
        SessionStats s = new SessionStats(T0);
        String longText = "x".repeat(4000);
        assertTrue(m.onClientReport(s, EVIL, "CN01", "csrf", longText, T0));
        assertFalse(m.onClientReport(s, EVIL, "CN01", "csrf", "lan 2", T0 + 500));
        assertTrue(m.onClientReport(s, EVIL, "CN01", "weird type!", "x", T0 + 1000));
        SecurityEvent first = events.get(0);
        assertEquals("CLIENT_CSRF", first.loai());
        assertEquals(SecurityEvent.CLIENT, first.nguon());
        assertEquals(SecurityEvent.HIGH, first.muc());
        assertEquals(500, first.chiTiet().length());
        assertEquals("CLIENT_WEIRD_TYPE_", events.get(1).loai());
        assertEquals(SecurityEvent.LOW, events.get(1).muc());
    }

    @Test
    void discoveryFloodDropsInBlockOnly() {
        for (int i = 0; i < 20; i++) {
            assertTrue(m.allowDiscovery(EVIL, T0 + i));
        }
        assertFalse(m.allowDiscovery(EVIL, T0 + 21));
        mode.set(Mode.DETECT);
        assertTrue(m.allowDiscovery(EVIL, T0 + 22));
        assertEquals(1, of("DISCOVERY_FLOOD").size()); // lần thứ hai bị gộp (cùng IP trong 10 s)
    }

    @Test
    void repeatedRecordOnlyEventsAreDeduplicated() {
        mode.set(Mode.DETECT);
        for (int i = 0; i < 30; i++) {
            m.onLoginFail(EVIL, "CN01", T0 + i * 100L);
        }
        assertEquals(1, of("BRUTE_FORCE").size());
        m.onLoginFail(EVIL, "CN01", T0 + 15_000);
        assertEquals(2, of("BRUTE_FORCE").size());
    }

    @Test
    void manualBanWorksAndUnban() {
        m.banManually(EVIL, 5, T0);
        assertNotNull(m.onAccept(EVIL, T0 + 1));
        assertTrue(m.unban(EVIL, T0 + 2));
        assertNull(m.onAccept(EVIL, T0 + 3));
        assertEquals(List.of("ADMIN_BAN", "ADMIN_UNBAN"), events.stream().map(SecurityEvent::loai).toList());
    }
}
