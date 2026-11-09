# Đặc tả UI TOBOKI

> Phần dưới ghi lại phương án thiết kế ban đầu. Giao diện hiện tại dùng header đỏ, menu nhóm xổ xuống có animation, bộ lọc thu gọn và poster thiết bị hai bên ở màn hình rộng; login/landing đồng bộ đỏ, trắng và xám than. Chi tiết đợt dọn mã cũ và kiểm tra hiện tại: [CLEANUP.md](CLEANUP.md).

## Phạm vi

Làm mới giao diện nội bộ trên hai route hiện có. Tham khảo bố cục dễ quét của mẫu người dùng và định hướng seller/admin trong plan. Giữ dữ liệu, quyền và API. Không có thay đổi backend.

## Hệ thiết kế

- Nền sáng mặc định, kể cả khi hệ điều hành dùng dark. Nền ngoài xám `#F5F7FA`, panel trắng, chữ `#182230`, chữ phụ `#5C697B`, viền `#E4E9F0`.
- Xanh TOBOKI `#245BD6` cho hành động chính, hover `#1B49B3`; nền xanh nhạt `#EDF3FF`. Trạng thái success/warn/danger có nhãn kèm màu.
- Font hệ thống hỗ trợ tiếng Việt, cỡ body 14px; page title 26px, section title 16px, bảng 13–14px, control 36–42px. Số tiền canh phải và dùng tabular numerals.
- Radius 6/10/14px, spacing 4/8/12/16/24/32; shadow nhẹ. Dùng tokens chung và tái sử dụng `Card`, `Badge`, `Stat`, `FilterBar`, `SortTh`, `Shell` hiện có.

## Bố cục

- Từ 1200px: sidebar trái cố định, nút ba gạch thu gọn/mở rộng; active rõ, icon có tooltip và accessible name. Header workspace trắng, trạng thái và đăng xuất giữ vị trí phải.
- Dưới 1200px: menu drawer native dialog, focus được giữ trong modal; Escape, nút đóng, click backdrop đóng menu.
- Tiêu đề ngắn và back theo ngữ cảnh hiện có. Bỏ breadcrumb, nhãn không gian và mô tả lặp nội dung. Nội dung có vùng cuộn ngang riêng cho bảng, không tràn cả trang.
- Không thêm ô tìm toàn hệ thống thiếu API. Tìm kiếm/lọc ở đúng module bằng dữ liệu/API sẵn có.
- Thông báo mở bằng icon chuông ở phía phải header cho cả admin và chi nhánh, không lặp trong sidebar/drawer. Chi nhánh có badge lấy từ số thông báo chưa đọc thực tế; admin không tự tạo số đếm. Tooltip/accessible name giữ nhãn dù chỉ hiển thị icon.
- Các mục admin/chi nhánh đồng bộ vào lịch sử trình duyệt qua fragment `#view=...`; Back/Forward và tải lại giữ đúng mục. Nút quay lại trong ứng dụng ưu tiên chi tiết hiện có, rồi mục trước; mở trực tiếp một mục thì quay về Tổng quan/Bán hàng. Không chặn người dùng rời ứng dụng ở mục gốc.
- Chuyển cổng đăng nhập dùng `location.replace` để trang chọn cổng không nằm ngay sau workspace trong lịch sử mới. Khi trình duyệt phục hồi trang từ BFCache, kiểm tra lại phiên trước khi hiển thị workspace; phiên hết hạn vẫn phải đăng nhập. Fragment khôi phục mật khẩu được giữ riêng. Điều hướng giữa các mục tạm khóa khi đang xác nhận thanh toán.

## POS và quản trị

- POS: bộ lọc bên trái, toolbar tìm sản phẩm, lựa chọn Thẻ/Bảng, giỏ ở bên phải. Bỏ nút Tải lại cạnh giỏ; khi mở/tải lại trang hoặc kết nối trở lại, tự yêu cầu tồn kho mới sau khi luồng cập nhật sẵn sàng. Thẻ có ảnh, mã/model, giá, tồn, trạng thái, số lượng và thêm giỏ. Bảng vẫn có các cột và sort như trước. Không giả rating/giảm giá.
- Admin: KPI dạng panel độc lập, bảng thoáng hơn, nhóm form rõ. Bổ sung tìm sản phẩm bằng dữ liệu danh sách đã nhận; giữ danh mục và các form nghiệp vụ.
- Checkout: giữ server quote, QR thủ công, cơ chế phục hồi, confirm idempotent và invoice; đồng bộ màu/nút với giao diện sáng. CSS hóa đơn/in được giữ riêng.
- Loading/empty/error/busy thể hiện bằng nhãn, focus bàn phím rõ; thông báo lỗi không xóa dữ liệu đang nhập.
- Bộ lọc POS có vùng cuộn riêng, giới hạn theo chiều cao màn hình và giữ thanh tiêu đề. Danh sách lựa chọn giữ nguyên khi lọc, nên vị trí cuộn không bị đặt lại khi kết quả ít đi, trống hoặc cập nhật tồn kho. Trên điện thoại có thể đóng/mở bộ lọc, vùng cuộn cao tối đa 60% màn hình.
- Câu chữ chỉ giữ nhãn, số liệu và hướng dẫn cần thiết. Bỏ chú thích QR mẫu dài, ghi nhận bởi client, thông tin giao thức/bảng dữ liệu và thống kê JVM; dùng tên dễ hiểu cho kết nối và bảo mật. API xác nhận thủ công và dữ liệu QR không đổi.
- Thông báo nổi cho phép bấm xuyên phần nội dung, có nút đóng riêng; không chặn nút Giỏ hàng ngay sau khi thêm hàng. Khoảng chừa khi cuộn giúp nút đang thao tác không khuất dưới thanh đầu trang.

## Kiểm tra và bàn giao

Viewport 390/768/1024/1440, thêm 200% qua viewport tương đương; kiểm tra người dùng OS dark vẫn nhận nền sáng. Build và regression các hành động hiện có. Không tuyên bố đạt WCAG toàn bộ chỉ từ kiểm tra tự động; ghi rõ phạm vi thực tế ở checklist.

## Hợp đồng component

| Component | Props / nguyên tắc |
|---|---|
| `Shell<T>` | `nav/value/onChange`, `title`, `back`, `navigationDisabled`. Chỉ trình bày và điều hướng; không gọi API. Sidebar và drawer cùng danh sách theo role |
| `Card`, `Stat`, `Badge` | Giữ props trước redesign, áp tokens chung; số liệu do màn hình truyền vào, không phát sinh KPI |
| `SortTh`, `FilterBar`, `Facet` | Giữ sort/filter state tại module; th có `scope=col`; radio có nhãn |
| `ProductImage` | `src/alt/category/size`, thêm `fit='contain'` cho thẻ POS; fallback như cũ khi ảnh không tải được |
| `Sales` | Nhận inventory/requests/reported/cart/online và callback `onAdd/onCart`; dùng nguyên shape và kiểm tra SL; thẻ và bảng dùng chung `StockQuantity` |
| `LoadingWorkspace`, `Empty` | Loading/empty có cấu trúc, không tạo dữ liệu nghiệp vụ giả |

Không thêm UI library hoặc font tải từ mạng. Ảnh vẫn từ nguồn Cloudinary hiện có; tên dài trong bảng có chiều rộng tối thiểu, bảng cuộn trong panel thay vì ép chữ thành cột hẹp. Thông báo ở góc trên để tránh che tổng tiền/thanh toán.
