# Kiểm thử và bàn giao UI

Ngày: 04/11/2026. Phạm vi: frontend admin và chi nhánh, trên mốc nguồn `92614b3`.

## Kết quả

| Kịch bản | Kết quả và bằng chứng |
|---|---|
| Baseline trước đổi | Chụp admin và chi nhánh ở 1440/1024/768/390px: `tools/ui-redesign/before/` |
| TypeScript / production export | `npm run typecheck` và `npm run build` đạt; xuất tĩnh `/admin/`, `/branch/` |
| Nền sáng mặc định | OS dark vẫn nhận nền body `rgb(245, 247, 250)`; không dùng `prefers-color-scheme: dark` |
| Sidebar | Desktop thu gọn về 80px, mở rộng lại; tablet/mobile dùng native dialog; đóng qua điều hướng/Escape |
| POS | 6 fixture sản phẩm, search ra 1/0 kết quả; xóa lọc; sort giá; đổi thẻ/bảng vẫn có đủ hàng và cột SL |
| Cuộn bộ lọc POS | 31 sản phẩm; con lăn trên bộ lọc không cuộn trang sản phẩm; giữ vị trí sau chọn, kết quả trống, cập nhật tồn kho; thử cả khi danh sách đã kéo xuống, dạng thẻ/bảng, 1440/1024/768/390px |
| Câu chữ | Bỏ nhãn không gian/breadcrumb/mô tả lặp; QR, hóa đơn không còn chú thích client/thủ công; nhãn kết nối và bảo mật dùng tiếng Việt; payload thanh toán giữ nguyên |
| Giỏ hàng | Một nút cạnh Tải lại; không có nút lặp trong sidebar/drawer; quay lại chọn hàng và sửa giỏ hoạt động |
| Quote / thanh toán | Payload giữ `{maHang:'TB01',soLuong:1}`, total từ response là 1.090.000 đ; hai click liên tiếp gửi một confirm |
| Hóa đơn | Hiển thị, trở về danh sách và về bán hàng; PDF mẫu 1 trang A4 tại `tools/ui-redesign/after/invoice.pdf` |
| Ngưỡng | Giá trị -1, 1.5, vượt int, rỗng không lưu được; 5 gửi đúng payload và cập nhật UI qua SSE fixture |
| Admin sản phẩm | Tìm hàng theo mã; mở sửa/hủy trở về đúng trạng thái; form giá/nhập kho giữ handler/payload cũ |
| Admin kho và công nợ | Mở kho/sổ CN/sổ NCC, back ưu tiên đóng chi tiết trước khi rời module; không lặp nút ghi phiếu khi đang có form |
| 20 mục theo role | 10 mục admin + 10 mục chi nhánh, mỗi mục tại 1440/1024/768/390px; 80 screenshot trong `tools/ui-redesign/screens/`; không tràn ngang toàn trang |
| Lỗi đọc dữ liệu | Giả lập 503 `/api/products`: banner rõ ràng, Thử tải lại khôi phục; không xóa state ghi của người dùng |
| Guard đăng nhập | Fixture `loggedIn:false` hiển thị form đăng nhập, không hiển thị workspace; chụp desktop/mobile |
| Lịch sử trình duyệt | Back/Forward giữa các mục admin và chi nhánh; refresh giữ mục, nút Quay lại sau refresh, liên kết trực tiếp quay về mục gốc; chuyển cổng thay thế trang chọn đăng nhập trong lịch sử |
| Phục hồi trang / thanh toán | Giả lập `pageshow.persisted` kiểm tra phiên còn/hết hạn trước khi mở workspace; Back giữa các mục khi confirm đang chờ vẫn giữ màn hình thanh toán; không có browser exception |
| JavaScript | Không phát hiện page exception trong toàn bộ kịch bản |
| Tương phản tokens | Chữ/surface 16,03; chữ phụ/surface 5,58; accent/surface 5,93; success 5,05; warning 4,94; danger 4,78; info 4,97. Đây là kiểm tra các cặp token chính, không phải chứng nhận WCAG toàn ứng dụng |
| Review source | `git diff --check` đạt. Không đổi API contract, schema, Java, xác thực backend hoặc cách tính tiền |

## Chạy lại

Từ gốc repository, với Node.js/npm và Microsoft Edge đã có:

```powershell
npm --prefix ui ci
npm --prefix ui run typecheck
npm --prefix ui run build
npm install --prefix tools/browser-check --no-save playwright@1.56.1
node scripts/ui-redesign-smoke.cjs
$env:UI_NAVIGATION_CHECK = '1'
node scripts/ui-redesign-smoke.cjs
Remove-Item Env:UI_NAVIGATION_CHECK
$env:UI_FILTER_CHECK = '1'
node scripts/ui-redesign-smoke.cjs
Remove-Item Env:UI_FILTER_CHECK
```

Nếu Edge ở vị trí khác, đặt biến `EDGE_EXECUTABLE` trỏ tới executable. Script tự mở cổng localhost trống, phục vụ `ui/out` cùng HTTP fixture, kiểm thử qua browser rồi đóng browser/server. Không đăng nhập hoặc ghi vào hệ thống thật. Playwright và ảnh kiểm tra ở `tools/`, không thêm dependency vào frontend production.

Kiểm thử này xác nhận giao diện, API payload được gửi, tương tác và response handling bằng fixture. Không tuyên bố đã kiểm thử lại PostgreSQL/TCP, SMTP, mật khẩu thật, phân quyền backend hoặc mọi hành động thu/chi/cấp hàng trên dữ liệu vận hành. Những thành phần đó không được sửa trong redesign. Firefox và audit accessibility toàn diện chưa thực hiện.

Kiểm tra điều hướng dùng lịch sử thật trên Edge và API fixture. Nhánh BFCache được kích hoạt bằng sự kiện `pageshow.persisted` giả lập; kiểm tra chuyển cổng dùng URL localhost thay cho cổng HTTPS vận hành. Không tuyên bố đã thử chuỗi điều hướng Tailscale thật hoặc xóa được lịch sử cũ của trình duyệt.

## Bàn giao và rollback

- Tài liệu: `ui-audit.md`, `ui-redesign-spec.md`, `screen-map.md` và checklist này.
- Ảnh trước/sau, PDF và log nằm trong `tools/ui-redesign/`, là artifact local không chứa session/token thật.
- Source giao diện, test và docs được giữ trong workspace để review; không tự commit, merge hoặc triển khai lên hosting.
- Có thể rollback các file UI/docs/test của đợt này về mốc `92614b3` sau khi lưu các thay đổi cần giữ, rồi chạy lại build UI. Không cần migration ngược database vì không có thay đổi schema.
- Deploy theo quy trình hiện tại của project chỉ sau khi người dùng duyệt. Build mới đã sẵn ở `ui/out`.
