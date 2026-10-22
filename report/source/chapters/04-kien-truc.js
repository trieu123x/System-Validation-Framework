// Chương 4. Kiến trúc hệ thống (N4)
module.exports = (L) => {
  const { add, P, H1, H2, B, N, newList, table, figure } = L;

  add(H1("4. Kiến trúc hệ thống", "4"));
  add(P("Hệ thống gồm ba loại tiến trình Java (`server.jar`, `client.jar`, `loadsim.jar`), một CSDL PostgreSQL, và giao diện web Next.js được build thành file tĩnh. {fig:arch} là kiến trúc tổng thể. Nguyên tắc xuyên suốt là: **mọi giao tiếp mạng giữa các máy nằm trong Java**, theo giao thức của nhóm. Trình duyệt chỉ nói chuyện với tiến trình Java trên chính máy của nó."));
  add(figure("docs/img/architecture.png", "Kiến trúc tổng thể: một server công ty, nhiều client chi nhánh, PostgreSQL", "arch"));
  add(H2("4.1. Các thành phần"));
  add(B("**server.jar (máy công ty).** Gồm tầng mạng (`NioServer` hoặc `BioServer` chọn bằng `io.mode`), tầng phiên (`ClientHandler`, `SessionRegistry`), tầng nghiệp vụ (`AuthService`, `StockService`, `RequestService`, `TransferService`, `DebtService`, `NoticeService`, `Outbox`), ghi nhật ký bất đồng bộ (`MessageLog`), trả lời khám phá UDP (`DiscoveryResponder`), giám sát an ninh (`SecurityMonitor`), và API HTTP cục bộ cho trang công ty (`AdminApi`, `ExperimentApi`)."));
  add(B("**client.jar (mỗi máy chi nhánh).** `ServerLink` giữ socket TCP và một luồng Listener đọc tin; `BranchAgent` chứa logic chi nhánh, heartbeat và tự nối lại; `Discovery` tìm server bằng UDP; `ClientSecurity` kiểm tra request tới API cục bộ và theo dõi bất thường; API HTTP cục bộ phục vụ trang chi nhánh."));
  add(B("**PostgreSQL.** 18 bảng (Phụ lục C); chỉ server truy cập qua pool HikariCP 20 kết nối {cite:hikari}."));
  add(B("**Giao diện (Next.js 15, React 19).** Build thành file tĩnh trong `ui/out`, do chính `server.jar` và `client.jar` phục vụ. Giao diện gọi API cục bộ qua `fetch` và nhận cập nhật qua SSE. Lúc vận hành không cần Node.js."));
  add(B("**loadsim.jar.** Bộ giả lập tải và bộ thực nghiệm E1–E9. Nó dùng chung lớp `Protocol` với client để nói đúng giao thức, và tự khởi động `server.jar` với cấu hình từng biến thể."));
  add(H2("4.2. Ai giao tiếp với ai"));
  add(P("{tab:links} liệt kê mọi kênh giao tiếp trong hệ thống. Chỉ hai kênh đầu đi qua mạng giữa các máy. Các kênh HTTP đều chỉ mở trên địa chỉ loopback."));
  add(table("Các kênh giao tiếp", [
    ["Từ → tới", "Giao thức, cổng", "Thiết lập", "Nội dung", "Đóng"],
    ["Chi nhánh → Server", "UDP 5001 (broadcast)", "Không kết nối; một gói hỏi, chờ trả lời 1,5 s", "DISCOVER / HERE|ip|5000", "Không áp dụng"],
    ["Chi nhánh ↔ Server", "TCP 5000, giao thức dòng văn bản", "Client connect (timeout 3 s), rồi LOGIN", "Request, trả lời và push trên cùng một kết nối", "LOGOUT, heartbeat hết hạn, server cắt client chậm, một bên tắt"],
    ["Trình duyệt ↔ client.jar", "HTTP 8081+ trên 127.0.0.1", "Mỗi thao tác một request; một kết nối SSE giữ mở", "JSON qua `/api/*`; sự kiện trạng thái qua `/api/events`", "Đóng tab; trình duyệt tự nối lại SSE"],
    ["Trình duyệt ↔ server.jar", "HTTP 8080 trên 127.0.0.1", "Đăng nhập admin bằng cookie HttpOnly", "JSON qua `/api/*`; SSE cảnh báo, yêu cầu, an ninh", "Như trên"],
    ["server.jar ↔ PostgreSQL", "JDBC trên TCP 5432", "Pool HikariCP giữ sẵn 20 kết nối", "Transaction SQL", "Khi tắt server"],
  ], [2.2, 2.2, 2.6, 2.8, 2.2], [], "links"));
  add(H2("4.3. Vì sao client đóng vai cổng HTTP cục bộ"));
  add(P("Trình duyệt không thể mở socket TCP thô tới cổng 5000, nên có hai cách đưa giao diện web vào hệ thống: cho server công ty mở một API HTTP ra mạng để trình duyệt ở chi nhánh gọi thẳng, hoặc để tiến trình Java ở chi nhánh làm **cổng (gateway) cục bộ**. Nhóm chọn cách thứ hai vì ba lý do:"));
  const l = newList();
  add(N("**Phần mạng là của Java.** Kết nối tới server, heartbeat, nối lại, giữ trạng thái khi mất mạng đều nằm trong `client.jar`. Trình duyệt tắt hay tải lại cũng không làm rớt kết nối của chi nhánh.", l));
  add(N("**Giao thức của nhóm là kênh duy nhất giữa các máy,** đúng yêu cầu của môn học. Server không phải mở thêm API HTTP ra mạng, nên bề mặt tấn công nhỏ hơn.", l));
  add(N("**Giao diện chỉ cần localhost.** API cục bộ chỉ nghe `127.0.0.1` và kiểm tra Origin/Host (mục 8.3), nên máy khác trong mạng không gọi được.", l));
  add(H2("4.4. Luồng dữ liệu của một cảnh báo thiếu hàng"));
  add(P("Để thấy các thành phần phối hợp thế nào, xét một lần chi nhánh CN01 bán máy hút bụi TB01 làm tồn xuống dưới ngưỡng. Mỗi bước dưới đây đi qua một kênh của {tab:links}:"));
  const f = newList();
  add(N("Nhân viên CN01 bấm **Bán** trên trình duyệt → `POST /api/sale` tới `client.jar` (HTTP cục bộ).", f));
  add(N("`BranchAgent` gửi `SALE|TB01|2` trên kết nối TCP; server trừ kho chi nhánh trong CSDL và trả `SALE_OK|TB01|1`.", f));
  add(N("Thấy tồn 1 < ngưỡng 3, `BranchAgent` tự gửi `LOW_STOCK|TB01|1|3`. Server tạo yêu cầu ở trạng thái CHO, với chỉ mục chống trùng.", f));
  add(N("Server phát sự kiện SSE `alert` tới mọi trang công ty đang mở; cảnh báo hiện ngay trên trang Tổng quan.", f));
  add(N("Admin bấm **Gửi hàng** → `POST /api/requests/{id}/ship`; server trừ kho tổng bằng câu `UPDATE` có điều kiện trong một transaction.", f));
  add(N("Server đẩy `DELIVERED|57|TB01|5` xuống CN01 qua TCP; `client.jar` phát SSE tới trình duyệt của chi nhánh.", f));
  add(N("Nhân viên bấm **Đã nhận hàng** → `RECEIVED|57`; server cộng kho chi nhánh, ghi công nợ, đóng yêu cầu, rồi báo trang công ty qua SSE.", f));
  add(P("Thực nghiệm E6 đo độ trễ của từng bước này khi 50–1000 chi nhánh cùng làm (mục 10.4)."));
  add(H2("4.5. Triển khai"));
  add(P("Có hai cách chạy. **Chạy trực tiếp:** `scripts\\setup-db.bat` tạo CSDL và dữ liệu mẫu, `scripts\\build.bat` build giao diện và bốn module Maven, `scripts\\run-server.bat` trên máy công ty, `scripts\\run-client.bat` trên mỗi máy chi nhánh. **Chạy bằng Docker Compose:** một image dùng cho cả ba vai, các dịch vụ `db`, `server`, `cn01`, `cn02` và `loadsim`. Khi chạy trong Docker, UDP broadcast không đi qua lớp NAT của Docker Desktop, nên chi nhánh ở máy khác phải ghi rõ `server=<ip>:5000`. Cấu hình đọc từ `config/*.properties`, ghi đè được bằng `*.local.properties` (không đưa lên git, chứa mật khẩu CSDL) và tham số `khóa=giá_trị` khi chạy."));
  add(H2("4.6. Các quyết định thiết kế"));
  add(table("Quyết định thiết kế và lý do", [
    ["Quyết định", "Phương án đã cân nhắc", "Lý do chọn"],
    ["Giao thức dòng văn bản tự thiết kế", "JSON trên TCP, nhị phân, HTTP", "Dễ quan sát bằng netcat và Wireshark; đủ cho tin ngắn; thể hiện rõ việc đóng khung"],
    ["Một kết nối cho cả request và push", "Hai kết nối; chi nhánh polling", "Đẩy tin tức thời; mỗi chi nhánh một socket; một chỗ duy nhất phát hiện mất kết nối"],
    ["CSDL là nguồn sự thật; tin push dựng lại được từ trạng thái", "ACK cho từng tin", "Không phải thêm trường vào giao thức; tự phục hồi sau mọi kiểu mất kết nối"],
    ["Trừ kho bằng UPDATE có điều kiện", "Khóa Java; SELECT FOR UPDATE dòng kho", "Đúng cả khi nhiều tiến trình; giữ khóa ngắn nhất"],
    ["NIO + hàng đợi tuần tự theo kết nối", "Thread-per-connection", "Số luồng không đổi theo số client mà vẫn giữ thứ tự tin"],
    ["Mỗi cải tiến có cờ baseline", "Chỉ giữ bản tốt nhất", "Đo được chính xác tác dụng của từng cải tiến (E1–E9)"],
    ["Giao diện web do tiến trình Java phục vụ trên localhost", "Swing/JavaFX; web gọi thẳng server", "Giao diện dễ làm; phần mạng vẫn hoàn toàn trong Java; không mở thêm cổng ra mạng"],
  ], [3.2, 3.2, 5.6]));
};
