package phanphoi.server;

import com.google.gson.JsonObject;
import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.web.Http;
import phanphoi.common.web.Router;
import phanphoi.server.db.Db;
import phanphoi.server.net.ClientHandler;

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * API phục vụ trình giả lập tải khi chạy thực nghiệm (docs/EXPERIMENTS.md). Chỉ thao tác trên
 * các chi nhánh ảo (chi_nhanh.gia_lap = TRUE), không đụng dữ liệu CN01..CN03.
 * Chạy cùng listener HTTP Admin. KHÔNG tự giới hạn localhost nếu Admin qua proxy/Funnel;
 * chỉ bật trên môi trường thử nghiệm cô lập bằng experiment.api=true.
 */
final class ExperimentApi {

    private ExperimentApi() {
    }

    static void register(Router r, ServerContext ctx) {
        r.get("/api/experiment/settings", (ex, p) -> Http.ok(ex, ctx.settings().toMap()));
        r.post("/api/experiment/settings", (ex, p) -> {
            JsonObject b = Http.body(ex);
            Map<String, String> v = new LinkedHashMap<>();
            for (String k : b.keySet()) {
                v.put(k, b.get(k).getAsString());
            }
            try {
                ctx.settings().update(v);
            } catch (IllegalArgumentException e) {
                throw new Http.ApiException(400, "Gia tri cau hinh khong hop le: " + v);
            }
            Http.ok(ex, ctx.settings().toMap());
        });

        r.get("/api/experiment/runtime", (ex, p) -> Http.ok(ex, runtime(ctx)));
        r.post("/api/experiment/runtime/reset-peak", (ex, p) -> {
            ManagementFactory.getThreadMXBean().resetPeakThreadCount();
            Http.ok(ex, runtime(ctx));
        });

        // E1: tạo n yêu cầu DA_DE_XUAT cho SIM001..n cùng một mặt hàng, đặt tồn kho tổng
        r.post("/api/experiment/prepare-offers", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String maSp = Http.str(b, "maSp");
            int n = Http.integer(b, "soChiNhanh");
            int qty = Http.integer(b, "soLuong");
            int stock = Http.integer(b, "khoTong");
            List<Integer> ids = ctx.db().tx(c -> {
                clearSim(c);
                Db.update(c, "UPDATE kho_tong SET so_luong = ? WHERE ma_sp = ?", stock, maSp);
                List<String> branches = Db.list(c,
                        "SELECT ma_cn FROM chi_nhanh WHERE gia_lap ORDER BY ma_cn LIMIT ?", rs -> rs.getString(1), n);
                List<Integer> out = new ArrayList<>();
                for (String cn : branches) {
                    out.add(Db.one(c, """
                            INSERT INTO yeu_cau (ma_cn, ma_sp, so_luong_de_xuat, trang_thai) VALUES (?, ?, ?, 'DA_DE_XUAT')
                            RETURNING ma_yc""", rs -> rs.getInt(1), cn, maSp, qty));
                }
                return out;
            });
            Http.ok(ex, Map.of("maYc", ids));
        });

        r.get("/api/experiment/accept-result", (ex, p) -> {
            String maSp = Http.query(ex).getOrDefault("maSp", "");
            Http.ok(ex, ctx.db().read(c -> Db.one(c, """
                    SELECT (SELECT so_luong FROM kho_tong WHERE ma_sp = ?) AS kho_tong,
                           (SELECT COALESCE(sum(px.so_luong), 0) FROM phieu_xuat px
                              JOIN chi_nhanh cn ON cn.ma_cn = px.ma_cn AND cn.gia_lap WHERE px.ma_sp = ?) AS tong_xuat,
                           (SELECT count(*) FROM yeu_cau y JOIN chi_nhanh cn ON cn.ma_cn = y.ma_cn AND cn.gia_lap
                              WHERE y.ma_sp = ? AND y.trang_thai = 'DA_GIAO') AS so_da_giao,
                           (SELECT count(*) FROM yeu_cau y JOIN chi_nhanh cn ON cn.ma_cn = y.ma_cn AND cn.gia_lap
                              WHERE y.ma_sp = ? AND y.trang_thai = 'THIEU_HANG') AS so_thieu_hang""",
                    Db::toMap, maSp, maSp, maSp, maSp)));
        });

        r.post("/api/experiment/reset", (ex, p) -> {
            ctx.db().tx(c -> {
                clearSim(c);
                return null;
            });
            Http.ok(ex, Map.of("ok", true));
        });

