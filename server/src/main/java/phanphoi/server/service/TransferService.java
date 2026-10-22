package phanphoi.server.service;

import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.Message;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;
import phanphoi.server.net.SessionRegistry;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * SRS 7.2-B: kho tổng thiếu → server tìm CN có tồn > 2 × ngưỡng, gửi TRANSFER_REQ;
 * CN nguồn đồng ý thì chuyển kho trong một transaction và gửi DELIVERED cho CN thiếu hàng.
 *
 * <pre>
 *   S → CN nguồn : TRANSFER_REQ|maDC|maHang|soLuong|tenCnNhan
 *   CN nguồn → S : TRANSFER_ACCEPT|maDC  hoặc  TRANSFER_REJECT|maDC
 *   S → CN nguồn : TRANSFER_DONE|maDC|maHang|soLuongCon
 *   S → CN nhận  : DELIVERED|maYC|maHang|soLuong   (rồi CN nhận gửi RECEIVED như bình thường)
 * </pre>
 * CN nguồn từ chối hoặc không đủ hàng → server thử CN kế tiếp.
 */
public final class TransferService {

    private record Dc(int maDc, int maYc, String tuCn, String denCn, String maSp, int soLuong, String trangThai) {
    }

    private record Donor(String maCn, int duThua) {
    }

    private final Db db;
    private final SessionRegistry registry;
    private final Outbox outbox;
    private final Events events;
    private final DebtService debts;

    public TransferService(Db db, SessionRegistry registry, Outbox outbox, Events events, DebtService debts) {
        this.db = db;
        this.registry = registry;
        this.outbox = outbox;
        this.events = events;
        this.debts = debts;
    }

    /** Huỷ lời mời đang chờ khi YC đã được xử lý theo đường khác (gọi trong transaction của YC). */
    static void cancelPending(Connection c, int maYc) throws SQLException {
        Db.update(c, """
                UPDATE dieu_chuyen SET trang_thai = 'HUY', cap_nhat_luc = CURRENT_TIMESTAMP
                WHERE ma_yc = ? AND trang_thai = 'CHO'""", maYc);
    }

    /** Tìm CN nguồn cho YC đang THIEU_HANG; ưu tiên CN online, dư nhiều nhất. */
    public void tryStart(int maYc) throws SQLException {
        Message[] toSend = new Message[1];
        String[] donorCn = new String[1];
        Integer maDc = db.tx(c -> {
            Object[] yc = Db.one(c, """
                    SELECT y.ma_cn, y.ma_sp, COALESCE(y.so_luong_chot, y.so_luong_de_xuat), cn.ten, y.trang_thai
                    FROM yeu_cau y JOIN chi_nhanh cn ON cn.ma_cn = y.ma_cn AND NOT cn.gia_lap
                    WHERE y.ma_yc = ? FOR UPDATE OF y""",
                    rs -> new Object[]{rs.getString(1), rs.getString(2), rs.getInt(3), rs.getString(4), rs.getString(5)},
                    maYc);
            if (yc == null || !RequestService.THIEU_HANG.equals(yc[4])) {
                return null;
            }
            if (Db.one(c, "SELECT 1 FROM dieu_chuyen WHERE ma_yc = ? AND trang_thai = 'CHO'", rs -> 1, maYc) != null) {
                return null;
            }
            String denCn = (String) yc[0];
            String maSp = (String) yc[1];
            int need = (Integer) yc[2];
            List<Donor> donors = new ArrayList<>(Db.list(c, """
                    SELECT k.ma_cn, k.so_luong - 2 * k.nguong_toi_thieu
                    FROM kho_chi_nhanh k JOIN chi_nhanh cn ON cn.ma_cn = k.ma_cn AND NOT cn.gia_lap
                    WHERE k.ma_sp = ? AND k.ma_cn <> ? AND k.so_luong > 2 * k.nguong_toi_thieu
                      AND k.ma_cn NOT IN (SELECT tu_cn FROM dieu_chuyen WHERE ma_yc = ?)""",
                    rs -> new Donor(rs.getString(1), rs.getInt(2)), maSp, denCn, maYc));
            if (donors.isEmpty()) {
                return null;
            }
            donors.sort(Comparator.comparing((Donor d) -> !registry.isOnline(d.maCn))
                    .thenComparing(Donor::duThua, Comparator.reverseOrder()));
            Donor d = donors.get(0);
            int qty = Math.min(need, d.duThua);
            Integer id = Db.one(c, """
                    INSERT INTO dieu_chuyen (ma_yc, tu_cn, den_cn, ma_sp, so_luong) VALUES (?, ?, ?, ?, ?)
                    RETURNING ma_dc""", rs -> rs.getInt(1), maYc, d.maCn, denCn, maSp, qty);
            toSend[0] = Message.of(Command.TRANSFER_REQ, id, maSp, qty, yc[3]);
            donorCn[0] = d.maCn;
            return id;
        });
        if (maDc != null) {
            outbox.send(donorCn[0], toSend[0]);
            publish(maDc);
        }
    }

