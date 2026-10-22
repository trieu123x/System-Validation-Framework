# Hàng Toboki, công nợ, quản lý kho chi nhánh, giám sát an ninh

Status: draft · Date: 2026-10-21

## Problem

Dữ liệu demo đang là hàng tạp hoá (nước suối, mì gói) và không có tiền: không biết công ty nhập bao nhiêu tiền hàng, xuất cho chi nhánh bao nhiêu, chi nhánh nào đã trả đủ, chi nhánh nào còn nợ. Tab "Kho chi nhánh" chỉ là một bảng phẳng, không cho thấy tình trạng từng kho. Tab "Giám sát" chỉ hiện luồng tin, không phát hiện được dò mật khẩu, gửi lệnh dồn dập, cào dữ liệu hay tấn công vào client.

Hệ thống sẽ mô phỏng một đại lý máy móc theo mẫu Công ty TNHH XNK Toboki Việt Nam (MST 0109227055, ngành 4653: bán buôn máy móc, thiết bị). Dữ liệu nghiên cứu nằm ở mục *Phụ lục A*, nguồn là masothue.com và meta.vn.

## Goals

1. Thay toàn bộ hàng cũ bằng 28 mặt hàng Toboki, mã TB01..TB28, chia 7 danh mục, mỗi mặt hàng có 3 giá: nhập, xuất cho chi nhánh, bán lẻ.
2. Công nợ hai chiều:
   - Chi nhánh nợ công ty tiền hàng đã nhận. Admin ghi phiếu thu. Mỗi chi nhánh có hạn mức nợ, vượt hạn mức chỉ cảnh báo.
   - Công ty nợ nhà cung cấp tiền phiếu nhập. Admin ghi phiếu chi.
   - Chi nhánh xem được công nợ của mình trên `/branch`.
3. Trang "Kho chi nhánh" kiểu quản lý kho: một thẻ cho mỗi chi nhánh, bấm vào để xem chi tiết theo danh mục. Mặt hàng nào thiếu, sắp thiếu hay đủ đều thấy ngay. Admin bổ sung chủ động được (tạo YC rồi Gửi hàng luôn).
4. Giám sát an ninh: phát hiện bất thường ở server và ở client, lưu sự kiện, đẩy realtime, tự chặn IP tạm thời, có cờ baseline `security.mode=off|detect|block`.
5. Thực nghiệm E8 mô phỏng tấn công, so sánh ba chế độ `security.mode`.

## Non-goals

- Không báo cáo doanh thu bán lẻ của chi nhánh, không làm hoá đơn VAT, không xuất Excel.
- Không thanh toán online. Chi nhánh không tự báo trả tiền, chỉ admin ghi phiếu thu.
- Không mã hoá kênh TCP (TLS), không xác thực server bằng chứng chỉ.
- Không giữ dữ liệu hàng cũ: CSDL nạp lại từ đầu, giao dịch cũ bị xoá.
- Không chặn IP trên HTTP admin (chỉ nghe 127.0.0.1); ở đó khoá tài khoản tạm thời thay vì chặn IP.

## Design

Làm theo 4 giai đoạn, mỗi giai đoạn build và test xong mới sang giai đoạn sau.

### Giai đoạn 1: Hàng Toboki, danh mục, giá

- `db/schema.sql`: thêm các bảng và cột ở mục *Data*.
- `db/seed.sql`: 3 chi nhánh CN01..CN03 giữ nguyên. Thêm 7 danh mục, 28 mặt hàng (*Phụ lục A*), 3 nhà cung cấp.
  - Kho tổng: máy rửa xe cao áp 20–40, các máy khác 60–200, dây đầm 300.
  - Kho chi nhánh: tồn 10, ngưỡng 3 (riêng dây đầm: tồn 30, ngưỡng 10).
  - Phiếu nhập đầu kỳ theo giá nhập, sao cho đối soát kho vẫn khớp.
  - Mọi `INSERT` có `ON CONFLICT`, chạy lại được.
- `db/seed_demo.sql`: thay khối mặt hàng SP06..SP30 bằng việc dùng TB01..TB28 từ `seed.sql`.
  - `low_sps` đổi thành `TB05, TB12, TB19, TB21`.
  - Danh sách nhà cung cấp đổi thành bảng `nha_cung_cap`.
  - Số lượng chia 5–10 lần cho hợp với máy móc.
  - Sinh thêm phiếu thu và phiếu chi trong 60 ngày, để có đủ 4 kiểu chi nhánh: đã trả đủ, còn nợ trong hạn mức, vượt hạn mức, chưa phát sinh.
- `db/migrate_toboki.sql` (mới): dùng cho CSDL đang có. Thêm cột và bảng (`IF NOT EXISTS`), `TRUNCATE` giao dịch, `kho_chi_nhanh`, `kho_tong`, `san_pham` (`CASCADE`), rồi `\ir seed.sql` và `\ir seed_loadsim.sql`. Script mới `scripts\migrate-db.bat` gọi nó. README ghi rõ là script này **xoá giao dịch**.
- `docker/initdb/00-init.sql`: vẫn nạp `schema.sql`, `seed.sql`, `seed_loadsim.sql`, `seed_demo.sql` như cũ.
- `server/.../service/StockService.java`:
  - `products()` trả thêm `model`, `maDm`, `tenDm`, `giaNhap`, `giaXuat`, `giaBanLe`.
  - `addProduct`/`updateProduct` nhận đủ 3 giá và mã danh mục.
  - `importStock` nhận `maNcc` và `donGia` (mặc định bằng `gia_nhap`).
  - `inventoryMessage` thêm trường vào cuối mỗi bản ghi (*API*).
  - Hàm mới `categories()`, `suppliers()`, `addSupplier()`.
