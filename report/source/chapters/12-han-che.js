// Chương 12. Hạn chế và hướng phát triển (N3)
module.exports = (L) => {
  const { add, P, H1, H2, B } = L;

  add(H1("12. Hạn chế và hướng phát triển", "12"));
  add(H2("12.1. Hạn chế"));
  add(B("**Môi trường đo một máy.** Client ảo, server và CSDL chạy trên cùng một máy qua loopback. Không có độ trễ đường truyền thật, client tranh CPU với server, và mọi chi nhánh ảo dùng chung một IP. Số tuyệt đối sẽ khác trong LAN nhiều máy; điều đáng tin là so sánh tương đối giữa các biến thể."));
  add(B("**“Rút dây” ở E2 là mô phỏng ở tầng ứng dụng:** byte vẫn tới máy nhưng client bỏ đi. Chưa có lần đo nào rút dây thật trên nhiều máy, kèm bắt gói bằng Wireshark."));
  add(B("**Chưa mã hóa đường truyền.** Mật khẩu đi dạng rõ trong lệnh LOGIN vì chưa có TLS. Trang công ty có đăng nhập nhưng chạy HTTP thường trên localhost. Phiên admin giữ trong bộ nhớ nên server khởi động lại thì phải đăng nhập lại. API thực nghiệm không đòi đăng nhập khi bật `experiment.api`."));
  add(B("**At-least-once chưa tổng quát.** Gửi lại theo trạng thái chỉ phủ các tin gắn với trạng thái trong CSDL. BROADCAST gửi vào socket “chết” mà server chưa phát hiện vẫn có thể mất. Giao thức chưa có số thứ tự và xác nhận chung cho mọi loại tin."));
  add(B("**Broadcast tuần tự trên NIO.** Ở chế độ ghi thẳng, luồng gọi broadcast tự ghi lần lượt vào mọi socket, nên chậm hơn BIO + hàng đợi khoảng 3 lần ở 1000 chi nhánh (E9)."));
  add(B("**Một tiến trình server.** Phiên, Selector và hàng đợi gửi đều nằm trong một tiến trình; chưa có cơ chế chạy nhiều server hay chuyển dự phòng."));
  add(B("**Giới hạn kích thước tin.** Danh sách dài hơn 4096 byte bị cắt bớt (lịch sử tối đa 200 phiếu). Tin `INVENTORY` của 31 mặt hàng đã dài 3358 byte, chỉ còn chỗ cho khoảng 5–6 mặt hàng nữa. Chưa có phân trang."));
  add(B("**Giám sát dựa trên ngưỡng.** Kẻ tấn công đi dưới ngưỡng tần suất sẽ không bị phát hiện; các ngưỡng mặc định được chọn theo thực nghiệm, chưa có cơ chế tự điều chỉnh."));
  add(H2("12.2. Hướng phát triển"));
  add(B("**TLS:** dùng `SSLSocket` cho BIO và `SSLEngine` cho NIO, đo thêm chi phí bắt tay và độ trễ; đổi đăng nhập sang cơ chế không gửi mật khẩu dạng rõ."));
  add(B("**Broadcast song song trên NIO:** chia danh sách chi nhánh thành các phần và giao cho các worker ghi song song, giữ số luồng cố định; đo lại bằng E9 để so với BIO + hàng đợi."));
  add(B("**Số thứ tự và ACK ở tầng ứng dụng** cho mọi tin đẩy, kể cả broadcast, để có at-least-once tổng quát; bên nhận khử trùng theo số thứ tự."));
  add(B("**Nhiều server dùng chung CSDL,** chuyển tin giữa các server bằng publish/subscribe (ví dụ `LISTEN/NOTIFY` của PostgreSQL). Cách trừ kho hiện tại vẫn đúng trong mô hình này nhờ câu `UPDATE` có điều kiện."));
  add(B("**Phân trang** cho các tin danh sách, hoặc tăng giới hạn dòng kèm tiền tố độ dài cho tin lớn."));
  add(B("**Bán hàng khi mất mạng:** hàng đợi phía client có số thứ tự, gửi bù khi nối lại; phân bổ công bằng khi khan hàng; dự báo ngày hết hàng từ lịch sử bán."));
  add(B("**Đo trên LAN nhiều máy:** chạy chi nhánh ảo trên vài máy khác nhau để có nhiều IP nguồn, rút dây thật, và bắt gói bằng Wireshark để đối chiếu với số đo tầng ứng dụng."));
};
