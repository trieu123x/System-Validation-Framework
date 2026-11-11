# Thu gọn điều hướng admin và client — 11/11/2026

Đã bỏ toàn bộ hàng mục con không xổ xuống ở bên phải các nhóm chức năng, cùng vạch ngăn sau nhóm. Giữ nguyên các trang trong dropdown, hiệu ứng mở/đóng và thông tin tài khoản/kết nối.

## Kiểm tra

- Next.js production build, kiểm tra TypeScript và xuất static: đạt.
- Local admin: 1440, 768, 390, 320px; client: 1440 và 320px. Không tràn ngang; không còn `.industry-view-links`; border-right của nhóm bằng 0px.
- Dropdown admin Hàng hóa & kho vẫn có Hàng hóa/Kho chi nhánh; client Bán hàng vẫn có Sản phẩm/Hóa đơn. Escape đóng menu trên local.
- Public admin và client tại 1440 và 390px: không tràn ngang, không còn mục con bên phải. Admin chuyển tới Hàng hóa bằng dropdown thành công.
- Client mở dropdown thành công; công cụ click và phím bấm không phát sự kiện ổn định sau đổi tab. Đã xác minh handler Hóa đơn bằng DOM click: chuyển đúng `#view=invoices`, tiêu đề Hóa đơn bán hàng, dropdown đóng. Không sửa ứng dụng dựa trên sự cố công cụ này.
- Console và page errors của hai trang public: rỗng.
- Không có request ghi dữ liệu kinh doanh trong network kiểm thử; chỉ đăng nhập/đăng xuất, heartbeat và đọc dữ liệu. Đã đăng xuất và xóa profile kiểm thử tạm.
- Đây là kiểm tra điều hướng liên quan; không kiểm thử thao tác bán hàng, tồn kho hay toàn bộ website.

## Triển khai

Đã triển khai cả admin/client: `phanphoi:nav-only-20261111-212040`.
Image chỉ thay file `/app/ui/out`, hai backend JAR có SHA256 giữ nguyên so với bản trước; không thay cấu hình Docker/Tailscale/database.

Tag dự phòng: `phanphoi:before-nav-only-20261111-212040`.
Screenshot và network đã lọc nằm cùng thư mục báo cáo.
