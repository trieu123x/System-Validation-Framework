package phanphoi.server.service;

import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.Message;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;
import phanphoi.server.net.ClientHandler;
import phanphoi.server.net.SessionRegistry;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Công nợ hai chiều.
 *
 * <p>Chi nhánh nợ công ty: sổ {@code cong_no_cn}, mỗi dòng một bút toán.
 * tongNhan = Σ(XUAT + DC_NHAN) − Σ DC_GIAO, daTra = Σ THU, conNo = tongNhan − daTra.
 * XUAT ghi khi chi nhánh xác nhận RECEIVED (đơn giá chốt ở phieu_xuat lúc gửi hàng), DC_* ghi khi điều chuyển
 * hoàn tất (nợ đi theo hàng), THU khi admin ghi phiếu thu. Vượt hạn mức chỉ cảnh báo, không chặn gửi hàng.
 *
 * <p>Công ty nợ nhà cung cấp: Σ phieu_nhap (so_luong × don_gia) − Σ thanh_toan_ncc.
 */
public final class DebtService {

    public static final String DA_TRA_DU = "DA_TRA_DU";
    public static final String CON_NO = "CON_NO";
    public static final String VUOT_HAN_MUC = "VUOT_HAN_MUC";
    public static final String CHUA_PHAT_SINH = "CHUA_PHAT_SINH";

    /** Số bút toán gửi kèm tin DEBT. */
    private static final int DEBT_ROWS = 50;
    private static final long MAX_MONEY = 1_000_000_000_000L;

    private final Db db;
    private final SessionRegistry registry;
    private final Events events;

    public DebtService(Db db, SessionRegistry registry, Events events) {
        this.db = db;
        this.registry = registry;
        this.events = events;
    }

    // ================= ghi sổ (gọi trong transaction của nghiệp vụ) =================

    /**
     * RECEIVED của YC lấy hàng từ kho tổng: ghi XUAT = so_luong × phieu_xuat.don_gia.
     * YC nhận qua điều chuyển không có phiếu xuất nên không ghi (nợ đã ghi bằng DC_NHAN).
     * {@code uq_cong_no_yc} chặn ghi hai lần khi RECEIVED gửi lặp.
     */
    static void recordDelivery(Connection c, int maYc) throws SQLException {
        Db.update(c, """
                INSERT INTO cong_no_cn (ma_cn, loai, so_tien, ma_yc, ghi_chu)
                SELECT px.ma_cn, 'XUAT', px.so_luong * px.don_gia, px.ma_yc,
                       'YC #' || px.ma_yc || ': ' || px.ma_sp || ' x ' || px.so_luong
                FROM phieu_xuat px WHERE px.ma_yc = ? AND px.don_gia > 0
                ON CONFLICT (loai, ma_yc) WHERE ma_yc IS NOT NULL DO NOTHING""", maYc);
    }

    /**
     * Điều chuyển hoàn tất: CN nhận ghi DC_NHAN, CN cho ghi DC_GIAO, số tiền = so_luong × dieu_chuyen.don_gia.
     * Khóa dòng chi_nhanh của CN cho (nợ của nó giảm) để không chạy song song với phiếu thu của chính nó.
     */
    static void recordTransfer(Connection c, int maDc) throws SQLException {
        Db.one(c, """
                SELECT 1 FROM chi_nhanh WHERE ma_cn = (SELECT tu_cn FROM dieu_chuyen WHERE ma_dc = ?)
                FOR NO KEY UPDATE""", rs -> 1, maDc);
        Db.update(c, """
                INSERT INTO cong_no_cn (ma_cn, loai, so_tien, ma_dc, ghi_chu)
                SELECT x.ma_cn, x.loai, dc.so_luong * dc.don_gia, dc.ma_dc, x.ghi_chu
                FROM dieu_chuyen dc
                CROSS JOIN LATERAL (VALUES
                    (dc.den_cn, 'DC_NHAN', 'Nhận điều chuyển #' || dc.ma_dc || ' từ ' || dc.tu_cn || ': '
                                           || dc.ma_sp || ' x ' || dc.so_luong),
                    (dc.tu_cn,  'DC_GIAO', 'Giao điều chuyển #' || dc.ma_dc || ' cho ' || dc.den_cn || ': '
                                           || dc.ma_sp || ' x ' || dc.so_luong)
                ) AS x(ma_cn, loai, ghi_chu)
                WHERE dc.ma_dc = ? AND dc.don_gia > 0
                ON CONFLICT (loai, ma_dc) WHERE ma_dc IS NOT NULL DO NOTHING""", maDc);
    }

