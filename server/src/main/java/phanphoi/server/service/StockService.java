package phanphoi.server.service;

import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.Message;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Kho tổng, kho chi nhánh, bán hàng, ngưỡng, lịch sử nhập (FR-07..FR-12, FR-24). */
public final class StockService {

    private final Db db;
    private final Events events;

    public StockService(Db db, Events events) {
        this.db = db;
        this.events = events;
    }

    // ================= phía chi nhánh =================

    /**
     * INVENTORY|maHang,tenHang,soLuong,nguong,model,danhMuc,giaXuat,giaBanLe,anh;... (FR-10).
     * Các trường sau trường 4 nối vào cuối nên client cũ chỉ đọc 4 trường đầu vẫn chạy.
     * anh là {@link #imageRef} của anh_url (rỗng nếu chưa có ảnh) để dòng tin không vượt 4096 byte.
     */
    public Message inventoryMessage(String maCn) throws SQLException {
        List<List<Object>> rows = db.read(c -> Db.list(c, """
                SELECT sp.ma_sp, sp.ten, COALESCE(k.so_luong, 0), COALESCE(k.nguong_toi_thieu, 0),
                       COALESCE(sp.model, ''), dm.ten, sp.gia_xuat, sp.gia_ban_le, sp.anh_url
                FROM san_pham sp
                JOIN danh_muc dm ON dm.ma_dm = sp.ma_dm
                LEFT JOIN kho_chi_nhanh k ON k.ma_sp = sp.ma_sp AND k.ma_cn = ?
                ORDER BY sp.ma_sp""",
                rs -> List.of(rs.getString(1), rs.getString(2), rs.getInt(3), rs.getInt(4),
                        rs.getString(5), rs.getString(6), rs.getLong(7), rs.getLong(8), imageRef(rs.getString(9))),
                maCn));
        return Lists.fit(Command.INVENTORY, rows);
    }

    /** Phải trùng CLOUDINARY_BASE trong ui/lib/images.ts (giao diện ghép tham chiếu rút gọn vào đây). */
    static final String CLOUDINARY_BASE = "https://res.cloudinary.com/dfnlbrk4w/image/upload/";

    /**
     * Rút gọn URL ảnh trên cloud của dự án thành phần sau {@code /image/upload/} (vd {@code v1761100000/toboki/TB01.webp}).
     * URL khác (kể cả cloud Cloudinary khác) giữ nguyên; null → rỗng. Giao diện ghép lại thành URL đầy đủ.
     */
    public static String imageRef(String url) {
        if (url == null) {
            return "";
        }
        return url.startsWith(CLOUDINARY_BASE) ? url.substring(CLOUDINARY_BASE.length()) : url;
    }

    /** FR-11: trừ kho CN, từ chối nếu bán vượt tồn. */
    public Message sale(String maCn, String maSp, int soLuong) throws SQLException {
        if (soLuong <= 0) {
            throw new ServiceException(ErrorCode.E05, "So luong ban phai > 0");
        }
        int con = db.tx(c -> {
            Integer left = Db.one(c, """
                    UPDATE kho_chi_nhanh SET so_luong = so_luong - ?
                    WHERE ma_cn = ? AND ma_sp = ? AND so_luong >= ?
                    RETURNING so_luong""", rs -> rs.getInt(1), soLuong, maCn, maSp, soLuong);
            if (left == null) {
                requireProduct(c, maSp);
                Integer have = Db.one(c, "SELECT so_luong FROM kho_chi_nhanh WHERE ma_cn = ? AND ma_sp = ?",
                        rs -> rs.getInt(1), maCn, maSp);
                throw new ServiceException(ErrorCode.E05,
                        "Ban vuot ton: " + maSp + " chi con " + (have == null ? 0 : have));
            }
            Db.update(c, "INSERT INTO ban_hang (ma_cn, ma_sp, so_luong) VALUES (?, ?, ?)", maCn, maSp, soLuong);
            return left;
        });
        events.publish(Events.STOCK, Map.of("maCn", maCn));
        return Message.of(Command.SALE_OK, maSp, con);
    }

