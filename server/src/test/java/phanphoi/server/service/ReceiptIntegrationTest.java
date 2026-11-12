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
        assertEquals(500, quote.get("subtotal").getAsLong());
        assertEquals(10, quote.get("vatRate").getAsInt());
        assertEquals(50, quote.get("vatAmount").getAsLong());
        assertEquals(550, quote.get("total").getAsLong());
        assertEquals(3, quantity());
        assertEquals(quote, checkout.execute("CN01", "CREATE", basket(id, 2)));
        db.read(c -> Db.update(c, "UPDATE san_pham SET gia_ban_le=999,ten='Changed' WHERE ma_sp='SP01'"));
        var paid = (com.google.gson.JsonObject) checkout.execute("CN01", "CONFIRM", basket(id, 2));
        assertEquals("PAID", paid.get("status").getAsString());
        assertEquals(500, paid.get("subtotal").getAsLong());
        assertEquals(50, paid.get("vatAmount").getAsLong());
        assertEquals(550, paid.get("total").getAsLong());
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

    @Test void checkoutRoundsVatOncePerBasketAndIgnoresClientProvidedTotals() throws Exception {
        db.tx(c -> {
            Db.update(c, "UPDATE san_pham SET gia_ban_le=5 WHERE ma_sp='SP01'");
            Db.update(c, "INSERT INTO san_pham (ma_sp,ten,don_vi,ma_dm,gia_ban_le) VALUES ('SP02','Second','cai','DM',5)");
            Db.update(c, "INSERT INTO kho_chi_nhanh (ma_cn,ma_sp,so_luong) VALUES ('CN01','SP02',2)");
            return null;
        });
        var checkout = new CheckoutService(db, new Events());
        var body = basket("HD" + UUID.randomUUID().toString().replace("-", ""), 1);
        var second = new com.google.gson.JsonObject();
        second.addProperty("maHang", "SP02"); second.addProperty("soLuong", 1);
        body.getAsJsonArray("items").add(second);
        body.addProperty("subtotal", 1); body.addProperty("vatRate", 0);
        body.addProperty("vatAmount", 0); body.addProperty("total", 1);
        var quote = (com.google.gson.JsonObject) checkout.execute("CN01", "CREATE", body);
        assertEquals(10, quote.get("subtotal").getAsLong());
        assertEquals(10, quote.get("vatRate").getAsInt());
        assertEquals(1, quote.get("vatAmount").getAsLong());
        assertEquals(11, quote.get("total").getAsLong());
        var paid = (com.google.gson.JsonObject) checkout.execute("CN01", "CONFIRM", body);
        assertEquals(11, paid.get("total").getAsLong());
        assertEquals(paid, checkout.execute("CN01", "GET", body));
    }

    @Test void legacyPendingAndPaidInvoicesKeepTheirOriginalAmounts() throws Exception {
        var checkout = new CheckoutService(db, new Events());
        String id = "HD" + UUID.randomUUID().toString().replace("-", "");
        db.read(c -> Db.update(c, "UPDATE san_pham SET gia_ban_le=250 WHERE ma_sp='SP01'"));
        var body = basket(id, 2);
        var legacy = ((com.google.gson.JsonObject) checkout.execute("CN01", "CREATE", body)).deepCopy();
        legacy.remove("subtotal"); legacy.remove("vatRate"); legacy.remove("vatAmount");
        legacy.addProperty("total", 500);
        db.tx(c -> Db.update(c, "UPDATE hoa_don_ban SET noi_dung=?::jsonb WHERE id=?", legacy.toString(), id));
        assertEquals(legacy, checkout.execute("CN01", "CREATE", body));
        var paid = (com.google.gson.JsonObject) checkout.execute("CN01", "CONFIRM", body);
        assertEquals(500, paid.get("total").getAsLong());
        assertFalse(paid.has("vatRate"));
        assertEquals(paid, checkout.execute("CN01", "CONFIRM", body));
        assertEquals(paid, checkout.execute("CN01", "GET", body));
        var listed = (com.google.gson.JsonObject) ((java.util.List<?>) checkout.execute("CN01", "LIST", new com.google.gson.JsonObject())).get(0);
        assertEquals(500, listed.get("total").getAsLong());
        assertFalse(listed.has("vatRate"));
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

    @Test void rejectShippedGoodsRestoresCentralOnceAndPreservesVoucher() throws Exception {
        Message ack = requests.reject("CN01", 1);
        assertEquals(Command.REJECT_RESULT, ack.command());
        assertEquals("OK", ack.param(1));
        assertEquals(ack, requests.reject("CN01", 1));
        assertEquals(110, (int) db.read(c -> Db.one(c, "SELECT so_luong FROM kho_tong WHERE ma_sp='SP01'", r -> r.getInt(1))));
        assertEquals(3, quantity());
        assertEquals(0, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM cong_no_cn", r -> r.getInt(1))));
        assertEquals(10, (int) db.read(c -> Db.one(c, "SELECT so_luong FROM phieu_xuat WHERE ma_yc=1", r -> r.getInt(1))));
        assertTrue(stock.historyMessage("CN01", "", "").listParam(0).isEmpty());
        assertTrue((Boolean) stock.reconcile().get("khop"));
        assertTrue(requests.resync("CN01").contains(ack));
        assertEquals(ErrorCode.E03, assertThrows(ServiceException.class, () -> requests.received("CN01", 1, 10)).code());
    }

    @Test void loginLimitUsesSameCanonicalBranchForCodeNameAndEmail() throws Exception {
        db.read(c -> Db.update(c, "UPDATE chi_nhanh SET email='branch@example.test' WHERE ma_cn='CN01'"));
        var auth = new AuthService(db);
        assertEquals("CN01", auth.loginKey(" CN01 "));
        assertEquals("CN01", auth.loginKey("cn01"));
        assertEquals("CN01", auth.loginKey("TEST"));
        assertEquals("CN01", auth.loginKey("BRANCH@example.test"));
        assertEquals("CN01", auth.loginKey("branch@example.test#cn01"));
        assertNull(auth.verify("CN01", "wrong-password"));
        var monitor = new phanphoi.server.security.SecurityMonitor(
                new phanphoi.server.security.SecurityRules(phanphoi.common.Config.load("missing-login-test.properties", new String[0])),
                () -> phanphoi.server.security.SecurityRules.Mode.BLOCK, event -> {});
        long now = System.currentTimeMillis();
        for (var input : java.util.List.of("CN01", "cn01", "Test", "branch@example.test", "branch@example.test#CN01"))
            monitor.onLoginFail("192.0.2.1", auth.loginKey(input), now);
        assertEquals(60, monitor.branchLoginRetryAfter("192.0.2.1", auth.loginKey("Test"), now));
        assertEquals(0, monitor.branchLoginRetryAfter("192.0.2.1", auth.loginKey("CN02"), now));
    }

    @Test void rejectCannotUndoReceivedGoodsOrAnotherBranch() throws Exception {
        assertEquals(ErrorCode.E04, assertThrows(ServiceException.class, () -> requests.reject("CN02", 1)).code());
        requests.received("CN01", 1, 10);
        assertEquals(ErrorCode.E03, assertThrows(ServiceException.class, () -> requests.reject("CN01", 1)).code());
        assertEquals(13, quantity());
    }

    @Test void concurrentRejectionsAndReceiptCannotBothSucceed() throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> { try { requests.reject("CN01", 1); return "reject"; } catch (ServiceException e) { return "error"; } });
            var b = executor.submit(() -> { try { requests.received("CN01", 1, 10); return "receive"; } catch (ServiceException e) { return "error"; } });
            String first = a.get(10, TimeUnit.SECONDS), second = b.get(10, TimeUnit.SECONDS);
            assertTrue(first.equals("error") ^ second.equals("error"));
            boolean rejected = first.equals("reject");
            assertEquals(rejected ? 3 : 13, quantity());
            assertEquals(rejected ? 110 : 100, (int) db.read(c -> Db.one(c, "SELECT so_luong FROM kho_tong WHERE ma_sp='SP01'", r -> r.getInt(1))));
        } finally { executor.shutdownNow(); }
    }

    @Test void rejectTransferredGoodsReturnsSourceStockAndReversesOriginalDebt() throws Exception {
        db.tx(c -> {
            Db.update(c, "DELETE FROM phieu_xuat WHERE ma_yc=1");
            Db.update(c, "INSERT INTO kho_chi_nhanh (ma_cn,ma_sp,so_luong) VALUES ('CN02','SP01',20)");
            Db.update(c, "INSERT INTO dieu_chuyen (ma_dc,ma_yc,tu_cn,den_cn,ma_sp,so_luong,don_gia,trang_thai) VALUES (1,1,'CN02','CN01','SP01',10,100,'HOAN_TAT')");
            DebtService.recordTransfer(c, 1);
            Db.update(c, "UPDATE san_pham SET gia_xuat=999 WHERE ma_sp='SP01'");
            return null;
        });
        requests.reject("CN01", 1);
        requests.reject("CN01", 1);
        assertEquals(30, (int) db.read(c -> Db.one(c, "SELECT so_luong FROM kho_chi_nhanh WHERE ma_cn='CN02'", r -> r.getInt(1))));
        assertEquals(3, quantity());
        assertEquals(4, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM cong_no_cn", r -> r.getInt(1))));
        var debt = new DebtService(db, new SessionRegistry(new Events()), new Events());
        assertTrue(debt.branchSummary("", true).stream().allMatch(row -> ((Number) row.get("conNo")).doubleValue() == 0));
        assertTrue((Boolean) stock.reconcile().get("khop"));
    }

    @Test void failedReturnRollsBackRejection() throws Exception {
        db.read(c -> Db.update(c, "UPDATE kho_tong SET so_luong=2147483647"));
        assertThrows(SQLException.class, () -> requests.reject("CN01", 1));
        assertEquals("DA_GIAO", requests.search("CN01", "", "", "", "", false).get(0).get("trangThai"));
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

    private RequestService replenishmentService() throws Exception {
        db.tx(c -> {
            Db.update(c, "DELETE FROM phieu_xuat");
            Db.update(c, "DELETE FROM yeu_cau");
            return null;
        });
        var settings = new phanphoi.server.ServerSettings(phanphoi.common.Config.load("test-no-config.properties", new String[0]));
        var events = new Events();
        var registry = new SessionRegistry(events);
        var outbox = new Outbox(db, registry, settings);
        var debts = new DebtService(db, registry, events);
        return new RequestService(db, outbox, events, new TransferService(db, registry, outbox, events, debts), debts, settings);
    }

    private int centralQuantity() throws SQLException {
        return db.read(c -> Db.one(c, "SELECT so_luong FROM kho_tong WHERE ma_sp='SP01'", r -> r.getInt(1)));
    }

    private int voucherCount() throws SQLException {
        return db.read(c -> Db.one(c, "SELECT count(*) FROM phieu_xuat", r -> r.getInt(1)));
    }

    @Test void replenishmentRequiresAllFourStepsAndRetriesDoNotDuplicateStockOrDebt() throws Exception {
        var service = replenishmentService();
        int id = service.replenish("CN01", "SP01", 10);
        assertEquals("DA_DE_XUAT", service.search("CN01", "", "", "", "", false).get(0).get("trangThai"));
        assertEquals(100, centralQuantity());
        assertEquals(3, quantity());
        assertEquals(0, voucherCount());
        assertThrows(ServiceException.class, () -> service.ship(id, 10));
        assertThrows(ServiceException.class, () -> service.received("CN01", id, 10));
        assertThrows(ServiceException.class, () -> service.accept("CN02", id, 10));

        assertEquals(Command.ACCEPTED, service.accept("CN01", id, 8).get(0).command());
        assertEquals(Command.ACCEPTED, service.accept("CN01", id, 8).get(0).command());
        assertThrows(ServiceException.class, () -> service.accept("CN01", id, 9));
        assertEquals("DA_CHAP_NHAN", service.search("CN01", "", "", "", "", false).get(0).get("trangThai"));
        var warehouse = stock.warehouse("CN01", java.util.Set.of("CN01"));
        var warehouseItem = (java.util.Map<?, ?>) ((java.util.List<?>) warehouse.get("matHang")).get(0);
        assertEquals(id, warehouseItem.get("ycMo"));
        assertEquals("DA_CHAP_NHAN", warehouseItem.get("ycTrangThai"));
        assertEquals(8, warehouseItem.get("ycSoLuongChot"));
        assertEquals(100, centralQuantity());
        assertEquals(3, quantity());
        assertEquals(0, voucherCount());
        var resync = service.resync("CN01");
        assertTrue(resync.stream().anyMatch(m -> m.command() == Command.ACCEPTED && "8".equals(m.param(2))));
        assertFalse(resync.stream().anyMatch(m -> m.command() == Command.OFFER || m.command() == Command.DELIVERED));
        assertThrows(ServiceException.class, () -> service.ship(id, 10));
        assertThrows(ServiceException.class, () -> service.replenish("CN01", "SP01", 9));

        service.ship(id, 8);
        service.ship(id, 8);
        var shippedWarehouse = stock.warehouse("CN01", java.util.Set.of("CN01"));
        var shippedItem = (java.util.Map<?, ?>) ((java.util.List<?>) shippedWarehouse.get("matHang")).get(0);
        assertEquals("DA_GIAO", shippedItem.get("ycTrangThai"));
        assertEquals(92, centralQuantity());
        assertEquals(3, quantity());
        assertEquals(1, voucherCount());
        assertEquals(0, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM cong_no_cn", r -> r.getInt(1))));
        service.received("CN01", id, 7);
        service.received("CN01", id, 7);
        service.ship(id, 8);
        assertEquals(92, centralQuantity());
        assertEquals(10, quantity());
        assertEquals(1, voucherCount());
        assertEquals(1, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM cong_no_cn", r -> r.getInt(1))));
        var row = service.search("CN01", "", "", "", "", false).get(0);
        assertEquals("HOAN_TAT", row.get("trangThai"));
        assertEquals(-1, row.get("chenhLech"));
    }

    @Test void replenishmentReusesOpenRequestWithoutDispatchingAndRefusalDoesNotChangeStock() throws Exception {
        var service = replenishmentService();
        int id = service.replenish("CN01", "SP01", 10);
        assertEquals(id, service.replenish("CN01", "SP01", 12));
        service.accept("CN01", id, 12);
        service.reject("CN01", id);
        service.reject("CN01", id);
        assertThrows(ServiceException.class, () -> service.ship(id, 12));
        assertEquals(100, centralQuantity());
        assertEquals(3, quantity());
        assertEquals(0, voucherCount());
    }

    @Test void insufficientStockAtDispatchRollsBackAndCanBeRetriedAfterRestock() throws Exception {
        var service = replenishmentService();
        int id = service.replenish("CN01", "SP01", 110);
        service.accept("CN01", id, 110);
        assertThrows(ServiceException.class, () -> service.ship(id, 110));
        assertEquals(100, centralQuantity());
        assertEquals(0, voucherCount());
        assertEquals("DA_CHAP_NHAN", service.search("CN01", "", "", "", "", false).get(0).get("trangThai"));
        db.read(c -> Db.update(c, "UPDATE kho_tong SET so_luong=150 WHERE ma_sp='SP01'"));
        service.ship(id, 110);
        assertEquals(40, centralQuantity());
        assertEquals(1, voucherCount());
    }

    @Test void simultaneousDispatchRetriesDeductOnlyOnce() throws Exception {
        var service = replenishmentService();
        int id = service.replenish("CN01", "SP01", 10);
        service.accept("CN01", id, 10);
        var executor = Executors.newFixedThreadPool(4);
        try {
            var tasks = new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for (int i = 0; i < 8; i++) tasks.add(executor.submit(() -> { service.ship(id, 10); return null; }));
            for (var task : tasks) task.get(10, TimeUnit.SECONDS);
        } finally { executor.shutdownNow(); }
        assertEquals(90, centralQuantity());
        assertEquals(1, voucherCount());
    }

    @Test void shortageCannotBypassBranchAgreementOrChangeAgreedQuantity() throws Exception {
        var service = replenishmentService();
        int id = service.replenish("CN01", "SP01", 10);
        service.reportShortage(id, 10);
        assertThrows(ServiceException.class, () -> service.ship(id, 10));
        service.accept("CN01", id, 6);
        assertThrows(ServiceException.class, () -> service.reportShortage(id, 7));
        service.reportShortage(id, 6);
        service.ship(id, 6);
        assertEquals(94, centralQuantity());
        assertEquals(1, voucherCount());
        assertEquals(3, quantity());
    }

    @Test void simultaneousDifferentRequestsCannotOversellCentralStock() throws Exception {
        var service = replenishmentService();
        db.read(c -> Db.update(c, "UPDATE kho_tong SET so_luong=10 WHERE ma_sp='SP01'"));
        int a = service.replenish("CN01", "SP01", 8);
        int b = service.replenish("CN02", "SP01", 8);
        service.accept("CN01", a, 8);
        service.accept("CN02", b, 8);
        assertEquals(10, centralQuantity());
        var executor = Executors.newFixedThreadPool(2);
        var start = new java.util.concurrent.CountDownLatch(1);
        try {
            var tasks = new java.util.ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int id : new int[]{a, b}) tasks.add(executor.submit(() -> {
                start.await();
                try { service.ship(id, 8); return true; }
                catch (ServiceException shortage) { return false; }
            }));
            start.countDown();
            int shipped = 0;
            for (var task : tasks) if (task.get(10, TimeUnit.SECONDS)) shipped++;
            assertEquals(1, shipped);
        } finally { executor.shutdownNow(); }
        assertEquals(2, centralQuantity());
        assertEquals(1, voucherCount());
    }

    @Test void replenishmentMigrationPreservesHistoricalDeliveriesAndIsRepeatable() throws Exception {
        db.read(c -> {
            Db.update(c, "ALTER TABLE yeu_cau DROP CONSTRAINT yeu_cau_trang_thai_check");
            return Db.update(c, "ALTER TABLE yeu_cau ADD CONSTRAINT yeu_cau_trang_thai_check CHECK (trang_thai IN ('CHO','DA_DE_XUAT','DA_GIAO','HOAN_TAT','TU_CHOI','THIEU_HANG'))");
        });
        phanphoi.server.db.ReplenishmentSchema.ensure(db);
        phanphoi.server.db.ReplenishmentSchema.ensure(db);
        assertEquals("DA_GIAO", requests.search("CN01", "", "", "", "", false).get(0).get("trangThai"));
        assertEquals(100, centralQuantity());
        assertEquals(3, quantity());
        assertEquals(1, voucherCount());
        db.read(c -> Db.update(c, "UPDATE yeu_cau SET trang_thai='DA_CHAP_NHAN',so_luong_chot=10 WHERE ma_yc=1"));
    }
}
