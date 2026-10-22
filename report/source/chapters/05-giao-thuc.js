// Chương 5. Thiết kế giao thức và giao tiếp mạng (N1)
module.exports = (L) => {
  const { add, P, H1, H2, H3, B, N, newList, table, figure, code } = L;

  add(H1("5. Thiết kế giao thức và giao tiếp mạng", "5"));
  add(P("Chương này đặc tả giao thức tầng ứng dụng giữa chi nhánh và server: nguyên tắc thiết kế, định dạng và cách đóng khung tin, bảng lệnh, mã lỗi, cách thiết lập và đóng kết nối, khám phá server, heartbeat, các luồng thông điệp nghiệp vụ và cách xử lý lỗi. Toàn bộ phần mã hóa và giải mã nằm trong một lớp `Protocol` dùng chung cho `server.jar`, `client.jar` và `loadsim.jar`, nên ba chương trình luôn nói cùng một ngôn ngữ."));

  add(H2("5.1. Nguyên tắc thiết kế"));
  add(B("**Một kết nối, hai chiều.** Mỗi chi nhánh giữ một kết nối TCP bền vững. Cả request của chi nhánh, trả lời và tin đẩy của server đều đi trên kết nối đó. Client phân biệt loại tin bằng tên lệnh, không cần một kết nối riêng cho push."));
  add(B("**Văn bản, mỗi tin một dòng.** Tin có thể đọc bằng mắt, gõ thử bằng netcat, và xem trực tiếp trong Wireshark. Điều này rất hữu ích khi kiểm thử và khi bảo vệ."));
  add(B("**Server là nguồn sự thật.** Chi nhánh không tự quyết định trạng thái yêu cầu; mọi tin đẩy quan trọng đều dựng lại được từ CSDL (mục 7.1)."));
  add(B("**Danh tính lấy từ phiên.** Sau `LOGIN_OK`, mã chi nhánh gắn với kết nối. Mọi lệnh sau đó dùng mã trong phiên, không tin mã chi nhánh trong tham số."));
  add(B("**Phòng thủ khi phân tích.** Giới hạn độ dài dòng, kiểm tra số tham số theo từng lệnh, kiểm tra chiều gửi. Một dòng sai chỉ nhận về `ERROR|E01`, không làm đóng kết nối hay ảnh hưởng chi nhánh khác."));

  add(H2("5.2. Định dạng tin và đóng khung"));
  add(P("Mỗi tin là một dòng văn bản UTF-8 kết thúc bằng ký tự xuống dòng `\\n`, dài tối đa **4096 byte**, có dạng:"));
  add(code(["LENH|thamSo1|thamSo2|…\\n"]));
  add(P("Tên lệnh là một trong 33 giá trị của enum `Command`, mỗi lệnh có **số tham số cố định**; sai số tham số là lỗi E01. Vì nội dung tham số có thể chứa chính ký tự `|` hoặc xuống dòng (ví dụ nội dung một thông báo), mỗi tham số được **escape**: `\\` thành `\\\\`, `|` thành `\\p`, xuống dòng thành `\\n`. Ký tự `\\r` cuối dòng bị bỏ, để tin gõ từ netcat hay telnet (kết thúc bằng CRLF) vẫn hợp lệ."));
  add(P("Một số tin mang **danh sách** (tồn kho, lịch sử, công nợ) trong một tham số duy nhất: các bản ghi ngăn bởi `;`, các trường ngăn bởi `,`. Trong một trường, `,` viết thành `\\c` và `;` viết thành `\\s`. Hai tầng escape độc lập giúp một trường chứa dấu phẩy (tên hàng “Máy hút bụi 80 lít, 2 mô tơ”) không làm vỡ danh sách, và một tham số chứa dấu `|` không làm vỡ dòng. Ví dụ các dòng thật trên dây:"));
  add(code([
    "LOGIN|CN01|123456",
    "LOGIN_OK|Chi nhánh Lĩnh Nam",
    "SALE|TB01|2",
    "SALE_OK|TB01|1",
    "LOW_STOCK|TB01|1|3",
    "INVENTORY|TB01,Máy hút bụi 80 lít\\c 2 mô tơ,1,3,…;TB02,…",
    "BROADCAST|Giá mới: 5\\p6 triệu\\nÁp dụng từ thứ Hai",
    "ERROR|E01|SALE can 2 tham so, nhan 1",
  ]));
  add(P("Vì TCP không giữ ranh giới tin (mục 2.3), phía nhận phải tự ghép byte thành dòng. {fig:framing} minh họa trường hợp hai tin bị cắt ngang ở giữa một lần đọc. Server BIO dùng `LineReader` trên `InputStream`; server NIO dùng `LineSplitter` nhận từng mảnh `ByteBuffer`. Cả hai chung một quy tắc: bộ đệm cố định 4096 byte; dòng dài hơn bị đánh dấu `TOO_LONG` và bỏ tới ký tự xuống dòng kế tiếp, nên dữ liệu rác không làm tràn bộ nhớ. Dòng chỉ được giải mã UTF-8 khi đã đủ cả dòng, nên một ký tự tiếng Việt nhiều byte bị cắt giữa hai gói vẫn ghép đúng (unit test có ca riêng cho trường hợp này)."));
  add(figure("docs/img/framing.png", "Đóng khung trên luồng byte: hai tin bị chia thành hai đoạn TCP và được ghép lại bởi LineSplitter", "framing"));

  add(H2("5.3. Bảng lệnh"));
  add(P("Giao thức có 33 lệnh, chia thành các nhóm theo chức năng ({tab:cmd-groups}). Bảng đầy đủ với tham số của từng lệnh nằm ở Phụ lục A. Chiều gửi được server kiểm tra: lệnh chỉ dành cho server (như `OFFER`) mà chi nhánh gửi lên sẽ nhận E01; lệnh nghiệp vụ gửi trước khi đăng nhập nhận E02. Trước đăng nhập chỉ có `LOGIN`, `PING`, `PONG` được chấp nhận."));
  add(table("Các nhóm lệnh của giao thức", [
    ["Nhóm", "Lệnh", "Kiểu trao đổi"],
    ["Phiên", "LOGIN, LOGIN_OK, LOGIN_FAIL, LOGOUT, PING, PONG", "Request–trả lời; PING/PONG hai chiều"],
    ["Kho chi nhánh", "INVENTORY_GET, INVENTORY, SALE, SALE_OK, SET_THRESHOLD, HISTORY_GET, HISTORY", "Request–trả lời"],
    ["Cảnh báo và cấp hàng", "LOW_STOCK, OFFER, ACCEPT, REJECT, DELIVERED, OUT_OF_STOCK, RECEIVED", "Chi nhánh báo; server đẩy; chi nhánh trả lời"],
    ["Điều chuyển", "TRANSFER_REQ, TRANSFER_ACCEPT, TRANSFER_REJECT, TRANSFER_DONE", "Server đẩy lời mời; chi nhánh nguồn trả lời"],
    ["Thông báo", "BROADCAST, NOTICE, NOTICE_REPLY", "Server đẩy; chi nhánh trả lời thông báo có phản hồi"],
    ["Công nợ", "DEBT_GET, DEBT", "Request–trả lời; server tự đẩy khi sổ nợ đổi"],
    ["An ninh", "SECURITY_REPORT", "Chi nhánh báo sự kiện lên server (tối đa 1 tin/giây)"],
    ["Lỗi", "ERROR", "Server trả khi tin sai hoặc không hợp lệ"],
    ["Khám phá (UDP)", "DISCOVER, HERE", "Broadcast hỏi – unicast trả lời"],
  ], [2.4, 6, 3.6], [], "cmd-groups"));

  add(H2("5.4. Mã lỗi"));
  add(table("Mã lỗi trong tin ERROR|maLoi|moTa", [
    ["Mã", "Ý nghĩa", "Ví dụ tình huống", "Kết nối"],
    ["E01", "Sai định dạng", "Dòng rác, lệnh không tồn tại, sai số tham số, escape sai, dòng > 4096 byte, sai chiều lệnh", "Giữ"],
    ["E02", "Chưa đăng nhập", "Gửi SALE trước LOGIN", "Giữ"],
    ["E03", "Sai trạng thái / server bận", "ACCEPT một yêu cầu đã đóng; lỗi CSDL; server đã đủ max.clients kết nối", "Giữ (đóng nếu server đầy)"],
    ["E04", "Không tìm thấy", "Mã hàng không có; mã yêu cầu thuộc chi nhánh khác", "Giữ"],
    ["E05", "Số lượng không hợp lệ", "Số lượng ≤ 0; bán vượt tồn", "Giữ"],
    ["E06", "Bị giới hạn hoặc bị chặn", "IP đang bị chặn; gửi lệnh dồn dập; vượt giới hạn đọc dữ liệu", "Đóng hoặc giữ tùy quy tắc"],
  ], [0.9, 2.4, 6.2, 2.5]));

  add(H2("5.5. Thiết lập và đóng kết nối"));
  add(P("{fig:tcp-life} là vòng đời đầy đủ của một kết nối, gồm cả các gói điều khiển do hệ điều hành gửi (mục 2.2) và các tin của giao thức. Trình tự cụ thể:"));
  const s = newList();
  add(N("**Tìm địa chỉ.** Nếu cấu hình `server=auto`, client hỏi bằng UDP (mục 5.6); nếu không, dùng địa chỉ đã cấu hình.", s));
  add(N("**Kết nối TCP** với thời hạn 3 giây. Ở phía server, kết nối mới bị từ chối ngay nếu số kết nối đã bằng `max.clients` (`ERROR|E03|Server da du N ket noi`) hoặc nếu IP nguồn đang bị chặn (`ERROR|E06|IP bi chan den HH:mm`). Trong cả hai trường hợp, server gửi một dòng lỗi rồi đóng, thay vì để client chờ vô hạn. Server bật `TCP_NODELAY` và `SO_KEEPALIVE` cho mỗi socket được nhận.", s));
  add(N("**Đăng nhập.** Client gửi `LOGIN|maCN|matKhau`. Server so băm SHA-256 có salt. Sai thì trả `LOGIN_FAIL` kèm lý do. Nếu mã chi nhánh đang có một phiên khác, server cũng trả `LOGIN_FAIL`, đồng thời **thăm dò ngay phiên cũ** bằng PING với hạn 5 giây. Phiên cũ có thể là một kết nối nửa mở sau khi rút dây, và nếu đúng vậy, lần thử sau của client sẽ vào được. Kết nối mở 10 giây mà không đăng nhập được ghi sự kiện `PRELOGIN_IDLE`; ở chế độ giám sát `block` nó bị đóng để không chiếm chỗ trong `max.clients`.", s));
  add(N("**Đồng bộ sau đăng nhập.** Ngay sau `LOGIN_OK`, server gửi các tin đang chờ và trạng thái mọi yêu cầu, điều chuyển, thông báo còn mở (mục 7.1). Client gửi `INVENTORY_GET` và `DEBT_GET` để làm mới giao diện.", s));
  add(N("**Hoạt động.** Request, trả lời và push đan xen trên cùng kết nối. Tin của một chi nhánh luôn được server xử lý theo đúng thứ tự gửi (mục 6.3).", s));
  add(N("**Đóng.** Có bốn cách: client gửi `LOGOUT`; heartbeat hết hạn; server cắt client đọc quá chậm; hoặc một bên tắt. Trong mọi trường hợp, server dọn phiên khỏi `SessionRegistry`. Client tự nối lại nếu người dùng chưa đăng xuất.", s));
  add(figure("docs/img/tcp-lifecycle.png", "Vòng đời một kết nối: bắt tay TCP, đăng nhập, request và push, heartbeat, đóng 4 bước", "tcp-life", 560));

  add(H2("5.6. Khám phá server bằng UDP broadcast"));
  add(P("Để chi nhánh không phải nhập IP, `client.jar` gửi tin `DISCOVER` bằng UDP tới cổng 5001. Tin được gửi tới địa chỉ broadcast giới hạn 255.255.255.255 và tới địa chỉ broadcast của từng card mạng đang bật, vì trên máy nhiều card, gói 255.255.255.255 có thể chỉ đi ra một card. `DiscoveryResponder` của server trả lời bằng unicast `HERE|ip|5000`. Địa chỉ `ip` được chọn là địa chỉ của server **cùng mạng con với client**, tính theo độ dài tiền tố của từng card, để client ở mạng nào cũng nhận được địa chỉ đến được."));
  add(P("Client chờ tối đa 1,5 giây cho trả lời đầu tiên, rồi chờ thêm 300 ms để bắt các trả lời khác. Nếu có **nhiều máy khác nhau** cùng trả lời, client vẫn dùng máy trả lời trước nhưng ghi sự kiện an ninh `CLIENT_DISCOVERY_SPOOF`, vì đó có thể là một máy giả mạo server (mục 8.5). Nếu không ai trả lời (mạng chặn broadcast, chạy qua NAT của Docker), client dùng địa chỉ của lần kết nối thành công trước, hoặc báo lỗi để người dùng nhập IP."));

  add(H2("5.7. Heartbeat"));
  add(P("Như đã phân tích ở mục 2.2.4, keep-alive của TCP quá chậm để phát hiện chi nhánh mất mạng. Cả hai phía vì vậy tự cài heartbeat ở tầng ứng dụng với cùng một quy tắc:"));
  add(B("Mỗi kết nối nhớ thời điểm **nhận** tin gần nhất. **Bất kỳ** tin nào nhận được cũng được tính là kết nối còn sống, không riêng PONG."));
  add(B("Im lặng 30 giây thì gửi `PING` và đặt hạn chót 10 giây."));
  add(B("Hết hạn chót mà không nhận được gì thì đóng kết nối và dọn phiên."));
  add(P("Phía server, một bộ hẹn giờ duy nhất chạy mỗi giây và duyệt mọi kết nối, chung cho cả BIO và NIO. Phía client, `BranchAgent` kiểm tra mỗi 200 ms, trong cùng vòng lặp với việc tự nối lại. Ca kiểm thử TC-08 dùng một client không trả PONG: server gửi PING ở giây thứ 31 và đóng kết nối ở giây thứ 41, đúng thiết kế."));

  add(H2("5.8. Luồng thông điệp cấp hàng"));
  add(P("Luồng nghiệp vụ chính là vòng đời của một **yêu cầu cấp hàng** (YC). Trạng thái YC lưu trong cột `yeu_cau.trang_thai`, và mỗi chuyển trạng thái tương ứng với một tin trên mạng ({fig:states}). Có hai cách cấp hàng, cùng kết thúc bằng `RECEIVED`:"));
  add(B("**Gửi thẳng** (mặc định trên trang Tổng quan): `LOW_STOCK` → admin bấm ~~Gửi hàng~~ → server trừ kho tổng, YC sang DA_GIAO và đẩy `DELIVERED` → chi nhánh bấm ~~Đã nhận hàng~~ (`RECEIVED`) → YC sang HOAN_TAT. Nếu kho tổng không đủ, admin bấm ~~Báo hết hàng~~: server đẩy `OUT_OF_STOCK` kèm số còn lại, và chi nhánh nhận phần còn lại (`ACCEPT`), từ chối (`REJECT`) hoặc chờ điều chuyển."));
  add(B("**Đề xuất rồi xác nhận:** `LOW_STOCK` → `OFFER` → chi nhánh `ACCEPT` (có thể sửa số lượng) → `DELIVERED` → `RECEIVED`. Nếu lúc ACCEPT kho tổng không đủ, server trả `OUT_OF_STOCK`."));
  add(figure("docs/img/yc-states.png", "Trạng thái của yêu cầu cấp hàng và tin giao thức gây ra từng chuyển trạng thái", "states"));
  add(P("{fig:seq} là một lần cấp hàng có thiếu kho được giải quyết bằng điều chuyển từ chi nhánh B, kèm cả các thao tác CSDL mà server thực hiện ở mỗi bước."));
  add(figure("docs/img/sequence.png", "Luồng thông điệp của một lần cấp hàng có điều chuyển giữa hai chi nhánh", "seq", 560));

  add(H2("5.9. Các luồng khác"));
  add(H3("5.9.1. Điều chuyển hàng giữa chi nhánh"));
  add(P("Khi một YC thiếu hàng, server tìm chi nhánh nguồn có tồn lớn hơn hai lần ngưỡng của chính nó, ưu tiên chi nhánh đang online và dư nhiều nhất. Server gửi `TRANSFER_REQ|maDC|maHang|soLuong|tenCnNhan` cho chi nhánh nguồn. Nếu nguồn trả `TRANSFER_ACCEPT`, server trừ kho nguồn, chuyển YC sang DA_GIAO trong cùng một transaction, rồi gửi `TRANSFER_DONE` cho nguồn và `DELIVERED` cho chi nhánh nhận. Nếu nguồn từ chối, server thử chi nhánh kế tiếp. Server là trung gian duy nhất: hai chi nhánh không bao giờ nối trực tiếp với nhau."));
  add(H3("5.9.2. Thông báo có phản hồi"));
  add(P("`BROADCAST` là thông báo một chiều. `NOTICE` mang trạng thái mới nhất của một thông báo (11 trường: loại, tiêu đề, nội dung, mặt hàng, số lượng đề xuất…); client ghi đè theo mã thông báo, nên nhận trùng không sao. Với loại ~~hỏi nhu cầu~~ hoặc ~~sản phẩm mới~~, chi nhánh trả `NOTICE_REPLY|id|CAN_HANG|soLuong` (hoặc `MUON_NHAP`). Server tạo một YC ở trạng thái CHO, dùng chung chỉ mục chống trùng với LOW_STOCK, rồi trả lại `NOTICE` đã cập nhật."));
  add(H3("5.9.3. Công nợ"));
  add(P("Sau `LOGIN_OK` client gửi `DEBT_GET`; server trả `DEBT|tongNhan|daTra|conNo|hanMuc|danhSach` với 50 bút toán gần nhất. Khi sổ nợ của một chi nhánh đổi (nhận hàng, công ty ghi phiếu thu), server tự đẩy `DEBT` nếu chi nhánh đang online. Tin này không xếp hàng, vì chi nhánh sẽ hỏi lại khi đăng nhập."));

  add(H2("5.10. Xử lý lỗi"));
  add(table("Các tình huống lỗi trong giao tiếp và cách xử lý", [
    ["Tình huống", "Cách xử lý"],
    ["Dòng rác, sai số tham số, escape sai, dòng > 4096 byte", "`ERROR|E01`; kết nối tiếp tục; dòng quá dài bị bỏ tới `\\n` kế tiếp; đếm vào quy tắc FUZZING theo IP"],
    ["Lệnh nghiệp vụ trước khi đăng nhập", "`ERROR|E02`"],
    ["Mã chi nhánh khác trong tham số", "Bị bỏ qua: mã luôn lấy từ phiên; YC của chi nhánh khác trả `E04` và đếm vào IDOR_PROBE"],
    ["Lệnh sai trạng thái (ACCEPT YC đã đóng…)", "`ERROR|E03`, không đổi dữ liệu"],
    ["Gửi lặp ACCEPT, RECEIVED, TRANSFER_ACCEPT", "Trả lại kết quả cũ, không trừ hay cộng kho lần hai (idempotent)"],
    ["Đăng nhập trùng khi phiên cũ đã chết mà server chưa biết", "`LOGIN_FAIL` + PING phiên cũ, đóng nó sau 5 giây nếu không trả lời"],
    ["Chi nhánh mất kết nối, rút dây, treo", "Heartbeat đóng phiên; tin push xếp hàng; gửi lại trạng thái khi đăng nhập; cắt client chậm"],
    ["Server tắt, khởi động lại", "Client báo trạng thái trên giao diện, nối lại theo chính sách jitter, tự đăng nhập lại"],
    ["Quá số kết nối tối đa", "`ERROR|E03|Server da du N ket noi` rồi đóng"],
    ["Lỗi CSDL, deadlock", "Rollback transaction, trả `ERROR|E03`; thứ tự khóa cố định để tránh deadlock"],
    ["Client nhận dòng lạ từ server", "Bỏ qua dòng đó, ghi sự kiện `CLIENT_BAD_SERVER_MSG`, kết nối tiếp tục"],
  ], [4.4, 7.6], [], "errors"));
};
