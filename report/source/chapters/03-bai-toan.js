// Chương 3. Định nghĩa bài toán (N3)
module.exports = (L) => {
  const { add, P, H1, H2, B, table } = L;

  add(H1("3. Định nghĩa bài toán", "3"));
  add(P("Chương này phát biểu bài toán một cách cụ thể: mô hình mạng, đầu vào, đầu ra, ràng buộc, giả định, các yêu cầu hệ thống và những loại lỗi mà thiết kế phải chịu được. Các ràng buộc ở đây là tiêu chí để đánh giá đúng/sai trong các thực nghiệm của Chương 10."));
  add(H2("3.1. Mô hình mạng"));
  add(P("Hệ thống gồm **một server** đặt ở công ty và **N chi nhánh**, mỗi chi nhánh là một máy tính chạy `client.jar`. Các máy nằm trong cùng một mạng LAN, hoặc trong các mạng nối với nhau mà vẫn đến được địa chỉ IP của server."));
  add(B("Mỗi chi nhánh giữ **đúng một kết nối TCP** tới server ở cổng 5000. Kết nối dùng chung cho request của chi nhánh và tin đẩy của server."));
  add(B("Chi nhánh có thể gửi UDP broadcast tới cổng 5001 để tìm server khi chưa biết địa chỉ."));
  add(B("Chỉ server truy cập CSDL PostgreSQL; chi nhánh không bao giờ nối trực tiếp tới CSDL."));
  add(B("Trên mỗi máy, giao diện web chỉ nói chuyện với tiến trình Java trên cùng máy qua HTTP ở `127.0.0.1` (cổng 8080 cho công ty, 8081 trở lên cho chi nhánh)."));
  add(P("Quy mô thiết kế là 10–20 chi nhánh theo đề bài. Hệ thống được kiểm chứng tới 1000 chi nhánh ảo để đánh giá khả năng mở rộng. Ở quy mô đó, mọi chi nhánh ảo chạy trên cùng một máy với server và nối qua loopback (mục 9.1)."));
  add(H2("3.2. Đầu vào và đầu ra"));
  add(table("Đầu vào và đầu ra của hệ thống", [
    ["Thành phần", "Đầu vào", "Đầu ra"],
    ["Chi nhánh", "Bán hàng; đặt ngưỡng tồn tối thiểu; trả lời đề xuất cấp, điều chuyển và thông báo; xác nhận đã nhận hàng", "Tồn kho cập nhật tức thì; cảnh báo LOW_STOCK tự động; lịch sử nhập; công nợ với công ty"],
    ["Công ty (admin)", "Danh mục hàng, phiếu nhập kho tổng; Gửi hàng / Báo hết hàng / Đề xuất; thông báo tới chi nhánh", "Danh sách cảnh báo sắp theo mức thiếu; phiếu xuất; điều chuyển; nhật ký mọi tin; đối soát kho và công nợ; sự kiện an ninh"],
    ["Server", "Dòng tin TCP từ các chi nhánh; request HTTP từ giao diện admin", "Tin trả lời và tin đẩy qua TCP; sự kiện SSE; trạng thái nhất quán trong CSDL"],
  ], [2, 5, 5]));
  add(H2("3.3. Ràng buộc"));
  add(table("Các ràng buộc hệ thống phải giữ", [
    ["Mã", "Ràng buộc", "Kiểm chứng"],
    ["R1", "Mỗi tin là một dòng UTF-8 tối đa 4096 byte; dòng sai định dạng bị từ chối bằng ERROR|E01 mà kết nối vẫn tiếp tục", "TC-09, unit test giao thức"],
    ["R2", "Kho tổng không âm và không bao giờ bị xuất vượt: tổng đã xuất + tồn còn lại = tồn ban đầu (NFR-03)", "E1, E6, TC-05"],
    ["R3", "Mỗi cặp (chi nhánh, mặt hàng) có tối đa một yêu cầu chưa đóng; gửi lặp ACCEPT/RECEIVED không trừ hay cộng kho lần hai", "TC-02, TC-12"],
    ["R4", "Mã chi nhánh luôn lấy từ phiên đăng nhập, không lấy từ tham số của tin (NFR-07)", "TC-16, IDOR_PROBE"],
    ["R5", "Mất kết nối không làm mất yêu cầu hay tin đẩy gắn với trạng thái; chi nhánh nối lại trong vòng 5 giây sau khi server lên (FR-05, NFR-04)", "E2, E5, TC-06, TC-07"],
    ["R6", "Một chi nhánh chậm hoặc lỗi không làm chậm chi nhánh khác", "E3"],
    ["R7", "20 chi nhánh × 1 tin/giây: không mất tin, độ trễ trung bình dưới 200 ms (NFR-02)", "E4, TC-11"],
  ], [0.8, 7.4, 2.8], [], "constraints"));
  add(H2("3.4. Giả định"));
  add(B("Danh sách chi nhánh và mật khẩu do admin tạo sẵn; mật khẩu lưu dạng băm SHA-256 có salt."));
  add(B("Đồng hồ các máy có thể lệch nhau; mọi mốc thời gian nghiệp vụ lấy theo đồng hồ server và CSDL."));
  add(B("“Gửi hàng” là mô phỏng: server xuất kho xong coi như hàng đã lên đường; chi nhánh bấm “Đã nhận hàng” thì kho chi nhánh được cộng."));
  add(B("Mạng nội bộ không có kẻ tấn công nghe lén đường truyền (chưa có TLS). Tuy vậy vẫn có thể có máy lạ gửi lưu lượng xấu tới server, nên server phải tự bảo vệ (mục 8.4)."));
  add(H2("3.5. Yêu cầu hệ thống"));
  add(table("Tóm tắt yêu cầu theo SRS", [
    ["Nhóm", "Yêu cầu chính", "Mã"],
    ["Kết nối", "Phục vụ ≥ 20 kết nối đồng thời; đăng nhập; heartbeat 30 s + 10 s; tự nối lại ≤ 5 s; đăng xuất", "FR-01..06"],
    ["Kho", "Quản lý mặt hàng, nhập kho tổng, xem tồn; bán hàng; đặt ngưỡng", "FR-07..12"],
    ["Cảnh báo", "Tự gửi LOW_STOCK; chống trùng cảnh báo ở server; báo ngay cho admin", "FR-13..15"],
    ["Cấp hàng", "Gửi hàng thẳng hoặc báo hết hàng; OFFER, ACCEPT/REJECT; trừ kho trong transaction; OUT_OF_STOCK; RECEIVED; hàng đợi tin cho chi nhánh offline", "FR-16..21"],
    ["Thông báo, lịch sử", "Broadcast; lịch sử yêu cầu; lịch sử nhập; nhật ký mọi tin tới mili-giây", "FR-22..25"],
    ["Phi chức năng", "Hiệu năng, nhất quán, tin cậy, bảo mật, khả dụng, bảo trì, triển khai", "NFR-01..10"],
    ["Mở rộng (SRS 7.2)", "Tự tìm server bằng UDP; điều chuyển hàng giữa chi nhánh; thông báo có phản hồi; công nợ; giám sát an ninh", "—"],
  ], [2.2, 7.4, 1.6]));
  add(H2("3.6. Mô hình lỗi"));
  add(P("Thiết kế phải xử lý các loại lỗi dưới đây. Mỗi loại được tái hiện có chủ đích bằng ít nhất một ca kiểm thử hoặc thực nghiệm, vì phần lớn chúng không bao giờ xuất hiện khi thử bằng tay từng bước."));
  add(table("Các loại lỗi hệ thống phải chịu được", [
    ["Lỗi", "Biểu hiện ở tầng mạng", "Server có biết ngay không", "Tái hiện"],
    ["Chi nhánh đóng ứng dụng", "FIN hoặc RST tới server", "Có (read trả −1 / ngoại lệ)", "E2 (đóng socket)"],
    ["Rút dây mạng, mất điện", "Không có gói nào; kết nối nửa mở", "Không, chỉ biết sau heartbeat", "E2 (rút dây mô phỏng), TC-08"],
    ["Chi nhánh treo, không đọc", "Cửa sổ nhận về 0, bộ đệm gửi đầy", "Không, chỉ thấy ghi bị nghẽn", "E3"],
    ["Server tắt đột ngột", "Mọi chi nhánh mất kết nối cùng lúc", "—", "E5, TC-07"],
    ["Nhiều chi nhánh tranh một mặt hàng", "Nhiều ACCEPT/Gửi hàng tới gần như cùng lúc", "—", "E1, E6, TC-05"],
    ["Dữ liệu rác, tin sai", "Dòng không đúng cú pháp, quá dài, sai số tham số", "Có", "TC-09, E8"],
    ["Lưu lượng tấn công", "Dò mật khẩu, flood, cào dữ liệu, kết nối không đăng nhập", "Có, nếu đếm theo IP/phiên", "E8, TC-15, TC-16"],
  ], [2.6, 3.4, 2.6, 2.4], [], "faults"));
};
