package phanphoi.server.service;

import phanphoi.common.Command;
import phanphoi.common.ErrorCode;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Thông báo có phản hồi: TIN (tin thường), HOI_NHU_CAU (hỏi CN sắp chạm ngưỡng có cần hàng),
 * SP_MOI (giới thiệu sản phẩm mới). Gửi tới tất cả hoặc một vài chi nhánh thật.
 *
 * <p>NOTICE mang trạng thái mới nhất, CN ghi đè theo id: server gửi lại NOTICE sau mỗi NOTICE_REPLY
 * và sau LOGIN_OK (thông báo 30 ngày gần nhất), nên CN offline hay cài lại vẫn có đủ hộp thư.
 * "Cần hàng" / "Muốn nhập" tạo YC CHO; admin duyệt bằng luồng Gửi hàng có sẵn.
 */
public final class NoticeService {

    public static final String TIN = "TIN";
    public static final String HOI_NHU_CAU = "HOI_NHU_CAU";
    public static final String SP_MOI = "SP_MOI";

    public static final String DA_GUI = "DA_GUI";
    public static final String XEM = "XEM";
    public static final String DA_XEM = "DA_XEM";
    public static final String CAN_HANG = "CAN_HANG";
    public static final String KHONG_CAN = "KHONG_CAN";
    public static final String MUON_NHAP = "MUON_NHAP";
    public static final String BO_QUA = "BO_QUA";

    static final int MAX_TITLE = 150;
    static final int MAX_BODY = 1500;
    /** Ngưỡng mặc định cho dòng kho chi nhánh tạo khi nhận hàng mới (như seed.sql). */
    static final int NEW_ITEM_THRESHOLD = 3;
    /** Trần số lượng CN xin trong một lần trả lời (số này điền sẵn cho admin khi Gửi hàng). */
    public static final int MAX_REPLY_QUANTITY = 1000;

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** Gửi tới một chi nhánh, deXuat riêng (null = dùng số đề xuất chung). */
    public record Target(String maCn, Integer deXuat) {
    }

    private final Db db;
    private final Outbox outbox;
    private final Events events;
    private final RequestService requests;

    public NoticeService(Db db, Outbox outbox, Events events, RequestService requests) {
        this.db = db;
        this.outbox = outbox;
        this.events = events;
        this.requests = requests;
    }

    // ================= quy tắc (thuần, có test) =================

    static boolean validType(String loai) {
        return TIN.equals(loai) || HOI_NHU_CAU.equals(loai) || SP_MOI.equals(loai);
    }

    /** Câu trả lời hợp lệ cho từng loại thông báo; XEM hợp lệ với mọi loại. */
    static Set<String> repliesFor(String loai) {
        return switch (loai) {
            case HOI_NHU_CAU -> Set.of(XEM, CAN_HANG, KHONG_CAN);
            case SP_MOI -> Set.of(XEM, MUON_NHAP, BO_QUA);
            default -> Set.of(XEM);
        };
    }

    static boolean needsQuantity(String traLoi) {
        return CAN_HANG.equals(traLoi) || MUON_NHAP.equals(traLoi);
    }

    /** Đã trả lời xong (không đổi được nữa). */
    static boolean answered(String trangThai) {
        return !DA_GUI.equals(trangThai) && !DA_XEM.equals(trangThai);
    }

    /** Số đề xuất bổ sung giống trang Kho chi nhánh: max(2 × ngưỡng − tồn, 1). */
    static int suggestQuantity(int soLuong, int nguong) {
        return Math.max(2 * nguong - soLuong, 1);
    }

    // ================= admin =================