- `server/.../AdminApi.java`: bỏ `money(b)` một giá, thay bằng `money(b, key)` đọc `giaNhap`/`giaXuat`/`giaBanLe` (số nguyên đồng, `>= 0`, `<= 10^12`).
- `ui/components/admin/Products.tsx`: cột danh mục, model, 3 giá. Bộ lọc theo danh mục. Form thêm/sửa có 3 giá; giá xuất nhỏ hơn giá nhập thì hiện cảnh báo (vẫn cho lưu). Form nhập kho có nhà cung cấp và đơn giá.
- `ui/app/branch/page.tsx`: bảng tồn kho có danh mục, model, giá bán lẻ, và lọc theo danh mục.
- `client/.../BranchAgent.java`: đọc các trường mới của `INVENTORY` khi có (thiếu thì để rỗng, để client mới vẫn chạy với server cũ).
- Đổi `SP01..SP05` thành `TB01..TB05` trong `loadsim/.../Experiments.java` (dòng 106, 323, 520, 879) và `scripts/sim-log.js` (danh sách hàng dòng 173–177, mặc định `--product`). Test `common` vẫn dùng chuỗi `SP01`, không phụ thuộc CSDL, nên không sửa.

### Giai đoạn 2: Công nợ

- Sổ công nợ chi nhánh: bảng `cong_no_cn`, mỗi dòng là một bút toán.
  - Số còn nợ = Σ(`XUAT` + `DC_NHAN`) − Σ(`THU` + `DC_GIAO`).
  - Đơn giá được chốt lúc gửi hàng: `phieu_xuat.don_gia = san_pham.gia_xuat` tại thời điểm `ship`/`accept`.
- Các điểm ghi sổ, đều nằm trong cùng transaction với nghiệp vụ:
  - `RequestService.received()`, nhánh `DA_GIAO → HOAN_TAT`: ghi `XUAT`, số tiền = `so_luong_giao × phieu_xuat.don_gia`. Có `UNIQUE (loai, ma_yc)` nên RECEIVED gửi lặp không ghi hai lần.
  - `TransferService.accept()` khi điều chuyển `HOAN_TAT`: chi nhánh nhận ghi `DC_NHAN`, chi nhánh cho ghi `DC_GIAO`, số tiền = `so_luong × gia_xuat` hiện tại (lưu ở `dieu_chuyen.don_gia`). Hàng đi từ chi nhánh này sang chi nhánh kia thì nợ đi theo.
  - Phiếu thu của admin: ghi `THU`.
- Service mới `server/.../service/DebtService.java`:
  - `branchSummary()`: mỗi chi nhánh có tổng nhận, đã trả, còn nợ, hạn mức, trạng thái `DA_TRA_DU | CON_NO | VUOT_HAN_MUC | CHUA_PHAT_SINH`.
  - `branchLedger(maCn)`, `recordPayment(maCn, soTien, ghiChu)`, `setCreditLimit(maCn, hanMuc)`.
  - `supplierSummary()`, `supplierLedger(maNcc)`, `paySupplier(maNcc, soTien, ghiChu)`.
  - `debtMessage(maCn)`: tạo tin `DEBT`.
  - Thêm vào `ServerContext`.
- Hạn mức: `RequestService.ship()`/`offer()` không chặn. API `GET /api/debts/branches/{maCn}/check?soTien=` trả về `vuotHanMuc`; UI gọi nó trước khi Gửi hàng, nếu vượt thì hiện hộp xác nhận "CNxx sẽ nợ X / hạn mức Y. Vẫn gửi?".
- Đẩy tin cho chi nhánh: sau khi ghi `XUAT`, `THU`, `DC_*` hoặc đổi hạn mức, server gửi `DEBT` nếu chi nhánh đang online (không xếp hàng `hang_doi_tin`). Sau `LOGIN_OK`, client tự gửi `DEBT_GET`.
- SSE mới `debt` gửi `{maCn}` để trang admin tải lại.
- UI admin: tab mới **Công nợ** (`ui/components/admin/Debts.tsx`) gồm hai phần.
  - *Chi nhánh*: bảng tổng hợp có badge trạng thái, lọc theo trạng thái. Bấm vào một dòng thì mở sổ chi tiết với nút "Ghi phiếu thu" và "Sửa hạn mức".
  - *Nhà cung cấp*: tổng nhập, đã trả, còn nợ, sổ chi tiết, nút "Ghi phiếu chi".
  - Trên cùng có 4 KPI: tổng tiền nhập, tổng tiền xuất, chi nhánh còn nợ, công ty còn nợ nhà cung cấp.
- UI chi nhánh: tab **Công nợ** gồm tổng nhận, đã trả, còn nợ, hạn mức, 50 bút toán gần nhất. Client HTTP: `GET /api/debt` (lấy từ `BranchState`).

### Giai đoạn 3: Quản lý kho chi nhánh

