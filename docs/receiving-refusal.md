# Nhận hoặc từ chối hàng đã gửi

Mục Nhận hàng có hai thao tác với đơn `DA_GIAO`: nhập số thực nhận rồi Đồng ý nhận hàng, hoặc Từ chối toàn bộ đơn. Từ chối không yêu cầu nhập số lượng, có bước xác nhận hoàn hàng về nơi gửi. Đơn đã nhận xong không được từ chối qua thao tác này.

- Hàng từ kho tổng: hoàn lại số đã xuất; giữ nguyên phiếu xuất gốc để tra cứu, loại đơn từ chối khỏi lịch sử nhập và tổng xuất ròng khi đối soát.
- Hàng điều chuyển: hoàn về kho chi nhánh gửi, hủy phiếu điều chuyển và ghi bút toán `TRA_NHAN`/`TRA_GIAO` đối ứng với giá trị gốc. Giữ các bút toán ban đầu; thay đổi giá sau khi gửi không làm đổi số tiền hoàn.
- Khóa dòng yêu cầu trong một transaction: từ chối/nhận đồng thời chỉ một thao tác thành công; thử lại không hoàn kho hoặc công nợ lần hai. Không cộng tồn kho chi nhánh nhận khi từ chối.
- `REJECT_RESULT|maYc|OK/ERROR|maHang/thongBao` chỉ xác nhận sau khi xử lý. Client chờ kết quả trước khi báo thành công; lỗi hoặc hết thời gian chờ không tự đóng yêu cầu. Đồng bộ lại cả các yêu cầu đã từ chối khi đăng nhập lại.
- `ReceiptSchema.ensure` bổ sung hai loại bút toán hoàn hàng cho cả database cũ và mới. Không xóa phiếu hoặc bút toán lịch sử.

Phải dùng đồng bộ `server/target/server.jar`, `client/target/client.jar` và `ui/out` của bản này, rồi khởi động lại ứng dụng công ty/chi nhánh. Không chỉ thay frontend: phiên bản cũ chưa cho từ chối `DA_GIAO` và chưa hỗ trợ xác nhận kết quả mới.

Snapshot của client mới có `canRejectDelivered=true`. Khi client đang chạy còn cũ, giao diện vẫn hiển thị nút Từ chối nhưng khóa thao tác với hàng đã gửi, kèm nhắc mở lại ứng dụng bằng bản mới; tránh gọi đường xử lý cũ vốn đóng đơn trước khi công ty xác nhận.

Kiểm tra bằng PostgreSQL riêng: `ReceiptIntegrationTest` (16 trường hợp, gồm hoàn kho, hoàn điều chuyển, thử lại, tranh chấp nhận/từ chối, sai chi nhánh và rollback). `RejectionTest` kiểm tra client không đóng yêu cầu khi lỗi và không mở lại đơn đã từ chối vì tin giao cũ. Giao diện dùng API fixture tại localhost, `UI_RECEIVING_CHECK=1 node scripts/ui-redesign-smoke.cjs`: bốn kích thước 1440/1024/768/390, hai nút hiển thị, hủy xác nhận không gửi, đúng payload nhận/từ chối, lỗi giữ nguyên đơn. Không dùng dữ liệu bán hàng thật để thử.
