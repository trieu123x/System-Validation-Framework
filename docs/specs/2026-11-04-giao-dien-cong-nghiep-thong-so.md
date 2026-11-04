# Giao diện công nghiệp B2B và thông số kỹ thuật máy

Status: draft · Date: 2026-11-04

## Problem

TOBOKI bán máy xây dựng (hút bụi, cắt gạch, tời, rửa xe, đầm, khoan, bơm...), nhưng giao diện admin và chi nhánh trong `ui/` đang theo kiểu SaaS chung chung: nền xanh `#245BD6`, thẻ sản phẩm chỉ có tên, model và giá. Catalog máy móc B2B (tham khảo commercetools B2B Manufacturing kit, mẫu "Factory dashboard" của Material Desktop, các shot warehouse/ERP trên Dribbble) thường làm nổi thông số kỹ thuật và cho lọc theo công suất. Hiện DB không có dữ liệu thông số: bảng `san_pham` chỉ có mã, tên, đơn vị, model, danh mục, 3 giá và ảnh.

## Goals

1. Đổi hệ thiết kế của `ui/` sang phong cách công nghiệp: sidebar và header màu graphite, nhấn vàng an toàn, vùng nội dung sáng, mã và số dùng font mono. Áp dụng cho admin, chi nhánh (POS, checkout), trang đăng nhập và hóa đơn in.
2. Lưu thông số kỹ thuật cho mỗi mặt hàng: công suất (W), điện áp (V), trọng lượng (kg) và tối đa 10 cặp thông số tự do.
3. Admin xem và sửa thông số trong form hàng hóa.
4. Chi nhánh nhận thông số qua TCP bằng lệnh mới `SPECS_GET`/`SPECS`, hiển thị dạng chip trên thẻ POS, lọc theo khoảng công suất và sắp xếp theo công suất ở chế độ Bảng.
5. Hóa đơn in thêm công suất cạnh model của từng dòng.

## Non-goals

- Không viết lại cấu trúc component. Giữ hành vi và hợp đồng component trong `docs/ui-redesign-spec.md`: điều hướng `#view=`, drawer, BFCache, POS, checkout idempotent.
- Không đổi landing `landing/`.
- Không gửi thông số tự do (JSONB) xuống chi nhánh qua TCP. Chi nhánh chỉ nhận 3 trường số; phần tự do chỉ hiện ở admin và trên hóa đơn (hóa đơn do server tạo từ DB).
- Không đổi dòng `INVENTORY` (đã dài 3358/4096 byte với 31 mặt hàng).
- Không thêm UI library, font tải từ mạng hay dependency mới.
- Không thêm chế độ tối toàn trang.

## Design

### 1. Hệ thiết kế (chỉ CSS và markup trình bày)

Tokens trong `ui/app/globals.css` (`:root`), giữ tên biến cũ để không phải sửa từng component:

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--bg` | `#F3F4F6` | nền ngoài |
| `--surface` / `--surface-2` | `#FFFFFF` / `#F8F9FA` | panel |
| `--text` / `--text-2` | `#111418` / `#5B636E` | chữ |
| `--border` / `--border-strong` | `#E2E5E9` / `#C4C9D0` | viền |
| `--chrome` / `--chrome-2` / `--chrome-text` (mới) | `#1B1F24` / `#252A31` / `#E6E8EB` | sidebar, header, drawer, đầu hóa đơn |
| `--accent` | `#F2B705` | nút chính và nhấn mạnh; chữ trên nền vàng là `#111418` (tương phản ≥ 10:1) |
| `--accent-hover` / `--accent-soft` | `#D9A300` / `#FFF6D6` | |
| `--accent-ink` (mới) | `#8A6500` | chữ/viền nhấn vàng trên nền trắng (≥ 4.5:1) |
| `--success/warn/danger/info` | giữ như hiện tại | trạng thái luôn có nhãn chữ kèm màu |
| `--radius-sm/--radius/--radius-lg` | `4px/6px/8px` | góc vuông hơn |
| `--font-mono` (mới) | `Consolas, "Cascadia Code", ui-monospace, monospace` | mã hàng, model, số lượng, thông số |

Bố cục và component trong `ui/app/workspace.css`, `ui/components/ui.tsx`:

