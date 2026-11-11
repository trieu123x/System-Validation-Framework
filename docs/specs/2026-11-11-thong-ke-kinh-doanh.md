# Thống kê kinh doanh cho Admin

Status: implemented · Date: 2026-11-11

## Problem

Admin hiện chỉ xem được vận hành (yêu cầu, kho, công nợ, giám sát), chưa trả lời được các câu hỏi kinh doanh của một nhà phân phối cấp hàng cho đại lý: bán được bao nhiêu, lãi bao nhiêu, mặt hàng nào bán chạy, chi nhánh nào mang lại doanh thu, đại lý đang bán ra tốt hay đang ôm hàng, đại lý nào ngừng nhập hoặc nợ sát hạn mức.

Các chỉ số dưới đây là bộ thường dùng cho nhà phân phối: doanh thu/lợi nhuận gộp theo sản phẩm, khách hàng và kỳ, so với kỳ trước và chỉ tiêu; sell-in và sell-through; tỉ lệ đáp ứng (fill rate); top khách hàng; phân tích ABC.

## Goals

- Màn hình mới **Kinh doanh** (nhóm "Quản lý") trên trang admin, có bộ lọc thời gian và so sánh với kỳ liền trước.
- KPI chính: doanh thu sell-in, lợi nhuận gộp, biên %, số phiếu xuất, giá trị trung bình/phiếu, doanh thu sell-out, mỗi chỉ số kèm % thay đổi so với kỳ trước.
- Biểu đồ xu hướng doanh thu và lợi nhuận theo ngày/tuần/tháng.
- Top sản phẩm, doanh thu theo danh mục, phân nhóm ABC và danh sách hàng không bán được.
- Xếp hạng chi nhánh theo doanh thu, kèm sell-through, số ngày tồn, công nợ/hạn mức, tỉ lệ đáp ứng, tỉ lệ trả hàng, số ngày từ lần nhập cuối.
- Chỉ tiêu doanh thu theo tháng cho từng chi nhánh: % hoàn thành và dự kiến cuối tháng.
- Bấm vào một chi nhánh để xem số liệu riêng của chi nhánh đó; xuất CSV cho bảng sản phẩm và bảng chi nhánh.

## Non-goals

- Không có dự báo nhu cầu, phân tích theo nhân viên bán hàng hay khu vực.
- Không có biểu đồ realtime từng giây (chỉ làm mới khi có sự kiện, xem Design).
- Không thống kê cho trang chi nhánh (`ui/app/branch`).
- Không tính chi nhánh giả lập (`chi_nhanh.gia_lap = true`) và không có nút bật lại.
- Không đổi giao thức TCP; README §5 và SRS §4 không bị ảnh hưởng.
- Không tính chiết khấu, VAT hay chi phí vận chuyển vào lợi nhuận. Lợi nhuận gộp = doanh thu − giá vốn.

## Design

### Định nghĩa số liệu (nguồn sự thật)

Mọi truy vấn chỉ lấy chi nhánh `NOT gia_lap`. Kỳ `[from, to]` tính theo ngày, bao gồm cả hai đầu, theo giờ local của server (cột `TIMESTAMP` không có múi giờ). Kỳ trước là kỳ liền trước có cùng số ngày.

