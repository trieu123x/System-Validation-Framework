package phanphoi.common;

import org.junit.jupiter.api.Test;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.*;

class NetUtilTest {

    private static List<String> split(LineSplitter s, String... chunks) {
        List<String> out = new ArrayList<>();
        for (String c : chunks) {
            s.feed(ByteBuffer.wrap(c.getBytes(StandardCharsets.UTF_8)), out::add);
        }
        return out;
    }

    @Test
    void splitterJoinsChunksAcrossBoundaries() {
        LineSplitter s = new LineSplitter();
        assertEquals(List.of("PING", "SALE|SP01|2"), split(s, "PI", "NG\r\nSALE|S", "P01|2\nPO"));
        assertEquals(List.of("PONG"), split(s, "NG\n"));
    }

    @Test
    void splitterHandlesUtf8SplitInsideCharacter() {
        LineSplitter s = new LineSplitter();
        byte[] all = "BROADCAST|Đà Nẵng\n".getBytes(StandardCharsets.UTF_8);
        List<String> out = new ArrayList<>();
        for (byte b : all) {
            s.feed(ByteBuffer.wrap(new byte[]{b}), out::add);
        }
        assertEquals(List.of("BROADCAST|Đà Nẵng"), out);
    }

    @Test
    void splitterFlagsTooLongAndRecovers() {
        LineSplitter s = new LineSplitter();
        List<String> out = split(s, "x".repeat(Protocol.MAX_LINE_BYTES + 1), "yy\nPING\n");
        assertEquals(2, out.size());
        assertSame(LineReader.TOO_LONG, out.get(0));
        assertEquals("PING", out.get(1));
    }

    @Test
    void fixedPolicyAlwaysWaitsCap() {
        ReconnectPolicy p = new ReconnectPolicy(ReconnectPolicy.Kind.FIXED, 500, 5000, new Random(1));
        for (int i = 0; i < 10; i++) {
            assertEquals(5000, p.delayMs(i));
        }
    }

    @Test
    void backoffPolicyStaysWithinGrowingCeiling() {
        ReconnectPolicy p = new ReconnectPolicy(ReconnectPolicy.Kind.BACKOFF, 500, 5000, new Random(7));
        for (int attempt = 0; attempt < 30; attempt++) {
            long ceiling = Math.min(5000, 500L << Math.min(attempt, 20));
            for (int k = 0; k < 100; k++) {
                long d = p.delayMs(attempt);
                assertTrue(d >= 0 && d <= ceiling, "attempt " + attempt + " delay " + d);
            }
        }
    }

    @Test
    void jitterPolicyFirstAttemptSpreadsThenStaysInUpperHalf() {
        ReconnectPolicy p = new ReconnectPolicy(ReconnectPolicy.Kind.JITTER, 500, 5000, new Random(11));
        long min0 = Long.MAX_VALUE;
        for (int k = 0; k < 1000; k++) {
            long d0 = p.delayMs(0);
            assertTrue(d0 >= 0 && d0 <= 5000);
            min0 = Math.min(min0, d0);
            long d = p.delayMs(3);
            assertTrue(d >= 2500 && d <= 5000, "delay " + d);
        }
        assertTrue(min0 < 500, "lan dau phai co the thu som");
    }

    @Test
    void parsePolicyByName() {
        assertEquals(ReconnectPolicy.Kind.JITTER, ReconnectPolicy.parse("jitter", 500, 5000).kind());
        assertEquals(ReconnectPolicy.Kind.FIXED, ReconnectPolicy.parse("FIXED", 500, 5000).kind());
    }

    @Test
    void backoffPolicySpreadsClients() {
        ReconnectPolicy p = new ReconnectPolicy(ReconnectPolicy.Kind.BACKOFF, 500, 5000, new Random(3));
        long min = Long.MAX_VALUE;
        long max = 0;
        for (int i = 0; i < 1000; i++) {
            long d = p.delayMs(5);
            min = Math.min(min, d);
            max = Math.max(max, d);
        }
        assertTrue(max - min > 4000, "jitter phai rai deu trong [0, 5000]");
    }
}