    // ================= chi nhánh =================

    private static final String BRANCH_SQL = """
            SELECT cn.ma_cn, cn.ten AS ten_cn, cn.gia_lap,
                   COALESCE(sum(CASE n.loai WHEN 'XUAT' THEN n.so_tien WHEN 'DC_NHAN' THEN n.so_tien
                                            WHEN 'DC_GIAO' THEN -n.so_tien ELSE 0 END), 0) AS tong_nhan,
                   COALESCE(sum(n.so_tien) FILTER (WHERE n.loai = 'THU'), 0) AS da_tra,
                   cn.han_muc_no AS han_muc, count(n.id) AS so_but_toan
            FROM chi_nhanh cn LEFT JOIN cong_no_cn n ON n.ma_cn = cn.ma_cn""";

    /** Bổ sung conNo, trangThai cho một dòng của BRANCH_SQL. */
    private static Map<String, Object> withStatus(Map<String, Object> r) {
        double tongNhan = ((Number) r.get("tongNhan")).doubleValue();
        double daTra = ((Number) r.get("daTra")).doubleValue();
        double hanMuc = ((Number) r.get("hanMuc")).doubleValue();
        double conNo = tongNhan - daTra;
        r.put("conNo", conNo);
        String st;
        if (((Number) r.get("soButToan")).longValue() == 0) {
            st = CHUA_PHAT_SINH;
        } else if (conNo <= 0) {
            st = DA_TRA_DU;
        } else if (conNo > hanMuc) {
            st = VUOT_HAN_MUC;
        } else {
            st = CON_NO;
        }
        r.put("trangThai", st);
        r.remove("soButToan");
        return r;
    }

    /** Tổng hợp công nợ từng chi nhánh; mặc định bỏ chi nhánh ảo SIM. */
    public List<Map<String, Object>> branchSummary(String trangThai, boolean includeSim) throws SQLException {
        List<Map<String, Object>> rows = db.read(c -> Db.rows(c, BRANCH_SQL + """
                 WHERE ? OR NOT cn.gia_lap
                GROUP BY cn.ma_cn ORDER BY cn.ma_cn""", includeSim));
        rows.forEach(DebtService::withStatus);
        if (!trangThai.isEmpty()) {
            rows.removeIf(r -> !trangThai.equals(r.get("trangThai")));
        }
        return rows;
    }

