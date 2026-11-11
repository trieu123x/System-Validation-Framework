package phanphoi.server.service;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;
import phanphoi.common.web.Http;
import phanphoi.server.ServiceException;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CheckoutServiceTest {
    @ParameterizedTest
    @CsvSource({"0,0,0", "4,0,4", "5,1,6", "14,1,15", "15,2,17", "500,50,550",
            "1090000,109000,1199000", "8181818181818181,818181818181818,8999999999999999"})
    void appliesTenPercentVatRoundedOnceToWholeDong(long subtotal, long vat, long total) {
        var amounts = CheckoutService.totals(subtotal);
        assertEquals(subtotal, amounts.subtotal());
        assertEquals(10, amounts.vatRate());
        assertEquals(vat, amounts.vatAmount());
        assertEquals(total, amounts.total());
    }

    @ParameterizedTest
    @ValueSource(longs = {-1, 8_181_818_181_818_183L, 9_000_000_000_000_000L, Long.MAX_VALUE})
    void rejectsAmountsWhoseVatInclusiveTotalExceedsSafeMoneyLimit(long subtotal) {
        assertThrows(ServiceException.class, () -> CheckoutService.totals(subtotal));
    }

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
