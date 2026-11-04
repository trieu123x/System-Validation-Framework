package phanphoi.server.service;

import org.junit.jupiter.api.Test;
import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.server.ServiceException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Kiểm tra thông số kỹ thuật của mặt hàng, không cần CSDL. */
class StockServiceSpecTest {

    private static StockService.Product product(Integer w, Integer v, String kg, Map<String, String> specs) {
        return new StockService.Product("TB22", "Máy đầm gà 1.100W", "cái", "TK-35", "DAM", 0, 0, 0,
                w, v, kg == null ? null : new BigDecimal(kg), specs);
    }

    private static void assertE05(StockService.Product p) {
        ServiceException e = assertThrows(ServiceException.class, () -> StockService.validateProduct(p));
        assertEquals(ErrorCode.E05, e.code());
    }

    private static Map<String, String> pairs(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void rejectsOutOfRangeNumbers() {
        assertE05(product(0, null, null, null));
        assertE05(product(100_001, null, null, null));
        assertE05(product(-5, null, null, null));
        assertE05(product(null, 0, null, null));
        assertE05(product(null, 1001, null, null));
        assertE05(product(null, null, "1.25", null));
        assertE05(product(null, null, "0", null));
        assertE05(product(null, null, "0.05", null));
        assertE05(product(null, null, "100000", null));
    }

    @Test
    void acceptsBoundaryValuesAndNulls() {
        assertDoesNotThrow(() -> StockService.validateProduct(product(1, 1, "0.1", null)));
        assertDoesNotThrow(() -> StockService.validateProduct(product(100_000, 1000, "99999.9", null)));
        // "3.50" chỉ có 1 chữ số thập phân có nghĩa
        assertDoesNotThrow(() -> StockService.validateProduct(product(null, null, "3.50", null)));
        // phụ kiện không dùng điện: cả 3 trường null
        assertEquals(Map.of(), StockService.validateProduct(product(null, null, null, null)));
    }

    @Test
    void rejectsBadFreeSpecs() {
        Map<String, String> eleven = new LinkedHashMap<>();
        for (int i = 1; i <= 11; i++) {
            eleven.put("Khóa " + i, "giá trị");
        }
        assertE05(product(null, null, null, eleven));
        assertE05(product(null, null, null, pairs("k".repeat(41), "x")));
        assertE05(product(null, null, null, pairs("Áp lực", "x".repeat(61))));
        assertE05(product(null, null, null, pairs("  ", "x")));
        assertE05(product(null, null, null, pairs("Áp lực", "   ")));
        // trùng key chỉ khác khoảng trắng
        assertE05(product(null, null, null, pairs("Áp lực", "100 bar", " Áp lực ", "120 bar")));
        assertE05(product(null, null, null, pairs("Áp\u0000lực", "100 bar")));
        assertE05(product(null, null, null, pairs("Áp lực", "100\nbar")));
        // ký tự định dạng ẩn: đảo chiều RLO, ngắt dòng Unicode, zero-width space
        assertE05(product(null, null, null, pairs("Áp lực", "100 ‮rab")));
        assertE05(product(null, null, null, pairs("Áp lực", "100 bar")));
        assertE05(product(null, null, null, pairs("Áp​lực", "100 bar")));
    }

    @Test
    void malformedStoredSpecsDoNotBreakProductList() {
        assertEquals(Map.of("Áp lực", "100 bar"), StockService.parseSpecs("{\"Áp lực\":\"100 bar\"}", "TB18"));
        assertEquals(Map.of(), StockService.parseSpecs(null, "TB01"));
        // sửa tay bằng SQL thành object lồng / mảng: bỏ qua dòng đó
        assertEquals(Map.of(), StockService.parseSpecs("{\"a\":{\"b\":1}}", "TB01"));
        assertEquals(Map.of(), StockService.parseSpecs("[1,2]", "TB01"));
    }

    @Test
    void trimsAndKeepsOrderOfValidSpecs() {
        Map<String, String> ten = new LinkedHashMap<>();
        for (int i = 1; i <= 10; i++) {
            ten.put(" Khóa " + i + " ", " giá trị, có ; và | ");
        }
        Map<String, String> clean = StockService.validateProduct(product(1100, 220, "3.0", ten));
        assertEquals(10, clean.size());
        assertEquals("Khóa 1", clean.keySet().iterator().next());
        assertEquals("giá trị, có ; và |", clean.get("Khóa 10"));
        assertDoesNotThrow(() -> StockService.validateProduct(product(null, null, null,
                pairs("k".repeat(40), "v".repeat(60)))));
    }

    @Test
    void specsLineFor31ItemsFitsAndParses() throws Exception {
        List<List<Object>> rows = new ArrayList<>();
        for (int i = 1; i <= 31; i++) {
            rows.add(Arrays.asList(String.format("TB%02d", i), i % 5 == 0 ? null : 1100 + i,
                    i % 5 == 0 ? null : 220, i % 3 == 0 ? null : "12.5"));
        }
        Message m = StockService.specsLine(rows);
        String line = m.toLine();
        assertTrue(line.getBytes(StandardCharsets.UTF_8).length < Protocol.MAX_LINE_BYTES, "dai " + line.length());
        List<List<String>> decoded = Protocol.decode(line).listParam(0);
        assertEquals(31, decoded.size());
        assertEquals(List.of("TB01", "1101", "220", "12.5"), decoded.get(0));
        assertEquals(List.of("TB05", "", "", "12.5"), decoded.get(4));
        assertEquals(Command.SPECS, m.command());
    }

    @Test
    void specsLineDropsTrailingRecordsWhenTooLong() throws Exception {
        List<List<Object>> rows = new ArrayList<>();
        for (int i = 0; i < 400; i++) {
            rows.add(Arrays.asList(String.format("SP%04d", i), 1100, 220, "12.5"));
        }
        String line = StockService.specsLine(rows).toLine();
        assertTrue(line.getBytes(StandardCharsets.UTF_8).length <= Protocol.MAX_LINE_BYTES);
        int kept = Protocol.decode(line).listParam(0).size();
        assertTrue(kept > 100 && kept < 400, "giu " + kept);
    }

}
