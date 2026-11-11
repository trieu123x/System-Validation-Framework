# Đổi vị trí danh mục và bộ lọc client — 11/11/2026

Đã thiết kế lại và triển khai lên client public, theo AGENTS.md và skill ui-ux-pro-max.

## Giao diện

- Danh mục có ảnh chuyển thành cột trái trên desktop: ảnh nhỏ, tên nhóm, số mặt hàng, trạng thái chọn rõ và nút Tất cả sản phẩm.
- Bộ lọc chuyển lên trên danh sách sản phẩm: tìm theo tên/mã/model, mức tồn và tình trạng nhập hàng. Xóa bộ lọc tại cùng vị trí.
- Bỏ khối thương hiệu lặp lại trong cột trái của client để dành diện tích cho danh mục.
- Tablet/mobile: danh mục mở/thu gọn; chọn nhóm sẽ thu gọn và đưa focus về nút danh mục.
- Mobile: tìm kiếm hiện ngay; các điều kiện mức tồn/nhập hàng mở khi cần để danh sách sản phẩm xuất hiện sớm hơn.
- Giữ nguyên lọc, tìm kiếm dùng chung với header, sắp xếp, chế độ thẻ/bảng và thao tác chọn hàng.
- Danh mục admin giữ bố cục hiện có; component dùng chung chỉ bổ sung biến thể sidebar cho client.

## Kiểm tra

- Build production Next.js, lint/type checking và static export thành công. `git diff --check` đạt; chỉ có cảnh báo LF/CRLF.
- Agent-browser local với fixture tại 1920/1440/1024/900/768/601/390/320px: không tràn trang, trường lọc, nhãn danh mục hay thẻ sản phẩm; không ảnh hỏng.
- Chọn Máy hút bụi: 5 sản phẩm; kết hợp Dưới ngưỡng và Đang chờ công ty: 1; đổi Không chờ: trạng thái rỗng; Xóa bộ lọc trả lại 31 sản phẩm fixture.
- Tìm TB16: 1; chuỗi không khớp: trạng thái rỗng; sắp xếp và chuyển thẻ/bảng hoạt động.
- Chọn Máy rửa xe trên mobile: 6 sản phẩm, danh mục tự thu gọn; mở điều kiện lọc bổ sung và lọc được.
- Axe WCAG 2A/2AA tại khu vực danh mục/bộ lọc: desktop và mobile không có violation hoặc incomplete trong các lượt quét.
- Kiểm tra admin local: vẫn có 10 nhóm dạng thẻ, bộ lọc cũ và không có biến thể sidebar.
- Đã cập nhật các selector bị ảnh hưởng trong script smoke có sẵn và kiểm tra cú pháp bằng Node; không chạy toàn bộ suite smoke.
- Public sau đăng nhập CN01: desktop 1440px, tablet 768px, mobile 390px đúng bố cục, không tràn. Chọn Máy rửa xe hiện đúng 6 mặt hàng; reset trả lại 31; không lỗi JavaScript/console.
- Không bấm thêm hàng, thanh toán, tạo đơn hoặc lưu dữ liệu thật. [Network public đã bỏ headers/body](public-network.json) không có request ghi nghiệp vụ.

## Triển khai

Image: `phanphoi:catalog-20261111-211008`. Image khôi phục: `phanphoi:before-catalog-20261111-211008`.

Chỉ cập nhật tệp UI trên nền image đang chạy. Mã băm server.jar/client.jar giữ nguyên; không đổi cấu hình Docker/Tailscale, không chạy migration hay khởi động lại PostgreSQL. Admin/client đã khởi động lại bằng luồng triển khai hiện có.

HTML client public trả 200 và có SHA-256 `81d14e059cbe1778e5746003df2ba50536c26fdc25567916fb188010ac16a30e`, khớp bản phát hành. Đã đăng xuất CN01 sau kiểm thử.

## Bằng chứng

- [Client desktop public](screenshots/public-desktop.png).
- [Client tablet public](screenshots/public-tablet.png).
- [Client mobile public](screenshots/public-mobile.png).
- [Mobile đã chọn danh mục](screenshots/public-mobile-selected.png).
- [Kết quả chi tiết](checks.json).

Ctrl+F5 để tải bản mới trong tab đang mở. Các luồng ghi dữ liệu không được kiểm thử trong nhiệm vụ này.
