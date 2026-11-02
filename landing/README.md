# Landing TOBOKI

Trang giới thiệu dùng React, TypeScript và Vite. Giao diện nghiệp vụ nằm ở `../ui/`.

Chạy trong thư mục `landing/` với Node.js 22.12 trở lên:

```sh
npm ci
npm run data:check
npm run lint
npm run build
npm run preview
```

Copy `.env.example` thành `.env.local` và điền URL triển khai trước khi build nếu cần
liên kết tới trang quản trị, chi nhánh hoặc canonical. Bản build nằm trong `dist/`.

Dữ liệu trong `src/data/` được sinh từ SQL và nguồn ảnh của dự án. Dùng
`npm run data:sync` để cập nhật, `npm run data:check` để kiểm tra đồng bộ.
Giữ `image-credits.json` để lưu tác giả, nguồn và giấy phép ảnh.

QA trình duyệt và Lighthouse dùng tooling riêng, không nằm trong dependency ứng dụng:

```sh
npm install --prefix artifacts/tooling --no-save playwright-core lighthouse
```

Sau khi build và mở preview tại `http://127.0.0.1:4173/`, chạy `npm run verify`
ở terminal khác. Đặt `CHROME_PATH` tới Chrome đã cài trên máy; có thể đặt
`QA_URL` để dùng địa chỉ preview khác. Kết quả được ghi vào `artifacts/`.
Các báo cáo có sẵn chỉ xác nhận phiên bản được ghi trong `artifacts/VALIDATION.md`.
