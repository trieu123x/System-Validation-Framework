package phanphoi.server.service;

import phanphoi.common.ErrorCode;
import phanphoi.common.web.Http;
import phanphoi.server.AuditLog;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Thống kê kinh doanh cho admin (docs/specs/2026-11-11-thong-ke-kinh-doanh.md): sell-in, lợi nhuận gộp,
 * sell-out, ABC, chỉ số từng chi nhánh và chỉ tiêu tháng. Chỉ đọc; mỗi khối là một truy vấn gộp,
 * chi nhánh giả lập bị loại bằng JOIN nên dữ liệu SIM không lên Java.
 */
public final class BusinessStatsService {

    /** Kỳ dài nhất được thống kê (ngày, tính cả hai đầu). */
    static final int MAX_DAYS = 366;
    /** Giới hạn của cột NUMERIC(15,0). */
    static final long MAX_TARGET = 999_999_999_999_999L;

    private final Db db;
    private final Events events;
    private final AuditLog audit;
    private final int inactiveDays;

    public BusinessStatsService(Db db, Events events, AuditLog audit, int inactiveDays) {
        this.db = db;
        this.events = events;
        this.audit = audit;
        this.inactiveDays = inactiveDays;
    }

    // ================= hàm thuần (kiểm thử không cần CSDL) =================

    public record Range(LocalDate from, LocalDate to) {
        long days() {
            return ChronoUnit.DAYS.between(from, to) + 1;
        }
    }

    /** Kiểm tra from/to dạng yyyy-MM-dd; sai thì 400 với thông báo tiếng Việt. */
    static Range parseRange(String from, String to, LocalDate today) {
        LocalDate f = parseDay(from, "from");
        LocalDate t = parseDay(to, "to");
        if (f.isAfter(t)) {
            throw new Http.ApiException(400, "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc");
        }
        Range r = new Range(f, t);
        if (r.days() > MAX_DAYS) {
            throw new Http.ApiException(400, "Kỳ thống kê tối đa " + MAX_DAYS + " ngày");
        }
        if (t.isAfter(today.plusDays(1))) {
            throw new Http.ApiException(400, "Ngày kết thúc không được ở tương lai");
        }
        return r;
    }

    private static LocalDate parseDay(String s, String name) {
        if (s == null || s.isBlank()) {
            throw new Http.ApiException(400, "Thiếu tham số '" + name + "' (yyyy-MM-dd)");
        }
        try {
            return LocalDate.parse(s.trim());
        } catch (DateTimeParseException e) {
            throw new Http.ApiException(400, "Tham số '" + name + "' phải có dạng yyyy-MM-dd");
        }
    }

    /** Kỳ liền trước có cùng số ngày. */
    static Range previous(Range r) {
        LocalDate prevTo = r.from().minusDays(1);
        return new Range(prevTo.minusDays(r.days() - 1), prevTo);
    }

    /** ≤ 62 ngày theo ngày; dài hơn mà trong một năm theo tuần; vắt qua nhiều năm theo tháng. */
    static String granularity(Range r) {
        if (r.days() <= 62) {
            return "day";
        }
        return r.from().getYear() == r.to().getYear() ? "week" : "month";
    }

    /**
     * Nhóm ABC cho doanh thu đã sắp giảm dần (đều &gt; 0): tỉ lệ cộng dồn của các mặt hàng đứng trước
     * &lt; 80% → A, &lt; 95% → B, còn lại C. Ví dụ [50, 30, 10, 6, 4] → A, A, B, B, C.
     */
    static List<String> abc(List<Long> revenueDesc) {
        long total = 0;
        for (long v : revenueDesc) {
            total += v;
        }
        List<String> out = new ArrayList<>(revenueDesc.size());
        long before = 0;
        for (long v : revenueDesc) {
            // so sánh số nguyên: before/total < 0.80 ⇔ 20·before < 16·total
            out.add(20 * before < 16 * total ? "A" : 20 * before < 19 * total ? "B" : "C");
            before += v;
        }
        return out;
    }

    /** Dự kiến cuối tháng theo tốc độ bình quân/ngày: doanh thu tới nay / số ngày đã qua × số ngày của tháng. */
    static long projection(long soFar, int daysElapsed, int daysInMonth) {
        if (daysElapsed <= 0) {
            return 0;
        }
        return Math.round((double) soFar * daysInMonth / daysElapsed);
    }

    static Double ratio(double num, double den) {
        return den == 0 ? null : num / den;
    }