- `StockService.warehouses()`: mỗi chi nhánh thật có số mặt hàng `thiếu` (`so_luong < nguong`), `sắp thiếu` (`nguong <= so_luong < 1.5 × nguong`), `đủ`, `chưa đặt ngưỡng`, giá trị tồn (`Σ so_luong × gia_xuat`), số YC đang mở, online/offline, còn nợ, vượt hạn mức hay không. Quy tắc mức tồn giống `stockLevel()` trong `ui/components/ui.tsx`.
- `StockService.warehouse(maCn)`: mỗi mặt hàng có danh mục, tồn, ngưỡng, mức, giá trị, YC đang mở (mã, trạng thái), bán 7 ngày gần nhất (từ `ban_hang`), và số lượng đề xuất bổ sung `max(2 × nguong − so_luong, 0)`.
- `RequestService.replenish(maCn, maSp, soLuong)`, dùng cho admin bổ sung chủ động:
  - Chưa có YC mở cho (CN, SP): tạo YC `CHO` rồi gọi luôn logic `ship` trong cùng transaction, đẩy `DELIVERED`.
  - Có YC `CHO`/`DA_DE_XUAT`: `ship` YC đó.
  - Có YC `DA_GIAO`/`THIEU_HANG`: lỗi 409 "Đã có YC đang giao".
  - Kho tổng không đủ: lỗi 409, không tạo gì.
  - Giao thức không đổi. Chi nhánh vẫn bấm Đã nhận như luồng Gửi thẳng.
- UI: viết lại `BranchStock` trong `ui/components/admin/Records.tsx` thành `ui/components/admin/Warehouses.tsx`.
  - Lưới thẻ chi nhánh. Thẻ có chấm online, tên, 4 con số (thiếu/sắp thiếu/đủ/chưa đặt), giá trị tồn, còn nợ (đỏ nếu vượt hạn mức). Sắp xếp được theo số mặt hàng thiếu, giá trị tồn, còn nợ.
  - Bấm vào thẻ thì mở chi tiết: nhóm theo danh mục, lọc theo mức, nút "Bổ sung" ở dòng thiếu/sắp thiếu (điền sẵn số đề xuất, kiểm tra hạn mức như trên).
  - Có thêm chế độ xem "Ma trận": hàng là mặt hàng, cột là chi nhánh, ô tô màu theo mức tồn, để tìm nhanh mặt hàng thiếu ở nhiều nơi.

### Giai đoạn 4: Giám sát an ninh

**Server.** Package mới `server/.../security/`:

- `SecurityMonitor`: các bộ đếm cửa sổ trượt theo IP và theo phiên, danh sách chặn `ConcurrentHashMap<String ip, Long until>`, ghi sự kiện bất đồng bộ theo lô như `MessageLog` (hàng đợi 10.000, đầy thì bỏ và đếm số bỏ), đẩy SSE `security`.
- `SecurityRules`: ngưỡng đọc từ `config/server.properties` (*Data*).
- Thêm `Transport.ip()` (chuỗi IP không kèm cổng) và `ClientHandler.id()` (số tăng dần) để định danh phiên.

Điểm móc:

| Chỗ | Việc |
|---|---|
| `NioServer.accept()`, `BioServer` accept | IP đang bị chặn: ghi `ERROR\|E06\|IP bi chan den HH:mm`, đóng. Đếm kết nối đồng thời và tốc độ mở kết nối theo IP. |
| `ClientHandler.onLine` | Đếm tin/giây của phiên, đếm `E01`/dòng quá dài theo IP, đếm `E04` theo phiên, đếm `INVENTORY_GET`/`HISTORY_GET` theo phiên. |
| `ClientHandler.login` | Đếm `LOGIN_FAIL` theo IP và theo mã chi nhánh. |
| Bộ hẹn giờ heartbeat | Kết nối mở quá `security.prelogin.timeout.seconds` mà chưa đăng nhập: đóng (khi `block`) và đếm. |
| `DiscoveryResponder` | `DISCOVER` dồn dập từ một IP: bỏ qua tin vượt mức và ghi sự kiện. |
| `AdminAuth.login` | Sai 5 lần trong 5 phút: khoá đăng nhập admin 5 phút (trả 429), ghi sự kiện `ADMIN_BRUTE_FORCE`. |
| `ClientHandler.dispatch` | `SECURITY_REPORT` từ client: cắt `chiTiet` còn 500 ký tự, giới hạn 1 tin/giây/phiên, lưu với `nguon = CLIENT`. |

Quy tắc. Mặc định nào cũng đổi được qua config. "Chặn" chỉ chạy khi `security.mode=block`; `detect` chỉ ghi sự kiện; `off` không làm gì.

| Mã | Dấu hiệu | Mặc định | Mức | Hành động khi `block` |
|---|---|---|---|---|
| `BRUTE_FORCE` | `LOGIN_FAIL` từ một IP | ≥ 5 trong 60 s | HIGH | chặn IP 10 phút |
| `CRED_STUFFING` | một mã CN đăng nhập sai từ nhiều IP | ≥ 3 IP trong 5 phút | HIGH | ghi nhận |
| `CMD_FLOOD` | tin/giây của một phiên | > 50 tin/s liên tục 3 s | MEDIUM | ngắt phiên, chặn IP 5 phút |
| `SCRAPING` | `INVENTORY_GET` + `HISTORY_GET` của một phiên | > 30 trong 60 s, hoặc `HISTORY_GET` khoảng > 366 ngày | MEDIUM | trả `ERROR\|E06` cho tin vượt mức |
| `FUZZING` | `E01`/dòng > 4096 byte từ một IP | ≥ 10 trong 60 s | MEDIUM | chặn IP 5 phút |
| `IDOR_PROBE` | `E04` (YC/điều chuyển của chi nhánh khác) trong một phiên | ≥ 5 trong 60 s | MEDIUM | ngắt phiên |
| `CONN_FLOOD` | kết nối từ một IP | > 20 đồng thời, hoặc > 30 kết nối mới trong 10 s | HIGH | chặn IP 10 phút |
| `PRELOGIN_IDLE` | kết nối không `LOGIN` | sau 10 s; sự kiện khi ≥ 20 lần/IP/phút | LOW / MEDIUM | đóng kết nối; ≥ 20 thì chặn IP 5 phút |
| `SERVER_FULL` | từ chối vì `max.clients` | mỗi phút gộp thành 1 sự kiện | LOW | ghi nhận |
| `DISCOVERY_FLOOD` | `DISCOVER` từ một IP | > 20/s | LOW | bỏ qua tin vượt mức |
| `ADMIN_BRUTE_FORCE` | sai mật khẩu trang công ty | ≥ 5 trong 5 phút | HIGH | khoá đăng nhập admin 5 phút (cả ở `detect`) |
| `CLIENT_*` | sự kiện client báo lên | — | theo client | ghi nhận |

