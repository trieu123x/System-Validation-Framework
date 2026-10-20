package phanphoi.common;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ProtocolTest {

    // ---------- escape ----------

    @Test
    void escapeRoundTripWithSpecialCharacters() throws Exception {
        String raw = "Giảm giá | 50% \\ hôm nay\nchỉ 1 ngày";
        String escaped = Protocol.escape(raw);
        assertFalse(escaped.contains("|"));
        assertFalse(escaped.contains("\n"));
        assertEquals(raw, Protocol.unescape(escaped));
    }

    @Test
    void escapeUsesSpecSequences() {
        assertEquals("a\\pb\\nc\\\\d", Protocol.escape("a|b\nc\\d"));
    }

    @Test
    void escapeDropsCarriageReturn() throws Exception {
        assertEquals("a\nb", Protocol.unescape(Protocol.escape("a\r\nb")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"abc\\", "a\\x", "\\q"})
    void unescapeRejectsInvalidSequences(String value) {
        assertThrows(ProtocolException.class, () -> Protocol.unescape(value));
    }

    // ---------- ghép/tách từng lệnh ----------

    @ParameterizedTest
    @EnumSource(Command.class)
    void everyCommandRoundTrips(Command command) throws Exception {
        Object[] params = new Object[command.paramCount()];
        for (int i = 0; i < params.length; i++) {
            params[i] = "p" + i + "|x\\y\nz";
        }
        String line = Protocol.encode(command, params);
        assertFalse(line.contains("\n"), "dong tin khong duoc chua xuong dong");
        Message decoded = Protocol.decode(line);
        assertEquals(command, decoded.command());
        for (int i = 0; i < params.length; i++) {
            assertEquals(params[i], decoded.param(i));
        }
    }

    @Test
    void encodeLogin() {
        assertEquals("LOGIN|CN01|123456", Protocol.encode(Command.LOGIN, "CN01", "123456"));
    }

    @Test
    void decodeSale() throws Exception {
        Message m = Protocol.decode("SALE|SP01|5");
        assertEquals(Command.SALE, m.command());
        assertEquals("SP01", m.param(0));
        assertEquals(5, m.intParam(1));
    }

    @Test
    void decodeCommandWithoutParams() throws Exception {
        assertEquals(Command.PING, Protocol.decode("PING").command());
        assertEquals(Command.INVENTORY_GET, Protocol.decode("INVENTORY_GET\r").command());
    }

    @Test
    void decodeKeepsEmptyParams() throws Exception {
        Message m = Protocol.decode("HISTORY_GET||");
        assertEquals(List.of("", ""), m.params());
    }

    @Test
    void decodeBroadcastWithEscapedPipeAndNewline() throws Exception {
        Message m = Protocol.decode("BROADCAST|Kho A \\p kho B\\nnghỉ lễ");
        assertEquals("Kho A | kho B\nnghỉ lễ", m.param(0));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "HELLO|x", "garbage", "SALE|SP01", "SALE|SP01|1|2", "LOGIN|a\\", "login|CN01|1"})
    void decodeRejectsMalformedLines(String line) {
        assertThrows(ProtocolException.class, () -> Protocol.decode(line));
    }

    @Test
    void intParamRejectsNonNumber() throws Exception {
        Message m = Protocol.decode("SALE|SP01|abc");
        assertThrows(ProtocolException.class, () -> m.intParam(1));
    }

    // ---------- danh sách ----------

    @Test
    void listRoundTrip() throws Exception {
        List<List<String>> records = List.of(
                List.of("SP01", "Nước suối, 500ml; loại 1", "50", "10"),
                List.of("SP02", "Mì \\ gói | cay", "0", "5"));
        String line = Protocol.encode(Command.INVENTORY, Protocol.encodeList(records));
        Message m = Protocol.decode(line);
        assertEquals(records, m.listParam(0));
    }

    @Test
    void listUsesSemicolonAndComma() {
        assertEquals("SP01,Nuoc,50;SP02,Mi,3",
                Protocol.encodeList(List.of(List.of("SP01", "Nuoc", 50), List.of("SP02", "Mi", 3))));
    }

    @Test
    void emptyListRoundTrip() throws Exception {
        String encoded = Protocol.encodeList(Collections.emptyList());
        assertEquals("", encoded);
        assertTrue(Protocol.decodeList(encoded).isEmpty());
    }

    @Test
    void listWithEmptyField() throws Exception {
        List<List<String>> records = List.of(List.of("1", "", "x"));
        assertEquals(records, Protocol.decodeList(Protocol.encodeList(records)));
    }

    @Test
    void decodeListRejectsInvalidEscape() {
        assertThrows(ProtocolException.class, () -> Protocol.decodeList("a\\z"));
    }

    // ---------- đọc dòng ----------

    @Test
    void lineReaderSplitsLinesAndStripsCr() throws Exception {
        LineReader r = reader("PING\r\nSALE|SP01|2\nPONG");
        assertEquals("PING", r.readLine());
        assertEquals("SALE|SP01|2", r.readLine());
        assertEquals("PONG", r.readLine());
        assertNull(r.readLine());
    }

    @Test
    void lineReaderFlagsTooLongLineAndRecovers() throws Exception {
        String longLine = "BROADCAST|" + "x".repeat(Protocol.MAX_LINE_BYTES + 10);
        LineReader r = reader(longLine + "\nPING\n");
        assertSame(LineReader.TOO_LONG, r.readLine());
        assertEquals("PING", r.readLine());
    }

    @Test
    void lineReaderAcceptsExactlyMaxBytes() throws Exception {
        String line = "x".repeat(Protocol.MAX_LINE_BYTES);
        assertEquals(line, reader(line + "\n").readLine());
    }

    @Test
    void lineReaderDecodesUtf8() throws Exception {
        assertEquals("BROADCAST|Chào chi nhánh Đà Nẵng", reader("BROADCAST|Chào chi nhánh Đà Nẵng\n").readLine());
    }

    private static LineReader reader(String s) {
        return new LineReader(new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8)));
    }
}
