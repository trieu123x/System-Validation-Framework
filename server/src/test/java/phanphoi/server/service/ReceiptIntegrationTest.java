package phanphoi.server.service;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.Message;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;
import phanphoi.server.db.ReceiptSchema;
import phanphoi.server.net.SessionRegistry;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/** Optional PostgreSQL integration suite. Uses only a new, random test schema; never touches application tables. */
@EnabledIfEnvironmentVariable(named = "SVF_TEST_DB_URL", matches = ".+")
class ReceiptIntegrationTest {
    private String schema;
    private Db db;
    private RequestService requests;
    private StockService stock;
    private String url;
    private String user;
    private String password;

    @BeforeEach
    void setup() throws Exception {
        url = System.getenv("SVF_TEST_DB_URL");
        user = System.getenv().getOrDefault("SVF_TEST_DB_USER", "postgres");
        password = System.getenv().getOrDefault("SVF_TEST_DB_PASSWORD", "");
        schema = "receipt_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var c = DriverManager.getConnection(url, user, password); var s = c.createStatement()) {
            s.execute("CREATE SCHEMA " + schema);
        }
        db = new Db(url + (url.contains("?") ? "&" : "?") + "currentSchema=" + schema, user, password, 4);
        Path root = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(root.resolve("db/schema.sql"))) root = root.getParent();
        String ddl = Files.readString(root.resolve("db/schema.sql"))
                .replace("\\ir dieu_chuyen.sql", Files.readString(root.resolve("db/dieu_chuyen.sql")))
                .replace("\\ir thong_bao.sql", Files.readString(root.resolve("db/thong_bao.sql")));
        db.read(c -> {
            try (var s = c.createStatement()) { s.execute(ddl); }
            return null;
        });
        ReceiptSchema.ensure(db);
        ReceiptSchema.ensure(db);
        phanphoi.server.db.CheckoutSchema.ensure(db);
        phanphoi.server.db.CheckoutSchema.ensure(db);
        db.tx(c -> {
            Db.update(c, "INSERT INTO chi_nhanh (ma_cn, ten, mat_khau_hash, salt) VALUES ('CN01','Test','x','x'), ('CN02','Other','x','x')");
            Db.update(c, "INSERT INTO danh_muc (ma_dm, ten) VALUES ('DM','Test')");
            Db.update(c, "INSERT INTO san_pham (ma_sp, ten, don_vi, ma_dm, gia_xuat) VALUES ('SP01','Product','cai','DM',100)");
            Db.update(c, "INSERT INTO kho_tong (ma_sp, so_luong) VALUES ('SP01',100)");
            Db.update(c, "INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu) VALUES ('CN01','SP01',3,0)");
            Db.update(c, "INSERT INTO yeu_cau (ma_yc,ma_cn,ma_sp,so_luong_giao,trang_thai) VALUES (1,'CN01','SP01',10,'DA_GIAO')");
            Db.update(c, "INSERT INTO phieu_xuat (ma_yc,ma_cn,ma_sp,so_luong,don_gia) VALUES (1,'CN01','SP01',10,100)");
            return null;
        });
        Events events = new Events();
        var debts = new DebtService(db, new SessionRegistry(events), events);
        requests = new RequestService(db, null, events, null, debts, null);
        stock = new StockService(db, events);
    }

    @AfterEach
    void cleanup() throws Exception {
        if (db != null) db.close();
        if (schema != null) {
            try (var c = DriverManager.getConnection(url, user, password); var s = c.createStatement()) {
                s.execute("DROP SCHEMA " + schema + " CASCADE");
            }
        }
    }

    private int quantity() throws SQLException {
        return db.read(c -> Db.one(c, "SELECT so_luong FROM kho_chi_nhanh WHERE ma_cn='CN01' AND ma_sp='SP01'", r -> r.getInt(1)));
    }

    private com.google.gson.JsonObject basket(String id, int quantity) {
        return phanphoi.common.web.Http.GSON.fromJson("""
                {"id":"%s","customer":"Khách thử nghiệm","items":[{"maHang":"SP01","soLuong":%d}]}""".formatted(id, quantity), com.google.gson.JsonObject.class);
    }

    @Test void checkoutIsQuotedWithoutDeductionAndPaidExactlyOnce() throws Exception {
        var checkout = new CheckoutService(db, new Events());
        String id = "HD" + UUID.randomUUID().toString().replace("-", "");
        db.read(c -> Db.update(c, "UPDATE san_pham SET gia_ban_le=250 WHERE ma_sp='SP01'"));
        var quote = (com.google.gson.JsonObject) checkout.execute("CN01", "CREATE", basket(id, 2));
        assertEquals("PENDING", quote.get("status").getAsString());
        assertEquals(500, quote.get("total").getAsLong());
        assertEquals(3, quantity());
        assertEquals(quote, checkout.execute("CN01", "CREATE", basket(id, 2)));
        db.read(c -> Db.update(c, "UPDATE san_pham SET gia_ban_le=999,ten='Changed' WHERE ma_sp='SP01'"));
        var paid = (com.google.gson.JsonObject) checkout.execute("CN01", "CONFIRM", basket(id, 2));
        assertEquals("PAID", paid.get("status").getAsString());
        assertEquals(500, paid.get("total").getAsLong());
        assertEquals("Product", paid.getAsJsonArray("items").get(0).getAsJsonObject().get("tenHang").getAsString());
        assertEquals(1, quantity());
        assertEquals(paid, checkout.execute("CN01", "CONFIRM", basket(id, 2)));
        assertEquals(paid, checkout.execute("CN01", "GET", basket(id, 2)));
        assertEquals(1, quantity());
        assertEquals(1, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM ban_hang", r -> r.getInt(1))));
        assertEquals(1, ((java.util.List<?>) checkout.execute("CN01", "LIST", new com.google.gson.JsonObject())).size());
        assertTrue(((java.util.List<?>) checkout.execute("CN02", "LIST", new com.google.gson.JsonObject())).isEmpty());
        assertThrows(ServiceException.class, () -> checkout.execute("CN02", "GET", basket(id, 2)));
        assertThrows(ServiceException.class, () -> checkout.execute("CN02", "CONFIRM", basket(id, 2)));
        assertThrows(ServiceException.class, () -> checkout.execute("CN01", "CREATE", basket(id, 1)));
    }

    @Test void checkoutRollsBackEveryLineIfAnotherSaleConsumesStock() throws Exception {
        db.tx(c -> {
            Db.update(c, "INSERT INTO san_pham (ma_sp,ten,don_vi,ma_dm) VALUES ('SP02','Second','cai','DM')");
            Db.update(c, "INSERT INTO kho_chi_nhanh (ma_cn,ma_sp,so_luong) VALUES ('CN01','SP02',2)");
            return null;
        });
        var checkout = new CheckoutService(db, new Events());
        String id = "HD" + UUID.randomUUID().toString().replace("-", "");
        var body = basket(id, 2);
        var second = new com.google.gson.JsonObject(); second.addProperty("maHang", "SP02"); second.addProperty("soLuong", 2);
        body.getAsJsonArray("items").add(second);
        checkout.execute("CN01", "CREATE", body);
        stock.sale("CN01", "SP02", 1);
        assertThrows(ServiceException.class, () -> checkout.execute("CN01", "CONFIRM", body));
        assertEquals(3, quantity());
        var pending = (com.google.gson.JsonObject) checkout.execute("CN01", "GET", body);
        assertEquals("PENDING", pending.get("status").getAsString());
        assertEquals(1, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM ban_hang", r -> r.getInt(1))));
    }

    @Test void concurrentPaymentClicksDeductOnlyOnce() throws Exception {
        var checkout = new CheckoutService(db, new Events());
        String id = "HD" + UUID.randomUUID().toString().replace("-", "");
        var body = basket(id, 2);
        checkout.execute("CN01", "CREATE", body);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> checkout.execute("CN01", "CONFIRM", body));
            var b = executor.submit(() -> checkout.execute("CN01", "CONFIRM", body));
            assertEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
            assertEquals(1, quantity());
            assertEquals(1, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM ban_hang", r -> r.getInt(1))));
        } finally { executor.shutdownNow(); }
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 8, 10, 12})
    void countedQuantityPersistsAndDuplicatesDoNotCreditTwice(int actual) throws Exception {
        Message ack = requests.received("CN01", 1, actual);
        assertEquals(Command.RECEIVED_OK, ack.command());
        assertEquals(actual, ack.intParam(3));
        assertEquals(3 + actual, quantity());
        assertEquals(ack, requests.received("CN01", 1, actual));
        assertEquals(3 + actual, quantity());
        assertTrue(requests.resync("CN01").contains(ack));
        var row = requests.search("CN01", "", "", "", "", false).get(0);
        assertEquals(actual, ((Number) row.get("soLuongNhan")).intValue());
        assertEquals(actual - 10, ((Number) row.get("chenhLech")).intValue());
        assertEquals(actual == 10 ? 0 : 1, requests.search("CN01", "", "", "", "", true).size());
        assertEquals(String.valueOf(actual), stock.historyMessage("CN01", "", "").listParam(0).get(0).get(6));
        assertEquals(1, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM cong_no_cn", r -> r.getInt(1))));
        assertEquals(1000, (int) db.read(c -> Db.one(c, "SELECT so_tien FROM cong_no_cn", r -> r.getInt(1))));
        var error = assertThrows(ServiceException.class, () -> requests.received("CN01", 1, actual + 1));
        assertEquals(ErrorCode.E03, error.code());
        assertEquals(3 + actual, quantity());
    }

    @Test
    void invalidAndForeignReceiptsAreRejected() throws Exception {
        assertEquals(ErrorCode.E05, assertThrows(ServiceException.class, () -> requests.received("CN01", 1, -1)).code());
        assertEquals(ErrorCode.E04, assertThrows(ServiceException.class, () -> requests.received("CN02", 1, 8)).code());
        assertEquals(ErrorCode.E04, assertThrows(ServiceException.class, () -> requests.received("CN01", 999, 8)).code());
        db.read(c -> Db.update(c, "UPDATE yeu_cau SET trang_thai='CHO' WHERE ma_yc=1"));
        assertEquals(ErrorCode.E03, assertThrows(ServiceException.class, () -> requests.received("CN01", 1, 8)).code());
        assertEquals(3, quantity());
    }

    @Test
    void concurrentRetriesCreditOnlyOnce() throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> requests.received("CN01", 1, 8));
            var second = executor.submit(() -> requests.received("CN01", 1, 8));
            assertEquals(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertEquals(11, quantity());
        } finally { executor.shutdownNow(); }
    }

    @Test
    void failedStockWriteRollsBackReceiptAndDebt() throws Exception {
        db.read(c -> Db.update(c, "UPDATE kho_chi_nhanh SET so_luong=2147483647"));
        assertThrows(SQLException.class, () -> requests.received("CN01", 1, 1));
        var row = requests.search("CN01", "", "", "", "", false).get(0);
        assertEquals("DA_GIAO", row.get("trangThai"));
        assertNull(row.get("soLuongNhan"));
        assertEquals(0, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM cong_no_cn", r -> r.getInt(1))));
    }

    @Test
    void migrationPreservesExistingRowsAndIsRepeatable() throws Exception {
        db.read(c -> Db.update(c, "ALTER TABLE yeu_cau DROP COLUMN so_luong_nhan"));
        ReceiptSchema.ensure(db);
        ReceiptSchema.ensure(db);
        assertEquals(3, quantity());
        assertNull(requests.search("CN01", "", "", "", "", false).get(0).get("soLuongNhan"));
        assertEquals(Command.RECEIVED_OK, requests.received("CN01", 1, 8).command());
    }
}