| Chỉ số | Công thức |
|---|---|
| Doanh thu sell-in | Σ `phieu_xuat.so_luong × phieu_xuat.don_gia` theo `phieu_xuat.thoi_gian` trong kỳ, với `yeu_cau.trang_thai <> 'TU_CHOI'`. Hàng điều chuyển giữa chi nhánh không tính. |
| Giá vốn đơn vị | Bình quân gia quyền toàn bộ `phieu_nhap` của mặt hàng: Σ(so_luong×don_gia)/Σso_luong. Mặt hàng chưa có phiếu nhập thì dùng `san_pham.gia_nhap`. Làm tròn tới đồng để tổng lợi nhuận các khối khớp KPI. |
| Lợi nhuận gộp | Σ `px.so_luong × (px.don_gia − giá vốn đơn vị)`. Biên % = lợi nhuận / doanh thu (null khi doanh thu = 0). |
| Số phiếu xuất, TB/phiếu | count(phieu_xuat) không tính TU_CHOI; doanh thu / số phiếu. |
| Sell-out (SL, doanh thu) | Σ `ban_hang.so_luong` và Σ `so_luong × COALESCE(ban_hang.don_gia, san_pham.gia_ban_le)` theo `ban_hang.thoi_gian`. Response có `sellOutUocTinh` = số dòng có `don_gia IS NULL`. |
| Sell-through (chi nhánh) | SL bán ra trong kỳ / (SL bán ra trong kỳ + tồn hiện tại `kho_chi_nhanh`). Đây là xấp xỉ có chủ đích vì không có snapshot tồn đầu kỳ. |
| Số ngày tồn | tồn hiện tại / (SL bán ra trong kỳ / số ngày của kỳ). null nếu không bán. |
| Tỉ lệ đáp ứng | YC tạo trong kỳ đã được giao (có `phieu_xuat` hoặc `dieu_chuyen` HOAN_TAT) / YC tạo trong kỳ không còn ở `CHO`. |
| Tỉ lệ trả hàng | SL `phieu_xuat` trong kỳ thuộc YC `TU_CHOI` / tổng SL `phieu_xuat` trong kỳ. |
| Ngày từ lần nhập cuối | Số ngày kể từ max(`phieu_xuat.thoi_gian`) của chi nhánh (mọi thời điểm, không tính YC `TU_CHOI` vì hàng đã bị trả). Cờ `ngungNhap` khi vượt `stats.inactive.days`; chưa từng nhập thì null và không gắn cờ. |
| Công nợ, hạn mức | Dùng lại công thức `DEBT_SQL` trong `StockService` và `chi_nhanh.han_muc_no`. |
| ABC | Xếp sản phẩm theo doanh thu sell-in giảm dần trong kỳ. Tỉ lệ cộng dồn của các mặt hàng **đứng trước** < 80% → A, < 95% → B, còn lại → C (khớp ví dụ [50, 30, 10, 6, 4] → A, A, B, B, C). Sản phẩm có doanh thu 0 thuộc `khongBan`, không xếp nhóm. |
| Chỉ tiêu | `muc_tieu_doanh_so.so_tien` của tháng chứa `to`. % hoàn thành = doanh thu sell-in từ đầu tháng tới `min(to, hôm nay)` / chỉ tiêu. Dự kiến không cắt ở `to`: tháng hiện tại = doanh thu từ đầu tháng tới hôm nay / số ngày đã qua × số ngày của tháng; tháng đã qua = doanh thu thực của cả tháng. |

Gộp trend: kỳ ≤ 62 ngày gộp theo ngày; dài hơn mà nằm trong một năm thì theo tuần (`date_trunc('week')`, mốc là thứ Hai); dài hơn và vắt qua nhiều năm thì theo tháng. Trend chứa đủ mọi bucket, kể cả bucket bằng 0 (dùng `generate_series`).

### Server

- `server/src/main/java/phanphoi/server/service/BusinessStatsService.java` (mới): `summary(String from, String to, String maCn)` và `setTarget(String maCn, YearMonth thang, long soTien, String actor, String ip)` (ghi audit và publish trong service để test tích hợp kiểm được). Chỉ đọc qua `db.read`; mỗi khối (kpi, trend, sản phẩm, danh mục, chi nhánh) là một truy vấn SQL gộp, không lặp truy vấn theo từng chi nhánh hoặc sản phẩm.
- `server/src/main/java/phanphoi/server/db/BusinessSchema.java` (mới), gọi trong `ServerMain` cạnh `ReceiptSchema.ensure`/`CheckoutSchema.ensure`; chạy lại nhiều lần không lỗi.
- `AdminApi.java`: thêm 2 route (xem phần API), nằm sau đăng nhập admin như các route `/api/*` khác. `setTarget` ghi `audit.record("ADMIN", user, "SET_TARGET", ...)` rồi publish hằng mới `Events.BUSINESS = "business"` (thêm vào `server/.../Events.java`). Audit tự động của router bỏ qua lần ghi thành công của route này (tránh hai dòng), vẫn ghi khi lỗi. Lỗi CSDL trong 2 route này trả 503.
- Ghi giá bán ra:
  - `StockService.sale`: `INSERT INTO ban_hang (..., don_gia) SELECT ..., gia_ban_le FROM san_pham`.
  - `CheckoutService.confirm`: ghi `giaBanLe` của dòng trong đơn đã báo giá (giá trước VAT).

### UI