    /** FR-12. */
    public void setThreshold(String maCn, String maSp, int nguong) throws SQLException {
        if (nguong < 0) {
            throw new ServiceException(ErrorCode.E05, "Nguong phai >= 0");
        }
        db.tx(c -> {
            requireProduct(c, maSp);
            return Db.update(c, """
                    INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu) VALUES (?, ?, 0, ?)
                    ON CONFLICT (ma_cn, ma_sp) DO UPDATE SET nguong_toi_thieu = EXCLUDED.nguong_toi_thieu""",
                    maCn, maSp, nguong);
        });
        events.publish(Events.STOCK, Map.of("maCn", maCn));
    }

    /**
     * FR-24: HISTORY|maYeuCau,maHang,tenHang,soLuong,thoiGian,nguon;... mới nhất trước.
     * nguon = KHO_TONG hoặc mã CN đã điều chuyển hàng sang.
     */
    public Message historyMessage(String maCn, String tu, String den) throws SQLException {
        LocalDateTime from = parseDate(tu, false);
        LocalDateTime to = parseDate(den, true);
        List<List<Object>> rows = db.read(c -> Db.list(c, """
                SELECT ma_yc, ma_sp, ten, so_luong, thoi_gian, nguon FROM (
                    SELECT px.ma_yc, px.ma_sp, sp.ten, px.so_luong, px.thoi_gian, 'KHO_TONG' AS nguon
                    FROM phieu_xuat px JOIN san_pham sp ON sp.ma_sp = px.ma_sp
                    WHERE px.ma_cn = ?
                    UNION ALL
                    SELECT dc.ma_yc, dc.ma_sp, sp.ten, dc.so_luong, dc.cap_nhat_luc, dc.tu_cn
                    FROM dieu_chuyen dc JOIN san_pham sp ON sp.ma_sp = dc.ma_sp
                    WHERE dc.den_cn = ? AND dc.trang_thai = 'HOAN_TAT'
                ) h
                WHERE thoi_gian >= ? AND thoi_gian < ?
                ORDER BY thoi_gian DESC
                LIMIT 200""",
                rs -> List.of(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getInt(4),
                        rs.getTimestamp(5).toLocalDateTime().format(Db.TIME_FORMAT).substring(0, 19), rs.getString(6)),
                maCn, maCn, Timestamp.valueOf(from), Timestamp.valueOf(to)));
        return Lists.fit(Command.HISTORY, rows);
    }

    private static LocalDateTime parseDate(String s, boolean endOfDay) {
        if (s == null || s.isBlank()) {
            return endOfDay ? LocalDateTime.of(9999, 1, 1, 0, 0) : LocalDateTime.of(1970, 1, 1, 0, 0);
        }
        try {
            LocalDate d = LocalDate.parse(s.trim());
            return endOfDay ? d.plusDays(1).atStartOfDay() : d.atStartOfDay();
        } catch (DateTimeParseException e) {
            throw new ServiceException(ErrorCode.E01, "Ngay phai co dang yyyy-MM-dd: " + s);
        }
    }