- **Sidebar** nền `--chrome`, chữ `--chrome-text`. Mục active có nền `--chrome-2`, vạch trái 3px vàng, icon vàng. Logo là monogram vàng và chữ TOBOKI. Dưới 1200px drawer dùng cùng màu.
- **Header** nền `--chrome`, cao 56px. Chuông thông báo, trạng thái kết nối và Đăng xuất giữ ở bên phải. Trạng thái kết nối là chấm màu kèm nhãn.
- **Tiêu đề trang** 22px, có nhãn phụ in hoa letter-spacing (ví dụ `KHO TỔNG · 31 MÃ HÀNG`) lấy từ dữ liệu màn hình đang có, không tạo số mới.
- **KPI (`Stat`)**: panel trắng có viền trái 3px theo trạng thái, nhãn in hoa 11px, số lớn dùng `--font-mono`.
- **Bảng**: header nền `--surface-2` in hoa 11px. Cột mã và model dùng mono. Số canh phải, dùng tabular-nums. Dòng dưới ngưỡng có vạch trái đỏ thay cho nền hồng.
- **Nút**: primary nền vàng chữ đen, secondary viền xám, danger viền đỏ. Focus ring `--accent-ink` 2px.
- **`SpecChips` (component mới trong `ui/components/ui.tsx`)**: nhận `{ congSuatW, dienApV, trongLuongKg }`, hiện tối đa 3 chip mono như `1100 W`, `220 V`, `3.0 kg`. Trường null không hiện; cả 3 null thì không render gì.
- **Thẻ POS** (`ui/components/branch/Sales.tsx`, `sales.css`): ảnh `contain` nền xám nhạt, mã và model mono ở trên, tên, `SpecChips`, rồi giá và tồn. Tồn dưới ngưỡng có badge chữ "Sắp hết".
- **Đăng nhập** (`ui/components/Login.tsx`, `PasswordRecovery.tsx`): hai cột từ 900px. Cột trái là panel `--chrome` với logo và một dòng mô tả, cột phải là form. Dưới 900px chỉ còn form với dải logo graphite ở trên.
- **Hóa đơn** (`ui/components/branch/checkout.css`): dải đầu màu `--chrome` có logo vàng trên màn hình. Trong `@media print` đổi sang viền đen chữ đen, không in nền màu. Dòng sản phẩm hiện `maHang / model · 1100 W · đơn vị`.

### 2. Dữ liệu thông số

Migration cộng thêm (chạy lại được), theo mẫu `CheckoutSchema`: `server/src/main/java/phanphoi/server/db/SpecSchema.java`, gọi `ensure` trong `ServerMain` cạnh `CheckoutSchema.ensure`. Đồng thời sửa `db/schema.sql` cho cài mới:

```sql
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS cong_suat_w    INTEGER      CHECK (cong_suat_w BETWEEN 1 AND 100000);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS dien_ap_v      INTEGER      CHECK (dien_ap_v BETWEEN 1 AND 1000);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS trong_luong_kg NUMERIC(7,1) CHECK (trong_luong_kg > 0);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS thong_so       JSONB        NOT NULL DEFAULT '{}'::jsonb;
```

Dữ liệu mẫu nằm ở `db/seed_specs.sql`, gồm các lệnh `UPDATE san_pham SET ... WHERE ma_sp = 'TBxx'` cho TB01..TB31. Mỗi dòng có comment ghi nguồn (URL toboki.vn/meta.vn, hoặc `ten_sp` nếu lấy từ tên sản phẩm). Giá trị không tìm được nguồn thì để NULL, không tự bịa. `scripts\setup-db.bat` và `docker-compose` (seed) chạy thêm file này sau `seed_images.sql`.

### 3. Server

- `StockService.Product` thêm `Integer congSuatW, Integer dienApV, BigDecimal trongLuongKg, Map<String,String> thongSo`. `products()` trả thêm 4 trường; `addProduct`/`updateProduct` ghi thêm 4 cột. `thong_so` được ghi bằng `?::jsonb` với chuỗi do Gson tạo, không ghép chuỗi SQL.
- `validateProduct` thêm các ràng buộc:
  - `congSuatW` null hoặc 1..100000
  - `dienApV` null hoặc 1..1000
  - `trongLuongKg` null hoặc 0.1..99999.9 và tối đa 1 chữ số thập phân
  - `thongSo` tối đa 10 cặp; key 1..40 ký tự, value 1..60 ký tự sau trim, cả hai là chuỗi; không key trùng sau khi trim, không ký tự điều khiển
  - Sai thì ném `ServiceException(E05, ...)`, giống các lỗi giá.
