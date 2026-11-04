package phanphoi.server;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;
import phanphoi.common.web.Http;
import phanphoi.server.service.StockService;

import java.math.BigDecimal;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Đọc body POST/PUT /api/products: 4 trường thông số đều optional. */
class AdminApiProductTest {

    private static JsonObject json(String s) {
        return Http.GSON.fromJson(s, JsonObject.class);
    }

    @Test
    void oldClientWithoutSpecFieldsGetsNullsAndEmptyMap() {
        StockService.Product p = AdminApi.product("TB22", json("""
                {"ten":"Máy","donVi":"cái","model":"","maDm":"DAM","giaNhap":"1","giaXuat":"2","giaBanLe":"3"}"""));
        assertNull(p.congSuatW());
        assertNull(p.dienApV());
        assertNull(p.trongLuongKg());
        assertEquals(Map.of(), p.thongSo());
        assertEquals(3, p.giaBanLe());
    }

    @Test
    void readsSpecFieldsFromNumbersOrStrings() {
        StockService.Product p = AdminApi.product("TB22", json("""
                {"ten":"Máy","donVi":"cái","maDm":"DAM","congSuatW":1100,"dienApV":"220","trongLuongKg":3.5,
                 "thongSo":{"Áp lực":"100 bar"}}"""));
        assertEquals(1100, p.congSuatW());
        assertEquals(220, p.dienApV());
        assertEquals(new BigDecimal("3.5"), p.trongLuongKg());
        assertEquals(Map.of("Áp lực", "100 bar"), p.thongSo());
        // ô để trống trên form = chưa có
        assertNull(AdminApi.product("TB22", json("{\"congSuatW\":\"\",\"trongLuongKg\":null}")).congSuatW());
    }

    @Test
    void rejectsWrongTypes() {
        assertThrows(ServiceException.class, () -> AdminApi.product("TB22", json("{\"thongSo\":{\"Áp lực\":100}}")));
        assertThrows(ServiceException.class, () -> AdminApi.product("TB22", json("{\"thongSo\":[\"a\",\"b\"]}")));
        assertThrows(Http.ApiException.class, () -> AdminApi.product("TB22", json("{\"congSuatW\":1100.5}")));
        assertThrows(Http.ApiException.class, () -> AdminApi.product("TB22", json("{\"congSuatW\":\"abc\"}")));
        assertThrows(Http.ApiException.class, () -> AdminApi.product("TB22", json("{\"congSuatW\":{\"x\":1}}")));
        assertThrows(Http.ApiException.class, () -> AdminApi.product("TB22", json("{\"trongLuongKg\":\"1e999999999\"}")));
    }
}