    /**
     * Tạo thông báo và gửi ngay tới CN online (CN offline: hàng đợi + gửi lại sau LOGIN_OK).
     * @param targets null = mọi chi nhánh thật
     * @return {id, tong, guiNgay}
     */
    public Map<String, Object> create(String loai, String tieuDe, String noiDung, String maSp, Integer soLuongDeXuat,
                                      List<Target> targets) throws SQLException {
        if (!validType(loai)) {
            throw new ServiceException(ErrorCode.E01, "Loai thong bao khong hop le: " + loai);
        }
        String title = tieuDe == null ? "" : tieuDe.strip();
        String body = noiDung == null ? "" : noiDung.strip();
        if (title.isEmpty() || title.length() > MAX_TITLE) {
            throw new ServiceException(ErrorCode.E01, "Tieu de phai co 1.." + MAX_TITLE + " ky tu");
        }
        if (body.length() > MAX_BODY || !fitsLine(title, body)) {
            throw new ServiceException(ErrorCode.E01, "Noi dung qua dai (toi da " + MAX_BODY
                    + " ky tu va mot dong tin " + Protocol.MAX_LINE_BYTES + " byte)");
        }
        String sp = maSp == null || maSp.isBlank() || TIN.equals(loai) ? null : maSp.strip();
        if (!TIN.equals(loai) && sp == null) {
            throw new ServiceException(ErrorCode.E01, "Thong bao " + loai + " can ma hang");
        }
        if (soLuongDeXuat != null && soLuongDeXuat <= 0) {
            throw new ServiceException(ErrorCode.E05, "So luong de xuat phai > 0");
        }
        if (targets != null && targets.isEmpty()) {
            throw new ServiceException(ErrorCode.E01, "Chua chon chi nhanh nhan");
        }

        record Created(long id, List<String> branches) {
        }
        Created created = db.tx(c -> {
            if (sp != null) {
                StockService.requireProduct(c, sp);
            }
            List<String> real = Db.list(c, "SELECT ma_cn FROM chi_nhanh WHERE NOT gia_lap ORDER BY ma_cn",
                    rs -> rs.getString(1));
            List<Target> to = targets == null ? real.stream().map(cn -> new Target(cn, null)).toList() : targets;
            for (Target t : to) {
                if (!real.contains(t.maCn())) {
                    throw new ServiceException(ErrorCode.E04, "Khong tim thay chi nhanh " + t.maCn());
                }
                if (t.deXuat() != null && t.deXuat() <= 0) {
                    throw new ServiceException(ErrorCode.E05, "So luong de xuat cho " + t.maCn() + " phai > 0");
                }
            }
            long id = Db.one(c, """
                    INSERT INTO thong_bao (loai, tieu_de, noi_dung, ma_sp, so_luong_de_xuat)
                    VALUES (?, ?, ?, ?, ?) RETURNING id""", rs -> rs.getLong(1), loai, title, body, sp, soLuongDeXuat);
            List<String> sent = new ArrayList<>();
            for (Target t : to) {
                if (sent.contains(t.maCn())) {
                    continue;
                }
                Db.update(c, "INSERT INTO thong_bao_cn (id_tb, ma_cn, de_xuat) VALUES (?, ?, ?)",
                        id, t.maCn(), t.deXuat() != null ? t.deXuat() : soLuongDeXuat);
                sent.add(t.maCn());
            }
            return new Created(id, sent);
        });

        int now = 0;
        for (String cn : created.branches()) {
            Message m = message(created.id(), cn);
            if (m != null && outbox.send(cn, m)) {
                now++;
            }
        }
        events.publish(Events.NOTICE, Map.of("id", created.id()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", created.id());
        out.put("tong", created.branches().size());
        out.put("guiNgay", now);
        return out;
    }

    private static final String STATS_SQL = """
            SELECT tb.id, tb.loai, tb.tieu_de, tb.noi_dung, tb.ma_sp, sp.ten AS ten_sp, sp.anh_url,
                   tb.so_luong_de_xuat, tb.tao_luc,
                   count(*) AS tong,
                   count(*) FILTER (WHERE x.trang_thai <> 'DA_GUI') AS da_xem,
                   count(*) FILTER (WHERE x.trang_thai IN ('CAN_HANG', 'MUON_NHAP')) AS dong_y,
                   count(*) FILTER (WHERE x.trang_thai IN ('KHONG_CAN', 'BO_QUA')) AS tu_choi,
                   COALESCE(sum(x.so_luong), 0) AS tong_so_luong
            FROM thong_bao tb
            JOIN thong_bao_cn x ON x.id_tb = tb.id
            LEFT JOIN san_pham sp ON sp.ma_sp = tb.ma_sp""";

    /** Lịch sử thông báo kèm thống kê phản hồi, mới nhất trước. */
    public List<Map<String, Object>> list(int limit) throws SQLException {
        return db.read(c -> Db.rows(c, STATS_SQL + " GROUP BY tb.id, sp.ma_sp ORDER BY tb.id DESC LIMIT ?", limit));
    }

    /** Một thông báo và phản hồi của từng chi nhánh. */
    public Map<String, Object> detail(long id) throws SQLException {
        return db.read(c -> {
            Map<String, Object> head = Db.one(c, STATS_SQL + " WHERE tb.id = ? GROUP BY tb.id, sp.ma_sp", Db::toMap, id);
            if (head == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay thong bao " + id);
            }
            head.put("chiNhanh", Db.rows(c, """
                    SELECT x.ma_cn, cn.ten AS ten_cn, x.trang_thai, x.de_xuat, x.so_luong, x.ma_yc,
                           y.trang_thai AS yc_trang_thai, x.xem_luc, x.tra_loi_luc
                    FROM thong_bao_cn x
                    JOIN chi_nhanh cn ON cn.ma_cn = x.ma_cn
                    LEFT JOIN yeu_cau y ON y.ma_yc = x.ma_yc
                    WHERE x.id_tb = ? ORDER BY x.ma_cn""", id));
            return head;
        });
    }

    /**
     * Gợi ý (CN, SP) sắp chạm ngưỡng để hỏi nhu cầu: đã đặt ngưỡng, tồn &lt; 1,5 × ngưỡng (gồm cả dưới ngưỡng)
     * và chưa có YC mở. maSp rỗng = mọi mặt hàng.
     */
    public List<Map<String, Object>> suggest(String maSp) throws SQLException {
        String sp = maSp == null ? "" : maSp.strip();
        List<Map<String, Object>> rows = db.read(c -> Db.rows(c, """
                SELECT k.ma_cn, cn.ten AS ten_cn, k.ma_sp, sp.ten AS ten_sp, k.so_luong, k.nguong_toi_thieu AS nguong,
                       CASE WHEN k.so_luong < k.nguong_toi_thieu THEN 'critical' ELSE 'warning' END AS muc
                FROM kho_chi_nhanh k
                JOIN chi_nhanh cn ON cn.ma_cn = k.ma_cn AND NOT cn.gia_lap
                JOIN san_pham sp ON sp.ma_sp = k.ma_sp
                WHERE k.nguong_toi_thieu > 0 AND k.so_luong < 1.5 * k.nguong_toi_thieu
                  AND (? = '' OR k.ma_sp = ?)
                  AND NOT EXISTS (SELECT 1 FROM yeu_cau y WHERE y.ma_cn = k.ma_cn AND y.ma_sp = k.ma_sp
                                  AND y.trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI'))
                ORDER BY k.so_luong::numeric / k.nguong_toi_thieu, k.ma_cn, k.ma_sp
                LIMIT 500""", sp, sp));
        for (Map<String, Object> r : rows) {
            r.put("deXuat", suggestQuantity(((Number) r.get("soLuong")).intValue(), ((Number) r.get("nguong")).intValue()));
        }
        return rows;
    }

    // ================= chi nhánh =================

    /**
     * NOTICE_REPLY. XEM chỉ ghi nhận đã xem (lặp lại không lỗi). Câu trả lời khác chỉ được một lần (E03);
     * CAN_HANG / MUON_NHAP tạo YC CHO với số CN xin, MUON_NHAP tạo thêm dòng kho chi nhánh tồn 0.
     * @return NOTICE trạng thái mới để gửi lại CN
     */
    public Message reply(String maCn, long id, String traLoi, int soLuong) throws SQLException {
        String answer = traLoi == null ? "" : traLoi.strip();
        record Result(Integer maYc, boolean created, boolean changed) {
        }
        Result result = db.tx(c -> {
            String[] row = Db.one(c, """
                    SELECT tb.loai, tb.ma_sp, x.trang_thai
                    FROM thong_bao_cn x JOIN thong_bao tb ON tb.id = x.id_tb
                    WHERE x.id_tb = ? AND x.ma_cn = ? FOR UPDATE OF x""",
                    rs -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}, id, maCn);
            // lọc theo mã CN của phiên: CN A trả lời thông báo của CN B → E04 (như mã YC, NFR-07)
            if (row == null) {
                throw new ServiceException(ErrorCode.E04, "Khong tim thay thong bao " + id);
            }
            String loai = row[0];
            String maSp = row[1];
            String state = row[2];
            if (!repliesFor(loai).contains(answer)) {
                throw new ServiceException(ErrorCode.E01, "Thong bao " + loai + " khong nhan tra loi " + answer);
            }
            if (XEM.equals(answer)) {
                int n = Db.update(c, """
                        UPDATE thong_bao_cn SET trang_thai = 'DA_XEM', xem_luc = CURRENT_TIMESTAMP
                        WHERE id_tb = ? AND ma_cn = ? AND trang_thai = 'DA_GUI'""", id, maCn);
                return new Result(null, false, n > 0);
            }
            if (answered(state)) {
                throw new ServiceException(ErrorCode.E03, "Thong bao " + id + " da tra loi (" + state + ")");
            }
            if (!needsQuantity(answer)) {
                Db.update(c, """
                        UPDATE thong_bao_cn SET trang_thai = ?, tra_loi_luc = CURRENT_TIMESTAMP,
                            xem_luc = COALESCE(xem_luc, CURRENT_TIMESTAMP)
                        WHERE id_tb = ? AND ma_cn = ?""", answer, id, maCn);
                return new Result(null, false, true);
            }
            if (soLuong <= 0 || soLuong > MAX_REPLY_QUANTITY) {
                throw new ServiceException(ErrorCode.E05, "So luong phai trong 1.." + MAX_REPLY_QUANTITY);
            }
            // E03 chứ không E04: CN trả lời đúng thông báo của mình, không bị tính là dò mã (IDOR_PROBE)
            if (maSp == null) {
                throw new ServiceException(ErrorCode.E03, "Mat hang cua thong bao " + id + " da bi xoa");
            }
            // khóa YC trước rồi mới đụng kho_chi_nhanh, cùng thứ tự với RECEIVED (tránh deadlock)
            int[] yc = RequestService.openFromNotice(c, maCn, maSp, soLuong);
            if (MUON_NHAP.equals(answer)) {
                Db.update(c, """
                        INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu) VALUES (?, ?, 0, ?)
                        ON CONFLICT (ma_cn, ma_sp) DO NOTHING""", maCn, maSp, NEW_ITEM_THRESHOLD);
            }
            Db.update(c, """
                    UPDATE thong_bao_cn SET trang_thai = ?, so_luong = ?, ma_yc = ?, tra_loi_luc = CURRENT_TIMESTAMP,
                        xem_luc = COALESCE(xem_luc, CURRENT_TIMESTAMP)
                    WHERE id_tb = ? AND ma_cn = ?""", answer, soLuong, yc[0], id, maCn);
            return new Result(yc[0], yc[1] == 1, true);
        });
        if (result.maYc() != null) {
            requests.publishOpened(result.maYc(), result.created());
        }
        if (result.changed()) {
            events.publish(Events.NOTICE, Map.of("id", id, "maCn", maCn));
        }
        return message(id, maCn);
    }

    private static final String MESSAGE_SQL = """
            SELECT tb.id, tb.loai, x.trang_thai, tb.tao_luc, tb.tieu_de, tb.noi_dung, tb.ma_sp,
                   x.de_xuat, x.so_luong, x.ma_yc, sp.anh_url
            FROM thong_bao_cn x
            JOIN thong_bao tb ON tb.id = x.id_tb
            LEFT JOIN san_pham sp ON sp.ma_sp = tb.ma_sp""";

    private Message message(long id, String maCn) throws SQLException {
        return db.read(c -> Db.one(c, MESSAGE_SQL + " WHERE x.id_tb = ? AND x.ma_cn = ?", NoticeService::toMessage, id, maCn));
    }

    /** Thông báo 30 ngày gần nhất (tối đa 50), gửi lại sau LOGIN_OK; cũ trước để CN xếp đúng thứ tự. */
    public List<Message> resync(String maCn) throws SQLException {
        return db.read(c -> {
            List<Message> out = new ArrayList<>(Db.list(c, MESSAGE_SQL + """
                     WHERE x.ma_cn = ? AND tb.tao_luc > CURRENT_TIMESTAMP - INTERVAL '30 days'
                    ORDER BY tb.id DESC LIMIT 50""", NoticeService::toMessage, maCn));
            Collections.reverse(out);
            return out;
        });
    }

    private static Message toMessage(ResultSet rs) throws SQLException {
        return Message.of(Command.NOTICE, rs.getLong(1), rs.getString(2), rs.getString(3),
                rs.getTimestamp(4).toLocalDateTime().format(TIME), rs.getString(5), rs.getString(6),
                orEmpty(rs.getString(7)), orEmpty(rs.getObject(8)), orEmpty(rs.getObject(9)), orEmpty(rs.getObject(10)),
                StockService.imageRef(rs.getString(11)));
    }

    private static String orEmpty(Object v) {
        return v == null ? "" : v.toString();
    }

    /** Dòng NOTICE (kể cả ký tự thoát, tiếng Việt 2–3 byte/ký tự) phải vừa MAX_LINE_BYTES, chừa chỗ cho số và ảnh. */
    static boolean fitsLine(String tieuDe, String noiDung) {
        Message worst = Message.of(Command.NOTICE, Long.MAX_VALUE, HOI_NHU_CAU, MUON_NHAP, "2026-10-22 10:00:00",
                tieuDe, noiDung, "TB0000", Integer.MAX_VALUE, Integer.MAX_VALUE, Integer.MAX_VALUE,
                "v1792609532/toboki/TB0000.webp");
        return worst.toLine().getBytes(StandardCharsets.UTF_8).length + 1 <= Protocol.MAX_LINE_BYTES;
    }
}
