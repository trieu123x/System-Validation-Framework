# Dọn project — 09/11/2026

Đợt dọn này giữ bố cục và hành vi hiện tại, không thay đổi Java, SQL, API, xác thực hay dữ liệu vận hành.

## Phần đã dọn

- Bỏ nhánh banner luôn tắt, kiểu `Feature`, props `showFeatures`/`features`, biến số cột mobile không còn sử dụng và mũi tên danh mục luôn bị ẩn.
- Bỏ `showDrawerStatus` cùng phần trạng thái lặp trong menu; bỏ props `brand`/`highlight` và logo/phụ đề ẩn của Shell.
- Bỏ khối ghi chú kho tổng bị ẩn bằng CSS; giữ đủ các bộ lọc và thao tác quản lý hàng hóa.
- Loại hơn 140 selector của sidebar, drawer modal, header/login cũ, banner và ô tìm kiếm đã thay thế. Giữ CSS nền tảng đang được dùng bởi các màn hình và trạng thái động.
- Chuyển 2 PNG gốc cùng README/prompt poster sang [design/posters](design/posters/README.md). Public và bản xuất chỉ giữ 2 WebP đang hiển thị, giảm khoảng 3,3 MiB tệp thiết kế trong bản web.
- Xóa 35 ảnh UI cũ/trùng, 11 tệp tải/thử nghiệm đã hết dùng (gồm ZIP Node đã giải nén và file META cũ), 4 bản sao tài liệu/PNG trong output. Tổng **50 tệp**, thu hồi khoảng **51 MiB**; dung lượng là ước tính vì ảnh kiểm tra được cập nhật trong cùng lượt dọn.
- Giữ ảnh và kết quả QA hiện tại, các báo cáo JSON lịch sử, bộ Node đã cài, phụ thuộc đang sử dụng, cấu hình local, dữ liệu thực nghiệm và báo cáo đồ án.
- Loại `ui/artifacts/` khỏi Docker build context.

## Kiểm thử UI được duy trì

`scripts/ui-redesign-smoke.cjs` từng tìm sidebar/drawer và các nút không còn tồn tại. Script đã được cập nhật cho menu nhóm xổ xuống, tìm kiếm chung, bộ lọc thu gọn, vị trí giỏ hàng và dialog sửa hàng hóa. Giữ kiểm tra ngưỡng, số tiền/payload checkout, chống xác nhận hai lần, PDF, lỗi/tải lại và phiên đăng nhập. Các nhánh đăng nhập, điều hướng, bộ lọc, nhận/từ chối hàng và chuông thông báo đều đã chạy lại thành công.

Nếu đã cài Playwright ở `tools/browser-check`, chạy từ gốc project:

```powershell
node scripts/ui-redesign-smoke.cjs
```

Có thể dùng Playwright ở vị trí khác bằng `PLAYWRIGHT_MODULE`; `EDGE_EXECUTABLE` chọn đường dẫn Edge. Script dùng API fixture tại localhost, tự đóng trình duyệt/máy chủ và không ghi lên hệ thống vận hành.

## Rà soát và xác minh

- Đã rà tham chiếu trong 29 file TS/TSX của UI, 16 file của landing và 101 file Java. Không phát hiện export/component hay private method Java chắc chắn không dùng cần xóa thêm. Giữ `metadata` của Next.js và `ServerMain` do framework/Maven sử dụng.
- Build Next.js và landing: đạt; TypeScript kiểm tra cả local/parameter không sử dụng.
- Giao diện: kiểm tra 10 màn hình admin và 11 màn hình client, tìm kiếm/danh mục, menu, giỏ hàng/thanh toán/hóa đơn, sửa sản phẩm, xuất hàng/đề xuất/báo thiếu, login và khôi phục mật khẩu bằng API giả lập.
- Landing `data:check`: đạt, giữ 31 sản phẩm, 10 danh mục, 15 chi nhánh và 31 nguồn ảnh.
- `git diff --check`: đạt. Không chạy lại Maven/PostgreSQL/TCP vì không thay đổi backend; rà soát tham chiếu không thay thế phân tích tĩnh đầy đủ hoặc kiểm thử tích hợp.
