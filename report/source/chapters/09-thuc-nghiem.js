// Chương 9. Thiết lập thực nghiệm và kiểm thử (N2; 9.6–9.7: N3)
module.exports = (L) => {
  const { add, P, H1, H2, B, table } = L;

  add(H1("9. Thiết lập thực nghiệm và kiểm thử", "9"));
  add(P("Chương này mô tả môi trường đo, dữ liệu, công cụ giả lập tải, phương pháp đo, và hai lớp kiểm thử: kiểm thử đơn vị và kiểm thử tích hợp. Phần cuối liệt kê chín thực nghiệm E1–E9 mà Chương 10 trình bày kết quả."));

  add(H2("9.1. Môi trường"));
  add(table("Môi trường thực nghiệm", [
    ["Thông số", "Giá trị"],
    ["Phần cứng", "Một máy tính, CPU 16 luồng logic, RAM 15 GB"],
    ["Hệ điều hành", "Windows 11 (amd64)"],
    ["Ngôn ngữ, runtime", "Java 17.0.20.1 (Eclipse Temurin); Node.js 24 chỉ để build giao diện"],
    ["Thư viện", "PostgreSQL JDBC 42.7.4, HikariCP 5.1.0, Gson 2.11.0, JUnit 5.11.3; Next.js 15.5, React 19.1, TypeScript 5.9"],
    ["CSDL", "PostgreSQL 18.6 trên localhost, pool 20 kết nối, `reWriteBatchedInserts=true`"],
    ["Cấu hình mạng", "Client ảo, server và CSDL cùng một máy, nối qua loopback 127.0.0.1; TCP 5000 (hoặc 5100 khi 5000 bận), UDP 5001, HTTP 8080/8180"],
    ["Cấu hình server khi đo", "`max.clients=2000`, `db.pool.size=20`, `security.mode=off` (trừ E8), các cờ còn lại theo từng biến thể"],
    ["Ngày chạy", "E1–E5: 20/10/2026; E6, E7: 21/10; E8: 22/10; E9: 23/10/2026"],
  ], [3, 9], [], "env"));
  add(P("Chế độ giám sát an ninh được tắt khi đo E1–E7 và E9, vì 1000 kết nối từ cùng địa chỉ 127.0.0.1 sẽ (đúng thiết kế) bị coi là mở kết nối dồn dập. Bật `detect` chỉ làm p99 của E7 tăng 0,03 ms (mục 8.4.2), nên điều này không làm thay đổi kết luận."));

  add(H2("9.2. Dữ liệu"));
  add(B("**Dữ liệu nghiệp vụ:** 31 mặt hàng TB01–TB31 thuộc 7 danh mục, 15 chi nhánh thật (CN01 Lĩnh Nam…), 3 nhà cung cấp, khoảng 60 ngày lịch sử bán và công nợ (`db/seed_demo.sql`)."));
  add(B("**Chi nhánh ảo:** 1000 chi nhánh SIM001–SIM1000 (`db/seed_loadsim.sql`), mật khẩu băm có salt riêng, tồn mỗi mặt hàng rất lớn, đánh dấu `chi_nhanh.gia_lap = TRUE`. Trang công ty mặc định ẩn chúng."));
  add(B("Mỗi thực nghiệm tự xóa dữ liệu giao dịch của chi nhánh ảo trước khi chạy, và chỉ đụng tới kho tổng của đúng mặt hàng dùng để đo (E1, E6), sau đó trả lại như cũ."));

  add(H2("9.3. Công cụ giả lập và đo"));
  add(P("Module `loadsim` là một chương trình Java riêng, dùng chung lớp `Protocol` với client, gồm các thành phần:"));
  add(B("**`SimClient`:** một chi nhánh ảo nói giao thức thật qua socket TCP thật. Nó có luồng đọc riêng, tự trả PONG, và có hai chế độ mô phỏng lỗi. Chế độ ~~treo~~ ngừng đọc socket và đặt bộ đệm nhận 4 KB để làm đầy TCP nhanh (E3). Chế độ ~~rút dây~~ giữ socket mở nhưng bỏ mọi byte nhận được và không trả PONG (E2)."));
  add(B("**`ServerProcess`:** khởi động `server.jar` như một tiến trình riêng với cấu hình của từng biến thể, chờ cổng sẵn sàng, ghi log riêng, và tắt (hoặc tắt đột ngột cho E5) khi xong."));
  add(B("**`AdminClient`:** gọi API của server và nghe SSE như một trình duyệt. Ở E6 nó đóng vai một **bot admin** đã đăng nhập, bấm Gửi hàng hoặc Báo hết hàng khi thấy cảnh báo."));
  add(B("**`Experiments`:** chạy các kịch bản E1–E9, tính thống kê (`Stats`), ghi CSV và bảng Markdown vào `experiments/results/`. Lệnh `scripts\\run-experiments.bat run=all` chạy toàn bộ; `run=e9` chạy riêng một thực nghiệm."));
  add(P("Server có thêm `ExperimentApi`, chỉ mở trên localhost khi bật `experiment.api`. API này chuẩn bị dữ liệu (tạo n yêu cầu chờ ACCEPT, đặt tồn kho tổng), kích hoạt hành động phía server (gửi OFFER, broadcast tới mọi chi nhánh ảo) và trả số đo nội bộ: số luồng JVM hiện tại và đỉnh (`ThreadMXBean`), heap đang dùng, số kết nối, số chi nhánh online."));

  add(H2("9.4. Phương pháp đo"));
  add(B("**Đồng hồ:** mọi độ trễ đo bằng `System.nanoTime()` trong cùng tiến trình loadsim, ở cả lúc gửi lẫn lúc nhận, nên không phụ thuộc đồng hồ của server hay độ lệch giữa các máy."));
  add(B("**Thống kê:** trung bình, phân vị p50/p95/p99 theo cách hạng gần nhất (phần tử thứ ⌈p·n/100⌉ sau khi sắp xếp), và giá trị lớn nhất. Với thực nghiệm lặp nhiều lần (E1, E5), số trong bảng là trung bình qua các lần."));
  add(B("**“Mất”:** không có trả lời hoặc tin mong đợi trong một thời hạn cố định, ghi rõ ở từng thực nghiệm (ví dụ 5 s cho SALE/PING, 15 s cho broadcast, 30 s cho DELIVERED trong E6)."));
  add(B("**Khởi động:** mỗi mức tải gửi trước một số tin khởi động không tính, để JIT của JVM và pool CSDL ổn định."));
  add(B("**Tài nguyên server:** số luồng đỉnh và heap đỉnh lấy mẫu mỗi 0,5 giây qua `ExperimentApi` trong lúc đo; đỉnh số luồng được đặt lại trước mỗi mức tải."));

  add(H2("9.5. Kiểm thử đơn vị"));
  add(P("Lệnh `mvn test` chạy **129 unit test, tất cả đạt** (chạy lại ngày 23/10/2026, BUILD SUCCESS). Các test tập trung vào phần dễ sai nhất của tầng mạng: phân tích giao thức và các quy tắc an ninh."));
  add(table("Phân bố unit test", [
    ["Module", "Số test", "Nội dung chính"],
    ["common", "78", "Escape/unescape; ghép và tách từng lệnh; danh sách hai tầng escape; INVENTORY 8 và 9 trường; NOTICE, NOTICE_REPLY, DEBT, SECURITY_REPORT; dòng quá dài; tách dòng NIO qua ranh giới gói và ký tự UTF-8 bị cắt; chính sách nối lại"],
    ["server", "37", "Quy tắc giám sát an ninh và danh sách chặn (`SecurityRulesTest`, `BanListTest`); quy tắc trả lời thông báo và độ dài dòng NOTICE (`NoticeServiceTest`)"],
    ["client", "14", "Kiểm tra Origin/Host, phát hiện discovery giả mạo, hàng đợi SECURITY_REPORT (`ClientSecurityTest`); đường dẫn theo tên chi nhánh"],
    ["Tổng", "129", "0 lỗi, 0 bỏ qua"],
  ], [1.4, 1.2, 9.4], [1]));

  add(H2("9.6. Kiểm thử tích hợp"));
  add(P("Các ca kiểm thử của SRS mục 8 chạy bằng script gửi lệnh TCP thật tới server đang chạy, trên **cả `io.mode=nio` lẫn `io.mode=bio`**, cộng các ca bổ sung cho công nợ và an ninh. Tất cả đều đạt."));
  add(table("Kết quả kiểm thử tích hợp", [
    ["Ca", "Kịch bản", "Kết quả"],
    ["TC-01", "Đăng nhập đúng, sai, trùng mã", "LOGIN_OK; LOGIN_FAIL kèm lý do; LOGIN_FAIL vì mã đang online"],
    ["TC-02", "Bán xuống dưới ngưỡng rồi bán tiếp", "Đúng 1 LOW_STOCK và 1 yêu cầu"],
    ["TC-03", "Luồng đủ 5 tin: LOW_STOCK → OFFER → ACCEPT → DELIVERED → RECEIVED", "Kho tổng giảm, kho chi nhánh tăng đúng số chốt, YC ở HOAN_TAT"],
    ["TC-04", "Chi nhánh từ chối (REJECT)", "YC ở TU_CHOI, không kho nào đổi"],
    ["TC-05", "Kho tổng 10, hai chi nhánh cùng ACCEPT 8", "1 DELIVERED, 1 OUT_OF_STOCK|…|2, kho tổng còn 2"],
    ["TC-06", "OFFER gửi khi chi nhánh offline", "Chi nhánh nhận OFFER ngay sau LOGIN_OK"],
    ["TC-07", "Tắt server 20 s rồi bật lại", "Client tự nối lại sau 3,5 s"],
    ["TC-08", "Client không trả PONG", "PING ở giây 31, đóng kết nối ở giây 41"],
    ["TC-09", "netcat gửi dòng rác và lệnh trước khi đăng nhập", "ERROR|E01, ERROR|E02; server và các client khác chạy bình thường"],
    ["TC-10", "Broadcast có `|` và xuống dòng", "Mọi chi nhánh hiển thị nguyên văn"],
    ["TC-11", "20 client, mỗi client 1 tin/giây", "Không mất tin, độ trễ trung bình dưới 2 ms (xem E4)"],
    ["TC-12", "Gửi một ACCEPT hai lần", "Kho tổng trừ một lần, một phiếu xuất"],
    ["TC-13", "Công nợ: gửi 5 × TB01 cho CN01, RECEIVED hai lần, thu 2 triệu rồi 3 triệu", "Một bút toán 4 635 000 đ; DEBT tới CN01 sau 29 ms; phiếu thu vượt số còn nợ bị từ chối"],
    ["TC-14", "Bổ sung chủ động cho CN02 (TB06 tồn 1, ngưỡng 3)", "Đúng một YC và một phiếu xuất; lần 2 bị từ chối (409); kho không đủ thì không tạo YC"],
    ["TC-15", "Dò mật khẩu: 6 LOGIN sai từ một IP", "block: BRUTE_FORCE, IP bị chặn, CN02 từ IP khác vẫn vào; detect: chỉ có sự kiện; off: không có gì"],
    ["TC-16", "Request có Origin lạ / Host lạ tới API cục bộ", "403; sự kiện CLIENT_CSRF / CLIENT_DNS_REBIND được báo lên server"],
  ], [1, 5, 6], [], "tc"));

  add(H2("9.7. Kịch bản thực nghiệm"));
  add(P("Mỗi thực nghiệm trả lời một câu hỏi và so sánh baseline với đề xuất bằng cờ cấu hình. Mọi biến thể chạy cùng một kịch bản, nên khác biệt đến từ đúng thay đổi được đo."));
  add(table("Chín thực nghiệm", [
    ["", "Câu hỏi", "Biến thể (cờ)", "Quy mô", "Số đo chính"],
    ["E1", "Trừ kho đúng và nhanh khi tranh chấp?", "check_then_act, synchronized, conditional (`accept.strategy`)", "50 CN cùng ACCEPT 8, kho 200; 5 lần", "Bán vượt, vi phạm bất biến, thời gian xong cả loạt"],
    ["E2", "Tin đẩy có mất khi chi nhánh mất kết nối?", "none, queue, queue_resync (`delivery`)", "30 CN, 60 s, ~10 OFFER/s; đóng socket và rút dây xen kẽ", "Tỉ lệ OFFER mất, nhận trùng"],
    ["E3", "Một client treo có chặn người khác?", "BIO ghi trực tiếp, BIO hàng đợi, NIO", "20 CN + 1 CN treo; 300 broadcast × 3 KB", "Tin tới CN bình thường, broadcast hoàn tất"],
    ["E4", "BIO và NIO khi tăng số client?", "`io.mode` bio / nio", "50, 200, 500 CN × 1 SALE/s × 30 s", "Số luồng, độ trễ p95, mất tin"],
    ["E5", "Nối lại hàng loạt có dồn cục?", "fixed, backoff, jitter (`reconnect.strategy`)", "300 CN; server tắt 6–10 s; 5 lần", "Thời gian nối lại, đỉnh lần thử/100 ms"],
    ["E6", "Luồng hai phía ổn khi nhiều CN cùng xin hàng?", "Đề xuất (bot admin qua SSE)", "50–1000 CN × 5 hoặc 20 vòng", "Mất/trùng tin, kho đúng, độ trễ từng chặng"],
    ["E7", "Tầng TCP/NIO thuần chịu được bao nhiêu?", "NIO ghi thẳng, NIO qua Selector, BIO (`nio.write.through`)", "100, 500, 1000 CN × 10 PING/s × 20 s", "Thông lượng, RTT p95/p99, số luồng"],
    ["E8", "Server có tự bảo vệ mà không chặn nhầm?", "off, detect, block (`security.mode`)", "20 CN thật + 5 kẻ tấn công, 40 s", "Kẻ tấn công bị chặn, CN bị chặn nhầm, tin tấn công được xử lý"],
    ["E9", "Server đẩy tin tới 1000 CN nhanh đến đâu?", "BIO ghi trực tiếp, BIO hàng đợi, NIO", "100 → 1000 CN; 100 broadcast; thêm 100 broadcast dồn dập", "Tỉ lệ nhận, độ trễ, thời gian tới CN cuối, số luồng"],
  ], [0.6, 2.8, 3.2, 3, 2.8], [], "experiments"));
  add(H2("9.8. Hạn chế của môi trường đo"));
  add(P("Client ảo, server và CSDL chạy trên **cùng một máy** và nói chuyện qua loopback. Không có độ trễ đường truyền thật, client tranh CPU với server, và mọi chi nhánh ảo có cùng địa chỉ IP vì không có proxy hay nhiều máy. Số liệu tuyệt đối vì vậy sẽ khác khi chạy trong LAN nhiều máy. Điều đáng tin là **so sánh tương đối giữa các biến thể**, vì mọi biến thể chịu cùng một điều kiện. Cũng vì mọi client cùng một máy, việc 1000 client cùng gửi lên chủ yếu đo khả năng của chính máy chạy client. E9 vì vậy đo chiều ngược lại, tức server gửi xuống 1000 chi nhánh, là chiều phản ánh đúng năng lực của server."));
};
