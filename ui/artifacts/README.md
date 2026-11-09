# Giao diện admin và chi nhánh

Thẻ hàng hóa đã thu gọn ảnh và khoảng cách nội dung trên admin/client; ô số lượng và nút thêm giỏ nằm cùng hàng trên điện thoại. Ảnh cận cảnh mới: `compact-cards-admin-1920.png`, `compact-cards-branch-1920.png`, `compact-cards-admin-360.png`, `compact-cards-branch-360.png`.

Ảnh hiện tại dùng header đỏ, catalog trắng/xám, bộ lọc thu gọn và hai poster thiết bị TOBOKI. Các ảnh kiểm tra dùng API giả lập cùng ảnh sản phẩm sẵn có; số liệu trong ảnh là dữ liệu thử nghiệm.

- `posters-admin-overview-1440.png`, `posters-admin-overview-1920.png`: tổng quan admin và hai poster.
- `posters-admin-products-1440.png`, `posters-admin-products-1920.png`: hàng hóa kho tổng.
- `posters-branch-stock-1440.png`, `posters-branch-stock-1920.png`: bán hàng tại chi nhánh.
- `storefront-admin-390-viewport.png`, `storefront-branch-390-viewport.png`: catalog trên điện thoại.
- `admin-redesign-overview.png`, `admin-redesign-products.png`, `admin-redesign-warehouses.png`, `admin-redesign-debts.png`, `admin-redesign-mobile.png`: các màn hình quản trị sau khi dọn mã/CSS cũ.
- `storefront-client-cart.png`: giỏ hàng hiện tại.
- `login-split-admin.png`, `login-split-client.png` và các ảnh cùng tên có hậu tố `-mobile`: login đỏ, trắng và xám than.

`storefront-checks.json`, `admin-redesign-checks.json` và `login-split-checks.json` đã chạy lại sau cleanup: kiểm tra 10 màn hình admin, 11 màn hình client, tìm kiếm/lọc/menu, checkout/hóa đơn, sửa sản phẩm, xử lý yêu cầu và đăng nhập/khôi phục mật khẩu bằng API giả lập. Các kiểm tra này không thay thế tích hợp với backend Java và cơ sở dữ liệu thực tế.

`posters-checks.json` ghi lại kiểm tra poster tải được, đúng nhóm thiết bị, không che nội dung, cuộn bám, ẩn dưới 1440px/khi in và không tràn ngang. Những JSON khác giữ kết quả kiểm tra lịch sử; ảnh cũ/trùng đã được dọn, không dùng làm mô tả giao diện hiện tại.

Bản gốc PNG và prompt poster nằm tại [docs/design/posters](../../docs/design/posters/README.md); `ui/public/posters/` chỉ giữ 2 WebP đang hiển thị. Login dùng Manrope tại `ui/fonts/` cùng giấy phép SIL Open Font License.

Build bằng `npm run build` trong `ui`; kết quả xuất tại `ui/out`. Kiểm thử hồi quy được duy trì tại `scripts/ui-redesign-smoke.cjs`. Chi tiết đợt dọn: [docs/CLEANUP.md](../../docs/CLEANUP.md).