**Client** (`client.jar`). Lớp mới `client/.../ClientSecurity.java`:

| Mã | Dấu hiệu | Xử lý |
|---|---|---|
| `CLIENT_CSRF` | request tới API cục bộ có `Origin` khác `http://127.0.0.1:<port>`/`http://localhost:<port>` và khác `security.allowed.origins` (mặc định `http://localhost:3000,http://localhost:3001` cho `next dev`) | 403, ghi sự kiện |
| `CLIENT_DNS_REBIND` | `Host` khác `127.0.0.1:<port>`/`localhost:<port>` | 403, ghi sự kiện |
| `CLIENT_API_FLOOD` | API cục bộ > 30 request/s | ghi sự kiện |
| `CLIENT_DISCOVERY_SPOOF` | một lượt discovery nhận ≥ 2 `HERE` khác nhau (ip:port) | dùng `HERE` đến trước, trang `/branch` hiện cảnh báo kèm danh sách |
| `CLIENT_SERVER_CHANGED` | lần nối lại vào ip:port khác lần trước | ghi sự kiện, hiện cảnh báo |
| `CLIENT_BAD_SERVER_MSG` | server gửi dòng không giải mã được hoặc lệnh sai chiều (vd `LOGIN`) | bỏ dòng, ghi sự kiện |

Client giữ 100 sự kiện gần nhất trong `BranchState`. Mỗi sự kiện được gửi `SECURITY_REPORT` khi đã đăng nhập (tối đa 1 tin/giây, offline thì xếp tối đa 50 tin, rồi gửi khi có `LOGIN_OK`). Client HTTP thêm `GET /api/security`. Trang `/branch` có thẻ "An ninh" và banner cảnh báo.

Kiểm tra `Origin`/`Host` cũng áp dụng cho `AdminApi`, với cùng danh sách cho phép và sự kiện `ADMIN_CSRF`.

**UI giám sát**: viết lại `Monitor` trong `ui/components/admin/Comms.tsx` thành `ui/components/admin/Security.tsx`, chia 4 phần:
1. KPI: số kết nối, tin/giây (trung bình 10 s), IP đang bị chặn, sự kiện 24 h theo mức (HIGH/MEDIUM/LOW), `security.mode` hiện tại.
2. Sự kiện an ninh realtime: lọc theo mức, mã, nguồn (SERVER/CLIENT/ADMIN), IP, chi nhánh. Sự kiện HIGH bật toast.
3. Bảng IP: số kết nối, tin/phút, `LOGIN_FAIL`, `E01`, trạng thái (bình thường/nghi vấn/bị chặn đến…), nút Chặn (chọn số phút) và Bỏ chặn.
4. Bảng phiên: mã phiên, chi nhánh, IP, mở lúc, tin vào/ra, tin/s, lệnh cuối, nút Ngắt.

Luồng tin trực tiếp và tra cứu `nhat_ky` cũ chuyển thành tab con "Luồng tin".

**Thực nghiệm E8** (`loadsim/.../Experiments.java`, `case "e8"`):
- Chạy 3 lượt với `security.mode=off|detect|block`. Mỗi lượt có 20 chi nhánh thật bán đều (SALE 2 tin/s) và 5 kẻ tấn công từ `127.0.0.2`..`127.0.0.6` (Windows cho bind loopback khác).
- Kẻ tấn công lần lượt làm: dò mật khẩu `CN01`, flood `PING` 500 tin/s, cào `INVENTORY_GET`/`HISTORY_GET`, gửi rác, mở 50 kết nối không `LOGIN`.
- Đo: thời gian từ đòn đầu tới sự kiện đầu tiên, thời gian tới khi bị chặn, p95 RTT `SALE` của chi nhánh thật trong và ngoài lúc bị tấn công, số tin của kẻ tấn công được xử lý, số chi nhánh thật bị chặn nhầm (phải bằng 0).
- Ghi `experiments/results/e8.csv`, vẽ biểu đồ bằng `experiments/make-charts.ps1`.
- `startServer()` trong `Experiments.java` thêm `security.mode=off` cho E1–E7. `scripts/sim-log.js --start-server` cũng thêm. Cách này giữ số liệu cũ so được: 1000 kết nối từ 127.0.0.1 sẽ dính `CONN_FLOOD`.

## Data and API changes

### Schema (`db/schema.sql`, kèm trong `db/migrate_toboki.sql`)

