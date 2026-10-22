// Chương 8. Cổng HTTP/SSE và an ninh mạng (N4)
module.exports = (L) => {
  const { add, P, H1, H2, H3, B, N, newList, table, figure, code } = L;

  add(H1("8. Cổng HTTP/SSE và an ninh mạng", "8"));
  add(P("Chương này trình bày phần giao tiếp giữa tiến trình Java và trình duyệt trên cùng máy (API HTTP cục bộ và luồng sự kiện SSE), rồi tới các cơ chế bảo vệ: xác thực trang công ty, chặn CSRF và DNS rebinding, giám sát an ninh phía server và phía chi nhánh."));

  add(H2("8.1. API HTTP cục bộ và Server-Sent Events"));
  add(P("Cả `server.jar` và `client.jar` đều nhúng một HTTP server nhỏ, dựa trên `com.sun.net.httpserver.HttpServer` có sẵn trong JDK, chỉ **bind vào 127.0.0.1** (cổng 8080 cho công ty, 8081 trở lên cho chi nhánh). Ba lớp dùng chung trong module `common` đảm nhận phần này:"));
  add(B("`Router`: ánh xạ phương thức và đường dẫn (có tham số, ví dụ `/api/requests/{id}/ship`) tới hàm xử lý; đọc/ghi JSON bằng Gson."));
  add(B("`StaticFiles`: phục vụ giao diện Next.js đã build sẵn trong `ui/out`, nên lúc vận hành không cần Node.js."));
  add(B("`SseHub`: giữ danh sách các response SSE đang mở và phát sự kiện tới tất cả."));
  add(P("Một kết nối SSE là một response HTTP có kiểu `text/event-stream` không bao giờ kết thúc. Mỗi sự kiện là một khung văn bản gồm dòng `event:` mang tên sự kiện, dòng `data:` mang JSON, và một dòng trống. Khi trình duyệt vừa mở kết nối, hub gửi ngay một ảnh chụp trạng thái để giao diện không phải chờ sự kiện đầu tiên. Cứ 15 giây hub gửi một dòng chú thích `: ping`, để các proxy hoặc trình duyệt không đóng kết nối vì im lặng, và để phát hiện tab đã đóng (ghi thất bại thì gỡ khỏi danh sách). Phía trình duyệt dùng `EventSource`, vốn tự kết nối lại khi mất kết nối {cite:sse}."));
  add(code([
    "HTTP/1.1 200 OK",
    "Content-Type: text/event-stream; charset=utf-8",
    "",
    "event: alert",
    "data: {\"maYc\":57,\"maCn\":\"CN01\",\"maSp\":\"TB01\",\"soLuongCon\":1,\"nguong\":3,\"trangThai\":\"CHO\",…}",
    "",
    ": ping",
  ]));
  add(P("Server phát các sự kiện `branches` (danh sách chi nhánh online), `alert` (cảnh báo mới), `request` (yêu cầu đổi trạng thái), `stock`, `transfer`, `message` (luồng tin giao thức cho trang giám sát), `products`, `debt`, `notice` và `security`. Như đã phân tích ở {tab:push-compare}, mọi thao tác của người dùng vốn là request HTTP bình thường, chỉ chiều server → trình duyệt cần đẩy, nên SSE đủ dùng mà không phải thêm giao thức WebSocket."));

  add(H2("8.2. Xác thực trang công ty"));
  add(P("Trang công ty điều khiển kho tổng, nên mọi API của nó (trừ đăng nhập và API thực nghiệm khi bật) trả 401 nếu chưa đăng nhập. Lớp `AdminAuth` hiện thực đăng nhập như sau:"));
  add(B("Mật khẩu lưu dạng `hex(SHA-256(salt + mật khẩu))`, cùng cách băm với mật khẩu chi nhánh. Phép so sánh dùng `MessageDigest.isEqual`, có thời gian không phụ thuộc vị trí byte khác nhau, để không lộ thông tin qua thời gian trả lời."));
  add(B("Đăng nhập đúng thì server tạo một token ngẫu nhiên bằng `SecureRandom` và đặt vào cookie `HttpOnly; SameSite=Strict`. HttpOnly ngăn mã JavaScript đọc token. SameSite=Strict ngăn trình duyệt gửi cookie kèm request xuất phát từ trang khác. Phiên hết hạn sau 12 giờ không dùng."));
  add(B("Sai mật khẩu 5 lần trong 5 phút thì khóa đăng nhập 5 phút (trả 429), kể cả khi lần sau nhập đúng. Sự kiện `ADMIN_BRUTE_FORCE` được ghi lại."));

  add(H2("8.3. Chặn CSRF và DNS rebinding"));
  add(P("API cục bộ chỉ nghe 127.0.0.1, nên máy khác trong mạng không gọi được. Tuy vậy, **trình duyệt của chính người dùng** vẫn có thể bị lợi dụng (mục 2.10). Mọi request tới API của cả hai tiến trình đều đi qua `OriginGuard.check(origin, host, allowedOrigins)`:"));
  const g = newList();
  add(N("Nếu tiêu đề `Host` không phải `localhost`, `127.0.0.1` hay `[::1]` (cổng nào cũng được) → từ chối với lý do **DNS rebinding**. Khi tên miền của kẻ tấn công được trỏ về 127.0.0.1, trình duyệt vẫn gửi `Host: ten-mien-ke-tan-cong`, nên kiểm tra này chặn được {cite:rebinding}.", g));
  add(N("Không có tiêu đề `Origin` (curl, GET cùng trang) → cho qua.", g));
  add(N("`Origin` trùng `http://` + `Host`, tức chính trang của ứng dụng, hoặc nằm trong danh sách cho phép (máy chủ phát triển của Next.js ở cổng 3000/3001) → cho qua.", g));
  add(N("Còn lại → từ chối với lý do **CSRF**.", g));
  add(P("Request bị từ chối nhận mã 403, và một sự kiện an ninh được ghi (`ADMIN_CSRF` ở server, `CLIENT_CSRF`/`CLIENT_DNS_REBIND` ở chi nhánh). Ca kiểm thử TC-16 gửi `curl -H \"Origin: http://evil.example\" -X POST http://127.0.0.1:8081/api/sale` và nhận 403, đồng thời server công ty nhận được sự kiện do chi nhánh báo lên."));

  add(H2("8.4. Giám sát an ninh phía server"));
  add(H3("8.4.1. Kiến trúc"));
  add(P("`SecurityMonitor` được gọi tại các điểm trên đường xử lý kết nối: khi accept (trước khi tạo phiên), khi mở và đóng kết nối, mỗi lần đăng nhập sai, mỗi tin đã giải mã, mỗi tin sai định dạng, mỗi lệnh đọc dữ liệu, mỗi lỗi “không tìm thấy”, khi hết thời gian chờ đăng nhập và khi chi nhánh báo sự kiện. Mỗi điểm chỉ cập nhật bộ đếm trong bộ nhớ và trả về một quyết định: không làm gì, từ chối tin, hay ngắt phiên. **Không có lời gọi CSDL nào trên đường đọc tin.** Sự kiện an ninh được ghi vào bảng `su_kien_bao_mat` bất đồng bộ theo lô, giống nhật ký tin, và đẩy lên tab Giám sát của trang công ty qua SSE."));
  add(P("Chế độ chọn bằng cờ `security.mode`: `off` (baseline, không làm gì), `detect` (chỉ ghi sự kiện) và `block` (ghi sự kiện và tự phản ứng). Có hai nguyên tắc để không chặn nhầm chi nhánh thật:"));
  add(B("Hành vi gắn với **một phiên** (gửi lệnh dồn dập, cào dữ liệu, dò mã yêu cầu của chi nhánh khác) chỉ bị xử lý **trên phiên đó**: từ chối tin vượt mức hoặc ngắt đúng phiên đó."));
  add(B("Quy tắc theo **IP** (dò mật khẩu, gửi rác, mở kết nối dồn dập) **không bao giờ chặn một IP đang có phiên đăng nhập hợp lệ**. Nhiều chi nhánh có thể đứng sau cùng một NAT, và trong thực nghiệm mọi chi nhánh ảo đều dùng 127.0.0.1."));
  add(table("Các quy tắc giám sát an ninh (giá trị mặc định)", [
    ["Quy tắc", "Phát hiện", "Phản ứng ở chế độ block"],
    ["BRUTE_FORCE", "≥ 5 LOGIN_FAIL từ một IP trong 60 s", "Gửi E06, đóng kết nối, chặn IP 10 phút"],
    ["CMD_FLOOD", "Một phiên gửi > 50 tin/giây liên tục 3 s", "E06 rồi ngắt phiên; chặn IP nếu IP không còn phiên hợp lệ"],
    ["SCRAPING", "> 30 lệnh INVENTORY_GET + HISTORY_GET của một phiên trong 60 s, hoặc HISTORY_GET khoảng > 366 ngày", "Trả E06 cho tin vượt mức"],
    ["FUZZING", "> 10 dòng sai định dạng/quá dài từ một IP trong 1 phút", "Chặn IP 5 phút"],
    ["IDOR_PROBE", "> 5 lỗi E04 với mã yêu cầu/điều chuyển của chi nhánh khác trong 1 phút (theo phiên)", "E06 rồi ngắt phiên"],
    ["CONN_FLOOD", "> 20 kết nối đồng thời từ một IP, hoặc > 30 kết nối mới trong 10 s", "Từ chối kết nối mới, chặn IP 10 phút"],
    ["PRELOGIN_IDLE", "Kết nối mở 10 s mà không LOGIN", "Đóng kết nối; nhiều lần trong 1 phút thì chặn IP 5 phút"],
    ["ADMIN_BRUTE_FORCE", "Sai mật khẩu trang công ty 5 lần trong 5 phút", "Khóa đăng nhập 5 phút (cả ở detect)"],
  ], [2.4, 5.4, 4.2], [], "sec-rules"));
  add(H3("8.4.2. Bộ đếm cửa sổ trượt không khóa"));
  add(P("Các quy tắc trên cần đếm “bao nhiêu lần trong N giây gần nhất” cho mỗi IP và mỗi phiên, và được gọi trên **mọi tin** của mọi kết nối. Dùng khóa ở đây sẽ biến bộ giám sát thành điểm nghẽn. Lớp `RateCounter` là một mảng vòng gồm S ô, mỗi ô giữ số đếm của một giây và nhãn giây của nó, lưu trong hai `AtomicLongArray`. Khi đếm, nếu nhãn của ô khác giây hiện tại thì ô được đặt lại bằng compare-and-set; tổng của cửa sổ là tổng các ô có nhãn nằm trong N giây gần nhất. Hai luồng cùng sang giây mới có thể làm mất vài lần đếm đúng ở ranh giới giây, nhưng với ngưỡng hàng chục sai số này không đáng kể, đổi lại không có khóa nào trên đường đọc tin. Khi đo E7 ở 500 chi nhánh × 10 tin/giây, bật `detect` làm p99 thay đổi từ 1,13 ms lên 1,16 ms, tức chỉ 0,03 ms."));

  add(H2("8.5. Giám sát phía chi nhánh"));
  add(P("Máy chi nhánh cũng có thể bị tấn công, và nó thấy được những điều server không thấy. `ClientSecurity` theo dõi:"));
  add(B("Request bị `OriginGuard` từ chối (`CLIENT_CSRF`, `CLIENT_DNS_REBIND`) và request dồn dập tới API cục bộ (> 30 request/giây: `CLIENT_API_FLOOD`)."));
  add(B("**Nhiều máy khác nhau cùng trả lời DISCOVER** (`CLIENT_DISCOVERY_SPOOF`, mức HIGH). Đây là dấu hiệu có máy giả mạo server trong LAN, vì broadcast không có xác thực (mục 2.4)."));
  add(B("Server đổi địa chỉ giữa hai lần kết nối (`CLIENT_SERVER_CHANGED`) và dòng lạ từ server (`CLIENT_BAD_SERVER_MSG`)."));
  add(P("Sự kiện được xếp hàng và gửi lên server bằng lệnh `SECURITY_REPORT|loai|chiTiet`, chỉ sau khi đã đăng nhập, tối đa một tin mỗi giây. Server lấy mã chi nhánh từ phiên chứ không từ tin, và giới hạn chi tiết 500 ký tự, nên một chi nhánh không thể giả danh chi nhánh khác hay làm ngập bảng sự kiện."));

  add(H2("8.6. Giao diện"));
  add(P("Giao diện theo lối các phần mềm quản lý bán hàng phổ biến: thanh menu ngang, bảng dữ liệu dày, dải chỉ số đầu trang và nút xử lý ngay trong bảng. Hai phía dùng chung một trang đăng nhập có thẻ **Công ty** và **Chi nhánh**. Mọi con số trên giao diện (chi nhánh online, cảnh báo, trạng thái yêu cầu) được cập nhật qua SSE mà không cần tải lại trang. Ảnh chụp dưới đây lấy từ hệ thống đang chạy với dữ liệu demo."));
  add(figure("docs/img/ui-admin.png", "Trang công ty: dải chỉ số, cảnh báo thiếu hàng với nút Gửi hàng, Báo hết hàng, Đề xuất", "ui-admin", 540));
  add(figure("docs/img/ui-branch.png", "Trang chi nhánh: bán nhanh, tồn so với ngưỡng, nhãn “đã báo công ty” và “công ty hết hàng”", "ui-branch", 540));
};