    // ================= SQL dùng chung =================

    /** Chi nhánh thật (lọc theo maCn nếu có). Tham số: maCn, maCn. */
    private static final String REAL = """
            cn_that AS (SELECT ma_cn FROM chi_nhanh WHERE NOT gia_lap AND (? = '' OR ma_cn = ?))""";

    /**
     * Giá vốn đơn vị: bình quân gia quyền mọi phiếu nhập, chưa nhập thì san_pham.gia_nhap. Làm tròn tới đồng để lợi nhuận
     * từng dòng là số nguyên, tổng theo chi nhánh/sản phẩm/mốc luôn khớp KPI.
     */
    private static final String COST = """
            gv AS (SELECT sp.ma_sp, round(COALESCE(pn.gia_von, sp.gia_nhap)) AS gia_von
                   FROM san_pham sp
                   LEFT JOIN (SELECT ma_sp, sum(so_luong * don_gia) / sum(so_luong) AS gia_von
                              FROM phieu_nhap GROUP BY ma_sp) pn ON pn.ma_sp = sp.ma_sp)""";

    /** Dòng sell-in trong [?, ?): phiếu xuất của chi nhánh thật, không tính YC bị trả (TU_CHOI). */
    private static final String SELL_IN = """
            SELECT px.ma_cn, px.ma_sp, px.so_luong, px.don_gia, px.thoi_gian, gv.gia_von
            FROM phieu_xuat px
            JOIN cn_that r ON r.ma_cn = px.ma_cn
            JOIN yeu_cau y ON y.ma_yc = px.ma_yc AND y.trang_thai <> 'TU_CHOI'
            JOIN gv ON gv.ma_sp = px.ma_sp
            WHERE px.thoi_gian >= ? AND px.thoi_gian < ?""";

    /** Dòng sell-out trong [?, ?): giá lưu lúc bán, dữ liệu cũ (NULL) ước tính theo giá bán lẻ hiện tại. */
    private static final String SELL_OUT = """
            SELECT b.ma_cn, b.so_luong, b.so_luong * COALESCE(b.don_gia, sp.gia_ban_le) AS thanh_tien,
                   b.don_gia IS NULL AS uoc_tinh, b.thoi_gian
            FROM ban_hang b
            JOIN cn_that r ON r.ma_cn = b.ma_cn
            JOIN san_pham sp ON sp.ma_sp = b.ma_sp
            WHERE b.thoi_gian >= ? AND b.thoi_gian < ?""";

    private static Timestamp start(LocalDate d) {
        return Timestamp.valueOf(d.atStartOfDay());
    }

    private static Timestamp end(LocalDate d) {
        return Timestamp.valueOf(d.plusDays(1).atStartOfDay());
    }

    // ================= truy vấn =================