        // E6: n CN ảo có tồn tonCn, ngưỡng nguong cho maSp; kho tổng = khoTong. Trả tồn kho tổng cũ để khôi phục.
        r.post("/api/experiment/prepare-live", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String maSp = Http.str(b, "maSp");
            int n = Http.integer(b, "soChiNhanh");
            int ton = Http.integer(b, "tonCn");
            int nguong = Http.integer(b, "nguong");
            int stock = Http.integer(b, "khoTong");
            Integer before = ctx.db().tx(c -> {
                clearSim(c);
                Integer old = Db.one(c, "SELECT so_luong FROM kho_tong WHERE ma_sp = ?", rs -> rs.getInt(1), maSp);
                Db.update(c, "UPDATE kho_tong SET so_luong = ? WHERE ma_sp = ?", stock, maSp);
                Db.update(c, """
                        UPDATE kho_chi_nhanh SET so_luong = ?, nguong_toi_thieu = ?
                        WHERE ma_sp = ? AND ma_cn IN (SELECT ma_cn FROM chi_nhanh WHERE gia_lap ORDER BY ma_cn LIMIT ?)""",
                        ton, nguong, maSp, n);
                return old;
            });
            Http.ok(ex, Map.of("khoTongTruoc", before == null ? 0 : before));
        });

        r.get("/api/experiment/live-result", (ex, p) -> {
            String maSp = Http.query(ex).getOrDefault("maSp", "");
            Http.ok(ex, ctx.db().read(c -> Db.one(c, """
                    SELECT (SELECT so_luong FROM kho_tong WHERE ma_sp = ?) AS kho_tong,
                           (SELECT COALESCE(sum(px.so_luong), 0) FROM phieu_xuat px
                              JOIN chi_nhanh cn ON cn.ma_cn = px.ma_cn AND cn.gia_lap WHERE px.ma_sp = ?) AS tong_xuat,
                           (SELECT count(*) FROM yeu_cau y JOIN chi_nhanh cn ON cn.ma_cn = y.ma_cn AND cn.gia_lap
                              WHERE y.ma_sp = ?) AS so_yc,
                           (SELECT count(*) FROM yeu_cau y JOIN chi_nhanh cn ON cn.ma_cn = y.ma_cn AND cn.gia_lap
                              WHERE y.ma_sp = ? AND y.trang_thai = 'HOAN_TAT') AS so_da_nhan,
                           (SELECT count(*) FROM yeu_cau y JOIN chi_nhanh cn ON cn.ma_cn = y.ma_cn AND cn.gia_lap
                              WHERE y.ma_sp = ? AND y.trang_thai = 'TU_CHOI') AS so_tu_choi,
                           (SELECT count(*) FROM yeu_cau y JOIN chi_nhanh cn ON cn.ma_cn = y.ma_cn AND cn.gia_lap
                              WHERE y.ma_sp = ? AND y.trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI')) AS so_con_mo""",
                    Db::toMap, maSp, maSp, maSp, maSp, maSp, maSp)));
        });

        // Sau E6: xoá dữ liệu CN ảo, trả CN ảo về tồn lớn/ngưỡng 0 và khôi phục kho tổng
        r.post("/api/experiment/finish-live", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String maSp = Http.str(b, "maSp");
            int stock = Http.integer(b, "khoTong");
            ctx.db().tx(c -> {
                clearSim(c);
                Db.update(c, """
                        UPDATE kho_chi_nhanh SET so_luong = 1000000, nguong_toi_thieu = 0
                        WHERE ma_sp = ? AND ma_cn IN (SELECT ma_cn FROM chi_nhanh WHERE gia_lap)""", maSp);
                return Db.update(c, "UPDATE kho_tong SET so_luong = ? WHERE ma_sp = ?", stock, maSp);
            });
            Http.ok(ex, Map.of("ok", true));
        });

        // E2: tạo một YC mới cho CN ảo và gửi OFFER (đóng YC cũ cùng mặt hàng nếu còn mở)
        r.post("/api/experiment/offer", (ex, p) -> {
            JsonObject b = Http.body(ex);
            String maCn = Http.str(b, "maCn");
            String maSp = Http.str(b, "maSp");
            int qty = Http.integer(b, "soLuong");
            int maYc = ctx.db().tx(c -> {
                Db.update(c, """
                        UPDATE yeu_cau SET trang_thai = 'TU_CHOI' WHERE ma_cn = ? AND ma_sp = ?
                          AND trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI')""", maCn, maSp);
                return Db.one(c, "INSERT INTO yeu_cau (ma_cn, ma_sp) VALUES (?, ?) RETURNING ma_yc",
                        rs -> rs.getInt(1), maCn, maSp);
            });
            ctx.requests().offer(maYc, qty);
            Http.ok(ex, Map.of("maYc", maYc, "online", ctx.registry().isOnline(maCn)));
        });

        // E3: gửi BROADCAST thẳng tới các CN ảo đang online, đo thời gian luồng gọi bị giữ
        r.post("/api/experiment/broadcast", (ex, p) -> {
            String text = Http.str(Http.body(ex), "noiDung");
            Message m = Message.of(Command.BROADCAST, text);
            long t0 = System.nanoTime();
            int sent = 0;
            for (String cn : ctx.registry().onlineIds()) {
                ClientHandler h = ctx.registry().get(cn);
                if (h != null && cn.startsWith("SIM") && h.send(m)) {
                    sent++;
                }
            }
            Http.ok(ex, Map.of("sent", sent, "elapsedMs", (System.nanoTime() - t0) / 1e6));
        });
    }

    /** Xoá dữ liệu giao dịch của chi nhánh ảo (giữ nguyên tài khoản và kho). */
    private static void clearSim(Connection c) throws SQLException {
        String sim = "(SELECT ma_cn FROM chi_nhanh WHERE gia_lap)";
        Db.update(c, "DELETE FROM cong_no_cn WHERE ma_cn IN " + sim);
        Db.update(c, "DELETE FROM dieu_chuyen WHERE den_cn IN " + sim + " OR tu_cn IN " + sim);
        Db.update(c, "DELETE FROM phieu_xuat WHERE ma_cn IN " + sim);
        Db.update(c, "DELETE FROM yeu_cau WHERE ma_cn IN " + sim);
        Db.update(c, "DELETE FROM hang_doi_tin WHERE ma_cn IN " + sim);
    }

    static Map<String, Object> runtime(ServerContext ctx) {
        ThreadMXBean tb = ManagementFactory.getThreadMXBean();
        Runtime rt = Runtime.getRuntime();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("threads", tb.getThreadCount());
        m.put("peakThreads", tb.getPeakThreadCount());
        m.put("heapUsedMb", (rt.totalMemory() - rt.freeMemory()) / (1024.0 * 1024.0));
        m.put("connections", ctx.registry().connections().size());
        m.put("online", ctx.registry().onlineIds().size());
        m.putAll(ctx.settings().toMap());
        return m;
    }
}