- Thêm dependency `recharts@3.10.1` (phát hành 25/07/2026, peer React ^19) và `react-is@19.1.0` (peer của recharts), ghim chính xác, commit kèm `package-lock.json`. `Business` được tải bằng `next/dynamic` nên trang admin chỉ tải recharts khi mở tab Kinh doanh.
- `ui/components/admin/Business.tsx` + `business.css` (mới). Gồm:
  - thanh lọc thời gian: 7 ngày / 30 ngày / Tháng này / Quý này / Tùy chọn từ–đến;
  - hàng KPI kèm mũi tên % so kỳ trước;
  - biểu đồ đường doanh thu + lợi nhuận (Recharts `LineChart`);
  - cột ngang top 10 sản phẩm và doanh thu theo danh mục (`BarChart`);
  - bảng sản phẩm có cột ABC; danh sách "Không bán trong kỳ";
  - bảng chi nhánh: doanh thu, % so kỳ trước, chỉ tiêu, % hoàn thành, dự kiến, sell-through, ngày tồn, nợ/hạn mức, đáp ứng, trả hàng, ngày từ lần nhập cuối, badge "Ngừng nhập"/"Vượt hạn mức".
- Bổ sung (12/11): cột "Bán ra" (doanh thu sell-out của chi nhánh, SL, % so kỳ trước) trong bảng và CSV, biểu đồ cột sell-in cạnh bán ra theo chi nhánh. Σ `branches[].sellOutDoanhThu` = `kpi.sellOutDoanhThu`.
- Bấm một dòng chi nhánh sẽ gọi lại `summary` với `maCn` và hiện cùng bố cục cho chi nhánh đó, có nút quay lại toàn công ty.
- Ô chỉ tiêu trong bảng chi nhánh sửa tại chỗ (Enter/blur để lưu, Esc để huỷ), dùng `useAction` như các form hiện có.
- Xuất CSV phía trình duyệt cho bảng sản phẩm và bảng chi nhánh: UTF-8 có BOM, dấu phẩy, tên file `kinh-doanh-<loai>-<from>_<to>.csv`.
- `ui/app/admin/page.tsx`: thêm `"business"` vào `ADMIN_VIEWS` và mục nav `{ id: "business", label: "Kinh doanh", group: "Quản lý" }`.
- `ui/lib/types.ts`: thêm type cho response.
- Làm mới tự động: `useEvents` lắng nghe `request`, `stock`, `debt`, `business`, debounce 5 s rồi tải lại. Không thêm nút tải lại (nhóm đã bỏ ở commit a37650c).

## Data and API changes

**Migration** (`BusinessSchema.ensure`, đồng thời thêm vào `db/schema.sql` cho cài mới và `docker/initdb` nếu file đó liệt kê bảng):

```sql
ALTER TABLE ban_hang ADD COLUMN IF NOT EXISTS don_gia NUMERIC(15,0) CHECK (don_gia >= 0);
CREATE TABLE IF NOT EXISTS muc_tieu_doanh_so (
    ma_cn    VARCHAR(10)   NOT NULL REFERENCES chi_nhanh(ma_cn),
    thang    DATE          NOT NULL CHECK (thang = date_trunc('month', thang)::date),
    so_tien  NUMERIC(15,0) NOT NULL CHECK (so_tien > 0),
    PRIMARY KEY (ma_cn, thang)
);
CREATE INDEX IF NOT EXISTS idx_phieu_xuat_thoi_gian ON phieu_xuat (thoi_gian);
CREATE INDEX IF NOT EXISTS idx_ban_hang_thoi_gian ON ban_hang (thoi_gian);
```

Các dòng `ban_hang` cũ giữ `don_gia = NULL` (doanh thu sell-out ước tính). `seed_demo.sql` ghi `don_gia = gia_ban_le` cho dữ liệu demo mới.

**API** (admin, cần cookie `pp_admin`):

- `GET /api/business/summary?from=YYYY-MM-DD&to=YYYY-MM-DD[&maCn=CN01]` → 200
  ```json
  { "from": "...", "to": "...", "prevFrom": "...", "prevTo": "...", "granularity": "day|week|month", "maCn": null,
    "kpi":  { "doanhThu": 0, "loiNhuan": 0, "bienLoiNhuan": 0.0, "soPhieu": 0, "tbPhieu": 0,
              "sellOutSoLuong": 0, "sellOutDoanhThu": 0, "sellOutUocTinh": 0 },
    "prevKpi": { ...như kpi },
    "trend": [ { "moc": "2026-11-01", "doanhThu": 0, "loiNhuan": 0, "sellOutDoanhThu": 0 } ],
    "products": [ { "maSp": "", "ten": "", "maDm": "", "soLuong": 0, "doanhThu": 0, "loiNhuan": 0, "tyTrong": 0.0, "abc": "A" } ],
    "khongBan": [ { "maSp": "", "ten": "", "tonTong": 0 } ],
    "categories": [ { "maDm": "", "ten": "", "doanhThu": 0, "loiNhuan": 0 } ],
    "branches": [ { "maCn": "", "ten": "", "doanhThu": 0, "doanhThuTruoc": 0, "loiNhuan": 0,
                    "chiTieu": null, "hoanThanh": null, "duKien": null,
                    "sellOutSoLuong": 0, "sellOutDoanhThu": 0, "sellOutTruoc": 0,
                    "sellThrough": null, "ngayTon": null, "congNo": 0, "hanMuc": 0,
                    "dapUng": null, "traHang": null, "ngayTuLanNhapCuoi": null, "ngungNhap": false } ] }
  ```
  Tiền là số nguyên VND (long), tỉ lệ là số thực 0..1 (null khi mẫu số bằng 0). `branches` gồm mọi chi nhánh thật, kể cả chi nhánh có doanh thu 0, sắp theo `doanhThu` giảm dần. Khi có `maCn`, mọi khối chỉ tính cho chi nhánh đó và `branches` chỉ có một phần tử.