```sql
CREATE TABLE danh_muc (ma_dm VARCHAR(10) PRIMARY KEY, ten VARCHAR(100) NOT NULL UNIQUE);

-- san_pham: bỏ cột gia, thêm:
model       VARCHAR(30),
ma_dm       VARCHAR(10)   NOT NULL REFERENCES danh_muc(ma_dm),
gia_nhap    NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_nhap >= 0),
gia_xuat    NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_xuat >= 0),
gia_ban_le  NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_ban_le >= 0)

-- chi_nhanh: thêm
han_muc_no  NUMERIC(15,0) NOT NULL DEFAULT 200000000 CHECK (han_muc_no >= 0)

CREATE TABLE nha_cung_cap (
    ma_ncc VARCHAR(10) PRIMARY KEY, ten VARCHAR(150) NOT NULL, mst VARCHAR(20),
    dia_chi VARCHAR(255), dien_thoai VARCHAR(20));

-- phieu_nhap: bỏ nha_cung_cap (text), thêm
ma_ncc   VARCHAR(10)   NOT NULL REFERENCES nha_cung_cap(ma_ncc),
don_gia  NUMERIC(15,0) NOT NULL CHECK (don_gia >= 0)

-- phieu_xuat, dieu_chuyen: thêm
don_gia  NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (don_gia >= 0)

CREATE TABLE cong_no_cn (
    id BIGSERIAL PRIMARY KEY,
    ma_cn VARCHAR(10) NOT NULL REFERENCES chi_nhanh(ma_cn),
    loai VARCHAR(8) NOT NULL CHECK (loai IN ('XUAT', 'THU', 'DC_NHAN', 'DC_GIAO')),
    so_tien NUMERIC(15,0) NOT NULL CHECK (so_tien > 0),   -- dấu suy ra từ loai
    ma_yc INTEGER REFERENCES yeu_cau(ma_yc),
    ma_dc INTEGER REFERENCES dieu_chuyen(ma_dc),
    ghi_chu VARCHAR(255),
    thoi_gian TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX uq_cong_no_yc ON cong_no_cn (loai, ma_yc) WHERE ma_yc IS NOT NULL;
CREATE UNIQUE INDEX uq_cong_no_dc ON cong_no_cn (loai, ma_dc) WHERE ma_dc IS NOT NULL;
CREATE INDEX idx_cong_no_cn ON cong_no_cn (ma_cn, thoi_gian);

CREATE TABLE thanh_toan_ncc (
    id BIGSERIAL PRIMARY KEY,
    ma_ncc VARCHAR(10) NOT NULL REFERENCES nha_cung_cap(ma_ncc),
    so_tien NUMERIC(15,0) NOT NULL CHECK (so_tien > 0),
    ghi_chu VARCHAR(255),
    thoi_gian TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE su_kien_bao_mat (
    id BIGSERIAL PRIMARY KEY,
    thoi_gian TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nguon VARCHAR(6) NOT NULL CHECK (nguon IN ('SERVER', 'CLIENT', 'ADMIN')),
    loai VARCHAR(30) NOT NULL,
    muc VARCHAR(6) NOT NULL CHECK (muc IN ('LOW', 'MEDIUM', 'HIGH')),
    ip VARCHAR(45),
    ma_cn VARCHAR(10),               -- không FK: có thể là mã đoán bừa khi dò mật khẩu
    chi_tiet TEXT,
    hanh_dong VARCHAR(12) NOT NULL);  -- GHI_NHAN | CHAN_IP | NGAT | GIOI_HAN | KHOA_TK
CREATE INDEX idx_su_kien_thoi_gian ON su_kien_bao_mat (thoi_gian);
```

Không đổi giới hạn `ma_sp VARCHAR(10)`.

### Giao thức TCP (cập nhật README §5 và nhắc cập nhật SRS §4)

| Lệnh | Chiều | Tham số | Ghi chú |
|---|---|---|---|
| `INVENTORY` | S→CN | danh sách `maHang,tenHang,soLuong,nguong,model,danhMuc,giaXuat,giaBanLe` | 4 trường mới nối vào cuối; client cũ đọc 4 trường đầu vẫn chạy |
| `DEBT_GET` | CN→S | — | mới |
| `DEBT` | S→CN | `tongNhan`, `daTra`, `conNo`, `hanMuc`, danh sách `id,loai,soTien,thoiGian,ghiChu` (50 dòng mới nhất) | mới; tiền là số nguyên đồng |
| `SECURITY_REPORT` | CN→S | `loai`, `chiTiet` (≤ 500 ký tự) | mới; chỉ sau khi đăng nhập |
| `ERROR` | S→CN | thêm `E06`: bị giới hạn tần suất hoặc IP bị chặn | mới |

`Command.java` thêm `DEBT_GET(0)`, `DEBT(5)`, `SECURITY_REPORT(2)`. `ErrorCode.java` thêm `E06`. `ClientHandler.FROM_CLIENT` thêm `DEBT_GET` và `SECURITY_REPORT`.

### HTTP API admin (đều cần đăng nhập)

| Method | Đường dẫn | Body / query | Trả về |
|---|---|---|---|
| GET | `/api/categories` | | `[{maDm, ten, soMatHang}]` |
| GET/POST/PUT | `/api/products`, `/api/products/{id}` | thêm `model`, `maDm`, `giaNhap`, `giaXuat`, `giaBanLe` | như cũ |
| GET/POST | `/api/suppliers` | `{maNcc, ten, mst, diaChi, dienThoai}` | |
| POST | `/api/imports` | thêm `maNcc` (bắt buộc), `donGia` (tuỳ chọn) | `{tonTong}` |
| GET | `/api/debts/summary` | | `{tongNhap, daTraNcc, conNoNcc, tongXuat, daThuCn, conNoCn}` |
| GET | `/api/debts/branches` | `trangThai=` | `[{maCn, tenCn, tongNhan, daTra, conNo, hanMuc, trangThai}]` |
| GET | `/api/debts/branches/{maCn}` | | `{tongHop, butToan: [...]}` |
| GET | `/api/debts/branches/{maCn}/check` | `soTien=` | `{conNo, hanMuc, sauKhiGui, vuotHanMuc}` |
| POST | `/api/debts/branches/{maCn}/payments` | `{soTien, ghiChu}` | `{conNo}` |
| PUT | `/api/branches/{maCn}/credit-limit` | `{hanMuc}` | `{ok}` |
| GET | `/api/debts/suppliers`, `/api/debts/suppliers/{maNcc}` | | như phía chi nhánh |
| POST | `/api/debts/suppliers/{maNcc}/payments` | `{soTien, ghiChu}` | `{conNo}` |
| GET | `/api/warehouses`, `/api/warehouses/{maCn}` | | *Giai đoạn 3* |
| POST | `/api/warehouses/{maCn}/replenish` | `{maSp, soLuong}` | `{maYc}` |
| GET | `/api/security/overview` | | KPI |
| GET | `/api/security/events` | `muc, loai, nguon, ip, maCn, limit≤2000` | |
| GET | `/api/security/ips`, `/api/security/sessions` | | |
| POST | `/api/security/bans` | `{ip, phut}` (1–1440) | `{until}` |
| DELETE | `/api/security/bans/{ip}` | | `{ok}` |
| POST | `/api/security/sessions/{id}/kick` | | `{ok}` |

