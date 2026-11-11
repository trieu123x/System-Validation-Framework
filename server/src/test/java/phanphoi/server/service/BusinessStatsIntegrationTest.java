package phanphoi.server.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import phanphoi.common.web.Http;
import phanphoi.server.AuditLog;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.BusinessSchema;
import phanphoi.server.db.Db;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Thống kê kinh doanh trên PostgreSQL thật. Như ReceiptIntegrationTest: chỉ chạy khi có SVF_TEST_DB_URL,
 * dựng schema ngẫu nhiên riêng rồi xoá, không đụng bảng của ứng dụng.
 *
 * Dữ liệu dựng tay (kỳ = 30 ngày tới hôm nay):
 *   SP01 giá vốn bình quân (10×100 + 30×200)/40 = 175; SP02 chưa nhập → gia_nhap 80; SP03 không bán.
 *   YC1 CN01 SP01 4×250 HOAN_TAT · YC2 CN02 SP02 2×100 HOAN_TAT · YC3 CN01 SP02 5×100 bị trả (TU_CHOI)
 *   YC4 SIM01 SP01 100×250 (giả lập) · YC5 CN02 SP01 điều chuyển từ CN01 · YC6 CN01 CHO · YC7 CN02 THIEU_HANG
 *   Kỳ trước: YC8 CN01 1×250, YC9 CN03 1×250 (40 ngày trước).
 */
@EnabledIfEnvironmentVariable(named = "SVF_TEST_DB_URL", matches = ".+")
class BusinessStatsIntegrationTest {
    private String schema;
    private Db db;
    private AuditLog audit;
    private BusinessStatsService stats;
    private String url;
    private String user;
    private String password;
    private final LocalDate today = LocalDate.now();
    private final String from = today.minusDays(29).toString();
    private final String to = today.toString();

    @BeforeEach
    void setup() throws Exception {
        url = System.getenv("SVF_TEST_DB_URL");
        user = System.getenv().getOrDefault("SVF_TEST_DB_USER", "postgres");
        password = System.getenv().getOrDefault("SVF_TEST_DB_PASSWORD", "");
        schema = "business_test_" + UUID.randomUUID().toString().replace("-", "");
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
        phanphoi.server.db.ReceiptSchema.ensure(db);
        phanphoi.server.db.CheckoutSchema.ensure(db);
        BusinessSchema.ensure(db);
        Timestamp now = Timestamp.valueOf(today.atTime(0, 0, 1));
        Timestamp old = Timestamp.valueOf(today.minusDays(40).atTime(12, 0));
        db.tx(c -> {
            Db.update(c, """
                    INSERT INTO chi_nhanh (ma_cn, ten, mat_khau_hash, salt, gia_lap) VALUES
                    ('CN01','Mot','x','x',false), ('CN02','Hai','x','x',false), ('CN03','Ba','x','x',false),
                    ('SIM01','Gia lap','x','x',true)""");
            Db.update(c, "INSERT INTO danh_muc (ma_dm, ten) VALUES ('DM1','Dien'), ('DM2','Nuoc')");
            Db.update(c, """
                    INSERT INTO san_pham (ma_sp, ten, don_vi, ma_dm, gia_nhap, gia_xuat, gia_ban_le) VALUES
                    ('SP01','May loc','cai','DM1',50,250,320), ('SP02','Loi loc','cai','DM1',80,100,150),
                    ('SP03','Binh nuoc','cai','DM2',10,20,30)""");
            Db.update(c, "INSERT INTO kho_tong (ma_sp, so_luong) VALUES ('SP01',100), ('SP02',100), ('SP03',7)");
            Db.update(c, "INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong) VALUES ('CN01','SP01',18)");
            Db.update(c, "INSERT INTO nha_cung_cap (ma_ncc, ten) VALUES ('N1','NCC')");
            Db.update(c, "INSERT INTO phieu_nhap (ma_sp, so_luong, ma_ncc, don_gia) VALUES ('SP01',10,'N1',100), ('SP01',30,'N1',200)");
            Db.update(c, """
                    INSERT INTO yeu_cau (ma_yc, ma_cn, ma_sp, so_luong_giao, trang_thai, tao_luc) VALUES
                    (1,'CN01','SP01',4,'HOAN_TAT',?), (2,'CN02','SP02',2,'HOAN_TAT',?), (3,'CN01','SP02',5,'TU_CHOI',?),
                    (4,'SIM01','SP01',100,'HOAN_TAT',?), (5,'CN02','SP01',3,'HOAN_TAT',?), (6,'CN01','SP01',NULL,'CHO',?),
                    (7,'CN02','SP01',NULL,'THIEU_HANG',?), (8,'CN01','SP01',1,'HOAN_TAT',?), (9,'CN03','SP01',1,'HOAN_TAT',?)""",
                    now, now, now, now, now, now, now, old, old);
            Db.update(c, """
                    INSERT INTO phieu_xuat (ma_yc, ma_cn, ma_sp, so_luong, don_gia, thoi_gian) VALUES
                    (1,'CN01','SP01',4,250,?), (2,'CN02','SP02',2,100,?), (3,'CN01','SP02',5,100,?),
                    (4,'SIM01','SP01',100,250,?), (8,'CN01','SP01',1,250,?), (9,'CN03','SP01',1,250,?)""",
                    now, now, now, now, old, old);
            Db.update(c, """
                    INSERT INTO dieu_chuyen (ma_yc, tu_cn, den_cn, ma_sp, so_luong, don_gia, trang_thai)
                    VALUES (5,'CN01','CN02','SP01',3,250,'HOAN_TAT')""");
            Db.update(c, """
                    INSERT INTO ban_hang (ma_cn, ma_sp, so_luong, don_gia, thoi_gian) VALUES
                    ('CN01','SP01',2,300,?), ('CN01','SP01',4,NULL,?), ('SIM01','SP01',50,320,?)""", now, now, now);
            Db.update(c, "INSERT INTO cong_no_cn (ma_cn, loai, so_tien, ma_yc) VALUES ('CN01','XUAT',1000,1)");
            return null;
        });
        audit = new AuditLog(db, true);
        stats = new BusinessStatsService(db, new Events(), audit, 14);
    }