    private static Dc lockDc(Connection c, int maDc, String tuCn) throws SQLException {
        Dc dc = Db.one(c, """
                SELECT ma_dc, ma_yc, tu_cn, den_cn, ma_sp, so_luong, trang_thai
                FROM dieu_chuyen WHERE ma_dc = ? AND tu_cn = ? FOR UPDATE""",
                rs -> new Dc(rs.getInt(1), rs.getInt(2), rs.getString(3), rs.getString(4), rs.getString(5),
                        rs.getInt(6), rs.getString(7)), maDc, tuCn);
        if (dc == null) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay yeu cau dieu chuyen " + maDc);
        }
        return dc;
    }

    private static void setState(Connection c, int maDc, String state) throws SQLException {
        Db.update(c, "UPDATE dieu_chuyen SET trang_thai = ?, cap_nhat_luc = CURRENT_TIMESTAMP WHERE ma_dc = ?",
                state, maDc);
    }

    /** TRANSFER_ACCEPT: trừ kho CN nguồn, giao cho CN thiếu trong một transaction. */
    public Message accept(String tuCn, int maDc) throws SQLException {
        record Result(Message reply, Dc dc, boolean delivered, boolean retry) {
        }
        Result r = db.tx(c -> {
            // Khóa yeu_cau trước dieu_chuyen, cùng thứ tự với RequestService để tránh deadlock
            Integer maYc = Db.one(c, "SELECT ma_yc FROM dieu_chuyen WHERE ma_dc = ? AND tu_cn = ?",
                    rs -> rs.getInt(1), maDc, tuCn);
            if (maYc == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay yeu cau dieu chuyen " + maDc);
            }
            String ycState = Db.one(c, "SELECT trang_thai FROM yeu_cau WHERE ma_yc = ? FOR UPDATE",
                    rs -> rs.getString(1), maYc);
            Dc dc = lockDc(c, maDc, tuCn);
            if ("HOAN_TAT".equals(dc.trangThai)) {
                Integer con = Db.one(c, "SELECT so_luong FROM kho_chi_nhanh WHERE ma_cn = ? AND ma_sp = ?",
                        rs -> rs.getInt(1), tuCn, dc.maSp);
                return new Result(Message.of(Command.TRANSFER_DONE, maDc, dc.maSp, con == null ? 0 : con), dc, false, false);
            }
            if (!"CHO".equals(dc.trangThai)) {
                throw new ServiceException(ErrorCode.E03, "Yeu cau dieu chuyen " + maDc + " da " + dc.trangThai);
            }
            if (!RequestService.THIEU_HANG.equals(ycState)) {
                setState(c, maDc, "HUY");
                return new Result(Message.of(Command.ERROR, ErrorCode.E03.name(),
                        "Yeu cau dieu chuyen " + maDc + " da huy vi chi nhanh nhan da xu ly"), dc, false, false);
            }
            Integer con = Db.one(c, """
                    UPDATE kho_chi_nhanh SET so_luong = so_luong - ?
                    WHERE ma_cn = ? AND ma_sp = ? AND so_luong >= ?
                    RETURNING so_luong""", rs -> rs.getInt(1), dc.soLuong, tuCn, dc.maSp, dc.soLuong);
            if (con == null) {
                setState(c, maDc, "HUY");
                return new Result(Message.of(Command.ERROR, ErrorCode.E05.name(),
                        "Khong du ton de chuyen " + dc.soLuong + " " + dc.maSp), dc, false, true);
            }
            Db.update(c, """
                    UPDATE yeu_cau SET so_luong_chot = ?, so_luong_giao = ?, trang_thai = 'DA_GIAO',
                           cap_nhat_luc = CURRENT_TIMESTAMP
                    WHERE ma_yc = ?""", dc.soLuong, dc.soLuong, dc.maYc);
            setState(c, maDc, "HOAN_TAT");
            // Nợ đi theo hàng: chốt gia_xuat lúc hoàn tất rồi ghi DC_NHAN / DC_GIAO
            Db.update(c, "UPDATE dieu_chuyen SET don_gia = (SELECT gia_xuat FROM san_pham WHERE ma_sp = ?) WHERE ma_dc = ?",
                    dc.maSp, maDc);
            DebtService.recordTransfer(c, maDc);
            return new Result(Message.of(Command.TRANSFER_DONE, maDc, dc.maSp, con), dc, true, false);
        });
        if (r.delivered) {
            outbox.send(r.dc.denCn, Message.of(Command.DELIVERED, r.dc.maYc, r.dc.maSp, r.dc.soLuong));
            events.publish(Events.STOCK, Map.of("maCn", tuCn));
            debts.changed(r.dc.denCn);
            debts.changed(tuCn);
        }
        publish(maDc);
        if (r.retry) {
            tryStart(r.dc.maYc);
        }
        return r.reply;
    }

    /** TRANSFER_REJECT: thử CN kế tiếp. */
    public void reject(String tuCn, int maDc) throws SQLException {
        Dc dc = db.tx(c -> {
            Dc d = lockDc(c, maDc, tuCn);
            if ("TU_CHOI".equals(d.trangThai) || "HUY".equals(d.trangThai)) {
                return null;
            }
            if (!"CHO".equals(d.trangThai)) {
                throw new ServiceException(ErrorCode.E03, "Yeu cau dieu chuyen " + maDc + " da " + d.trangThai);
            }
            setState(c, maDc, "TU_CHOI");
            return d;
        });
        if (dc != null) {
            publish(maDc);
            tryStart(dc.maYc);
        }
    }

    public List<Message> resync(String maCn) throws SQLException {
        return db.read(c -> Db.list(c, """
                SELECT dc.ma_dc, dc.ma_sp, dc.so_luong, cn.ten
                FROM dieu_chuyen dc JOIN chi_nhanh cn ON cn.ma_cn = dc.den_cn
                WHERE dc.tu_cn = ? AND dc.trang_thai = 'CHO' ORDER BY dc.ma_dc""",
                rs -> Message.of(Command.TRANSFER_REQ, rs.getInt(1), rs.getString(2), rs.getInt(3), rs.getString(4)),
                maCn));
    }

    private static final String LIST_SQL = """
            SELECT dc.ma_dc, dc.ma_yc, dc.tu_cn, a.ten AS ten_tu_cn, dc.den_cn, b.ten AS ten_den_cn,
                   dc.ma_sp, sp.ten AS ten_sp, dc.so_luong, dc.trang_thai, dc.tao_luc, dc.cap_nhat_luc
            FROM dieu_chuyen dc
            JOIN chi_nhanh a ON a.ma_cn = dc.tu_cn
            JOIN chi_nhanh b ON b.ma_cn = dc.den_cn
            JOIN san_pham sp ON sp.ma_sp = dc.ma_sp""";

    public List<Map<String, Object>> list() throws SQLException {
        return db.read(c -> Db.rows(c, LIST_SQL + " ORDER BY dc.ma_dc DESC LIMIT 200"));
    }

    private void publish(int maDc) throws SQLException {
        Map<String, Object> row = db.read(c -> Db.one(c, LIST_SQL + " WHERE dc.ma_dc = ?", Db::toMap, maDc));
        if (row != null) {
            events.publish(Events.TRANSFER, row);
        }
    }
}
