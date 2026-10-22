package phanphoi.server.service;

import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.Message;
import phanphoi.server.Events;
import phanphoi.server.ServerSettings;
import phanphoi.server.ServerSettings.AcceptStrategy;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Vòng đời yêu cầu cấp hàng (SRS 6.2):
 * CHO → DA_DE_XUAT → DA_GIAO → HOAN_TAT, rẽ nhánh TU_CHOI và THIEU_HANG.
 */
public final class RequestService {

    public static final String CHO = "CHO";
    public static final String DA_DE_XUAT = "DA_DE_XUAT";
    public static final String DA_GIAO = "DA_GIAO";
    public static final String HOAN_TAT = "HOAN_TAT";
    public static final String TU_CHOI = "TU_CHOI";
    public static final String THIEU_HANG = "THIEU_HANG";

    private record Yc(int maYc, String maCn, String maSp, Integer deXuat, Integer chot, Integer giao, String trangThai) {
    }

    private final Db db;
    private final Outbox outbox;
    private final Events events;
    private final TransferService transfers;
    private final DebtService debts;
    private final ServerSettings settings;

    public RequestService(Db db, Outbox outbox, Events events, TransferService transfers, DebtService debts,
                          ServerSettings settings) {
        this.db = db;
        this.outbox = outbox;
        this.events = events;
        this.transfers = transfers;
        this.debts = debts;
        this.settings = settings;
    }

    /** Ghi phiếu xuất, chốt đơn giá = gia_xuat hiện tại (đổi giá sau đó không làm đổi nợ của YC này). */
    private static void insertPhieuXuat(Connection c, int maYc, String maCn, String maSp, int soLuong) throws SQLException {
        Db.update(c, """
                INSERT INTO phieu_xuat (ma_yc, ma_cn, ma_sp, so_luong, don_gia)
                SELECT ?, ?, ?, ?, gia_xuat FROM san_pham WHERE ma_sp = ?""", maYc, maCn, maSp, soLuong, maSp);
    }