SSE mới: `debt` `{maCn}`, `security` (một sự kiện).

Client HTTP mới: `GET /api/debt`, `GET /api/security`.

### Config

`config/server.properties`:
```
security.mode=block                 # off | detect | block
security.ban.minutes=10
security.login.fail.max=5
security.login.fail.window.seconds=60
security.flood.msgs.per.second=50
security.scrape.max.per.minute=30
security.fuzz.max.per.minute=10
security.idor.max.per.minute=5
security.conn.max.per.ip=20
security.prelogin.timeout.seconds=10
security.allowed.origins=http://localhost:3000,http://localhost:3001
admin.lock.fails=5
admin.lock.minutes=5
```
`config/client.properties`: `security.allowed.origins=...` (như trên), `security.api.max.per.second=30`.

## Edge cases and errors

- **Tiền:** `soTien` không phải số nguyên dương, hoặc > 10^12 → 400. Phiếu thu lớn hơn số còn nợ → 400 "Số tiền lớn hơn số còn nợ (X)", phiếu chi nhà cung cấp cũng vậy. Hai phiếu thu cùng lúc: khoá dòng `chi_nhanh ... FOR UPDATE` trước khi tính còn nợ, để không thu quá.
- **Giá:** đổi giá sau khi đã gửi hàng không làm đổi nợ của YC đó (đã chốt ở `phieu_xuat.don_gia`). Điều chuyển dùng `gia_xuat` lúc hoàn tất.
- **RECEIVED lặp / ACCEPT lặp:** không ghi `XUAT` hai lần (`uq_cong_no_yc`), có test riêng.
- **Chi nhánh ảo `SIM*`:** vẫn ghi công nợ, nhưng UI mặc định ẩn như hiện tại. `finish-live`/sim-log dọn cả `cong_no_cn` của lượt chạy.
- **Xoá mặt hàng:** đã có phiếu nhập/xuất thì không xoá được (đã có từ trước). Đổi danh mục thì được. Xoá danh mục còn hàng → 409.
- **Bổ sung chủ động lúc chi nhánh vừa gửi LOW_STOCK:** cả hai đi qua `uq_yeu_cau_dang_mo` và khoá dòng YC, nên chỉ một YC được ship. Bên thua nhận 409 hoặc LOW_STOCK bị bỏ qua (`ON CONFLICT DO NOTHING`) như hiện tại.
- **Chặn nhầm:** quy tắc theo IP không bao giờ chặn IP đang có phiên đã đăng nhập hợp lệ, trừ `CMD_FLOOD` và `IDOR_PROBE` (hai quy tắc này theo phiên, ngắt đúng phiên đó). Admin bỏ chặn tay được. Danh sách chặn chỉ giữ trong bộ nhớ (khởi động lại server thì mất), sự kiện thì lưu CSDL.
- **NAT:** nhiều chi nhánh sau một IP (Docker Desktop, cùng LAN NAT) dễ chạm `CONN_FLOOD`. README ghi cách nâng `security.conn.max.per.ip` hoặc đặt `security.mode=detect`.
- **Dữ liệu không đáng tin:** `SECURITY_REPORT` là dữ liệu từ client. Escape khi hiển thị (React đã escape), cắt độ dài, giới hạn tần suất, không tin `ma_cn` trong nội dung (lấy từ phiên).
- **Hàng đợi sự kiện đầy:** bỏ sự kiện mới, tăng bộ đếm `suKienBiBo`, hiện ở KPI. Không bao giờ chặn luồng Selector.
- **Hiệu năng:** bộ đếm dùng mảng vòng theo giây (`LongAdder` hoặc `AtomicLongArray` 60 ô), không gọi CSDL trên đường đọc tin. E7 với `security.mode=detect` không được tăng p99 quá 0,5 ms so với `off`.
- **`next dev`:** proxy của Next giữ `Origin: http://localhost:3000`, nằm trong danh sách cho phép mặc định.

## Test plan

Unit (JUnit 5). `server` và `client` hiện chưa có thư mục test, nên test mới đặt ở `server/src/test/java/...` và `client/src/test/java/...`. JUnit đã khai báo cho mọi module trong `pom.xml` gốc.
- `SecurityRulesTest`: từng quy tắc ở bảng trên, chạm ngưỡng và vượt ngưỡng, cửa sổ trượt hết hạn thì reset, `off`/`detect`/`block` cho hành động khác nhau, IP có phiên hợp lệ không bị chặn theo quy tắc IP.
- `BanListTest`: chặn, hết hạn, bỏ chặn, chặn lại thì cộng dồn hạn.
- `common/ProtocolTest`: `DEBT` với danh sách có ghi chú chứa `,` `;` `|`, `INVENTORY` 8 trường, `SECURITY_REPORT` dài 4000 byte vẫn trong giới hạn dòng, `E06`.
- `client`: `ClientSecurityTest` cho Origin/Host hợp lệ và không hợp lệ, phát hiện 2 `HERE` khác nhau.

