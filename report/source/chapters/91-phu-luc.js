// Phụ lục A–F. A: N1 · B: N2 · C, D: N3 · E: N2 · F: N4
const { Paragraph } = require("docx");

module.exports = (L) => {
  const { add, P, H1, H2, B, table, code, runs } = L;

  // ---------------- A ----------------
  add(H1("Phụ lục A. Bảng lệnh giao thức", "A"));
  add(P("CN = chi nhánh, S = server. Mỗi lệnh có số tham số cố định; danh sách nằm trong một tham số (bản ghi ngăn bởi `;`, trường ngăn bởi `,`)."));
  add(table("Đầy đủ 33 lệnh của giao thức", [
    ["Lệnh", "Chiều", "Tham số", "Ý nghĩa"],
    ["LOGIN", "CN→S", "maCN, matKhau", "Đăng nhập"],
    ["LOGIN_OK / LOGIN_FAIL", "S→CN", "tên CN / lý do", "Kết quả đăng nhập"],
    ["LOGOUT", "CN→S", "—", "Đăng xuất; server đóng kết nối"],
    ["PING / PONG", "Hai chiều", "—", "Heartbeat"],
    ["INVENTORY_GET", "CN→S", "—", "Xin tồn kho chi nhánh"],
    ["INVENTORY", "S→CN", "danh sách maHang, tenHang, soLuong, nguong, model, danhMuc, giaXuat, giaBanLe, anh", "Tồn kho chi nhánh"],
    ["SALE / SALE_OK", "CN→S / S→CN", "maHang, soLuong / maHang, soLuongCon", "Ghi nhận bán hàng"],
    ["SET_THRESHOLD", "CN→S", "maHang, nguong", "Đặt ngưỡng tồn tối thiểu (server trả INVENTORY)"],
    ["LOW_STOCK", "CN→S", "maHang, soLuongCon, nguong", "Cảnh báo thiếu hàng"],
    ["OFFER", "S→CN", "maYC, maHang, soLuongDeXuat", "Đề xuất cấp hàng"],
    ["ACCEPT / REJECT", "CN→S", "maYC, soLuong / maYC", "Đồng ý (có thể sửa số) / từ chối"],
    ["DELIVERED", "S→CN", "maYC, maHang, soLuong", "Đã xuất kho, hàng đang tới"],
    ["OUT_OF_STOCK", "S→CN", "maYC, soLuongCoThe, maHang", "Kho tổng không đủ"],
    ["RECEIVED", "CN→S", "maYC", "Đã nhận hàng; cộng kho chi nhánh, đóng YC"],
    ["HISTORY_GET / HISTORY", "CN→S / S→CN", "từ ngày, đến ngày / danh sách maYC, maHang, tenHang, soLuong, thoiGian, nguon", "Lịch sử nhập (tối đa 200 phiếu)"],
    ["TRANSFER_REQ", "S→CN", "maDC, maHang, soLuong, tenCnNhan", "Mời chi nhánh nguồn điều chuyển"],
    ["TRANSFER_ACCEPT / TRANSFER_REJECT", "CN→S", "maDC", "Trả lời điều chuyển"],
    ["TRANSFER_DONE", "S→CN", "maDC, maHang, soLuongCon", "Điều chuyển hoàn tất"],
    ["BROADCAST", "S→CN", "noiDung", "Thông báo một chiều"],
    ["NOTICE", "S→CN", "id, loai, trangThai, taoLuc, tieuDe, noiDung, maHang, deXuat, soLuong, maYC, anh", "Thông báo có phản hồi (trạng thái mới nhất)"],
    ["NOTICE_REPLY", "CN→S", "id, traLoi, soLuong", "Trả lời thông báo (XEM, CAN_HANG, KHONG_CAN, MUON_NHAP, BO_QUA)"],
    ["DEBT_GET / DEBT", "CN→S / S→CN", "— / tongNhan, daTra, conNo, hanMuc, danh sách bút toán", "Công nợ với công ty"],
    ["SECURITY_REPORT", "CN→S", "loai, chiTiet", "Chi nhánh báo sự kiện an ninh (≤ 1 tin/giây)"],
    ["ERROR", "S→CN", "maLoi (E01–E06), moTa", "Báo lỗi"],
    ["DISCOVER / HERE (UDP 5001)", "CN→S / S→CN", "— / ip, cổng TCP", "Tự tìm server trong LAN"],
  ], [3.2, 1.8, 4.4, 2.6]));

  // ---------------- B ----------------
  add(H1("Phụ lục B. Cấu hình và cờ baseline", "B", { newPage: false }));
  add(P("Cấu hình đọc từ `config/server.properties` và `config/client.properties`, rồi file `*.local.properties` cùng tên nếu có (giá trị riêng của máy như mật khẩu CSDL, không đưa lên git), rồi tham số `khóa=giá_trị` khi chạy, ví dụ `run-server.bat io.mode=bio`."));
  add(table("Các cờ cải tiến và giá trị baseline", [
    ["Khóa", "Mặc định (đề xuất)", "Baseline", "Thực nghiệm"],
    ["`io.mode`", "nio", "bio", "E3, E4, E7, E9"],
    ["`nio.write.through`", "true", "false (mọi lần ghi qua Selector)", "E7"],
    ["`write.mode` (chỉ BIO)", "queued", "direct", "E3, E9"],
    ["`send.queue.limit`", "2000", "—", "E3 (256)"],
    ["`accept.strategy`", "conditional", "check_then_act, synchronized", "E1"],
    ["`delivery`", "queue_resync", "queue (SRS), none", "E2"],
    ["`reconnect.strategy` (client)", "jitter, cap 5000 ms", "fixed, backoff", "E5"],
    ["`security.mode`", "block", "off, detect", "E8"],
  ], [3.4, 2.6, 3.4, 2.6]));
  add(table("Các khóa cấu hình khác", [
    ["Khóa", "Mặc định", "Ý nghĩa"],
    ["`tcp.port`, `discovery.port`", "5000, 5001", "Cổng TCP và cổng UDP khám phá"],
    ["`max.clients`", "100", "Vượt thì kết nối mới nhận ERROR|E03 rồi bị đóng (thực nghiệm dùng 2000)"],
    ["`heartbeat.idle.seconds`, `heartbeat.pong.timeout.seconds`", "30, 10", "Im lặng 30 s → PING; không có tin sau 10 s → đóng"],
    ["`nio.workers`", "16", "Số luồng worker của server NIO"],
    ["`db.url`, `db.user`, `db.password`, `db.pool.size`", "…, 20", "Kết nối PostgreSQL qua HikariCP"],
    ["`admin.http.port`, `experiment.api`", "8080, true", "API trang công ty và API thực nghiệm (chỉ localhost)"],
    ["`security.ban.minutes`", "10", "Thời gian chặn IP vì BRUTE_FORCE, CONN_FLOOD (quy tắc khác 5 phút)"],
    ["`security.conn.max.per.ip`", "20", "CONN_FLOOD: kết nối đồng thời tối đa từ một IP"],
    ["`server` (client)", "auto", "auto = UDP discovery; hoặc ip / ip:port"],
    ["`http.port` (client)", "8081", "Cổng giao diện chi nhánh"],
  ], [4.4, 1.8, 5.8]));

  // ---------------- C ----------------
  add(H1("Phụ lục C. Lược đồ cơ sở dữ liệu", "C", { newPage: false }));
  add(P("CSDL `phan_phoi_hang` gồm 18 bảng: 10 bảng theo SRS mục 6, bảng điều chuyển, và các bảng mở rộng cho danh mục, nhà cung cấp, công nợ, thông báo và giám sát an ninh. Các ràng buộc quan trọng được đặt ngay trong CSDL để làm lớp bảo vệ cuối cùng, kể cả khi mã ứng dụng có lỗi."));
  add(table("Các bảng và ràng buộc đáng chú ý", [
    ["Bảng", "Cột chính", "Ràng buộc / chỉ mục"],
    ["chi_nhanh", "ma_cn, ten, dia_chi, mat_khau_hash, salt, gia_lap, han_muc_no", "Mật khẩu băm SHA-256 có salt; gia_lap đánh dấu chi nhánh ảo"],
    ["danh_muc, san_pham", "ma_dm, ten; ma_sp, ten, model, gia_nhap, gia_xuat, gia_ban_le, anh_url", "Giá là số nguyên đồng"],
    ["nha_cung_cap", "ma_ncc, ten, mst, dia_chi, dien_thoai", "—"],
    ["kho_tong", "ma_sp, so_luong", "CHECK so_luong ≥ 0"],
    ["kho_chi_nhanh", "(ma_cn, ma_sp), so_luong, nguong_toi_thieu", "CHECK so_luong ≥ 0"],
    ["yeu_cau", "ma_yc, ma_cn, ma_sp, so_luong_de_xuat / chot / giao / xin, trang_thai, tao_luc, cap_nhat_luc", "CHECK 6 trạng thái; UNIQUE uq_yeu_cau_dang_mo (ma_cn, ma_sp) khi chưa đóng"],
    ["dieu_chuyen", "ma_dc, ma_yc, tu_cn, den_cn, ma_sp, so_luong, don_gia, trang_thai", "UNIQUE uq_dieu_chuyen_dang_cho: mỗi YC một điều chuyển đang chờ"],
    ["phieu_xuat", "ma_px, ma_yc, ma_cn, ma_sp, so_luong, don_gia, thoi_gian", "UNIQUE ma_yc: một YC chỉ xuất kho một lần"],
    ["phieu_nhap", "ma_pn, ma_sp, so_luong, ma_ncc, don_gia, thoi_gian", "—"],
    ["ban_hang", "id, ma_cn, ma_sp, so_luong, thoi_gian", "Chỉ mục (ma_cn, ma_sp, thoi_gian)"],
    ["hang_doi_tin", "id, ma_cn, noi_dung, tao_luc, da_gui", "Chỉ mục riêng cho tin chưa gửi"],
    ["nhat_ky", "id, ma_cn, chieu, lenh, noi_dung, thoi_gian (mili-giây)", "Ghi theo lô; chỉ mục (ma_cn, thoi_gian)"],
    ["cong_no_cn, thanh_toan_ncc", "id, ma_cn / ma_ncc, loai, so_tien, ma_yc, ma_dc, ghi_chu, thoi_gian", "UNIQUE uq_cong_no_yc, uq_cong_no_dc: mỗi YC/điều chuyển chỉ ghi nợ một lần"],
    ["thong_bao, thong_bao_cn", "id, loai, tieu_de, noi_dung, ma_sp; id_tb, ma_cn, trang_thai, so_luong, ma_yc", "Trạng thái từng chi nhánh với từng thông báo"],
    ["su_kien_bao_mat", "id, thoi_gian, nguon, loai, muc, ip, ma_cn, chi_tiet, hanh_dong", "Ghi theo lô; chỉ mục theo thời gian"],
  ], [2.6, 5.2, 4.2]));

  // ---------------- D ----------------
  add(H1("Phụ lục D. Đoạn mã quan trọng", "D", { newPage: false }));
  add(H2("D.1. Trừ kho tổng: đề xuất và baseline (RequestService)"));
  add(code([
    "private boolean takeFromCentral(Connection c, String maSp, int soLuong)",
    "        throws SQLException {",
    "    if (settings.acceptStrategy == AcceptStrategy.CONDITIONAL) {",
    "        return Db.update(c, \"UPDATE kho_tong SET so_luong = so_luong - ? \"",
    "                + \"WHERE ma_sp = ? AND so_luong >= ?\", soLuong, maSp, soLuong) == 1;",
    "    }",
    "    // baseline: đọc rồi ghi giá trị tính trong Java",
    "    // → lost update nếu không có khóa bao cả transaction",
    "    Integer have = Db.one(c, \"SELECT so_luong FROM kho_tong WHERE ma_sp = ?\",",
    "            rs -> rs.getInt(1), maSp);",
    "    if (have == null || have < soLuong) return false;",
    "    Db.update(c, \"UPDATE kho_tong SET so_luong = ? WHERE ma_sp = ?\", have - soLuong, maSp);",
    "    return true;",
    "}",
  ]));
  add(H2("D.2. Tách dòng cho I/O không chặn (LineSplitter)"));
  add(code([
    "public void feed(ByteBuffer in, Consumer<String> onLine) {",
    "    while (in.hasRemaining()) {",
    "        byte b = in.get();",
    "        if (b == '\\n') {",
    "            if (overflow) onLine.accept(LineReader.TOO_LONG);",
    "            else {",
    "                int n = len > 0 && buf[len - 1] == '\\r' ? len - 1 : len; // bỏ \\r",
    "                onLine.accept(new String(buf, 0, n, StandardCharsets.UTF_8));",
    "            }",
    "            len = 0; overflow = false;",
    "        } else if (!overflow) {",
    "            if (len >= buf.length) overflow = true;   // > 4096 byte: bỏ tới \\n kế tiếp",
    "            else buf[len++] = b;",
    "        }",
    "    }",
    "}",
  ]));
  add(H2("D.3. Hàng đợi tuần tự của một kết nối trên worker pool chung (NioServer)"));
  add(code([
    "private static final class SerialExecutor {",
    "    private final ExecutorService pool;",
    "    private final ArrayDeque<Runnable> tasks = new ArrayDeque<>();",
    "    private boolean running;",
    "",
    "    synchronized void execute(Runnable r) {",
    "        tasks.add(r);",
    "        if (!running) { running = true; pool.execute(this::drain); }",
    "    }",
    "",
    "    private void drain() {",
    "        while (true) {",
    "            Runnable r;",
    "            synchronized (this) {",
    "                r = tasks.poll();",
    "                if (r == null) { running = false; return; }",
    "            }",
    "            r.run();   // các dòng của một kết nối chạy lần lượt, đúng thứ tự đến",
    "        }",
    "    }",
    "}",
  ]));

  // ---------------- E ----------------
  add(H1("Phụ lục E. Chạy lại hệ thống và thực nghiệm", "E", { newPage: false }));
  add(code([
    "scripts\\setup-db.bat                            :: tạo CSDL, dữ liệu mẫu, 1000 chi nhánh ảo",
    "scripts\\build.bat                               :: build giao diện và 4 module Maven",
    "scripts\\run-server.bat                          :: trang công ty :8080 (admin/admin123)",
    "scripts\\run-client.bat [http.port=8082]         :: trang chi nhánh :8081 (CN01/123456)",
    "",
    "mvn test                                        :: 129 unit test",
    "scripts\\run-experiments.bat run=all             :: E1–E9",
    "scripts\\run-experiments.bat run=e9 e9.hold=120  :: giữ 1000 CN online để chụp màn hình",
    "powershell -File experiments\\make-charts.ps1    :: vẽ lại biểu đồ từ CSV",
    "powershell -File docs\\make-diagrams.ps1         :: vẽ lại sơ đồ",
    "",
    "docker compose up --build -d                    :: chạy toàn bộ bằng Docker",
  ]));
  add(P("Mỗi lượt E6, E7, E9 ghi hàng trăm nghìn dòng `nhat_ky` cho các chi nhánh ảo. Sau khi đo, xóa bằng `DELETE FROM nhat_ky WHERE ma_cn LIKE 'SIM%'`."));

  // ---------------- F ----------------
  add(H1("Phụ lục F. Phân công công việc", "F", { newPage: false }));
  add(P("Nhóm chia việc theo bốn mảng của lập trình mạng. Mỗi thành viên chịu trách nhiệm cả phần mã nguồn, phần báo cáo và các câu hỏi bảo vệ của mảng mình, và đọc chéo phần của một thành viên khác."));
  add(table("Phân công theo mảng mạng", [
    ["Thành viên", "Mảng", "Mã nguồn chính", "Phần báo cáo", "Bằng chứng"],
    ["[[Thành viên 1]]", "Socket TCP/UDP, giao thức tầng ứng dụng", "`common/Protocol`, `LineReader`, `LineSplitter`, `Command`, `ErrorCode`; `DiscoveryResponder`, `Discovery`", "2.1–2.4, Ch.5, 10.1, Ch.13, Tài liệu tham khảo, PL A", "Unit test giao thức, E7, TC-08..10"],
    ["[[Thành viên 2]]", "Mô hình I/O, xử lý đồng thời ở server", "`NetServer`, `BioServer`, `NioServer`, `ClientHandler`, `SessionRegistry`, `MessageLog`; module `loadsim`", "2.5, Ch.6, Ch.9, 10.2, Ch.11, PL B, PL E", "E3, E4, E9, TC-11"],
    ["[[Thành viên 3]]", "Độ tin cậy, chịu lỗi, tranh chấp", "`Outbox`, `RequestService`, `TransferService`, `ReconnectPolicy`, `ServerLink`, `BranchAgent`", "2.6–2.8, Ch.3, Ch.7, 10.3, Ch.12, PL C, PL D", "E1, E2, E5, TC-05..07, TC-12"],
    ["[[Thành viên 4]]", "Kiến trúc, HTTP/SSE, an ninh mạng; gộp báo cáo", "`Router`, `SseHub`, `OriginGuard`, `AdminApi`, `AdminAuth`, `security/*`, `ClientSecurity`; giao diện", "Tóm tắt, Ch.1, 2.9–2.10, Ch.4, Ch.8, 10.4, PL F", "E6, E8, TC-01..04, TC-13..16"],
  ], [2, 2.4, 3.4, 2.6, 1.6]));
};