    private static Yc lockYc(Connection c, int maYc, String maCn) throws SQLException {
        // Lọc theo mã CN của phiên: CN A gửi mã YC của CN B → E04 (NFR-07)
        Yc yc = Db.one(c, """
                SELECT ma_yc, ma_cn, ma_sp, so_luong_de_xuat, so_luong_chot, so_luong_giao, trang_thai
                FROM yeu_cau WHERE ma_yc = ? AND ma_cn = ? FOR UPDATE""",
                rs -> new Yc(rs.getInt(1), rs.getString(2), rs.getString(3), (Integer) rs.getObject(4),
                        (Integer) rs.getObject(5), (Integer) rs.getObject(6), rs.getString(7)), maYc, maCn);
        if (yc == null) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay yeu cau " + maYc);
        }
        return yc;
    }

    private static void setState(Connection c, int maYc, String state) throws SQLException {
        Db.update(c, "UPDATE yeu_cau SET trang_thai = ?, cap_nhat_luc = CURRENT_TIMESTAMP WHERE ma_yc = ?", state, maYc);
    }

    // ================= lệnh từ chi nhánh =================

    /**
     * LOW_STOCK (FR-13..15). Server chống trùng bằng chỉ mục UNIQUE uq_yeu_cau_dang_mo (FR-14):
     * cặp (CN, SP) đã có YC chưa đóng thì bỏ qua.
     */
    public void lowStock(String maCn, String maSp, int soLuongCon, int nguong) throws SQLException {
        Map<String, Object> alert = db.tx(c -> {
            StockService.requireProduct(c, maSp);
            int[] stock = Db.one(c, "SELECT so_luong, nguong_toi_thieu FROM kho_chi_nhanh WHERE ma_cn = ? AND ma_sp = ?",
                    rs -> new int[]{rs.getInt(1), rs.getInt(2)}, maCn, maSp);
            int con = stock == null ? 0 : stock[0];
            int ng = stock == null ? 0 : stock[1];
            if (con >= ng) {
                throw new ServiceException(ErrorCode.E03,
                        "Ton " + maSp + " (" + con + ") chua duoi nguong (" + ng + ")");
            }
            Integer maYc = Db.one(c, """
                    INSERT INTO yeu_cau (ma_cn, ma_sp) VALUES (?, ?)
                    ON CONFLICT (ma_cn, ma_sp) WHERE trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI') DO NOTHING
                    RETURNING ma_yc""", rs -> rs.getInt(1), maCn, maSp);
            if (maYc == null) {
                return null;
            }
            return Db.one(c, ALERT_SQL + " WHERE y.ma_yc = ?", Db::toMap, maYc);
        });
        if (alert != null) {
            events.publish(Events.ALERT, alert);
        }
    }

    /**
     * YC từ phản hồi thông báo (Cần hàng / Muốn nhập), trong transaction của người gọi. Dùng chung chỉ mục
     * uq_yeu_cau_dang_mo với LOW_STOCK: (CN, SP) đã có YC mở thì trả mã YC đó, ghi số xin nếu YC còn CHO.
     * @return {maYc, 1 nếu vừa tạo YC mới / 0 nếu dùng YC đang mở}
     */
    static int[] openFromNotice(Connection c, String maCn, String maSp, int soLuong) throws SQLException {
        Integer maYc = Db.one(c, """
                INSERT INTO yeu_cau (ma_cn, ma_sp, so_luong_xin) VALUES (?, ?, ?)
                ON CONFLICT (ma_cn, ma_sp) WHERE trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI') DO NOTHING
                RETURNING ma_yc""", rs -> rs.getInt(1), maCn, maSp, soLuong);
        if (maYc != null) {
            return new int[]{maYc, 1};
        }
        Integer open = Db.one(c, """
                SELECT ma_yc FROM yeu_cau WHERE ma_cn = ? AND ma_sp = ? AND trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI')
                FOR UPDATE""", rs -> rs.getInt(1), maCn, maSp);
        if (open == null) {
            // YC đang mở vừa đóng (Đã nhận / Từ chối) giữa INSERT và SELECT: CN bấm lại là tạo được YC mới
            throw new ServiceException(ErrorCode.E03, "Yeu cau " + maSp + " vua dong, hay tra loi lai");
        }
        Db.update(c, "UPDATE yeu_cau SET so_luong_xin = ?, cap_nhat_luc = CURRENT_TIMESTAMP WHERE ma_yc = ? AND trang_thai = 'CHO'",
                soLuong, open);
        return new int[]{open, 0};
    }

    /** Đẩy cảnh báo mới (như LOW_STOCK) hoặc cập nhật YC lên trang admin sau khi transaction đã commit. */
    void publishOpened(int maYc, boolean created) throws SQLException {
        Map<String, Object> row = db.read(c -> Db.one(c, ALERT_SQL + " WHERE y.ma_yc = ?", Db::toMap, maYc));
        if (row != null) {
            events.publish(created ? Events.ALERT : Events.REQUEST, row);
        }
    }

    /** Khóa Java dùng cho baseline SYNCHRONIZED: giữ suốt transaction để đúng, nhưng tuần tự hóa mọi ACCEPT. */
    private static final Object CENTRAL_LOCK = new Object();

    /** ACCEPT theo transaction SRS 6.3; ACCEPT lặp lại không trừ kho lần hai (FR-18). */
    public List<Message> accept(String maCn, int maYc, int soLuong) throws SQLException {
        if (settings.acceptStrategy == AcceptStrategy.SYNCHRONIZED) {
            synchronized (CENTRAL_LOCK) {
                return acceptTx(maCn, maYc, soLuong);
            }
        }
        return acceptTx(maCn, maYc, soLuong);
    }

    /**
     * Trừ kho tổng theo chiến lược đang chọn (thực nghiệm E1).
     * CONDITIONAL: một câu UPDATE có điều kiện, CSDL tự khóa dòng → không bao giờ bán vượt.
     * CHECK_THEN_ACT / SYNCHRONIZED: đọc tồn rồi ghi giá trị tính trong Java. Không có khóa bao quanh
     * thì hai transaction cùng đọc 10, cùng ghi 2 → mất một lần trừ (lost update), xuất 16 từ kho 10.
     */
    private boolean takeFromCentral(Connection c, String maSp, int soLuong) throws SQLException {
        if (settings.acceptStrategy == AcceptStrategy.CONDITIONAL) {
            return Db.update(c, "UPDATE kho_tong SET so_luong = so_luong - ? WHERE ma_sp = ? AND so_luong >= ?",
                    soLuong, maSp, soLuong) == 1;
        }
        Integer have = Db.one(c, "SELECT so_luong FROM kho_tong WHERE ma_sp = ?", rs -> rs.getInt(1), maSp);
        if (have == null || have < soLuong) {
            return false;
        }
        Db.update(c, "UPDATE kho_tong SET so_luong = ? WHERE ma_sp = ?", have - soLuong, maSp);
        return true;
    }

    private List<Message> acceptTx(String maCn, int maYc, int soLuong) throws SQLException {
        List<Message> replies = new ArrayList<>();
        boolean[] shortage = {false};
        db.tx(c -> {
            Yc yc = lockYc(c, maYc, maCn);
            switch (yc.trangThai) {
                case DA_GIAO, HOAN_TAT -> {
                    // idempotent: trả lại kết quả cũ, không trừ kho
                    replies.add(Message.of(Command.DELIVERED, yc.maYc, yc.maSp, yc.giao));
                    return null;
                }
                case DA_DE_XUAT, THIEU_HANG -> { }
                default -> throw new ServiceException(ErrorCode.E03,
                        "Yeu cau " + maYc + " dang o trang thai " + yc.trangThai + ", khong the ACCEPT");
            }
            if (soLuong <= 0) {
                throw new ServiceException(ErrorCode.E05, "So luong chap nhan phai > 0");
            }
            Db.update(c, "UPDATE yeu_cau SET so_luong_chot = ? WHERE ma_yc = ?", soLuong, maYc);
            // Mặc định là UPDATE có điều kiện, chống tranh chấp giữa nhiều ClientHandler (NFR-03)
            if (!takeFromCentral(c, yc.maSp, soLuong)) {
                Integer coThe = Db.one(c, "SELECT so_luong FROM kho_tong WHERE ma_sp = ?", rs -> rs.getInt(1), yc.maSp);
                setState(c, maYc, THIEU_HANG);
                replies.add(Message.of(Command.OUT_OF_STOCK, maYc, coThe == null ? 0 : coThe, yc.maSp));
                shortage[0] = true;
                return null;
            }
            insertPhieuXuat(c, maYc, maCn, yc.maSp, soLuong);
            Db.update(c, """
                    UPDATE yeu_cau SET so_luong_giao = ?, trang_thai = 'DA_GIAO', cap_nhat_luc = CURRENT_TIMESTAMP
                    WHERE ma_yc = ?""", soLuong, maYc);
            TransferService.cancelPending(c, maYc);
            replies.add(Message.of(Command.DELIVERED, maYc, yc.maSp, soLuong));
            return null;
        });
        publishRequest(maYc);
        events.publish(Events.PRODUCTS, null);
        if (shortage[0]) {
            transfers.tryStart(maYc);
        }
        return replies;
    }

    /** REJECT (FR-17, FR-19). Không có tin trả lời khi thành công. */
    public void reject(String maCn, int maYc) throws SQLException {
        boolean changed = db.tx(c -> {
            Yc yc = lockYc(c, maYc, maCn);
            switch (yc.trangThai) {
                case TU_CHOI -> {
                    return false;
                }
                case DA_DE_XUAT, THIEU_HANG -> {
                    setState(c, maYc, TU_CHOI);
                    TransferService.cancelPending(c, maYc);
                    return true;
                }
                default -> throw new ServiceException(ErrorCode.E03,
                        "Yeu cau " + maYc + " dang o trang thai " + yc.trangThai + ", khong the REJECT");
            }
        });
        if (changed) {
            publishRequest(maYc);
        }
    }

    /**
     * RECEIVED (FR-20): cộng kho CN, đóng YC và ghi nợ XUAT trong cùng transaction.
     * @return true nếu kho CN vừa thay đổi.
     */
    public boolean received(String maCn, int maYc) throws SQLException {
        boolean changed = db.tx(c -> {
            Yc yc = lockYc(c, maYc, maCn);
            switch (yc.trangThai) {
                case HOAN_TAT -> {
                    return false;
                }
                case DA_GIAO -> {
                    Db.update(c, """
                            INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu) VALUES (?, ?, ?, 0)
                            ON CONFLICT (ma_cn, ma_sp) DO UPDATE SET so_luong = kho_chi_nhanh.so_luong + EXCLUDED.so_luong""",
                            maCn, yc.maSp, yc.giao);
                    setState(c, maYc, HOAN_TAT);
                    DebtService.recordDelivery(c, maYc);
                    return true;
                }
                default -> throw new ServiceException(ErrorCode.E03,
                        "Yeu cau " + maYc + " chua duoc giao (trang thai " + yc.trangThai + ")");
            }
        });
        if (changed) {
            publishRequest(maYc);
            events.publish(Events.STOCK, Map.of("maCn", maCn));
            debts.changed(maCn);
        }
        return changed;
    }

    // ================= thao tác admin =================

    /** FR-16: gửi OFFER với số lượng đề xuất tới đúng CN. Gửi lại khi đang DA_DE_XUAT để đổi số. */
    public void offer(int maYc, int soLuong) throws SQLException {
        if (soLuong <= 0) {
            throw new ServiceException(ErrorCode.E05, "So luong de xuat phai > 0");
        }
        String[] target = db.tx(c -> {
            String[] row = Db.one(c, "SELECT ma_cn, ma_sp, trang_thai FROM yeu_cau WHERE ma_yc = ? FOR UPDATE",
                    rs -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}, maYc);
            if (row == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay yeu cau " + maYc);
            }
            if (!CHO.equals(row[2]) && !DA_DE_XUAT.equals(row[2])) {
                throw new ServiceException(ErrorCode.E03, "Yeu cau dang o trang thai " + row[2] + ", khong the de xuat");
            }
            Db.update(c, """
                    UPDATE yeu_cau SET so_luong_de_xuat = ?, trang_thai = 'DA_DE_XUAT', cap_nhat_luc = CURRENT_TIMESTAMP
                    WHERE ma_yc = ?""", soLuong, maYc);
            return row;
        });
        outbox.send(target[0], Message.of(Command.OFFER, maYc, target[1], soLuong));
        publishRequest(maYc);
    }

    /**
     * Admin gửi hàng thẳng (không chờ CN ACCEPT): xuất kho tổng, YC → DA_GIAO ("đã gửi"), đẩy DELIVERED tới CN.
     * CN offline thì DELIVERED nằm trong hàng đợi và được gửi lại sau LOGIN_OK như mọi tin trạng thái.
     */
    public void ship(int maYc, int soLuong) throws SQLException {
        if (settings.acceptStrategy == AcceptStrategy.SYNCHRONIZED) {
            synchronized (CENTRAL_LOCK) {
                shipTx(maYc, soLuong);
            }
        } else {
            shipTx(maYc, soLuong);
        }
    }

    private static final Set<String> SHIPPABLE = Set.of(CHO, DA_DE_XUAT, THIEU_HANG);

    private void shipTx(int maYc, int soLuong) throws SQLException {
        if (soLuong <= 0) {
            throw new ServiceException(ErrorCode.E05, "So luong gui phai > 0");
        }
        String[] target = db.tx(c -> {
            String[] row = lockForAdmin(c, maYc);
            if (!SHIPPABLE.contains(row[2])) {
                throw new ServiceException(ErrorCode.E03, "Yeu cau dang o trang thai " + row[2] + ", khong the gui hang");
            }
            if (!shipLocked(c, maYc, row[0], row[1], soLuong)) {
                throw new ServiceException(ErrorCode.E05, "Kho tong chi con " + centralStock(c, row[1]) + " "
                        + row[1] + ", khong du gui " + soLuong + ". Hay bao het hang hoac nhap them kho");
            }
            return row;
        });
        afterShip(target[0], maYc, target[1], soLuong);
    }

    /** Xuất kho tổng cho YC đã khóa dòng, YC → DA_GIAO. @return false nếu kho tổng không đủ (chưa đổi gì). */
    private boolean shipLocked(Connection c, int maYc, String maCn, String maSp, int soLuong) throws SQLException {
        if (!takeFromCentral(c, maSp, soLuong)) {
            return false;
        }
        insertPhieuXuat(c, maYc, maCn, maSp, soLuong);
        Db.update(c, """
                UPDATE yeu_cau SET so_luong_de_xuat = COALESCE(so_luong_de_xuat, ?), so_luong_chot = ?,
                    so_luong_giao = ?, trang_thai = 'DA_GIAO', cap_nhat_luc = CURRENT_TIMESTAMP
                WHERE ma_yc = ?""", soLuong, soLuong, soLuong, maYc);
        TransferService.cancelPending(c, maYc);
        return true;
    }

    private static int centralStock(Connection c, String maSp) throws SQLException {
        Integer coThe = Db.one(c, "SELECT so_luong FROM kho_tong WHERE ma_sp = ?", rs -> rs.getInt(1), maSp);
        return coThe == null ? 0 : coThe;
    }

    private void afterShip(String maCn, int maYc, String maSp, int soLuong) throws SQLException {
        outbox.send(maCn, Message.of(Command.DELIVERED, maYc, maSp, soLuong));
        publishRequest(maYc);
        events.publish(Events.PRODUCTS, null);
    }

    /**
     * Admin bổ sung chủ động từ trang Kho chi nhánh: chưa có YC mở cho (CN, SP) thì tạo YC rồi gửi hàng luôn
     * trong cùng transaction; có YC CHO/DA_DE_XUAT thì gửi hàng cho YC đó. Chi nhánh vẫn bấm Đã nhận như luồng
     * Gửi thẳng, giao thức không đổi. LOW_STOCK đến cùng lúc cũng đi qua uq_yeu_cau_dang_mo và khóa dòng YC,
     * nên chỉ một YC được gửi hàng.
     * @return mã YC đã gửi hàng.
     */
    public int replenish(String maCn, String maSp, int soLuong) throws SQLException {
        if (settings.acceptStrategy == AcceptStrategy.SYNCHRONIZED) {
            synchronized (CENTRAL_LOCK) {
                return replenishTx(maCn, maSp, soLuong);
            }
        }
        return replenishTx(maCn, maSp, soLuong);
    }

    private int replenishTx(String maCn, String maSp, int soLuong) throws SQLException {
        if (soLuong <= 0) {
            throw new ServiceException(ErrorCode.E05, "So luong bo sung phai > 0");
        }
        int maYc = db.tx(c -> {
            if (Db.one(c, "SELECT 1 FROM chi_nhanh WHERE ma_cn = ? AND NOT gia_lap", rs -> 1, maCn) == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay chi nhanh " + maCn);
            }
            StockService.requireProduct(c, maSp);
            String findOpen = """
                    SELECT ma_yc, trang_thai FROM yeu_cau
                    WHERE ma_cn = ? AND ma_sp = ? AND trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI') FOR UPDATE""";
            Object[] open = Db.one(c, findOpen, rs -> new Object[]{rs.getInt(1), rs.getString(2)}, maCn, maSp);
            if (open == null) {
                Integer id = Db.one(c, """
                        INSERT INTO yeu_cau (ma_cn, ma_sp) VALUES (?, ?)
                        ON CONFLICT (ma_cn, ma_sp) WHERE trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI') DO NOTHING
                        RETURNING ma_yc""", rs -> rs.getInt(1), maCn, maSp);
                // LOW_STOCK vừa chen vào giữa: dùng YC của nó
                open = id != null ? new Object[]{id, CHO}
                        : Db.one(c, findOpen, rs -> new Object[]{rs.getInt(1), rs.getString(2)}, maCn, maSp);
                if (open == null) {
                    throw new ServiceException(ErrorCode.E03, "Yeu cau vua thay doi, thu lai");
                }
            }
            int id = (Integer) open[0];
            String st = (String) open[1];
            if (!CHO.equals(st) && !DA_DE_XUAT.equals(st)) {
                throw new ServiceException(ErrorCode.E03, "Da co YC" + id + " dang giao (" + st + ")");
            }
            if (!shipLocked(c, id, maCn, maSp, soLuong)) {
                // rollback: YC vừa tạo (nếu có) cũng không còn
                throw new ServiceException(ErrorCode.E03, "Kho tong chi con " + centralStock(c, maSp) + " "
                        + maSp + ", khong du bo sung " + soLuong);
            }
            return id;
        });
        afterShip(maCn, maYc, maSp, soLuong);
        return maYc;
    }

    /**
     * Admin báo kho tổng không đủ cho YC: YC → THIEU_HANG, đẩy OUT_OF_STOCK kèm số kho tổng còn lại.
     * CN có thể nhận số còn lại (ACCEPT), từ chối, hoặc chờ server tìm CN khác điều chuyển (7.2-B).
     */
    public void reportShortage(int maYc, int soLuongCan) throws SQLException {
        if (soLuongCan <= 0) {
            throw new ServiceException(ErrorCode.E05, "So luong can phai > 0");
        }
        Object[] target = db.tx(c -> {
            String[] row = lockForAdmin(c, maYc);
            if (!CHO.equals(row[2]) && !DA_DE_XUAT.equals(row[2])) {
                throw new ServiceException(ErrorCode.E03, "Yeu cau dang o trang thai " + row[2] + ", khong the bao thieu");
            }
            Db.update(c, """
                    UPDATE yeu_cau SET so_luong_de_xuat = ?, trang_thai = 'THIEU_HANG', cap_nhat_luc = CURRENT_TIMESTAMP
                    WHERE ma_yc = ?""", soLuongCan, maYc);
            Integer coThe = Db.one(c, "SELECT so_luong FROM kho_tong WHERE ma_sp = ?", rs -> rs.getInt(1), row[1]);
            return new Object[]{row[0], row[1], coThe == null ? 0 : coThe};
        });
        outbox.send((String) target[0], Message.of(Command.OUT_OF_STOCK, maYc, target[2], target[1]));
        publishRequest(maYc);
        transfers.tryStart(maYc);
    }

    /** @return {ma_cn, ma_sp, trang_thai} của YC đã khóa dòng. */
    private static String[] lockForAdmin(Connection c, int maYc) throws SQLException {
        String[] row = Db.one(c, "SELECT ma_cn, ma_sp, trang_thai FROM yeu_cau WHERE ma_yc = ? FOR UPDATE",
                rs -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}, maYc);
        if (row == null) {
            throw new ServiceException(ErrorCode.E04, "Khong tim thay yeu cau " + maYc);
        }
        return row;
    }

    private static final String ALERT_SQL = """
            SELECT y.ma_yc, y.ma_cn, cn.ten AS ten_cn, y.ma_sp, sp.ten AS ten_sp,
                   COALESCE(k.so_luong, 0) AS so_luong_con, COALESCE(k.nguong_toi_thieu, 0) AS nguong,
                   COALESCE(k.nguong_toi_thieu, 0) - COALESCE(k.so_luong, 0) AS muc_thieu,
                   COALESCE(y.so_luong_xin,
                            GREATEST(2 * COALESCE(k.nguong_toi_thieu, 0) - COALESCE(k.so_luong, 0), 1)) AS goi_y,
                   COALESCE(kt.so_luong, 0) AS ton_tong, sp.gia_xuat, y.so_luong_xin,
                   y.so_luong_de_xuat, y.so_luong_chot, y.so_luong_giao, y.trang_thai, y.tao_luc, y.cap_nhat_luc
            FROM yeu_cau y
            JOIN chi_nhanh cn ON cn.ma_cn = y.ma_cn
            JOIN san_pham sp ON sp.ma_sp = y.ma_sp
            LEFT JOIN kho_chi_nhanh k ON k.ma_cn = y.ma_cn AND k.ma_sp = y.ma_sp
            LEFT JOIN kho_tong kt ON kt.ma_sp = y.ma_sp""";

    /** FR-15: cảnh báo chờ xử lý, sắp theo mức thiếu giảm dần. */
    public List<Map<String, Object>> pendingAlerts() throws SQLException {
        return db.read(c -> Db.rows(c, ALERT_SQL + """
                 WHERE y.trang_thai = 'CHO'
                ORDER BY muc_thieu DESC, y.tao_luc"""));
    }

    /** FR-23: lọc theo CN, SP, trạng thái, khoảng thời gian. */
    public List<Map<String, Object>> search(String maCn, String maSp, String trangThai, String tu, String den)
            throws SQLException {
        Timestamp from = Timestamp.valueOf((tu.isEmpty() ? LocalDate.of(1970, 1, 1) : LocalDate.parse(tu)).atStartOfDay());
        Timestamp to = Timestamp.valueOf((den.isEmpty() ? LocalDate.of(9998, 1, 1) : LocalDate.parse(den)).plusDays(1).atStartOfDay());
        return db.read(c -> Db.rows(c, ALERT_SQL + """
                 WHERE (? = '' OR y.ma_cn = ?) AND (? = '' OR y.ma_sp = ?) AND (? = '' OR y.trang_thai = ?)
                  AND y.tao_luc >= ? AND y.tao_luc < ?
                ORDER BY y.ma_yc DESC LIMIT 500""",
                maCn, maCn, maSp, maSp, trangThai, trangThai, from, to));
    }

    private void publishRequest(int maYc) throws SQLException {
        Map<String, Object> row = db.read(c -> Db.one(c, ALERT_SQL + " WHERE y.ma_yc = ?", Db::toMap, maYc));
        if (row != null) {
            events.publish(Events.REQUEST, row);
        }
    }

    /** Trạng thái các YC còn mở, gửi lại sau LOGIN_OK (FR-21, NFR-04). */
    public List<Message> resync(String maCn) throws SQLException {
        return db.read(c -> {
            List<Message> out = new ArrayList<>();
            List<Object[]> rows = Db.list(c, """
                    SELECT y.ma_yc, y.ma_sp, y.so_luong_de_xuat, y.so_luong_giao, y.trang_thai, COALESCE(kt.so_luong, 0)
                    FROM yeu_cau y LEFT JOIN kho_tong kt ON kt.ma_sp = y.ma_sp
                    WHERE y.ma_cn = ? AND y.trang_thai IN ('DA_DE_XUAT', 'THIEU_HANG', 'DA_GIAO')
                    ORDER BY y.ma_yc""",
                    rs -> new Object[]{rs.getInt(1), rs.getString(2), rs.getObject(3), rs.getObject(4),
                            rs.getString(5), rs.getInt(6)}, maCn);
            for (Object[] r : rows) {
                String state = (String) r[4];
                if (DA_GIAO.equals(state)) {
                    out.add(Message.of(Command.DELIVERED, r[0], r[1], r[3]));
                } else {
                    out.add(Message.of(Command.OFFER, r[0], r[1], r[2]));
                    if (THIEU_HANG.equals(state)) {
                        out.add(Message.of(Command.OUT_OF_STOCK, r[0], r[5], r[1]));
                    }
                }
            }
            return out;
        });
    }
}