    private static Map<String, Object> branchRow(Connection c, String maCn) throws SQLException {
        Map<String, Object> r = Db.one(c, BRANCH_SQL + " WHERE cn.ma_cn = ? GROUP BY cn.ma_cn", Db::toMap, maCn);
        if (r == null) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay chi nhanh " + maCn);
        }
        return withStatus(r);
    }

    /** Sổ chi tiết: tổng hợp + 200 bút toán mới nhất. */
    public Map<String, Object> branchLedger(String maCn) throws SQLException {
        return db.read(c -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("tongHop", branchRow(c, maCn));
            out.put("butToan", Db.rows(c, """
                    SELECT id, loai, so_tien, ma_yc, ma_dc, ghi_chu, thoi_gian FROM cong_no_cn
                    WHERE ma_cn = ? ORDER BY thoi_gian DESC, id DESC LIMIT 200""", maCn));
            return out;
        });
    }

    /** Kiểm tra trước khi Gửi hàng: gửi thêm soTien thì có vượt hạn mức không (chỉ cảnh báo). */
    public Map<String, Object> check(String maCn, long soTien) throws SQLException {
        if (soTien < 0 || soTien > MAX_MONEY) {
            throw new ServiceException(ErrorCode.E05, "So tien khong hop le");
        }
        Map<String, Object> r = db.read(c -> branchRow(c, maCn));
        double conNo = ((Number) r.get("conNo")).doubleValue();
        double hanMuc = ((Number) r.get("hanMuc")).doubleValue();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("conNo", conNo);
        out.put("hanMuc", hanMuc);
        out.put("sauKhiGui", conNo + soTien);
        out.put("vuotHanMuc", conNo + soTien > hanMuc);
        return out;
    }

    /** Phiếu thu của admin. Khóa dòng chi nhánh trước khi tính số còn nợ để hai phiếu cùng lúc không thu quá. */
    public long recordPayment(String maCn, long soTien, String ghiChu) throws SQLException {
        requireAmount(soTien);
        requireNote(ghiChu);
        long con = db.tx(c -> {
            if (Db.one(c, "SELECT 1 FROM chi_nhanh WHERE ma_cn = ? FOR NO KEY UPDATE", rs -> 1, maCn) == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay chi nhanh " + maCn);
            }
            double conNo = ((Number) branchRow(c, maCn).get("conNo")).doubleValue();
            if (soTien > conNo) {
                throw new ServiceException(ErrorCode.E05, "So tien lon hon so con no (" + money(conNo) + ")");
            }
            Db.update(c, "INSERT INTO cong_no_cn (ma_cn, loai, so_tien, ghi_chu) VALUES (?, 'THU', ?, ?)",
                    maCn, soTien, ghiChu.isEmpty() ? "Phiếu thu" : ghiChu);
            return Math.round(conNo - soTien);
        });
        changed(maCn);
        return con;
    }

    public void setCreditLimit(String maCn, long hanMuc) throws SQLException {
        if (hanMuc < 0 || hanMuc > MAX_MONEY) {
            throw new ServiceException(ErrorCode.E05, "Han muc phai tu 0 den 10^12");
        }
        int n = db.read(c -> Db.update(c, "UPDATE chi_nhanh SET han_muc_no = ? WHERE ma_cn = ?", hanMuc, maCn));
        if (n == 0) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay chi nhanh " + maCn);
        }
        changed(maCn);
    }

    /**
     * DEBT|tongNhan|daTra|conNo|hanMuc|id,loai,soTien,thoiGian,ghiChu;... (50 bút toán mới nhất).
     * Trả null cho chi nhánh ảo SIM: không hiển thị nên không tốn công tính và gửi.
     */
    public Message debtMessage(String maCn) throws SQLException {
        return db.read(c -> {
            Map<String, Object> r = branchRow(c, maCn);
            if (Boolean.TRUE.equals(r.get("giaLap"))) {
                return null;
            }
            List<List<Object>> rows = Db.list(c, """
                    SELECT id, loai, so_tien, thoi_gian, COALESCE(ghi_chu, '') FROM cong_no_cn
                    WHERE ma_cn = ? ORDER BY thoi_gian DESC, id DESC LIMIT ?""",
                    rs -> List.of(rs.getLong(1), rs.getString(2), rs.getLong(3),
                            rs.getTimestamp(4).toLocalDateTime().format(Db.TIME_FORMAT).substring(0, 19), rs.getString(5)),
                    maCn, DEBT_ROWS);
            return Lists.fit(Command.DEBT, List.of(money(r.get("tongNhan")), money(r.get("daTra")),
                    money(r.get("conNo")), money(r.get("hanMuc"))), rows);
        });
    }

    /**
     * Sau khi sổ của chi nhánh đổi: đẩy DEBT nếu chi nhánh đang online (không xếp hàng: sau LOGIN_OK
     * client tự gửi DEBT_GET) và báo trang admin tải lại.
     */
    public void changed(String maCn) {
        try {
            ClientHandler h = registry.get(maCn);
            Message m = h == null ? null : debtMessage(maCn);
            if (m != null) {
                h.send(m);
            }
            if (h == null || m != null) {
                events.publish(Events.DEBT, Map.of("maCn", maCn));
            }
        } catch (SQLException e) {
            System.err.println("[server] loi gui cong no cho " + maCn + ": " + e.getMessage());
        }
    }

    // ================= nhà cung cấp =================

    private static final String SUPPLIER_SQL = """
            SELECT ncc.ma_ncc, ncc.ten,
                   COALESCE((SELECT sum(so_luong * don_gia) FROM phieu_nhap WHERE ma_ncc = ncc.ma_ncc), 0) AS tong_nhap,
                   COALESCE((SELECT sum(so_tien) FROM thanh_toan_ncc WHERE ma_ncc = ncc.ma_ncc), 0) AS da_tra
            FROM nha_cung_cap ncc""";

    private static Map<String, Object> supplierStatus(Map<String, Object> r) {
        r.put("conNo", ((Number) r.get("tongNhap")).doubleValue() - ((Number) r.get("daTra")).doubleValue());
        return r;
    }

    public List<Map<String, Object>> supplierSummary() throws SQLException {
        List<Map<String, Object>> rows = db.read(c -> Db.rows(c, SUPPLIER_SQL + " ORDER BY ncc.ma_ncc"));
        rows.forEach(DebtService::supplierStatus);
        return rows;
    }

    private static Map<String, Object> supplierRow(Connection c, String maNcc) throws SQLException {
        Map<String, Object> r = Db.one(c, SUPPLIER_SQL + " WHERE ncc.ma_ncc = ?", Db::toMap, maNcc);
        if (r == null) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay nha cung cap " + maNcc);
        }
        return supplierStatus(r);
    }

    /** Sổ nhà cung cấp: phiếu nhập (NHAP, tăng nợ) và phiếu chi (CHI, giảm nợ), 200 dòng mới nhất. */
    public Map<String, Object> supplierLedger(String maNcc) throws SQLException {
        return db.read(c -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("tongHop", supplierRow(c, maNcc));
            out.put("butToan", Db.rows(c, """
                    SELECT * FROM (
                        SELECT 'PN' || pn.ma_pn AS id, 'NHAP' AS loai, pn.so_luong * pn.don_gia AS so_tien,
                               pn.ma_sp || ' x ' || pn.so_luong || ' @ ' || pn.don_gia AS ghi_chu, pn.thoi_gian
                        FROM phieu_nhap pn WHERE pn.ma_ncc = ?
                        UNION ALL
                        SELECT 'PC' || t.id, 'CHI', t.so_tien, t.ghi_chu, t.thoi_gian
                        FROM thanh_toan_ncc t WHERE t.ma_ncc = ?
                    ) x ORDER BY thoi_gian DESC LIMIT 200""", maNcc, maNcc));
            return out;
        });
    }

    /** Phiếu chi trả nhà cung cấp; khóa dòng NCC để hai phiếu cùng lúc không trả quá. */
    public long paySupplier(String maNcc, long soTien, String ghiChu) throws SQLException {
        requireAmount(soTien);
        requireNote(ghiChu);
        long con = db.tx(c -> {
            if (Db.one(c, "SELECT 1 FROM nha_cung_cap WHERE ma_ncc = ? FOR NO KEY UPDATE", rs -> 1, maNcc) == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay nha cung cap " + maNcc);
            }
            double conNo = ((Number) supplierRow(c, maNcc).get("conNo")).doubleValue();
            if (soTien > conNo) {
                throw new ServiceException(ErrorCode.E05, "So tien lon hon so con no (" + money(conNo) + ")");
            }
            Db.update(c, "INSERT INTO thanh_toan_ncc (ma_ncc, so_tien, ghi_chu) VALUES (?, ?, ?)",
                    maNcc, soTien, ghiChu.isEmpty() ? "Phiếu chi" : ghiChu);
            return Math.round(conNo - soTien);
        });
        events.publish(Events.DEBT, Map.of("maNcc", maNcc));
        return con;
    }

    /** 4 KPI trang Công nợ (chi nhánh thật, không tính SIM). */
    public Map<String, Object> summary() throws SQLException {
        return db.read(c -> Db.one(c, """
                SELECT COALESCE((SELECT sum(so_luong * don_gia) FROM phieu_nhap), 0) AS tong_nhap,
                       COALESCE((SELECT sum(so_tien) FROM thanh_toan_ncc), 0) AS da_tra_ncc,
                       COALESCE((SELECT sum(n.so_tien) FROM cong_no_cn n JOIN chi_nhanh cn ON cn.ma_cn = n.ma_cn
                                 WHERE n.loai = 'XUAT' AND NOT cn.gia_lap), 0) AS tong_xuat,
                       COALESCE((SELECT sum(n.so_tien) FROM cong_no_cn n JOIN chi_nhanh cn ON cn.ma_cn = n.ma_cn
                                 WHERE n.loai = 'THU' AND NOT cn.gia_lap), 0) AS da_thu_cn,
                       COALESCE((SELECT sum(CASE WHEN n.loai IN ('XUAT', 'DC_NHAN') THEN n.so_tien ELSE -n.so_tien END)
                                 FROM cong_no_cn n JOIN chi_nhanh cn ON cn.ma_cn = n.ma_cn WHERE NOT cn.gia_lap), 0)
                           AS con_no_cn""", rs -> {
            Map<String, Object> m = Db.toMap(rs);
            m.put("conNoNcc", ((Number) m.get("tongNhap")).doubleValue() - ((Number) m.get("daTraNcc")).doubleValue());
            return m;
        }));
    }

    private static void requireAmount(long soTien) {
        if (soTien <= 0 || soTien > MAX_MONEY) {
            throw new ServiceException(ErrorCode.E05, "So tien phai la so nguyen duong, toi da 10^12");
        }
    }

    private static void requireNote(String ghiChu) {
        if (ghiChu.length() > 255) {
            throw new ServiceException(ErrorCode.E01, "Ghi chu toi da 255 ky tu");
        }
    }

    /** Số tiền dạng số nguyên đồng (CSDL trả NUMERIC → double qua Db.toMap). */
    private static String money(Object v) {
        return String.valueOf(Math.round(((Number) v).doubleValue()));
    }
}