    static void requireProduct(Connection c, String maSp) throws SQLException {
        if (Db.one(c, "SELECT 1 FROM san_pham WHERE ma_sp = ?", rs -> 1, maSp) == null) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay ma hang " + maSp);
        }
    }

    // ================= phía admin =================

    /** Mặt hàng với 3 giá (đồng): nhập từ NCC, xuất cho chi nhánh, bán lẻ. */
    public record Product(String maSp, String ten, String donVi, String model, String maDm,
                          long giaNhap, long giaXuat, long giaBanLe) {
    }

    public List<Map<String, Object>> products() throws SQLException {
        return db.read(c -> Db.rows(c, """
                SELECT sp.ma_sp, sp.ten, sp.don_vi, sp.model, sp.ma_dm, dm.ten AS ten_dm,
                       sp.gia_nhap, sp.gia_xuat, sp.gia_ban_le, COALESCE(kt.so_luong, 0) AS ton_tong, sp.anh_url
                FROM san_pham sp
                JOIN danh_muc dm ON dm.ma_dm = sp.ma_dm
                LEFT JOIN kho_tong kt ON kt.ma_sp = sp.ma_sp
                ORDER BY sp.ma_sp"""));
    }

    /** FR-07: thêm sản phẩm, tạo luôn dòng kho tổng = 0. */
    public void addProduct(Product p) throws SQLException {
        validateProduct(p);
        db.tx(c -> {
            if (Db.one(c, "SELECT 1 FROM san_pham WHERE ma_sp = ?", rs -> 1, p.maSp()) != null) {
                throw new ServiceException(ErrorCode.E03, "Ma hang " + p.maSp() + " da ton tai");
            }
            requireCategory(c, p.maDm());
            Db.update(c, """
                    INSERT INTO san_pham (ma_sp, ten, don_vi, model, ma_dm, gia_nhap, gia_xuat, gia_ban_le)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    p.maSp(), p.ten(), p.donVi(), emptyToNull(p.model()), p.maDm(), p.giaNhap(), p.giaXuat(), p.giaBanLe());
            return Db.update(c, "INSERT INTO kho_tong (ma_sp, so_luong) VALUES (?, 0)", p.maSp());
        });
        events.publish(Events.PRODUCTS, null);
    }

    /** Đổi giá không làm đổi nợ của YC đã gửi (đã chốt ở phieu_xuat.don_gia). */
    public void updateProduct(Product p) throws SQLException {
        validateProduct(p);
        int n = db.tx(c -> {
            requireCategory(c, p.maDm());
            return Db.update(c, """
                    UPDATE san_pham SET ten = ?, don_vi = ?, model = ?, ma_dm = ?, gia_nhap = ?, gia_xuat = ?, gia_ban_le = ?
                    WHERE ma_sp = ?""",
                    p.ten(), p.donVi(), emptyToNull(p.model()), p.maDm(), p.giaNhap(), p.giaXuat(), p.giaBanLe(), p.maSp());
        });
        if (n == 0) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay ma hang " + p.maSp());
        }
        events.publish(Events.PRODUCTS, null);
    }

    /** FR-07: không xóa sản phẩm đang có YC chưa đóng; có lịch sử giao dịch thì cũng không xóa được (khóa ngoại). */
    public void deleteProduct(String maSp) throws SQLException {
        try {
            db.tx(c -> {
                requireProduct(c, maSp);
                Integer open = Db.one(c, """
                        SELECT count(*) FROM yeu_cau WHERE ma_sp = ? AND trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI')""",
                        rs -> rs.getInt(1), maSp);
                if (open != null && open > 0) {
                    throw new ServiceException(ErrorCode.E03, "San pham dang co " + open + " yeu cau chua dong");
                }
                Db.update(c, "DELETE FROM kho_chi_nhanh WHERE ma_sp = ?", maSp);
                Db.update(c, "DELETE FROM kho_tong WHERE ma_sp = ?", maSp);
                return Db.update(c, "DELETE FROM san_pham WHERE ma_sp = ?", maSp);
            });
        } catch (SQLException e) {
            if ("23503".equals(e.getSQLState())) {
                throw new ServiceException(ErrorCode.E03, "San pham da co lich su giao dich, khong the xoa");
            }
            throw e;
        }
        events.publish(Events.PRODUCTS, null);
    }

    private static void validateProduct(Product p) {
        if (p.maSp().isEmpty() || p.maSp().length() > 10 || !p.maSp().matches("[A-Za-z0-9_-]+")) {
            throw new ServiceException(ErrorCode.E01, "Ma hang 1-10 ky tu chu, so, _ hoac -");
        }
        if (p.ten().isEmpty() || p.ten().length() > 150) {
            throw new ServiceException(ErrorCode.E01, "Ten hang 1-150 ky tu");
        }
        if (p.donVi().isEmpty() || p.donVi().length() > 20) {
            throw new ServiceException(ErrorCode.E01, "Don vi 1-20 ky tu");
        }
        if (p.model().length() > 30) {
            throw new ServiceException(ErrorCode.E01, "Model toi da 30 ky tu");
        }
        if (p.maDm().isEmpty()) {
            throw new ServiceException(ErrorCode.E01, "Chua chon danh muc");
        }
        if (p.giaNhap() < 0 || p.giaXuat() < 0 || p.giaBanLe() < 0) {
            throw new ServiceException(ErrorCode.E05, "Gia phai >= 0");
        }
    }

    private static void requireCategory(Connection c, String maDm) throws SQLException {
        if (Db.one(c, "SELECT 1 FROM danh_muc WHERE ma_dm = ?", rs -> 1, maDm) == null) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay danh muc " + maDm);
        }
    }

    private static String emptyToNull(String s) {
        return s == null || s.isEmpty() ? null : s;
    }

    public List<Map<String, Object>> categories() throws SQLException {
        return db.read(c -> Db.rows(c, """
                SELECT dm.ma_dm, dm.ten, count(sp.ma_sp) AS so_mat_hang
                FROM danh_muc dm LEFT JOIN san_pham sp ON sp.ma_dm = dm.ma_dm
                GROUP BY dm.ma_dm, dm.ten ORDER BY dm.ma_dm"""));
    }

    public List<Map<String, Object>> suppliers() throws SQLException {
        return db.read(c -> Db.rows(c, "SELECT ma_ncc, ten, mst, dia_chi, dien_thoai FROM nha_cung_cap ORDER BY ma_ncc"));
    }

    public void addSupplier(String maNcc, String ten, String mst, String diaChi, String dienThoai) throws SQLException {
        if (maNcc.isEmpty() || maNcc.length() > 10 || !maNcc.matches("[A-Za-z0-9_-]+")) {
            throw new ServiceException(ErrorCode.E01, "Ma NCC 1-10 ky tu chu, so, _ hoac -");
        }
        if (ten.isEmpty() || ten.length() > 150) {
            throw new ServiceException(ErrorCode.E01, "Ten NCC 1-150 ky tu");
        }
        if (mst.length() > 20 || diaChi.length() > 255 || dienThoai.length() > 20) {
            throw new ServiceException(ErrorCode.E01, "MST, dien thoai toi da 20 ky tu; dia chi toi da 255 ky tu");
        }
        db.tx(c -> {
            if (Db.one(c, "SELECT 1 FROM nha_cung_cap WHERE ma_ncc = ?", rs -> 1, maNcc) != null) {
                throw new ServiceException(ErrorCode.E03, "Ma NCC " + maNcc + " da ton tai");
            }
            return Db.update(c, "INSERT INTO nha_cung_cap (ma_ncc, ten, mst, dia_chi, dien_thoai) VALUES (?, ?, ?, ?, ?)",
                    maNcc, ten, emptyToNull(mst), emptyToNull(diaChi), emptyToNull(dienThoai));
        });
        events.publish(Events.PRODUCTS, null);
    }

    /** FR-08: nhập hàng vào kho tổng, ghi phiếu nhập. donGia null thì lấy giá nhập hiện tại của mặt hàng. */
    public int importStock(String maSp, int soLuong, String maNcc, Long donGia) throws SQLException {
        if (soLuong <= 0) {
            throw new ServiceException(ErrorCode.E05, "So luong nhap phai > 0");
        }
        if (donGia != null && donGia < 0) {
            throw new ServiceException(ErrorCode.E05, "Don gia phai >= 0");
        }
        if (maNcc.isEmpty()) {
            throw new ServiceException(ErrorCode.E01, "Chua chon nha cung cap");
        }
        int ton = db.tx(c -> {
            requireProduct(c, maSp);
            if (Db.one(c, "SELECT 1 FROM nha_cung_cap WHERE ma_ncc = ?", rs -> 1, maNcc) == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay nha cung cap " + maNcc);
            }
            Db.update(c, """
                    INSERT INTO phieu_nhap (ma_sp, so_luong, ma_ncc, don_gia)
                    SELECT ?, ?, ?, COALESCE(CAST(? AS NUMERIC), gia_nhap) FROM san_pham WHERE ma_sp = ?""",
                    maSp, soLuong, maNcc, donGia, maSp);
            return Db.one(c, """
                    INSERT INTO kho_tong (ma_sp, so_luong) VALUES (?, ?)
                    ON CONFLICT (ma_sp) DO UPDATE SET so_luong = kho_tong.so_luong + EXCLUDED.so_luong
                    RETURNING so_luong""", rs -> rs.getInt(1), maSp, soLuong);
        });
        events.publish(Events.PRODUCTS, null);
        return ton;
    }

    public List<Map<String, Object>> imports(int limit) throws SQLException {
        return db.read(c -> Db.rows(c, """
                SELECT pn.ma_pn, pn.ma_sp, sp.ten, pn.so_luong, pn.ma_ncc, ncc.ten AS ten_ncc, pn.don_gia,
                       pn.so_luong * pn.don_gia AS thanh_tien, pn.thoi_gian
                FROM phieu_nhap pn
                JOIN san_pham sp ON sp.ma_sp = pn.ma_sp
                JOIN nha_cung_cap ncc ON ncc.ma_ncc = pn.ma_ncc
                ORDER BY pn.thoi_gian DESC LIMIT ?""", limit));
    }

    /** FR-09: tồn kho từng CN (lọc theo maCn nếu có); mặt hàng chưa có dòng kho coi như tồn 0, chưa đặt ngưỡng (như INVENTORY). */
    public List<Map<String, Object>> branchStock(String maCn) throws SQLException {
        return db.read(c -> Db.rows(c, """
                SELECT cn.ma_cn, cn.ten AS ten_cn, sp.ma_sp, sp.ten AS ten_sp, sp.ma_dm,
                       COALESCE(k.so_luong, 0) AS so_luong, COALESCE(k.nguong_toi_thieu, 0) AS nguong_toi_thieu,
                       (COALESCE(k.so_luong, 0) < COALESCE(k.nguong_toi_thieu, 0)) AS duoi_nguong
                FROM chi_nhanh cn
                CROSS JOIN san_pham sp
                LEFT JOIN kho_chi_nhanh k ON k.ma_cn = cn.ma_cn AND k.ma_sp = sp.ma_sp
                WHERE (? = '' AND NOT cn.gia_lap) OR cn.ma_cn = ?
                ORDER BY cn.ma_cn, sp.ma_sp""", maCn, maCn));
    }

    /**
     * Mức tồn theo cùng quy tắc với stockLevel() của giao diện: ngưỡng 0 = chưa đặt, tồn &lt; ngưỡng = thiếu,
     * tồn &lt; 1,5 × ngưỡng = sắp thiếu, còn lại đủ. Mặt hàng chưa có dòng kho_chi_nhanh coi như tồn 0, chưa đặt ngưỡng.
     */
    private static final String LEVEL_SQL = """
            CASE WHEN COALESCE(k.nguong_toi_thieu, 0) = 0 THEN 'unset'
                 WHEN k.so_luong < k.nguong_toi_thieu THEN 'critical'
                 WHEN k.so_luong < 1.5 * k.nguong_toi_thieu THEN 'warning'
                 ELSE 'ok' END""";

    private static final String DEBT_SQL = """
            COALESCE((SELECT sum(CASE WHEN n.loai IN ('XUAT', 'DC_NHAN') THEN n.so_tien ELSE -n.so_tien END)
                      FROM cong_no_cn n WHERE n.ma_cn = cn.ma_cn), 0)""";

    /** Kho chi nhánh: mỗi chi nhánh thật một thẻ với số mặt hàng theo mức tồn, giá trị tồn, YC mở, công nợ. */
    public List<Map<String, Object>> warehouses(java.util.Set<String> online) throws SQLException {
        List<Map<String, Object>> rows = db.read(c -> Db.rows(c, """
                SELECT cn.ma_cn, cn.ten, cn.dia_chi,
                       count(*) FILTER (WHERE muc = 'critical') AS thieu,
                       count(*) FILTER (WHERE muc = 'warning') AS sap_thieu,
                       count(*) FILTER (WHERE muc = 'ok') AS du,
                       count(*) FILTER (WHERE muc = 'unset') AS chua_dat,
                       COALESCE(sum(t.so_luong * t.gia_xuat), 0) AS gia_tri_ton,
                       (SELECT count(*) FROM yeu_cau y WHERE y.ma_cn = cn.ma_cn
                          AND y.trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI')) AS yc_mo,
                       """ + DEBT_SQL + """
                        AS con_no, cn.han_muc_no AS han_muc
                FROM chi_nhanh cn
                JOIN LATERAL (
                    SELECT COALESCE(k.so_luong, 0) AS so_luong, sp.gia_xuat, """ + LEVEL_SQL + """
                     AS muc
                    FROM san_pham sp LEFT JOIN kho_chi_nhanh k ON k.ma_sp = sp.ma_sp AND k.ma_cn = cn.ma_cn
                ) t ON TRUE
                WHERE NOT cn.gia_lap
                GROUP BY cn.ma_cn ORDER BY cn.ma_cn"""));
        for (Map<String, Object> r : rows) {
            r.put("online", online.contains((String) r.get("maCn")));
            r.put("vuotHanMuc", ((Number) r.get("conNo")).doubleValue() > ((Number) r.get("hanMuc")).doubleValue());
        }
        return rows;
    }

    /**
     * Chi tiết một kho: mỗi mặt hàng có danh mục, tồn, ngưỡng, mức, giá trị, YC đang mở, bán 7 ngày gần nhất
     * và số lượng đề xuất bổ sung max(2 × ngưỡng − tồn, 0).
     */
    public Map<String, Object> warehouse(String maCn, java.util.Set<String> online) throws SQLException {
        return db.read(c -> {
            Map<String, Object> head = Db.one(c, "SELECT cn.ma_cn, cn.ten, cn.dia_chi, cn.gia_lap, " + DEBT_SQL
                    + " AS con_no, cn.han_muc_no AS han_muc FROM chi_nhanh cn WHERE cn.ma_cn = ?", Db::toMap, maCn);
            if (head == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay chi nhanh " + maCn);
            }
            head.put("online", online.contains(maCn));
            List<Map<String, Object>> items = Db.rows(c, """
                    SELECT sp.ma_sp, sp.ten, sp.model, sp.don_vi, sp.ma_dm, dm.ten AS ten_dm, sp.gia_xuat, sp.anh_url,
                           COALESCE(k.so_luong, 0) AS so_luong, COALESCE(k.nguong_toi_thieu, 0) AS nguong,
                           """ + LEVEL_SQL + """
                     AS muc,
                           COALESCE(k.so_luong, 0) * sp.gia_xuat AS gia_tri,
                           y.ma_yc AS yc_mo, y.trang_thai AS yc_trang_thai,
                           COALESCE((SELECT sum(b.so_luong) FROM ban_hang b WHERE b.ma_cn = ? AND b.ma_sp = sp.ma_sp
                                       AND b.thoi_gian > CURRENT_TIMESTAMP - INTERVAL '7 days'), 0) AS ban_7_ngay,
                           GREATEST(2 * COALESCE(k.nguong_toi_thieu, 0) - COALESCE(k.so_luong, 0), 0) AS de_xuat,
                           COALESCE(kt.so_luong, 0) AS ton_tong
                    FROM san_pham sp
                    JOIN danh_muc dm ON dm.ma_dm = sp.ma_dm
                    LEFT JOIN kho_chi_nhanh k ON k.ma_sp = sp.ma_sp AND k.ma_cn = ?
                    LEFT JOIN kho_tong kt ON kt.ma_sp = sp.ma_sp
                    LEFT JOIN yeu_cau y ON y.ma_cn = ? AND y.ma_sp = sp.ma_sp AND y.trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI')
                    ORDER BY sp.ma_dm, sp.ma_sp""", maCn, maCn, maCn);
            head.put("matHang", items);
            return head;
        });
    }

    public List<Map<String, Object>> branches(java.util.Set<String> online) throws SQLException {
        List<Map<String, Object>> rows = db.read(c -> Db.rows(c, """
                SELECT cn.ma_cn, cn.ten, cn.dia_chi, cn.gia_lap,
                       (SELECT count(*) FROM yeu_cau y WHERE y.ma_cn = cn.ma_cn
                          AND y.trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI')) AS yc_mo,
                       (SELECT count(*) FROM hang_doi_tin q WHERE q.ma_cn = cn.ma_cn AND NOT q.da_gui) AS tin_cho
                FROM chi_nhanh cn ORDER BY cn.ma_cn"""));
        for (Map<String, Object> r : rows) {
            r.put("online", online.contains((String) r.get("maCn")));
        }
        return rows;
    }

    /** NFR-03: đối soát kho tổng và kho chi nhánh. */
    public Map<String, Object> reconcile() throws SQLException {
        return db.read(c -> {
            Map<String, Object> out = new LinkedHashMap<>();
            List<Map<String, Object>> perProduct = Db.rows(c, """
                    SELECT sp.ma_sp, sp.ten,
                        COALESCE((SELECT sum(so_luong) FROM phieu_nhap WHERE ma_sp = sp.ma_sp), 0) AS tong_nhap,
                        COALESCE((SELECT sum(so_luong) FROM phieu_xuat WHERE ma_sp = sp.ma_sp), 0) AS tong_xuat,
                        COALESCE((SELECT so_luong FROM kho_tong WHERE ma_sp = sp.ma_sp), 0) AS ton_tong,
                        COALESCE((SELECT sum(so_luong_giao) FROM yeu_cau
                                  WHERE ma_sp = sp.ma_sp AND trang_thai = 'HOAN_TAT'), 0) AS cn_da_nhan,
                        COALESCE((SELECT sum(so_luong) FROM dieu_chuyen
                                  WHERE ma_sp = sp.ma_sp AND trang_thai = 'HOAN_TAT'), 0) AS tu_dieu_chuyen,
                        COALESCE((SELECT sum(so_luong_giao) FROM yeu_cau
                                  WHERE ma_sp = sp.ma_sp AND trang_thai = 'DA_GIAO'), 0) AS dang_giao,
                        (SELECT count(*) FROM kho_tong WHERE ma_sp = sp.ma_sp AND so_luong < 0) AS am
                    FROM san_pham sp ORDER BY sp.ma_sp""");
            boolean ok = true;
            for (Map<String, Object> r : perProduct) {
                long xuat = ((Number) r.get("tongXuat")).longValue();
                long nhanTuKho = ((Number) r.get("cnDaNhan")).longValue() - ((Number) r.get("tuDieuChuyen")).longValue()
                        + ((Number) r.get("dangGiao")).longValue();
                boolean rowOk = xuat == nhanTuKho && ((Number) r.get("am")).longValue() == 0;
                r.put("khop", rowOk);
                ok &= rowOk;
            }
            // Sổ công nợ: XUAT khớp phiếu xuất của YC đã nhận, DC_NHAN = DC_GIAO = điều chuyển hoàn tất
            Map<String, Object> debt = Db.one(c, """
                    SELECT COALESCE((SELECT sum(so_tien) FROM cong_no_cn WHERE loai = 'XUAT'), 0) AS so_xuat,
                           COALESCE((SELECT sum(px.so_luong * px.don_gia) FROM phieu_xuat px
                                     JOIN yeu_cau y ON y.ma_yc = px.ma_yc WHERE y.trang_thai = 'HOAN_TAT'), 0) AS phieu_xuat,
                           COALESCE((SELECT sum(so_tien) FROM cong_no_cn WHERE loai = 'DC_NHAN'), 0) AS so_dc_nhan,
                           COALESCE((SELECT sum(so_tien) FROM cong_no_cn WHERE loai = 'DC_GIAO'), 0) AS so_dc_giao,
                           COALESCE((SELECT sum(so_luong * don_gia) FROM dieu_chuyen
                                     WHERE trang_thai = 'HOAN_TAT'), 0) AS dieu_chuyen""", Db::toMap);
            double dc = ((Number) debt.get("dieuChuyen")).doubleValue();
            boolean debtOk = ((Number) debt.get("soXuat")).doubleValue() == ((Number) debt.get("phieuXuat")).doubleValue()
                    && ((Number) debt.get("soDcNhan")).doubleValue() == dc
                    && ((Number) debt.get("soDcGiao")).doubleValue() == dc;
            debt.put("khop", debtOk);
            ok &= debtOk;
            out.put("khop", ok);
            out.put("congNo", debt);
            out.put("sanPham", perProduct);
            out.put("ghiChu", "tong_xuat (phieu_xuat) = so CN da nhan tu kho tong (HOAN_TAT tru dieu chuyen) + dang giao; cong_no_cn: XUAT = phieu xuat cua YC da nhan, DC_NHAN = DC_GIAO = dieu chuyen hoan tat");
            return out;
        });
    }
}
