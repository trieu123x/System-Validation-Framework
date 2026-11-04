package phanphoi.server.service;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import phanphoi.common.web.Http;
import phanphoi.server.ServiceException;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CheckoutServiceTest {
    @Test void sortsProductsToKeepConcurrentStockLocksInTheSameOrder() {
        JsonObject body = Http.GSON.fromJson("""
                {"items":[{"maHang":"TB02","soLuong":2},{"maHang":"TB01","soLuong":3}]}""", JsonObject.class);
        var quantities = CheckoutService.quantities(body);
        assertEquals(Map.of("TB01", 3, "TB02", 2), quantities);
        assertEquals("TB01", quantities.keySet().iterator().next());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{}", "{\"items\":[]}", "{\"items\":null}", "{\"items\":[null]}",
            "{\"items\":[{\"maHang\":\"TB01\",\"soLuong\":0}]}",
            "{\"items\":[{\"maHang\":\"TB01\",\"soLuong\":-1}]}",
            "{\"items\":[{\"maHang\":\"TB01\",\"soLuong\":1.5}]}",
            "{\"items\":[{\"maHang\":\"TB01\",\"soLuong\":1000001}]}",
            "{\"items\":[{\"maHang\":\"TB01\",\"soLuong\":2147483648}]}",
            "{\"items\":[{\"maHang\":\"bad|code\",\"soLuong\":1}]}",
            "{\"items\":[{\"maHang\":\"TB01\",\"soLuong\":1},{\"maHang\":\"TB01\",\"soLuong\":1}]}"
    })
    void rejectsMalformedAndAmbiguousBaskets(String json) {
        assertThrows(ServiceException.class, () -> CheckoutService.quantities(Http.GSON.fromJson(json, JsonObject.class)));
    }
}