    /** Toàn công ty (maCn rỗng) hoặc một chi nhánh thật. */
    public Map<String, Object> summary(String fromStr, String toStr, String maCn) throws SQLException {
        LocalDate today = LocalDate.now();
        Range range = parseRange(fromStr, toStr, today);
        Range prev = previous(range);
        String cn = maCn == null ? "" : maCn.trim();
        if (!cn.isEmpty() && !cn.matches("[A-Za-z0-9_-]{1,10}")) {
            throw new Http.ApiException(400, "Mã chi nhánh không hợp lệ");
        }
        String unit = granularity(range);
        return db.read(c -> {
            if (!cn.isEmpty() && Db.one(c, "SELECT 1 FROM chi_nhanh WHERE ma_cn = ? AND NOT gia_lap", rs -> 1, cn) == null) {
                throw new ServiceException(ErrorCode.E04, "Không tìm thấy chi nhánh " + cn);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("from", range.from().toString());
            out.put("to", range.to().toString());
            out.put("prevFrom", prev.from().toString());
            out.put("prevTo", prev.to().toString());
            out.put("granularity", unit);
            out.put("maCn", cn.isEmpty() ? null : cn);
            out.put("kpi", kpi(c, range, cn));
            out.put("prevKpi", kpi(c, prev, cn));
            out.put("trend", trend(c, range, cn, unit));
            products(c, range, cn, out);
            out.put("branches", branches(c, range, prev, cn, today));
            return out;
        });
    }

    private static Map<String, Object> kpi(Connection c, Range r, String cn) throws SQLException {
        return Db.one(c, "WITH " + REAL + ", " + COST + ", si AS (" + SELL_IN + "), so AS (" + SELL_OUT + ")" + """
                SELECT (SELECT COALESCE(sum(so_luong * don_gia), 0) FROM si) AS doanh_thu,
                       (SELECT COALESCE(round(sum(so_luong * (don_gia - gia_von))), 0) FROM si) AS loi_nhuan,
                       (SELECT count(*) FROM si) AS so_phieu,
                       (SELECT COALESCE(sum(so_luong), 0) FROM so) AS so_sl,
                       (SELECT COALESCE(sum(thanh_tien), 0) FROM so) AS so_dt,
                       (SELECT count(*) FROM so WHERE uoc_tinh) AS uoc_tinh""", rs -> {
            long doanhThu = rs.getLong("doanh_thu");
            long loiNhuan = rs.getLong("loi_nhuan");
            long soPhieu = rs.getLong("so_phieu");
            Map<String, Object> k = new LinkedHashMap<>();
            k.put("doanhThu", doanhThu);
            k.put("loiNhuan", loiNhuan);
            k.put("bienLoiNhuan", ratio(loiNhuan, doanhThu));
            k.put("soPhieu", soPhieu);
            k.put("tbPhieu", soPhieu == 0 ? 0 : Math.round((double) doanhThu / soPhieu));
            k.put("sellOutSoLuong", rs.getLong("so_sl"));
            k.put("sellOutDoanhThu", rs.getLong("so_dt"));
            k.put("sellOutUocTinh", rs.getLong("uoc_tinh"));
            return k;
        }, cn, cn, start(r.from()), end(r.to()), start(r.from()), end(r.to()));
    }

    /** Đủ mọi mốc (kể cả mốc 0) nhờ generate_series. */
    private static List<Map<String, Object>> trend(Connection c, Range r, String cn, String unit) throws SQLException {
        return Db.list(c, "WITH " + REAL + ", " + COST + ", si AS (" + SELL_IN + "), so AS (" + SELL_OUT + ")" + """
                , b AS (SELECT generate_series(date_trunc(?, CAST(? AS timestamp)), CAST(? AS timestamp),
                                               CAST(? AS interval)) AS moc),
                a AS (SELECT date_trunc(?, thoi_gian) AS moc, sum(so_luong * don_gia) AS dt,
                             sum(so_luong * (don_gia - gia_von)) AS ln FROM si GROUP BY 1),
                o AS (SELECT date_trunc(?, thoi_gian) AS moc, sum(thanh_tien) AS dt FROM so GROUP BY 1)
                SELECT b.moc, COALESCE(a.dt, 0) AS dt, COALESCE(round(a.ln), 0) AS ln, COALESCE(o.dt, 0) AS so_dt
                FROM b LEFT JOIN a ON a.moc = b.moc LEFT JOIN o ON o.moc = b.moc
                ORDER BY b.moc""", rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("moc", rs.getTimestamp("moc").toLocalDateTime().toLocalDate().toString());
            m.put("doanhThu", rs.getLong("dt"));
            m.put("loiNhuan", rs.getLong("ln"));
            m.put("sellOutDoanhThu", rs.getLong("so_dt"));
            return m;
        }, cn, cn, start(r.from()), end(r.to()), start(r.from()), end(r.to()),
                unit, start(r.from()), start(r.to()), "1 " + unit, unit, unit);
    }

    /** Ghi products, khongBan, categories vào out. Danh mục cộng từ dòng sản phẩm nên tổng luôn khớp. */
    private static void products(Connection c, Range r, String cn, Map<String, Object> out) throws SQLException {
        List<Map<String, Object>> rows = Db.list(c, "WITH " + REAL + ", " + COST + ", si AS (" + SELL_IN + ")" + """
                SELECT sp.ma_sp, sp.ten, sp.ma_dm, dm.ten AS ten_dm,
                       COALESCE(sum(si.so_luong), 0) AS so_luong,
                       COALESCE(sum(si.so_luong * si.don_gia), 0) AS doanh_thu,
                       COALESCE(round(sum(si.so_luong * (si.don_gia - si.gia_von))), 0) AS loi_nhuan,
                       CASE WHEN ? = '' THEN COALESCE((SELECT kt.so_luong FROM kho_tong kt WHERE kt.ma_sp = sp.ma_sp), 0)
                            ELSE COALESCE((SELECT k.so_luong FROM kho_chi_nhanh k
                                           WHERE k.ma_cn = ? AND k.ma_sp = sp.ma_sp), 0) END AS ton
                FROM san_pham sp
                JOIN danh_muc dm ON dm.ma_dm = sp.ma_dm
                LEFT JOIN si ON si.ma_sp = sp.ma_sp
                GROUP BY sp.ma_sp, sp.ten, sp.ma_dm, dm.ten
                ORDER BY doanh_thu DESC, sp.ma_sp""", rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("maSp", rs.getString("ma_sp"));
            m.put("ten", rs.getString("ten"));
            m.put("maDm", rs.getString("ma_dm"));
            m.put("tenDm", rs.getString("ten_dm"));
            m.put("soLuong", rs.getLong("so_luong"));
            m.put("doanhThu", rs.getLong("doanh_thu"));
            m.put("loiNhuan", rs.getLong("loi_nhuan"));
            m.put("tonTong", rs.getLong("ton"));
            return m;
        }, cn, cn, start(r.from()), end(r.to()), cn, cn);