- `PUT /api/business/targets/{maCn}` body `{ "thang": "2026-11", "soTien": 150000000 }` → 200 `{ "ok": true }`. `soTien = 0` thì xoá chỉ tiêu. Ghi `audit_log` và publish SSE `business`.

**Config** (`config/server.properties`): `stats.inactive.days=14`.

## Edge cases and errors

- `from`/`to` thiếu hoặc sai định dạng, `from > to`, kỳ > 366 ngày, `to` ở tương lai quá 1 ngày → 400 với thông báo tiếng Việt.
- `maCn` không tồn tại hoặc là chi nhánh giả lập → 404.
- Kỳ không có dữ liệu → 200 với KPI bằng 0, các tỉ lệ null, trend đủ bucket giá trị 0. UI hiện `Empty` ("Chưa có giao dịch trong kỳ"), không hiện biểu đồ rỗng.
- Kỳ trước bằng 0 → % thay đổi là null; UI hiện "—" thay cho ∞.
- `phieu_xuat.don_gia = 0`: vẫn tính số lượng và số phiếu, doanh thu cộng 0, lợi nhuận có thể âm (theo đúng dữ liệu).
- Lợi nhuận âm hiển thị màu đỏ, không bị kẹp về 0.
- Hàng bị trả (TU_CHOI sau khi giao) không tính vào doanh thu của mọi kỳ, kể cả khi trả ở kỳ sau.
- Chỉ tiêu: `thang` sai định dạng, `soTien < 0` hoặc > 999 999 999 999 999 (giới hạn `NUMERIC(15,0)`), `maCn` không tồn tại hoặc giả lập → 400/404. Hai admin cùng sửa: ghi sau thắng (upsert), mỗi lần ghi đều vào audit.
- Hiệu năng: có 1000 chi nhánh SIM trong DB (`seed_loadsim.sql`) và vài chục nghìn dòng `ban_hang`/`phieu_xuat` thì `summary` cho kỳ 366 ngày vẫn trả về < 1 s trên máy dev. Mọi truy vấn lọc `gia_lap` bằng JOIN, không tải dữ liệu SIM lên Java.
- Mất kết nối DB → 503 qua handler chung; UI giữ dữ liệu cũ và hiện toast lỗi.

## Test plan

Unit (không cần DB, `server/src/test/.../BusinessStatsServiceTest.java`):
- `granularityByRangeLength`: 1, 62, 63, 366 ngày và kỳ nhiều năm cho đúng `day/week/month`.
- `previousPeriodHasSameLength`: 01–30/11 → 02–31/10.
- `abcClassificationUsesCumulativeShare`: doanh thu [50, 30, 10, 6, 4] → A, A, B, B, C; sản phẩm doanh thu 0 nằm ở `khongBan`.
- `rejectsInvalidRanges`: from > to, > 366 ngày, sai định dạng → `ApiException(400)`.
- `projectionLinearForCurrentMonth`: ngày 10/30, doanh thu 10 → dự kiến 30.

Tích hợp DB (`BusinessStatsIntegrationTest`, cùng cơ chế schema tạm `SVF_TEST_DB_URL` như `ReceiptIntegrationTest`):
- `sellInExcludesRejectedAndTransfersAndSimBranches`.
- `grossProfitUsesWeightedAverageCostWithFallback`: 2 phiếu nhập 10×100 và 30×200 → giá vốn 175; sản phẩm chưa nhập thì dùng `gia_nhap`.
- `sellOutUsesStoredPriceAndCountsEstimatedRows`.
- `saleAndCheckoutStorePrice`: `StockService.sale` và `CheckoutService.confirm` ghi đúng `ban_hang.don_gia`.
- `branchMetrics`: sell-through, ngày tồn, đáp ứng, trả hàng, `ngungNhap` khớp với dữ liệu dựng tay.
- `targetUpsertDeleteAndCompletion`.
- `schemaEnsureIsRepeatable`: gọi `BusinessSchema.ensure` 2 lần trên DB đã có dữ liệu `ban_hang`.