- `AdminApi.product(...)` đọc 4 trường mới, nếu thiếu thì coi là null hoặc `{}` để client cũ gọi API vẫn chạy.
- `StockService.specsMessage()` trả `SPECS|maSp,congSuatW,dienApV,trongLuongKg;...` qua `Lists.fit`, trường null để rỗng. Có 31 mặt hàng × khoảng 22 byte nên khoảng 700 byte, dư nhiều so với 4096.
- `ClientHandler`: thêm `SPECS_GET` vào danh sách lệnh sau đăng nhập và xử lý `case SPECS_GET -> send(ctx.stock().specsMessage())`. Không tính vào bộ đếm SCRAPING; vẫn chịu rate limit chung. `AuditLog` mô tả là "xem thong so".
- `CheckoutService`: khi chốt quote, snapshot từng dòng thêm `congSuatW` (cùng câu SELECT với `model`). Hóa đơn cũ không có trường này vẫn hiển thị được.

### 4. Giao thức (`common`)

`Command.java` thêm hai lệnh:

```java
// danh sách thông số số của mọi mặt hàng: maSp, congSuatW, dienApV, trongLuongKg (rỗng = chưa có)
SPECS_GET(0),
SPECS(1),
```

### 5. Client chi nhánh

- `BranchState.Item` thêm `Integer congSuatW, dienApV; Double trongLuongKg`. Các trường này nằm trong `/api/state`, `/api/events`.
- `BranchAgent`: gửi `SPECS_GET` ngay sau mỗi lần gửi `INVENTORY_GET` (3 chỗ: dòng ~309, ~626, ~677). `case SPECS` gán thông số vào item có sẵn, bỏ qua mã không có trong inventory, rồi publish state. Nếu `SPECS` tới trước `INVENTORY` thì giữ trong `state.specs` tạm và gán khi `INVENTORY` tới.
- Server cũ trả `ERROR|E01` cho `SPECS_GET` thì bỏ qua lặng lẽ (không hiện toast). POS hiện như hiện tại, không có chip và không có bộ lọc công suất.

### 6. UI

- `ui/lib/types.ts`: `Product` thêm `congSuatW: number | null; dienApV: number | null; trongLuongKg: number | null; thongSo: Record<string, string>`. `BranchItem` thêm 3 trường số (optional). `Invoice` line thêm `congSuatW?: number | null`.
- `ui/components/admin/Products.tsx`: form có nhóm "Thông số kỹ thuật" gồm 3 ô số và danh sách cặp key/value (thêm/xóa, tối đa 10). Bảng sản phẩm thêm cột "Công suất" sắp xếp được. Lỗi validate hiện ngay dưới ô, không xóa dữ liệu đang nhập.
- `ui/components/branch/Sales.tsx`: facet "Công suất" (radio: Tất cả, < 500 W, 500–1500 W, > 1500 W, Chưa có thông số) đặt cạnh facet danh mục và lọc trên dữ liệu đã nhận. Chế độ Bảng thêm cột Công suất có `SortTh`. Thẻ dùng `SpecChips`.
- `ui/components/branch/Checkout.tsx` `InvoiceView`: thêm `· {congSuatW} W` vào dòng phụ khi có giá trị.

## Data and API changes

- **DB**: 4 cột mới trên `san_pham` (ở trên); file `db/seed_specs.sql`.
- **Giao thức**: `SPECS_GET` (CN→S, 0 tham số) và `SPECS` (S→CN, 1 tham số danh sách). Cập nhật README §5 "Định dạng tin", và **nhắc nhóm cập nhật SRS §4** (quy định nhóm).
- **HTTP admin**: `GET /api/products` trả thêm `congSuatW, dienApV, trongLuongKg, thongSo`. `POST/PUT /api/products` nhận thêm 4 trường đó, đều optional.
- **HTTP chi nhánh**: các item trong `inventory` của `/api/state` có thêm 3 trường số.
- **Hóa đơn**: `hoa_don_ban.noi_dung.items[].congSuatW` (tùy chọn).
- **Config**: không có.

## Edge cases and errors

