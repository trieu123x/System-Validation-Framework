# Thông báo có phản hồi, ảnh hàng hoá, URL theo chi nhánh, thương hiệu TOBOKI

Status: approved · Date: 2026-10-22 · Tiếp nối `2026-10-21-toboki-cong-no-kho-giam-sat.md`

## Problem

Thông báo hiện chỉ là một dòng chữ gửi tới mọi chi nhánh, chi nhánh không trả lời được. Admin không hỏi được chi nhánh sắp thiếu hàng là có cần hàng không, cũng không giới thiệu được sản phẩm mới. Hàng hoá không có ảnh. Trang chi nhánh luôn ở `/branch/` nên nhìn URL không biết đang ở chi nhánh nào. Trang admin vẫn mang tên chung "Phân phối hàng hóa".

## Tìm hiểu Toboki

Xác minh được (toboki.vn, thongtincongty.vn, 22/10/2026):

- Công ty TNHH XNK Toboki Việt Nam, MST 0109227055, hoạt động từ 17/06/2020, giám đốc Nguyễn Ngọc Tuân.
- Trụ sở: Số 11, ngõ 102 Ngũ Nhạc, Hà Nội. Hotline 083.5582.333 (07:00–22:00), email Tobokivietnam@gmail.com.
- Một chi nhánh đăng ký: 0109227055-001, phường Lĩnh Nam, Hà Nội (từ 16/08/2022).
- Ngành chính: bán buôn máy móc, thiết bị; ngành phụ: sản xuất thiết bị hàn, dụng cụ cầm tay. Quy mô 25–99 nhân viên.
- toboki.vn có 10 nhóm hàng. Ba nhóm chưa có trong TB01..TB28: máy bơm, máy phun / bình phun bọt tuyết, máy xoa vữa.
- Bán lẻ qua meta.vn (showroom Hà Nội, TP.HCM).

Không tìm được chính sách đại lý, chiết khấu, công nợ hay cách giao hàng cho chi nhánh. Phần đó là **giả định** theo thông lệ ngành: giá xuất = 85% giá bán lẻ (chiết khấu 15%), chi nhánh đặt hàng theo phiếu yêu cầu, công ty giao từ kho tổng.

## Goals

1. Trang admin mang thương hiệu **TOBOKI**, có thông tin công ty. CN01 đổi thành "Chi nhánh Lĩnh Nam" cho khớp chi nhánh thật; CN02, CN03 là chi nhánh mô phỏng.
2. Mỗi mặt hàng có ảnh tượng trưng: lấy từ Wikimedia Commons, nén bằng Python (Pillow), lưu trên Cloudinary, hiện ở admin và chi nhánh.
3. Thông báo có loại và đối tượng:
   - `TIN`: tin thường.
   - `HOI_NHU_CAU`: hỏi chi nhánh sắp chạm ngưỡng có cần hàng không. Chi nhánh bấm "Cần hàng" → server tạo YC → admin bấm Gửi hàng.
   - `SP_MOI`: giới thiệu sản phẩm mới. Chi nhánh bấm "Muốn nhập" → server tạo YC (và dòng kho chi nhánh) → admin Gửi hàng.
   - Gửi tới tất cả hoặc một vài chi nhánh. Có gợi ý chi nhánh sắp chạm ngưỡng.
4. URL trang chi nhánh theo tên: `http://localhost:8081/ha-noi/`.

## Non-goals

- Không sửa `report/` (làm lại sau khi code xong).
- Chi nhánh trả lời "Cần hàng" không tự trừ kho tổng; admin vẫn duyệt bằng luồng Gửi hàng có sẵn.
- Không tự lưu ảnh trên máy chủ; mất mạng thì hiện icon danh mục.
- Admin vẫn ở `/admin/`.

## Design

### Giai đoạn 1: thương hiệu

- `ui/app/admin/page.tsx`, `ui/app/layout.tsx`: brand TOBOKI, tiêu đề tab "TOBOKI · Quản trị".
- Thông tin công ty (tên, MST, trụ sở, hotline) ở màn hình đăng nhập admin và chân sidebar.
- `db/seed.sql`: CN01 = "Chi nhánh Lĩnh Nam", "Tổ 21, Lĩnh Nam, Hoàng Mai, Hà Nội".

### Giai đoạn 2: ảnh

- `san_pham.anh_url VARCHAR(255)` (NULL = chưa có ảnh).
- `scripts/images/upload_images.py`: đọc `scripts/images/sources.json` (ma_sp → tên file Commons), tải ảnh, nén (cạnh dài ≤ 800 px, WebP q=75, bỏ EXIF), upload có chữ ký lên Cloudinary (`public_id = toboki/<ma_sp>`, ghi đè), sinh `db/seed_images.sql` và `scripts/images/credits.json` (tác giả, giấy phép, link gốc). `--dry-run` chỉ tải và nén, in kích thước trước/sau.
- Khoá Cloudinary ở `config/cloudinary.local.properties` (gitignored): `cloud.name`, `api.key`, `api.secret`.
- API sản phẩm, kho chi nhánh trả `anhUrl`. Dòng `INVENTORY` thêm trường `anhUrl` (đổi giao thức).
- UI dùng URL Cloudinary có `w_160,c_fill,f_auto,q_auto` cho ảnh nhỏ; lỗi tải hoặc NULL → icon danh mục.

