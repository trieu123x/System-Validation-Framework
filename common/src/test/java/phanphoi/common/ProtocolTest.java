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
    void inventoryWithEightFieldsFitsLineAndKeepsFirstFourFields() throws Exception {
        // 28 mặt hàng Toboki, tên dài có dấu phẩy và ký tự tiếng Việt như dữ liệu thật
        List<List<String>> records = new java.util.ArrayList<>();
        for (int i = 1; i <= 28; i++) {
            records.add(List.of(String.format("TB%02d", i), "Máy khoan bàn 375W, mũi 1,5–13 mm", "10", "3",
                    "TK1200/25", "Máy tời, pa lăng", "15725000", "18500000"));
        }
        String line = Protocol.encode(Command.INVENTORY, Protocol.encodeList(records));
        assertTrue(line.getBytes(StandardCharsets.UTF_8).length <= Protocol.MAX_LINE_BYTES);
        List<List<String>> decoded = Protocol.decode(line).listParam(0);
        assertEquals(records, decoded);
        // client cũ chỉ đọc 4 trường đầu
        assertEquals(List.of("TB28", "Máy khoan bàn 375W, mũi 1,5–13 mm", "10", "3"), decoded.get(27).subList(0, 4));
    }

    @Test
    void debtRoundTripWithSeparatorsInNote() throws Exception {
        List<List<String>> rows = List.of(
                List.of("12", "THU", "2000000", "2026-10-21 09:15:00", "Thu đợt 1, chuyển khoản; còn nợ | ghi chú"),
                List.of("11", "XUAT", "4635000", "2026-10-21 09:00:00", "YC #7: TB01 x 5"),
                List.of("10", "DC_GIAO", "927000", "2026-10-20 16:00:00", ""));
        Message sent = Message.of(Command.DEBT, 4635000, 2000000, 2635000, 200000000, Protocol.encodeList(rows));
        Message got = Protocol.decode(sent.toLine());
        assertEquals(Command.DEBT, got.command());
        assertEquals(List.of("4635000", "2000000", "2635000", "200000000"), got.params().subList(0, 4));
        assertEquals(rows, got.listParam(4));
    }

    @Test
    void inventoryWithImageRefFits31Items() throws Exception {
        // 31 mặt hàng (TB01..TB31) với trường thứ 9 là tham chiếu ảnh rút gọn, không phải URL đầy đủ.
        // Dòng có độ dài tiêu biểu: danh mục thật đo được 3358 byte (URL đầy đủ sẽ thành ~4900 byte, quá 4096).
        List<List<String>> records = new java.util.ArrayList<>();
        for (int i = 1; i <= 31; i++) {
            String ma = String.format("TB%02d", i);
            records.add(List.of(ma, "Máy rửa xe cao áp TOK7500", "100", "10", "TOK7500", "Máy rửa xe",
                    "15725000", "18500000", "v1792609532/toboki/" + ma + ".webp"));
        }
        String line = Protocol.encode(Command.INVENTORY, Protocol.encodeList(records));
        assertTrue(line.getBytes(StandardCharsets.UTF_8).length <= Protocol.MAX_LINE_BYTES);
        List<List<String>> decoded = Protocol.decode(line).listParam(0);
        assertEquals(records, decoded);
        assertEquals("v1792609532/toboki/TB31.webp", decoded.get(30).get(8));
    }

    @Test
    void noticeRoundTripKeepsEmptyFieldsAndSeparators() throws Exception {
        Message sent = Message.of(Command.NOTICE, 7, "HOI_NHU_CAU", "DA_GUI", "2026-10-22 09:30:00",
                "Chi nhánh có cần thêm Máy tời TK400/25?", "Tồn 4 | ngưỡng 3\nĐề xuất 2 cái; giao trong tuần", "TB10",
                2, "", "", "v1792609532/toboki/TB10.webp");
        Message got = Protocol.decode(sent.toLine());
        assertEquals(Command.NOTICE, got.command());
        assertEquals(sent.params(), got.params());
        assertEquals("Tồn 4 | ngưỡng 3\nĐề xuất 2 cái; giao trong tuần", got.param(5));
        assertEquals("", got.param(8));
        // TIN không có mặt hàng: các trường cuối để rỗng
        Message tin = Protocol.decode(Message.of(Command.NOTICE, 8, "TIN", "DA_XEM", "2026-10-22 10:00:00",
                "Kiểm kê quý IV", "", "", "", "", "", "").toLine());
        assertEquals(11, tin.params().size());
    }

    @Test
    void noticeReplyRequiresThreeParams() throws Exception {
        assertThrows(ProtocolException.class, () -> Protocol.decode("NOTICE_REPLY|7|CAN_HANG"));
        Message m = Protocol.decode("NOTICE_REPLY|7|CAN_HANG|5");
        assertEquals(7, m.intParam(0));
        assertEquals(5, m.intParam(2));
        assertThrows(ProtocolException.class, () -> Protocol.decode("NOTICE|1|TIN|DA_GUI"));
    }

    @Test
    void debtRequiresFiveParams() {
        assertThrows(ProtocolException.class, () -> Protocol.decode("DEBT|1|2|3|4"));
        assertEquals(0, Command.DEBT_GET.paramCount());
    }

    @Test
    void securityReportWithLongDetailStaysWithinLineLimit() throws Exception {
        // chi tiết dài (client cắt còn 500 ký tự, server cắt lại) kèm ký tự cần escape vẫn nằm trong 4096 byte
        String detail = "Origin: http://evil.example | Host: 127.0.0.1:8081\n".repeat(70).substring(0, 3500);
        String line = Message.of(Command.SECURITY_REPORT, "CLIENT_CSRF", detail).toLine();
        assertTrue(line.getBytes(StandardCharsets.UTF_8).length <= Protocol.MAX_LINE_BYTES);
        Message m = Protocol.decode(line);
        assertEquals("CLIENT_CSRF", m.param(0));
        assertEquals(detail, m.param(1));
        assertThrows(ProtocolException.class, () -> Protocol.decode("SECURITY_REPORT|CLIENT_CSRF"));
        String plain = "a".repeat(4000);
        String line4000 = Message.of(Command.SECURITY_REPORT, "CLIENT_API_FLOOD", plain).toLine();
        assertTrue(line4000.getBytes(StandardCharsets.UTF_8).length <= Protocol.MAX_LINE_BYTES);
        assertEquals(plain, Protocol.decode(line4000).param(1));
    }

    @Test
    void errorE06RoundTrip() throws Exception {
        Message m = Protocol.decode(Message.of(Command.ERROR, ErrorCode.E06.name(), "IP bi chan den 10:25").toLine());
        assertEquals(ErrorCode.E06, ErrorCode.valueOf(m.param(0)));
        assertEquals("IP bi chan den 10:25", m.param(1));
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