Tích hợp (script, như TC-01..12 trong README §6, chạy trên cổng 5100/8180):
- TC-13 công nợ: Gửi hàng 5 × TB01 cho CN01 → RECEIVED → `cong_no_cn` có 1 `XUAT` 4.635.000 → RECEIVED lần nữa vẫn 1 dòng → ghi thu 2.000.000 → `DEBT` đẩy xuống CN01 còn nợ 2.635.000 → ghi thu 3.000.000 → 400.
- TC-14 bổ sung chủ động: CN02 tồn TB06 = 1, ngưỡng 3 → `POST /api/warehouses/CN02/replenish` → CN02 nhận `DELIVERED`, bấm Đã nhận → tồn 6.
- TC-15 tấn công: netcat từ một IP gửi 6 `LOGIN` sai → sự kiện `BRUTE_FORCE`, kết nối mới nhận `ERROR|E06`; CN01 từ IP khác vẫn đăng nhập được.
- TC-16 client CSRF: `curl -H "Origin: http://evil.example" -X POST http://127.0.0.1:8081/api/sale` → 403, `/api/security` của client có `CLIENT_CSRF`, tab Giám sát của admin thấy sự kiện nguồn CLIENT.
- Đối soát (`/api/reconcile`) vẫn khớp sau `seed_demo.sql`, và có thêm kiểm tra Σ sổ công nợ = Σ(phiếu xuất HOAN_TAT × đơn giá) − Σ thu ± điều chuyển.

End-to-end: `scripts\migrate-db.bat` → `scripts\seed-demo.bat` → build → `run-server.bat` + 2 client → thấy 28 hàng Toboki, tab Công nợ có đủ 4 trạng thái, tab Kho chi nhánh có thẻ, chạy `scripts\run-experiments.bat run=e8` ra `e8.csv` với `security.mode=block` chặn được cả 5 kẻ tấn công và 0 chặn nhầm.

## Acceptance criteria

- [ ] `SELECT count(*) FROM san_pham` = 28, mã TB01..TB28, `count(DISTINCT ma_dm)` = 7. Giá đúng *Phụ lục A* (vd TB21: 12.950.000 / 15.725.000 / 18.500.000).
- [ ] `source tools/env.sh && mvn -q test` qua toàn bộ, gồm test mới của `server` và `client`. `npm --prefix ui run typecheck` exit 0.
- [ ] E1–E7 (`scripts\run-experiments.bat`) chạy được với TB01..TB05, không lỗi.
- [ ] TC-13: RECEIVED hai lần chỉ sinh một bút toán `XUAT`. Phiếu thu vượt số còn nợ bị 400.
- [ ] `GET /api/debts/branches` sau `seed_demo.sql` có ít nhất một chi nhánh ở mỗi trạng thái `DA_TRA_DU`, `CON_NO`, `VUOT_HAN_MUC`.
- [ ] Chi nhánh nhận `DEBT` trong vòng 1 s sau khi admin ghi phiếu thu, và tab Công nợ ở `/branch` hiện số mới.
- [ ] `GET /api/warehouses` trả đủ chi nhánh thật với số thiếu/sắp thiếu/đủ, khớp `GET /api/stock/branches` khi đếm tay.
- [ ] TC-14 qua: bổ sung chủ động tạo đúng một YC và một phiếu xuất.
- [ ] TC-15 qua với `security.mode=block`. Với `detect`: có sự kiện nhưng không có `ERROR|E06`. Với `off`: không có sự kiện.
- [ ] TC-16 qua: request khác Origin tới client và admin API đều bị 403 và sinh sự kiện.
- [ ] `ADMIN_BRUTE_FORCE`: sai mật khẩu admin lần thứ 6 trong 5 phút → 429, kể cả khi đúng mật khẩu cho tới khi hết 5 phút.
- [ ] E8 ghi `experiments/results/e8.csv`. Ở `block`: 5/5 kẻ tấn công bị chặn hoặc ngắt, 0 chi nhánh thật bị chặn nhầm, p95 RTT `SALE` của chi nhánh thật thấp hơn lượt `off`.
- [ ] E7 chạy lại với `security.mode=detect`: p99 tăng không quá 0,5 ms so với `off`.
- [ ] README cập nhật: mục 3 Công nghệ (không đổi thư viện), mục 4 (migrate-db), mục 5 (lệnh mới, `E06`), mục 6 (TC-13..16), mục 7 (E8), bảng cấu hình `security.*`.

## Open questions

1. **Nhà cung cấp:** chưa có tên thật. Đề xuất dùng tên hư cấu: NCC01 "Nhà máy Toboki (Chiết Giang, TQ)", NCC02 "Cty TNHH Thiết bị Đông Á", NCC03 "Cty CP Phụ tùng Máy Việt". Nếu muốn ghi công ty mình là Toboki Việt Nam (tên, MST trên trang đăng nhập) thì cần xác nhận.
2. **Điều chuyển chuyển nợ:** spec chọn cho nợ đi theo hàng (`DC_NHAN`/`DC_GIAO`). Nếu nhóm muốn điều chuyển không ảnh hưởng công nợ thì bỏ hai loại này.
3. **Thời gian:** cả 4 giai đoạn khá lớn so với hạn 31/10. Nếu thiếu giờ, có thể cắt bỏ trước chế độ xem "Ma trận" (giai đoạn 3) và `CLIENT_API_FLOOD`/`DISCOVERY_FLOOD` (giai đoạn 4).
4. **Báo cáo `.docx`:** spec này không sửa `report/source/build-report.js`. Chương thực nghiệm có cần thêm E8 không?

