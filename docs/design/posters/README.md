# Poster thiết bị TOBOKI

Hai poster minh họa nhóm thiết bị thực tế trong danh mục TOBOKI: máy hút bụi công nghiệp và máy tời/pa lăng. Ảnh được tạo bằng công cụ imagegen tích hợp ngày 09/11/2026, không phải ảnh chụp hay thông số của một mã sản phẩm cụ thể.

- [toboki-vacuum.webp](../../../ui/public/posters/toboki-vacuum.webp): bản hiển thị của poster máy hút bụi, 400 × 1200 px, khoảng 32 KB.
- [toboki-hoist.webp](../../../ui/public/posters/toboki-hoist.webp): bản hiển thị của poster thiết bị nâng hạ, 400 × 1200 px, khoảng 30 KB.
- Thư mục `masters/` lưu hai bản PNG gốc. [prompts.md](prompts.md) lưu hai prompt đầy đủ, dùng chế độ built-in imagegen, không dùng CLI/API fallback.

Bản gốc và tài liệu thiết kế được đặt ngoài `ui/public` để không đưa vào bản web xuất tĩnh. `ui/public/posters/` chỉ chứa hai ảnh WebP đang được giao diện sử dụng.

Phần chữ TOBOKI, tiêu đề và mô tả được dựng bằng HTML/CSS trong `WorkspaceShell.tsx` để hiển thị rõ. Poster giới thiệu nhóm thiết bị, không có giá, giảm giá hoặc liên kết sang cửa hàng khác.

Poster hiển thị từ chiều rộng 1440px, cuộn bám hai mép và có vùng bố cục riêng để không che nội dung. Màn hình nhỏ hơn và bản in ẩn poster.
