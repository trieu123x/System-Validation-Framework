package phanphoi.server.service;

import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.Message;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;

import java.math.BigDecimal;
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

    /** INVENTORY|maHang,tenHang,soLuong,nguong;... (FR-10). */
    public Message inventoryMessage(String maCn) throws SQLException {
        List<List<Object>> rows = db.read(c -> Db.list(c, """
                SELECT sp.ma_sp, sp.ten, COALESCE(k.so_luong, 0), COALESCE(k.nguong_toi_thieu, 0)
                FROM san_pham sp
                LEFT JOIN kho_chi_nhanh k ON k.ma_sp = sp.ma_sp AND k.ma_cn = ?
                ORDER BY sp.ma_sp""",
                rs -> List.of(rs.getString(1), rs.getString(2), rs.getInt(3), rs.getInt(4)), maCn));
        return Lists.fit(Command.INVENTORY, rows);
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

    public List<Map<String, Object>> products() throws SQLException {
        return db.read(c -> Db.rows(c, """
                SELECT sp.ma_sp, sp.ten, sp.don_vi, sp.gia, COALESCE(kt.so_luong, 0) AS ton_tong
                FROM san_pham sp LEFT JOIN kho_tong kt ON kt.ma_sp = sp.ma_sp
                ORDER BY sp.ma_sp"""));
    }

    /** FR-07: thêm sản phẩm, tạo luôn dòng kho tổng = 0. */
    public void addProduct(String maSp, String ten, String donVi, BigDecimal gia) throws SQLException {
        validateProduct(maSp, ten, donVi, gia);
        db.tx(c -> {
            if (Db.one(c, "SELECT 1 FROM san_pham WHERE ma_sp = ?", rs -> 1, maSp) != null) {
                throw new ServiceException(ErrorCode.E03, "Ma hang " + maSp + " da ton tai");
            }
            Db.update(c, "INSERT INTO san_pham (ma_sp, ten, don_vi, gia) VALUES (?, ?, ?, ?)", maSp, ten, donVi, gia);
            return Db.update(c, "INSERT INTO kho_tong (ma_sp, so_luong) VALUES (?, 0)", maSp);
        });
        events.publish(Events.PRODUCTS, null);
    }

    public void updateProduct(String maSp, String ten, String donVi, BigDecimal gia) throws SQLException {
        validateProduct(maSp, ten, donVi, gia);
        int n = db.read(c -> Db.update(c, "UPDATE san_pham SET ten = ?, don_vi = ?, gia = ? WHERE ma_sp = ?",
                ten, donVi, gia, maSp));
        if (n == 0) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay ma hang " + maSp);
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

    private static void validateProduct(String maSp, String ten, String donVi, BigDecimal gia) {
        if (maSp.isEmpty() || maSp.length() > 10 || !maSp.matches("[A-Za-z0-9_-]+")) {
            throw new ServiceException(ErrorCode.E01, "Ma hang 1-10 ky tu chu, so, _ hoac -");
        }
        if (ten.isEmpty() || ten.length() > 150) {
            throw new ServiceException(ErrorCode.E01, "Ten hang 1-150 ky tu");
        }
        if (donVi.isEmpty() || donVi.length() > 20) {
            throw new ServiceException(ErrorCode.E01, "Don vi 1-20 ky tu");
        }
        if (gia == null || gia.signum() < 0) {
            throw new ServiceException(ErrorCode.E05, "Gia phai >= 0");
        }
    }

    /** FR-08: nhập hàng vào kho tổng, ghi phiếu nhập. */
    public int importStock(String maSp, int soLuong, String nhaCungCap) throws SQLException {
        if (soLuong <= 0) {
            throw new ServiceException(ErrorCode.E05, "So luong nhap phai > 0");
        }
        int ton = db.tx(c -> {
            requireProduct(c, maSp);
            Db.update(c, "INSERT INTO phieu_nhap (ma_sp, so_luong, nha_cung_cap) VALUES (?, ?, ?)",
                    maSp, soLuong, nhaCungCap.isEmpty() ? null : nhaCungCap);
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
                SELECT pn.ma_pn, pn.ma_sp, sp.ten, pn.so_luong, pn.nha_cung_cap, pn.thoi_gian
                FROM phieu_nhap pn JOIN san_pham sp ON sp.ma_sp = pn.ma_sp
                ORDER BY pn.thoi_gian DESC LIMIT ?""", limit));
    }

    /** FR-09: tồn kho từng CN (lọc theo maCn nếu có). */
    public List<Map<String, Object>> branchStock(String maCn) throws SQLException {
        return db.read(c -> Db.rows(c, """
                SELECT k.ma_cn, cn.ten AS ten_cn, k.ma_sp, sp.ten AS ten_sp, k.so_luong, k.nguong_toi_thieu,
                       (k.so_luong < k.nguong_toi_thieu) AS duoi_nguong
                FROM kho_chi_nhanh k
                JOIN chi_nhanh cn ON cn.ma_cn = k.ma_cn
                JOIN san_pham sp ON sp.ma_sp = k.ma_sp
                WHERE (? = '' AND NOT cn.gia_lap) OR k.ma_cn = ?
                ORDER BY k.ma_cn, k.ma_sp""", maCn, maCn));
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
            out.put("khop", ok);
            out.put("sanPham", perProduct);
            out.put("ghiChu", "tong_xuat (phieu_xuat) = so CN da nhan tu kho tong (HOAN_TAT tru dieu chuyen) + dang giao");
            return out;
        });
    }
}