## Phụ lục A: 28 mặt hàng

Danh mục: DM01 Máy hút bụi · DM02 Máy cắt gạch · DM03 Máy tời, pa lăng · DM04 Máy rửa xe · DM05 Máy đầm · DM06 Phụ kiện máy đầm · DM07 Máy khoan.

Giá bán lẻ lấy từ meta.vn (21/10/2026). Giá nhập = 70% và giá xuất = 85% giá bán lẻ, làm tròn tới 1.000 đ.

| Mã | DM | Tên | Model | ĐV | Giá nhập | Giá xuất | Giá bán lẻ |
|---|---|---|---|---|---|---|---|
| TB01 | DM01 | Máy hút bụi công nghiệp khô và ướt 16 lít | TK-16L | cái | 763.000 | 927.000 | 1.090.000 |
| TB02 | DM01 | Máy hút bụi 35 lít | TK-35L | cái | 1.113.000 | 1.352.000 | 1.590.000 |
| TB03 | DM01 | Máy hút bụi 45 lít | TK-45L | cái | 1.295.000 | 1.573.000 | 1.850.000 |
| TB04 | DM01 | Máy hút bụi 80 lít, 2 mô tơ | TK-80L | cái | 2.555.000 | 3.103.000 | 3.650.000 |
| TB05 | DM01 | Máy hút bụi 100 lít, 3 mô tơ | TK-100L | cái | 3.325.000 | 4.038.000 | 4.750.000 |
| TB06 | DM02 | Bàn cắt gạch 800 mm | T-800 | cái | 805.000 | 978.000 | 1.150.000 |
| TB07 | DM02 | Bàn cắt gạch 1000 mm | T-1000 | cái | 1.015.000 | 1.233.000 | 1.450.000 |
| TB08 | DM02 | Bàn cắt gạch 1200 mm | T-1200 | cái | 1.330.000 | 1.615.000 | 1.900.000 |
| TB09 | DM03 | Máy tời TK200/25 | TK200/25 | cái | 1.106.000 | 1.343.000 | 1.580.000 |
| TB10 | DM03 | Máy tời TK400/25 | TK400/25 | cái | 1.645.000 | 1.998.000 | 2.350.000 |
| TB11 | DM03 | Máy tời TK600/25 | TK600/25 | cái | 1.470.000 | 1.785.000 | 2.100.000 |
| TB12 | DM03 | Máy tời TK1000 | TK1000 | cái | 2.485.000 | 3.018.000 | 3.550.000 |
| TB13 | DM03 | Máy tời TK1200/25 | TK1200/25 | cái | 2.387.000 | 2.899.000 | 3.410.000 |
| TB14 | DM03 | Máy tời TK1500/25 | TK1500/25 | cái | 2.478.000 | 3.009.000 | 3.540.000 |
| TB15 | DM03 | Máy tời 2400W, cáp 30 m | TK2400 | cái | 3.213.000 | 3.902.000 | 4.590.000 |
| TB16 | DM04 | Máy rửa xe TK-888 | TK-888 | cái | 1.491.000 | 1.811.000 | 2.130.000 |
| TB17 | DM04 | Máy rửa xe chỉnh áp 2.500W | TK-999 | cái | 1.407.000 | 1.709.000 | 2.010.000 |
| TB18 | DM04 | Máy rửa xe cao áp TOK2700 | TOK2700 | cái | 5.530.000 | 6.715.000 | 7.900.000 |
| TB19 | DM04 | Máy rửa xe cao áp TOK4000 | TOK4000 | cái | 7.840.000 | 9.520.000 | 11.200.000 |
| TB20 | DM04 | Máy rửa xe cao áp TOK5500 | TOK5500 | cái | 10.360.000 | 12.580.000 | 14.800.000 |
| TB21 | DM04 | Máy rửa xe cao áp TOK7500 | TOK7500 | cái | 12.950.000 | 15.725.000 | 18.500.000 |
| TB22 | DM05 | Máy đầm gà 1.100W | TK-35 | cái | 350.000 | 425.000 | 500.000 |
| TB23 | DM05 | Máy đầm TK-45 | TK-45 | cái | 350.000 | 425.000 | 500.000 |
| TB24 | DM05 | Máy đầm dùi DR-1100 | DR-1100 | cái | 1.015.000 | 1.233.000 | 1.450.000 |
| TB25 | DM05 | Máy đầm dùi 2.500W | DR-2500 | cái | 1.505.000 | 1.828.000 | 2.150.000 |
| TB26 | DM06 | Dây đầm gà 1,2 m / 1,5 m | — | sợi | 196.000 | 238.000 | 280.000 |
| TB27 | DM06 | Dây đầm dùi | — | sợi | 441.000 | 536.000 | 630.000 |
| TB28 | DM07 | Máy khoan bàn 375W, mũi 1,5–13 mm | TK-13KB | cái | 1.498.000 | 1.819.000 | 2.140.000 |

Nguồn: [masothue.com](https://masothue.com/0109227055-cong-ty-tnhh-xnk-toboki-viet-nam), [meta.vn/toboki.html](https://meta.vn/toboki.html?view=list) (trang 1–2).