### Giai đoạn 3: thông báo

Bảng:

```sql
thong_bao (id, loai TIN|HOI_NHU_CAU|SP_MOI, tieu_de, noi_dung, ma_sp NULL, so_luong_de_xuat NULL, tao_luc)
thong_bao_cn (id_tb, ma_cn, trang_thai DA_GUI|DA_XEM|CAN_HANG|KHONG_CAN|MUON_NHAP, so_luong, ma_yc, tra_loi_luc)
```

Giao thức (BROADCAST giữ nguyên cho E3):

- `NOTICE|id|loai|tieuDe|noiDung|maSp|soLuongDeXuat|anhUrl` server → CN. Trường trống khi không áp dụng.
- `NOTICE_REPLY|id|traLoi|soLuong` CN → server. `traLoi` ∈ `XEM`, `CAN_HANG`, `KHONG_CAN`, `MUON_NHAP`, `BO_QUA`.
- Lỗi: thông báo không thuộc CN → `E04`; đã trả lời → `E03`; số lượng ≤ 0 → `E05`; trả lời sai loại → `E01`.
- CN offline: tin vào `hang_doi_tin`; sau `LOGIN_OK` gửi lại mọi thông báo chưa trả lời (30 ngày gần nhất).

Phản hồi `CAN_HANG`/`MUON_NHAP` trong một transaction: ghi trạng thái, tạo YC `CHO` (cùng chỉ mục chống trùng; đã có YC mở thì gắn mã YC đó), `MUON_NHAP` tạo thêm dòng `kho_chi_nhanh` tồn 0, ngưỡng 3. Đẩy `ALERT` lên admin như LOW_STOCK. YC lưu số lượng chi nhánh xin để admin điền sẵn khi Gửi hàng.

Admin API:

- `POST /api/notices` `{loai, tieuDe, noiDung, maSp?, soLuongDeXuat?, chiNhanh: [] | null}` (null = tất cả CN thật).
- `GET /api/notices` (kèm thống kê), `GET /api/notices/{id}` (từng CN).
- `GET /api/notices/suggest?maSp=` → các (CN, SP) sắp chạm ngưỡng (tồn ≤ 1,5 × ngưỡng) kèm số đề xuất.

Client: `GET /api/notices` (hộp thư), `POST /api/notices/{id}/reply`.

UI admin tab Thông báo: soạn (loại, đối tượng, sản phẩm), lịch sử + thống kê. Kho chi nhánh: dòng sắp thiếu có nút "Hỏi cần hàng". UI chi nhánh: thẻ thông báo, huy hiệu chưa đọc, nút trả lời theo loại.

`seed_demo.sql`: thêm TB29 máy bơm, TB30 bình phun bọt tuyết, TB31 máy xoa vữa (danh mục mới), có ở kho tổng, chưa có ở chi nhánh.

### Giai đoạn 4: URL theo tên

- Slug từ tên trong `LOGIN_OK`: bỏ tiền tố "Chi nhánh", bỏ dấu, chữ thường, khoảng trắng → `-` ("Chi nhánh TP.HCM" → `tp-hcm`).
- Client Java: `/<slug>/` → `branch/index.html`; `/` và `/branch/` → 302 sang slug khi đã đăng nhập. Mở trình duyệt đúng URL.
- UI: sau đăng nhập dùng `history.replaceState` để đặt URL slug nếu đang ở `/branch/`.

## Acceptance criteria

- [ ] Trang admin hiện TOBOKI và thông tin công ty; CN01 tên "Chi nhánh Lĩnh Nam".
- [ ] `upload_images.py --dry-run` nén được ảnh cho TB01..TB31, in kích thước trước/sau; chạy thật sinh `db/seed_images.sql`, ảnh mở được từ `res.cloudinary.com/dfnlbrk4w/...`.
- [ ] Bảng Sản phẩm, Kho chi nhánh, tồn kho chi nhánh và thẻ SP_MOI hiện ảnh; `anh_url` NULL hiện icon.
- [ ] Gửi thông báo cho 2/3 chi nhánh: chỉ 2 chi nhánh nhận `NOTICE`; chi nhánh offline nhận khi đăng nhập lại.
- [ ] `HOI_NHU_CAU` → "Cần hàng 5" tạo đúng 1 YC `CHO`; trả lời lần hai bị `E03`; admin Gửi hàng xong, chi nhánh nhận DELIVERED như luồng cũ.
- [ ] `SP_MOI` → "Muốn nhập" tạo dòng kho chi nhánh và YC.
- [ ] Trang chi nhánh CN02 mở ở `http://localhost:8081/da-nang/`; tải lại trang vẫn chạy.
- [ ] `mvn -q test` qua (test mới: NOTICE/NOTICE_REPLY/INVENTORY trong `ProtocolTest`, slug, trả lời thông báo); `npm --prefix ui run typecheck` exit 0.
- [ ] README §5 cập nhật lệnh mới và INVENTORY; nhắc cập nhật SRS §4.