UI: `npm --prefix ui run typecheck` và `npm --prefix ui run build` thành công.

End-to-end: `scripts\setup-db.bat` với `seed_demo.sql` → `scripts\run-server.bat` (cổng riêng `tcp.port=5100 admin.http.port=8180`) → đăng nhập admin → **Kinh doanh** → 30 ngày. Kiểm tra:
- tổng doanh thu bảng chi nhánh = KPI doanh thu;
- tổng bảng sản phẩm = KPI;
- bấm CN01 thì KPI đổi;
- đặt chỉ tiêu CN01 thì % hoàn thành xuất hiện và có dòng `SET_TARGET` trong audit;
- xuất CSV mở đúng tiếng Việt trong Excel.

## Acceptance criteria

- [ ] `GET /api/business/summary?from=<30 ngày trước>&to=<hôm nay>` trả 200 và đủ các khóa `kpi, prevKpi, trend, products, khongBan, categories, branches`.
- [ ] Σ `branches[].doanhThu` = `kpi.doanhThu` = Σ `products[].doanhThu` (test tích hợp).
- [ ] YC bị TU_CHOI sau khi giao, điều chuyển giữa chi nhánh và chi nhánh `gia_lap` không làm đổi `kpi.doanhThu` (test tích hợp).
- [ ] Giá vốn bình quân gia quyền cho ví dụ 10×100 + 30×200 bằng 175 (test tích hợp).
- [ ] Sau `SALE` qua TCP và sau khi thanh toán tại quầy, dòng `ban_hang` mới có `don_gia` bằng giá bán lẻ lúc bán (test tích hợp).
- [ ] Kỳ > 366 ngày hoặc `from > to` trả 400; `maCn` của chi nhánh SIM trả 404 (test).
- [ ] `PUT /api/business/targets/CN01` lưu, ghi đè, xoá được (soTien=0) và mỗi lần đều có một dòng `audit_log` hành động `SET_TARGET` (test tích hợp).
- [ ] `BusinessSchema.ensure` chạy 2 lần liên tiếp không lỗi trên DB đã có dữ liệu (test tích hợp).
- [ ] `summary` cho kỳ 366 ngày với DB có `seed_loadsim.sql` trả về trong < 1 s (đo bằng `curl -w "%{time_total}"`).
- [ ] `mvn -q test`, `npm --prefix ui run typecheck` và `npm --prefix ui run build` đều thành công.
- [ ] Trang admin có mục **Kinh doanh** trong nhóm "Quản lý"; vào thẳng bằng `#view=business` được.

## Open questions

- ~~Bộ dữ liệu demo mới (`seed_demo.sql`) có cần sinh thêm chỉ tiêu mẫu cho CN01..CN03 để demo không?~~ Chốt: không; đặt tay trên màn hình khi demo.
- Báo cáo/SRS có cần thêm mục FR mới cho thống kê kinh doanh không? (Không phải thay đổi protocol, nhưng là chức năng mới.)

## Tham khảo

- Phocas: [Key sales KPIs for distributors](https://phocassoftware.com/resources/blog/key-sales-kpis-for-distributors), [KPIs for distribution execs](https://www.phocassoftware.com/resources/blog/kpis-for-distribution-execs)
- [Acumatica: 12 metrics every distribution manager should track](https://www.acumatica.com/blog/distribution-kpis/)
- [Solver: Sales manager dashboard for a distribution company](https://blog.solverglobal.com/glossary/sales-manager-dashboard-for-a-distribution-company)
- [Racklify: Sell-in vs sell-through](https://racklify.com/encyclopedia/sell-in-vs-sell-through-which-metric-should-retailers-and-brands-use/)
- [Sysgenpro: Fill rate, turnover, service levels](https://sysgenpro.com/erp/distribution-erp-kpi-frameworks-for-measuring-fill-rate-turnover-and-service-levels)
- MISA AMIS: [KPI kênh GT cho nhà phân phối](https://amis.misa.vn/264183/phan-mem-quan-ly-kenh-gt/), [Các loại báo cáo bán hàng](https://amis.misa.vn/12431/cac-loai-bao-cao-ban-hang/)