    @AfterEach
    void cleanup() throws Exception {
        if (audit != null) audit.close();
        if (db != null) db.close();
        if (schema != null) {
            try (var c = DriverManager.getConnection(url, user, password); var s = c.createStatement()) {
                s.execute("DROP SCHEMA " + schema + " CASCADE");
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> m, String key) {
        return (List<Map<String, Object>>) m.get(key);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Map<String, Object> m, String key) {
        return (Map<String, Object>) m.get(key);
    }

    private static long num(Map<String, Object> m, String key) {
        return ((Number) m.get(key)).longValue();
    }

    private static Map<String, Object> branch(Map<String, Object> s, String maCn) {
        return list(s, "branches").stream().filter(b -> maCn.equals(b.get("maCn"))).findFirst().orElseThrow();
    }

    @Test
    void sellInExcludesRejectedAndTransfersAndSimBranches() throws Exception {
        var s = stats.summary(from, to, "");
        for (String key : List.of("kpi", "prevKpi", "trend", "products", "khongBan", "categories", "branches")) {
            assertTrue(s.containsKey(key), key);
        }
        var kpi = map(s, "kpi");
        assertEquals(1200, num(kpi, "doanhThu"));
        assertEquals(2, num(kpi, "soPhieu"));
        assertEquals(600, num(kpi, "tbPhieu"));
        assertEquals(500, num(map(s, "prevKpi"), "doanhThu"));
        // Σ chi nhánh = KPI = Σ sản phẩm = Σ danh mục = Σ trend
        long branches = list(s, "branches").stream().mapToLong(b -> num(b, "doanhThu")).sum();
        long products = list(s, "products").stream().mapToLong(p -> num(p, "doanhThu")).sum();
        long categories = list(s, "categories").stream().mapToLong(p -> num(p, "doanhThu")).sum();
        long trend = list(s, "trend").stream().mapToLong(p -> num(p, "doanhThu")).sum();
        assertEquals(1200, branches);
        assertEquals(1200, products);
        assertEquals(1200, categories);
        assertEquals(1200, trend);
        // giá vốn làm tròn tới đồng nên lợi nhuận cũng cộng khớp giữa các khối
        long profit = num(kpi, "loiNhuan");
        assertEquals(profit, list(s, "branches").stream().mapToLong(b -> num(b, "loiNhuan")).sum());
        assertEquals(profit, list(s, "products").stream().mapToLong(p -> num(p, "loiNhuan")).sum());
        assertEquals(profit, list(s, "trend").stream().mapToLong(p -> num(p, "loiNhuan")).sum());
        assertEquals(List.of("CN01", "CN02", "CN03"), list(s, "branches").stream().map(b -> b.get("maCn")).toList());
        assertEquals("day", s.get("granularity"));
        assertEquals(30, list(s, "trend").size());
        assertEquals(List.of("SP03"), list(s, "khongBan").stream().map(p -> p.get("maSp")).toList());
        assertEquals(7, num(list(s, "khongBan").get(0), "tonTong"));
        assertEquals(List.of("A", "B"), list(s, "products").stream().map(p -> p.get("abc")).toList());
    }

    @Test
    void grossProfitUsesWeightedAverageCostWithFallback() throws Exception {
        var s = stats.summary(from, to, "");
        var bySp = list(s, "products").stream().collect(java.util.stream.Collectors.toMap(p -> p.get("maSp"), p -> p));
        assertEquals(4 * (250 - 175), num(bySp.get("SP01"), "loiNhuan"));   // giá vốn 175
        assertEquals(2 * (100 - 80), num(bySp.get("SP02"), "loiNhuan"));    // chưa nhập: gia_nhap
        var kpi = map(s, "kpi");
        assertEquals(340, num(kpi, "loiNhuan"));
        assertEquals(340.0 / 1200, (Double) kpi.get("bienLoiNhuan"), 1e-9);
    }

    @Test
    void sellOutUsesStoredPriceAndCountsEstimatedRows() throws Exception {
        var kpi = map(stats.summary(from, to, ""), "kpi");
        assertEquals(6, num(kpi, "sellOutSoLuong"));
        assertEquals(2 * 300 + 4 * 320, num(kpi, "sellOutDoanhThu"));
        assertEquals(1, num(kpi, "sellOutUocTinh"));
        // từng chi nhánh: CN01 bán 6 cái, SIM01 (50 cái) không tính; Σ chi nhánh = KPI
        var s = stats.summary(from, to, "");
        var cn01 = branch(s, "CN01");
        assertEquals(6, num(cn01, "sellOutSoLuong"));
        assertEquals(2 * 300 + 4 * 320, num(cn01, "sellOutDoanhThu"));
        assertEquals(0, num(cn01, "sellOutTruoc"));
        assertEquals(0, num(branch(s, "CN02"), "sellOutDoanhThu"));
        assertEquals(num(kpi, "sellOutDoanhThu"),
                list(s, "branches").stream().mapToLong(b -> num(b, "sellOutDoanhThu")).sum());
        // bán ở kỳ trước rơi vào sellOutTruoc
        db.read(c -> Db.update(c, "INSERT INTO ban_hang (ma_cn, ma_sp, so_luong, don_gia, thoi_gian) VALUES ('CN01','SP01',1,310,?)",
                Timestamp.valueOf(today.minusDays(40).atTime(12, 0))));
        assertEquals(310, num(branch(stats.summary(from, to, ""), "CN01"), "sellOutTruoc"));
    }

    @Test
    void saleAndCheckoutStorePrice() throws Exception {
        Events events = new Events();
        new StockService(db, events).sale("CN01", "SP01", 1);
        assertEquals(320, (long) db.read(c -> Db.one(c,
                "SELECT don_gia FROM ban_hang WHERE ma_cn='CN01' ORDER BY id DESC LIMIT 1", r -> r.getLong(1))));
        var checkout = new CheckoutService(db, events);
        String id = "HD" + UUID.randomUUID().toString().replace("-", "");
        var body = Http.GSON.fromJson("""
                {"id":"%s","customer":"Khach","items":[{"maHang":"SP01","soLuong":2}]}""".formatted(id),
                com.google.gson.JsonObject.class);
        checkout.execute("CN01", "CREATE", body);
        db.read(c -> Db.update(c, "UPDATE san_pham SET gia_ban_le = 999 WHERE ma_sp = 'SP01'"));
        checkout.execute("CN01", "CONFIRM", body);
        var last = db.read(c -> Db.one(c,
                "SELECT so_luong, don_gia FROM ban_hang WHERE ma_cn='CN01' ORDER BY id DESC LIMIT 1", Db::toMap));
        assertEquals(2, ((Number) last.get("soLuong")).intValue());
        assertEquals(320, ((Number) last.get("donGia")).longValue());   // giá đã báo, trước VAT
    }

    @Test
    void branchMetrics() throws Exception {
        var s = stats.summary(from, to, "");
        var cn01 = branch(s, "CN01");
        assertEquals(1000, num(cn01, "doanhThu"));
        assertEquals(250, num(cn01, "doanhThuTruoc"));
        assertEquals(0.25, (Double) cn01.get("sellThrough"), 1e-9);         // 6 / (6 + 18)
        assertEquals(90.0, (Double) cn01.get("ngayTon"), 1e-9);             // 18 / (6 / 30)
        assertEquals(1.0, (Double) cn01.get("dapUng"), 1e-9);               // YC1, YC3 đã giao; YC6 còn CHO
        assertEquals(5.0 / 9, (Double) cn01.get("traHang"), 1e-9);          // 5 trả / 9 đã xuất
        assertEquals(0, num(cn01, "ngayTuLanNhapCuoi"));
        assertEquals(false, cn01.get("ngungNhap"));
        assertEquals(1000, num(cn01, "congNo"));
        assertEquals(200_000_000, num(cn01, "hanMuc"));

        var cn02 = branch(s, "CN02");
        assertEquals(2.0 / 3, (Double) cn02.get("dapUng"), 1e-9);           // YC2 xuất, YC5 điều chuyển, YC7 thiếu
        assertNull(cn02.get("sellThrough"));                                // không bán, không tồn
        assertNull(cn02.get("ngayTon"));
        assertEquals(0.0, (Double) cn02.get("traHang"), 1e-9);

        var cn03 = branch(s, "CN03");
        assertEquals(0, num(cn03, "doanhThu"));
        assertEquals(40, num(cn03, "ngayTuLanNhapCuoi"));
        assertEquals(true, cn03.get("ngungNhap"));
        assertNull(cn03.get("dapUng"));
        assertNull(cn03.get("traHang"));
        assertNull(cn03.get("chiTieu"));

        var only = stats.summary(from, to, "CN01");
        assertEquals("CN01", only.get("maCn"));
        assertEquals(1, list(only, "branches").size());
        assertEquals(1000, num(map(only, "kpi"), "doanhThu"));
        assertEquals(1000, list(only, "products").stream().mapToLong(p -> num(p, "doanhThu")).sum());
        // SP02 của CN01 chỉ có phiếu bị trả nên tính là không bán; tồn lấy theo kho chi nhánh
        assertEquals(List.of("SP02", "SP03"), list(only, "khongBan").stream().map(p -> p.get("maSp")).toList());
        assertEquals(0, num(list(only, "khongBan").get(0), "tonTong"));

        assertEquals(404, assertThrows(ServiceException.class, () -> stats.summary(from, to, "SIM01")).status());
        assertEquals(404, assertThrows(ServiceException.class, () -> stats.summary(from, to, "CN99")).status());
        assertEquals(400, assertThrows(Http.ApiException.class,
                () -> stats.summary(today.minusDays(400).toString(), to, "")).status());
    }

    @Test
    void emptyPeriodReturnsZeroKpiAndFullTrend() throws Exception {
        String f = today.minusDays(200).toString(), t = today.minusDays(170).toString();
        var s = stats.summary(f, t, "");
        var kpi = map(s, "kpi");
        assertEquals(0, num(kpi, "doanhThu"));
        assertEquals(0, num(kpi, "tbPhieu"));
        assertNull(kpi.get("bienLoiNhuan"));
        assertEquals(31, list(s, "trend").size());
        assertTrue(list(s, "products").isEmpty());
        assertEquals(3, list(s, "khongBan").size());
    }

    @Test
    void targetUpsertDeleteAndCompletion() throws Exception {
        YearMonth month = YearMonth.from(today);
        stats.setTarget("CN01", month, 2000, "admin", "127.0.0.1");
        var cn01 = branch(stats.summary(from, to, ""), "CN01");
        assertEquals(2000, num(cn01, "chiTieu"));
        assertEquals(1000, num(cn01, "doanhThuThang"));
        assertEquals(0.5, (Double) cn01.get("hoanThanh"), 1e-9);
        assertEquals(BusinessStatsService.projection(1000, today.getDayOfMonth(), month.lengthOfMonth()),
                num(cn01, "duKien"));

        stats.setTarget("CN01", month, 4000, "admin", "127.0.0.1");
        assertEquals(0.25, (Double) branch(stats.summary(from, to, ""), "CN01").get("hoanThanh"), 1e-9);

        stats.setTarget("CN01", month, 0, "admin", "127.0.0.1");
        cn01 = branch(stats.summary(from, to, ""), "CN01");
        assertNull(cn01.get("chiTieu"));
        assertNull(cn01.get("hoanThanh"));
        assertEquals(0, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM muc_tieu_doanh_so", r -> r.getInt(1))));

        assertEquals(404, assertThrows(ServiceException.class,
                () -> stats.setTarget("SIM01", month, 10, "admin", "127.0.0.1")).status());
        assertEquals(404, assertThrows(ServiceException.class,
                () -> stats.setTarget("CN99", month, 10, "admin", "127.0.0.1")).status());
        assertEquals(400, assertThrows(Http.ApiException.class,
                () -> stats.setTarget("CN01", month, -1, "admin", "127.0.0.1")).status());
        assertEquals(400, assertThrows(Http.ApiException.class,
                () -> stats.setTarget("CN01", month, BusinessStatsService.MAX_TARGET + 1, "admin", "127.0.0.1")).status());
        // đúng cận trên vẫn lưu được (vừa NUMERIC(15,0)), rồi xoá lại
        stats.setTarget("CN02", month, BusinessStatsService.MAX_TARGET, "admin", "127.0.0.1");
        assertEquals(BusinessStatsService.MAX_TARGET, num(branch(stats.summary(from, to, ""), "CN02"), "chiTieu"));
        stats.setTarget("CN02", month, 0, "admin", "127.0.0.1");

        // kỳ kết thúc trước hôm nay: % hoàn thành cắt ở `to`, dự kiến vẫn dùng doanh thu cả tháng tới hôm nay
        if (today.getDayOfMonth() > 1) {
            stats.setTarget("CN01", month, 2000, "admin", "127.0.0.1");
            var early = branch(stats.summary(month.atDay(1).toString(), today.minusDays(1).toString(), ""), "CN01");
            assertEquals(0, num(early, "doanhThuThang"));
            assertEquals(0.0, (Double) early.get("hoanThanh"), 1e-9);
            assertEquals(BusinessStatsService.projection(1000, today.getDayOfMonth(), month.lengthOfMonth()),
                    num(early, "duKien"));
            stats.setTarget("CN01", month, 0, "admin", "127.0.0.1");
        }
        // tháng đã qua: dự kiến = doanh thu thực của cả tháng (YC8, YC9 ở 40 ngày trước)
        LocalDate old = today.minusDays(40);
        var past = stats.summary(YearMonth.from(old).atDay(1).toString(), YearMonth.from(old).atDay(1).toString(), "");
        assertEquals(250, num(branch(past, "CN01"), "duKien"));

        audit.close();   // đẩy hết hàng đợi audit xuống CSDL
        audit = null;
        assertEquals(today.getDayOfMonth() > 1 ? 5 : 3, (int) db.read(c -> Db.one(c,
                "SELECT count(*) FROM audit_log WHERE hanh_dong = 'SET_TARGET' AND chi_tiet LIKE 'maCn=CN01;%'",
                r -> r.getInt(1))));
    }

    @Test
    void schemaEnsureIsRepeatable() throws Exception {
        db.tx(c -> {
            Db.update(c, "DROP TABLE muc_tieu_doanh_so");
            Db.update(c, "DROP INDEX idx_phieu_xuat_thoi_gian");
            Db.update(c, "DROP INDEX idx_ban_hang_thoi_gian");
            Db.update(c, "ALTER TABLE ban_hang DROP COLUMN don_gia");
            return null;
        });
        BusinessSchema.ensure(db);
        BusinessSchema.ensure(db);
        assertEquals(3, (int) db.read(c -> Db.one(c, "SELECT count(*) FROM ban_hang WHERE don_gia IS NULL", r -> r.getInt(1))));
        assertEquals(6, num(map(stats.summary(from, to, ""), "kpi"), "sellOutSoLuong"));
        stats.setTarget("CN02", YearMonth.from(today), 500, "admin", "127.0.0.1");
    }
}
