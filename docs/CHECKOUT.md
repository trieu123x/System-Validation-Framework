# Giỏ hàng, thanh toán QR và hóa đơn

Trong trang chi nhánh, chọn số lượng rồi bấm **Thêm vào giỏ** ở từng sản phẩm. Bấm **Giỏ hàng** ở bên phải bảng, cạnh nút **Tải lại**, để sửa số lượng, xóa hàng, nhập tên khách (tùy chọn), và bấm **Tiến hành thanh toán**. Trang thanh toán hiển thị QR, chi tiết đơn và nút **Xác nhận thanh toán** để client bấm thủ công. Giỏ hàng không lặp lại trong menu.

**Ngưỡng tối thiểu** là mục riêng trong menu. Trang này hỗ trợ tìm kiếm, lọc theo danh mục/trạng thái, sắp xếp và lưu ngưỡng từng mặt hàng. Ngưỡng phải là số nguyên không âm; 0 tắt cảnh báo. Các màn có nút quay lại theo ngữ cảnh: giỏ về chọn hàng, thanh toán về sửa giỏ, chi tiết hóa đơn về danh sách; các mục khác quay lại màn trước. Menu đóng khi chọn chức năng, bấm bên ngoài hoặc nhấn Escape.

Trang admin cũng dùng menu ba gạch. Mục **Ngưỡng tối thiểu** tổng hợp ngưỡng của các chi nhánh, có tìm kiếm, lọc và sắp xếp. Nút quay lại ưu tiên đóng chi tiết kho/sổ công nợ hoặc hủy chỉnh sửa hàng hóa; khi đang ở danh sách, nút quay lại trở về mục trước.

QR mặc định là mã dùng thử, chứa mã đơn và tổng tiền; chưa chuyển khoản ngân hàng. Đổi `PAYMENT_QR_URL` trong `ui/lib/checkout.ts` thành đường dẫn ảnh QR của bạn, rồi đặt `PAYMENT_QR_IS_DEMO = false`. URL hỗ trợ `{amount}` (số tiền VND) và `{reference}` (mã đơn). Build lại giao diện sau khi đổi cấu hình.

Sau xác nhận thành công, ứng dụng hiển thị hóa đơn nền trắng, điểm nhấn xanh TOBOKI. Bấm **In / Lưu PDF** để in hoặc chọn lưu PDF trong hộp thoại trình duyệt. Mục **Hóa đơn** cho phép mở và in lại 100 hóa đơn đã thanh toán gần nhất của chi nhánh. Đây là hóa đơn bán hàng nội bộ.

Giỏ và mã đơn đang thanh toán được giữ trong trình duyệt theo từng chi nhánh. Giá và tên sản phẩm được chốt trên server khi tạo đơn. Đơn chờ thanh toán chưa giữ hàng; khi xác nhận, server kiểm tra tồn và trừ tất cả mặt hàng trong một transaction. Nếu một mặt hàng không đủ, toàn bộ thao tác được hoàn tác. Bấm xác nhận lại cùng mã đơn không trừ kho thêm. Client tự tải lại tồn và gửi cảnh báo thiếu hàng theo luồng hiện có.

Build đồng thời server, client và UI vì có bổ sung lệnh TCP `CHECKOUT` / `CHECKOUT_RESULT`. Khi server khởi động, migration cộng thêm tự tạo bảng `hoa_don_ban`; dữ liệu hiện có được giữ nguyên. HTTP của client đợi kết quả đã commit từ server trước khi báo hoàn tất.

Kiểm tra:

```powershell
cd ui
npm install
npm run typecheck
npm run build
cd ..
mvn -pl server,client -am test
```

Để chạy thêm kiểm thử PostgreSQL, đặt `SVF_TEST_DB_URL`, `SVF_TEST_DB_USER`, `SVF_TEST_DB_PASSWORD` trỏ tới database thử nghiệm. Bộ `ReceiptIntegrationTest` tạo schema ngẫu nhiên riêng cho từng test và xóa schema đó khi xong. Các ca mới kiểm tra giữ nguyên giá hóa đơn, phân quyền chi nhánh, xác nhận đồng thời và rollback nhiều sản phẩm.
