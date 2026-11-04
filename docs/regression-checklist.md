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
| Giỏ hàng | Một nút ở bên phải, không còn Tải lại cạnh giỏ; không có nút lặp trong sidebar/drawer; quay lại chọn hàng và sửa giỏ hoạt động; tải lại trang tự yêu cầu tồn kho mới và giữ giỏ đã lưu |
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

## Giao diện công nghiệp và thông số kỹ thuật (04/11/2026)

Spec: `docs/specs/2026-11-04-giao-dien-cong-nghiep-thong-so.md`. Lệnh mới `SPECS_GET`/`SPECS` (README §5), 4 cột mới trên `san_pham`, dữ liệu mẫu `db/seed_specs.sql`.

### Tự động

| Kịch bản | Lệnh | Kiểm tra |
|---|---|---|
| Giao thức | `mvn -pl common test -Dtest=ProtocolTest` | `specsRoundTrip`: trường rỗng, số thập phân `3.5`, `SPECS_GET` 0 tham số, `SPECS` 1 tham số |
| Kiểm tra hợp lệ (không cần CSDL) | `mvn -pl common,server test -Dtest='StockServiceSpecTest,AdminApiProductTest' -Dsurefire.failIfNoSpecifiedTests=false` | Công suất 0/100001, trọng lượng 1.25, 11 cặp, key 41 ký tự, key trùng sau trim, ký tự điều khiển/RLO đều bị E05; biên hợp lệ thì qua; tin `SPECS` 31 mặt hàng < 4096 byte; body thiếu 4 trường = null/{} |
| Giao diện | `$env:UI_SPECS_CHECK='1'; node scripts/ui-redesign-smoke.cjs` | Ở 390/768/1024/1440px: header/sidebar/drawer `rgb(27, 31, 36)`, nút chính `rgb(242, 183, 5)`, nền `rgb(243, 244, 246)`; chip `1100 W` trên TB22, TB26 không có chip; lọc "> 1500 W" và "Chưa có thông số" đúng theo `seed_specs.sql`; bảng sắp xếp theo công suất; Back/Forward giữ `#view=`; hóa đơn có `· 1100 W ·`, bản in không nền màu, chữ đen; form admin báo lỗi ngay dưới ô mà không xóa dữ liệu |

### Thủ công end-to-end (server/client thật, PostgreSQL local)

Chạy trên cổng riêng để không đụng phiên khác: `server.jar tcp.port=5100 admin.http.port=8180 discovery.enabled=false`, `client.jar server=127.0.0.1 server.port=5100 http.port=8190 open.browser=false`.

| Bước | Thao tác | Kết quả 04/11/2026 |
|---|---|---|
| 1 | Khởi động server mới (chạy `SpecSchema.ensure`), nạp `db/seed_specs.sql` 2 lần, khởi động lại server | Không lỗi; `\d san_pham` có `cong_suat_w`, `dien_ap_v`, `trong_luong_kg`, `thong_so`, mỗi cột một CHECK; 24/31 mã có công suất, 30/31 có thông số tự do |
| 2 | `GET /api/products` rồi `PUT /api/products/TB22` với `congSuatW: 0`, sau đó `1200` | GET trả TB22 `1100`; PUT 0 → HTTP 400 (E05 "Cong suat phai tu 1 den 100000 W"), DB giữ nguyên; PUT 1200 → `cong_suat_w = 1200` |
| 3 | CN01 (client mới) đăng nhập lại | `nhat_ky`: `INVENTORY_GET` → `INVENTORY` (3297 byte) → `SPECS_GET` → `SPECS` (442 byte); thẻ TB22 hiện 2 chip `1200 W` và `220 V`; lọc "> 1500 W" còn 16 thẻ |
| 4 | Bán 1 TB22 qua giỏ hàng, xác nhận, xem bản in | Tồn CN01 12 → 11; `hoa_don_ban` PAID có `congSuatW = 1200`; dòng hóa đơn `TB22 / TK-35 · 1200 W · cái`; print preview không nền màu |
| 5 | Client cũ (jar trước thay đổi) CN02 nối server mới, bán 1 TB22 | Đăng nhập và bán được (tồn 10 → 9); client cũ không gửi `SPECS_GET`; POS không có chip/bộ lọc công suất; không lỗi trình duyệt |
| 6 | Chiều ngược lại: client mới CN03 nối server cũ (cổng 5200), tải lại tồn kho 2 lần | 3 `INVENTORY_GET` nhưng chỉ 1 `SPECS_GET` (sau `ERROR\|E01` đầu tiên client thôi gửi); không toast lỗi; `coThongSo: false`, POS như cũ |

Sau khi chạy, đặt lại dữ liệu mẫu nếu cần: `psql ... -f db/seed_specs.sql` (TB22 về 1100 W).

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
$env:UI_SPECS_CHECK = '1'
node scripts/ui-redesign-smoke.cjs
Remove-Item Env:UI_SPECS_CHECK
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