- Mặt hàng mới thêm chưa có thông số: chip không hiện; lọc "Chưa có thông số" phải tìm thấy mặt hàng đó.
- Phụ kiện không dùng điện (TB26, TB27): công suất NULL, không hiện là `0 W`.
- `thong_so` có key trùng chỉ khác khoảng trắng: báo lỗi E05.
- Value chứa `,` `;` `|` không ảnh hưởng gì vì `thong_so` không đi qua TCP.
- Danh sách SPECS dài hơn 4096 byte (trên khoảng 180 mặt hàng): `Lists.fit` cắt các bản ghi cuối. Item bị cắt hiện như "Chưa có thông số". Ghi nhận ở Open questions.
- Admin sửa thông số khi chi nhánh đang online: server chưa đẩy `SPECS` mới, chi nhánh thấy thay đổi ở lần `INVENTORY_GET` kế tiếp (đăng nhập lại, hoặc khi có thông báo sản phẩm mới).
- Người dùng OS dark mode vẫn thấy nền sáng (giữ `color-scheme: light`).
- In hóa đơn: không mất chữ khi tắt "background graphics" của trình duyệt.

## Test plan

- **Unit (`common`)**: thêm vào `ProtocolTest` một test `specsRoundTrip`: encode/decode `SPECS` với trường rỗng và số thập phân `3.5`. Kiểm tra `Command.SPECS_GET.paramCount == 0`, `SPECS == 1`.
- **Unit (`server`)**: `StockServiceSpecTest` (thuần, không DB) kiểm tra validate: công suất 0, 100001, trọng lượng 1.25, 11 cặp thongSo, key 41 ký tự, key trùng sau trim đều bị E05; giá trị biên hợp lệ thì qua. `specsMessage` với 31 bản ghi giả có độ dài < 4096 và parse lại được.
- **Build**: `source tools/env.sh && mvn -q test` và `mvn -q package` xanh; `npm --prefix ui run typecheck` và `npm --prefix ui run build` xanh.
- **Smoke UI**: cập nhật `scripts/ui-redesign-smoke.cjs` để mock `congSuatW` vào inventory và chạy ở viewport 390/768/1024/1440. Kiểm tra: header và sidebar có nền graphite (`getComputedStyle`), nút "Thêm vào giỏ" nền vàng, chip `1100 W` hiện trên thẻ TB22, chọn "> 1500 W" chỉ còn các mặt hàng > 1500 W, Back/Forward giữa các mục vẫn đúng `#view=`.
- **End-to-end (thủ công, ghi vào `docs/regression-checklist.md`)**:
  1. Chạy migration và `seed_specs.sql`, khởi động server và CN01 trên cổng riêng (`tcp.port=5100 admin.http.port=8180`).
  2. Admin sửa TB22 thành 1200 W rồi lưu, kiểm tra DB đã đổi.
  3. CN01 đăng nhập lại, thẻ TB22 hiện `1200 W`, lọc theo công suất đúng.
  4. Bán 1 TB22 qua checkout và in, hóa đơn có `1200 W`.
  5. Chạy client CN cũ (jar trước thay đổi) với server mới, vẫn đăng nhập và bán được.

## Acceptance criteria

- [ ] `mvn -q test` xanh, có thêm `specsRoundTrip` và `StockServiceSpecTest`.
- [ ] `npm --prefix ui run typecheck` và `npm --prefix ui run build` không lỗi.
- [ ] Chạy `SpecSchema.ensure` hai lần trên DB đã có dữ liệu không lỗi; `\d san_pham` có 4 cột mới.
- [ ] `GET /api/products` trả `congSuatW` của TB22 đúng theo `seed_specs.sql`.
- [ ] `PUT /api/products/TB22` với `congSuatW: 0` trả lỗi E05 và DB không đổi.
- [ ] Bắt dòng tin TCP (`scripts\sim-log.bat` hoặc log tin) thấy `SPECS_GET` sau `INVENTORY_GET` và `SPECS|...` < 4096 byte.
- [ ] Smoke UI qua ở 4 viewport: header/sidebar màu `rgb(27, 31, 36)`, nút chính màu `rgb(242, 183, 5)`, lọc công suất đúng.
- [ ] Hóa đơn in (print preview) đen trắng, có công suất ở dòng sản phẩm có thông số.
- [ ] README §5 có `SPECS_GET`/`SPECS`; mọi giá trị trong `seed_specs.sql` đều có comment nguồn.

## Open questions

- Có cần đẩy `SPECS` chủ động tới các CN online khi admin sửa thông số không? Hiện spec chờ lần tải tồn kho kế tiếp.
- Khi số mặt hàng vượt khoảng 180, `SPECS` (và `INVENTORY`) sẽ bị cắt. Có cần phân trang cho cả hai không? Ngoài phạm vi spec này.
- Có muốn POS xem thông số tự do (JSONB) ở chi tiết sản phẩm qua một lệnh `SPEC_GET|maSp` riêng không?