        List<Map<String, Object>> sold = new ArrayList<>();
        List<Map<String, Object>> notSold = new ArrayList<>();
        Map<String, Map<String, Object>> categories = new LinkedHashMap<>();
        long total = 0;
        for (Map<String, Object> m : rows) {
            long dt = (Long) m.get("doanhThu");
            Map<String, Object> cat = categories.computeIfAbsent((String) m.get("maDm"), k -> {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("maDm", k);
                x.put("ten", m.get("tenDm"));
                x.put("doanhThu", 0L);
                x.put("loiNhuan", 0L);
                return x;
            });
            cat.put("doanhThu", (Long) cat.get("doanhThu") + dt);
            cat.put("loiNhuan", (Long) cat.get("loiNhuan") + (Long) m.get("loiNhuan"));
            if (dt > 0) {
                sold.add(m);
                total += dt;
            } else {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("maSp", m.get("maSp"));
                x.put("ten", m.get("ten"));
                x.put("tonTong", m.get("tonTong"));
                notSold.add(x);
            }
        }
        List<String> groups = abc(sold.stream().map(m -> (Long) m.get("doanhThu")).toList());
        for (int i = 0; i < sold.size(); i++) {
            Map<String, Object> m = sold.get(i);
            m.remove("tenDm");
            m.remove("tonTong");
            m.put("tyTrong", ratio((Long) m.get("doanhThu"), total));
            m.put("abc", groups.get(i));
        }
        List<Map<String, Object>> cats = new ArrayList<>(categories.values());
        cats.sort((a, b) -> Long.compare((Long) b.get("doanhThu"), (Long) a.get("doanhThu")));
        out.put("products", sold);
        out.put("khongBan", notSold);
        out.put("categories", cats);
    }

    private List<Map<String, Object>> branches(Connection c, Range r, Range prev, String cn, LocalDate today)
            throws SQLException {
        long days = r.days();
        YearMonth month = YearMonth.from(r.to());
        LocalDate monthStart = month.atDay(1);
        LocalDate mtdLast = r.to().isAfter(today) ? today : r.to();
        // tháng chưa bắt đầu: khoảng rỗng [monthStart, monthStart)
        Timestamp mtdEnd = mtdLast.isBefore(monthStart) ? start(monthStart) : end(mtdLast);
        // dự kiến dùng doanh thu cả tháng tới hôm nay (tháng hiện tại) hoặc cả tháng (tháng đã qua), không cắt ở `to`
        LocalDate fullLast = month.atEndOfMonth().isAfter(today) ? today : month.atEndOfMonth();
        Timestamp fullEnd = fullLast.isBefore(monthStart) ? start(monthStart) : end(fullLast);
        YearMonth current = YearMonth.from(today);
        List<Map<String, Object>> rows = Db.list(c, "WITH " + REAL + ", " + COST
                + ", cur AS (SELECT ma_cn, sum(so_luong * don_gia) AS dt, sum(so_luong * (don_gia - gia_von)) AS ln FROM ("
                + SELL_IN + ") s GROUP BY ma_cn)"
                + ", prev AS (SELECT ma_cn, sum(so_luong * don_gia) AS dt FROM (" + SELL_IN + ") s GROUP BY ma_cn)"
                + ", mtd AS (SELECT ma_cn, sum(so_luong * don_gia) AS dt FROM (" + SELL_IN + ") s GROUP BY ma_cn)"
                + ", full_month AS (SELECT ma_cn, sum(so_luong * don_gia) AS dt FROM (" + SELL_IN + ") s GROUP BY ma_cn)"
                // sell-out của chi nhánh: cùng nguồn với KPI nên Σ chi nhánh = kpi.sellOutDoanhThu
                + ", ban AS (SELECT ma_cn, sum(so_luong) AS sl, sum(thanh_tien) AS dt FROM (" + SELL_OUT + ") s GROUP BY ma_cn)"
                + ", ban_truoc AS (SELECT ma_cn, sum(thanh_tien) AS dt FROM (" + SELL_OUT + ") s GROUP BY ma_cn)" + """
                ,
                ton AS (SELECT k.ma_cn, sum(k.so_luong) AS sl FROM kho_chi_nhanh k JOIN cn_that r ON r.ma_cn = k.ma_cn
                        GROUP BY k.ma_cn),
                xuat AS (SELECT px.ma_cn, sum(px.so_luong) FILTER (WHERE y.trang_thai = 'TU_CHOI') AS tra,
                                sum(px.so_luong) AS tong
                         FROM phieu_xuat px JOIN cn_that r ON r.ma_cn = px.ma_cn JOIN yeu_cau y ON y.ma_yc = px.ma_yc
                         WHERE px.thoi_gian >= ? AND px.thoi_gian < ? GROUP BY px.ma_cn),
                dap AS (SELECT y.ma_cn,
                               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM phieu_xuat px WHERE px.ma_yc = y.ma_yc)
                                   OR EXISTS (SELECT 1 FROM dieu_chuyen d WHERE d.ma_yc = y.ma_yc
                                              AND d.trang_thai = 'HOAN_TAT')) AS giao,
                               count(*) AS tong
                        FROM yeu_cau y JOIN cn_that r ON r.ma_cn = y.ma_cn
                        WHERE y.tao_luc >= ? AND y.tao_luc < ? AND y.trang_thai <> 'CHO' GROUP BY y.ma_cn),
                cuoi AS (SELECT px.ma_cn, max(px.thoi_gian) AS t
                         FROM phieu_xuat px JOIN cn_that r ON r.ma_cn = px.ma_cn
                         JOIN yeu_cau y ON y.ma_yc = px.ma_yc AND y.trang_thai <> 'TU_CHOI'
                         GROUP BY px.ma_cn)
                SELECT cn.ma_cn, cn.ten, COALESCE(cur.dt, 0) AS doanh_thu, COALESCE(prev.dt, 0) AS doanh_thu_truoc,
                       COALESCE(round(cur.ln), 0) AS loi_nhuan, COALESCE(mtd.dt, 0) AS mtd, COALESCE(full_month.dt, 0) AS ca_thang,
                       mt.so_tien AS chi_tieu,
                       COALESCE(ban.sl, 0) AS ban, COALESCE(ban.dt, 0) AS ban_dt, COALESCE(ban_truoc.dt, 0) AS ban_dt_truoc,
                       COALESCE(ton.sl, 0) AS ton,
                       COALESCE(xuat.tra, 0) AS tra, COALESCE(xuat.tong, 0) AS xuat,
                       COALESCE(dap.giao, 0) AS giao, COALESCE(dap.tong, 0) AS xu_ly, cuoi.t AS nhap_cuoi,
                       """ + StockService.DEBT_SQL + """
                 AS cong_no, cn.han_muc_no AS han_muc
                FROM chi_nhanh cn
                JOIN cn_that r ON r.ma_cn = cn.ma_cn
                LEFT JOIN cur ON cur.ma_cn = cn.ma_cn
                LEFT JOIN prev ON prev.ma_cn = cn.ma_cn
                LEFT JOIN mtd ON mtd.ma_cn = cn.ma_cn
                LEFT JOIN full_month ON full_month.ma_cn = cn.ma_cn
                LEFT JOIN ban ON ban.ma_cn = cn.ma_cn
                LEFT JOIN ban_truoc ON ban_truoc.ma_cn = cn.ma_cn
                LEFT JOIN ton ON ton.ma_cn = cn.ma_cn
                LEFT JOIN xuat ON xuat.ma_cn = cn.ma_cn
                LEFT JOIN dap ON dap.ma_cn = cn.ma_cn
                LEFT JOIN cuoi ON cuoi.ma_cn = cn.ma_cn
                LEFT JOIN muc_tieu_doanh_so mt ON mt.ma_cn = cn.ma_cn AND mt.thang = ?
                ORDER BY doanh_thu DESC, cn.ma_cn""", rs -> {
            long ban = rs.getLong("ban");
            long ton = rs.getLong("ton");
            long mtd = rs.getLong("mtd");
            long caThang = rs.getLong("ca_thang");
            Long chiTieu = rs.getObject("chi_tieu") == null ? null : rs.getLong("chi_tieu");
            Timestamp nhapCuoi = rs.getTimestamp("nhap_cuoi");
            Long ngayTuLanNhapCuoi = nhapCuoi == null ? null
                    : Math.max(0, ChronoUnit.DAYS.between(nhapCuoi.toLocalDateTime().toLocalDate(), today));
            Long duKien = month.equals(current) ? projection(caThang, today.getDayOfMonth(), month.lengthOfMonth())
                    : month.isBefore(current) ? caThang : null;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("maCn", rs.getString("ma_cn"));
            m.put("ten", rs.getString("ten"));
            m.put("doanhThu", rs.getLong("doanh_thu"));
            m.put("doanhThuTruoc", rs.getLong("doanh_thu_truoc"));
            m.put("loiNhuan", rs.getLong("loi_nhuan"));
            m.put("thang", month.toString());
            m.put("doanhThuThang", mtd);
            m.put("chiTieu", chiTieu);
            m.put("hoanThanh", chiTieu == null ? null : ratio(mtd, chiTieu));
            m.put("duKien", duKien);
            m.put("sellOutSoLuong", ban);
            m.put("sellOutDoanhThu", rs.getLong("ban_dt"));
            m.put("sellOutTruoc", rs.getLong("ban_dt_truoc"));
            m.put("sellThrough", ratio(ban, ban + ton));
            m.put("ngayTon", ban == 0 ? null : ton / ((double) ban / days));
            m.put("congNo", rs.getLong("cong_no"));
            m.put("hanMuc", rs.getLong("han_muc"));
            m.put("dapUng", ratio(rs.getLong("giao"), rs.getLong("xu_ly")));
            m.put("traHang", ratio(rs.getLong("tra"), rs.getLong("xuat")));
            m.put("ngayTuLanNhapCuoi", ngayTuLanNhapCuoi);
            m.put("ngungNhap", ngayTuLanNhapCuoi != null && ngayTuLanNhapCuoi > inactiveDays);
            return m;
        }, cn, cn,
                start(r.from()), end(r.to()),
                start(prev.from()), end(prev.to()),
                start(monthStart), mtdEnd,
                start(monthStart), fullEnd,
                start(r.from()), end(r.to()),
                start(prev.from()), end(prev.to()),
                start(r.from()), end(r.to()),
                start(r.from()), end(r.to()),
                monthStart);
        return rows;
    }

    // ================= chỉ tiêu =================

    /** Đặt chỉ tiêu tháng cho chi nhánh thật; soTien = 0 thì xoá. Ghi sau thắng (upsert), mỗi lần ghi đều vào audit. */
    public void setTarget(String maCn, YearMonth thang, long soTien, String actor, String ip) throws SQLException {
        if (soTien < 0 || soTien > MAX_TARGET) {
            throw new Http.ApiException(400, "Chỉ tiêu phải là số nguyên đồng từ 0 đến " + MAX_TARGET);
        }
        if (maCn == null || !maCn.matches("[A-Za-z0-9_-]{1,10}")) {
            throw new Http.ApiException(400, "Mã chi nhánh không hợp lệ");
        }
        LocalDate month = thang.atDay(1);
        db.tx(c -> {
            if (Db.one(c, "SELECT 1 FROM chi_nhanh WHERE ma_cn = ? AND NOT gia_lap", rs -> 1, maCn) == null) {
                throw new ServiceException(ErrorCode.E04, "Không tìm thấy chi nhánh " + maCn);
            }
            if (soTien == 0) {
                return Db.update(c, "DELETE FROM muc_tieu_doanh_so WHERE ma_cn = ? AND thang = ?", maCn, month);
            }
            return Db.update(c, """
                    INSERT INTO muc_tieu_doanh_so (ma_cn, thang, so_tien) VALUES (?, ?, ?)
                    ON CONFLICT (ma_cn, thang) DO UPDATE SET so_tien = EXCLUDED.so_tien""", maCn, month, soTien);
        });
        audit.record("ADMIN", actor, "SET_TARGET", "maCn=" + maCn + "; thang=" + thang + "; soTien=" + soTien,
                "SUCCESS", ip);
        events.publish(Events.BUSINESS, Map.of("maCn", maCn, "thang", thang.toString()));
    }
}
