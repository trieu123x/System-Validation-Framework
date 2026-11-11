# Bỏ hai mục trùng cạnh Tổng quan — 11/11/2026

- Đã bỏ Yêu cầu cấp hàng và Điều chuyển khỏi hàng ngang admin. Hai mục vẫn nằm trong menu xổ xuống Vận hành, giữ nguyên số đếm và hiệu ứng.
- Dùng cờ `dropdownOnly` cho đúng hai mục; các nhóm khác và client không bị thay đổi.
- Build production, lint/type check, static export thành công.
- Agent-browser local: hàng ngang chỉ còn Tổng quan; cả hai liên kết trong menu mở đúng trang; mobile 390px không tràn; client vẫn có Sản phẩm/Hóa đơn.
- Đã cập nhật UI public, giữ nguyên mã băm hai JAR backend và cấu hình dịch vụ. Có tag khôi phục trong checks.json.
- Agent-browser public sau đăng nhập: desktop 1440px/mobile 390px chỉ còn Tổng quan ở hàng ngang; menu xổ xuống còn đủ ba mục; Escape đóng menu; không lỗi JavaScript/console.
- Đã đăng xuất admin sau kiểm thử; không xử lý yêu cầu hay thay đổi dữ liệu nghiệp vụ.
- [Kết quả chi tiết](checks.json), [hàng ngang public](screenshots/public-admin-row-desktop.png), [menu public](screenshots/public-admin-dropdown.png), [mobile public](screenshots/public-admin-mobile.png).
