# Đặc tả luồng bổ sung hàng

Ngày cập nhật: 12/11/2026.

## 1. Mục tiêu và phạm vi

Luồng bổ sung từ kho tổng phải có đủ bốn bước:

**Admin yêu cầu bổ sung → Chi nhánh chấp nhận bổ sung → Admin xuất hàng → Chi nhánh nhận hàng.**

Áp dụng cho yêu cầu tạo từ Kho chi nhánh và đề xuất gửi từ cảnh báo thiếu hàng. Giữ nguyên đăng nhập, phân quyền, bán hàng, thống kê, công nợ và nghiệp vụ điều chuyển giữa chi nhánh. Các đơn đã giao/hoàn tất trước khi nâng cấp tiếp tục theo trạng thái cũ, không bắt xác nhận lại.

## 2. Trạng thái và quyền thao tác

| Trạng thái | Ý nghĩa | Thao tác tiếp theo |
| --- | --- | --- |
| `CHO` | Cảnh báo hoặc nhu cầu mới, chưa có đề xuất của Admin | Admin yêu cầu bổ sung |
| `DA_DE_XUAT` | Đã gửi yêu cầu, chờ chi nhánh xác nhận | Chi nhánh chấp nhận hoặc từ chối; Admin được đổi đề xuất |
| `DA_CHAP_NHAN` | Chi nhánh đã chốt số lượng, chờ Admin xuất hàng | Admin xuất đúng số lượng đã chốt |
| `DA_GIAO` | Admin đã xuất hàng, chờ chi nhánh nhận | Chi nhánh nhập số lượng thực nhận và xác nhận |
| `HOAN_TAT` | Đã ghi nhận hàng thực nhận | Chỉ xem, đối soát |
| `TU_CHOI` | Yêu cầu đã bị từ chối | Có thể tạo yêu cầu mới cho cùng mặt hàng |
| `THIEU_HANG` | Ngoại lệ kho tổng không đủ | Giữ nghiệp vụ báo thiếu/điều chuyển; xuất từ kho tổng vẫn phải có số lượng chi nhánh đã chốt |

```mermaid
sequenceDiagram
    participant A as Admin
    participant S as Server
    participant C as Chi nhánh
    A->>S: Yêu cầu bổ sung (mặt hàng, số lượng)
    S->>C: OFFER
    Note over S: DA_DE_XUAT; chưa thay đổi tồn kho
    C->>S: ACCEPT (số lượng chốt)
    S-->>C: ACCEPTED sau commit
    Note over S: DA_CHAP_NHAN; chưa thay đổi tồn kho
    S-->>A: Cập nhật yêu cầu qua SSE
    A->>S: Xuất hàng theo số lượng đã chốt
    Note over S: Trừ kho tổng + tạo phiếu xuất + DA_GIAO cùng transaction
    S->>C: DELIVERED
    C->>S: RECEIVED (số lượng thực nhận)
    Note over S: Cộng kho chi nhánh + ghi công nợ + HOAN_TAT cùng transaction
    S-->>C: RECEIVED_OK sau commit
    S-->>A: Cập nhật số nhận và chênh lệch
```

## 3. Quy tắc nghiệp vụ

### Bước 1 — Admin yêu cầu bổ sung

- Tại Kho chi nhánh, Admin nhập số lượng nguyên dương và bấm **Yêu cầu bổ sung**. Tại cảnh báo thiếu hàng, Admin cũng gửi yêu cầu thay cho xuất hàng ngay.
- Server tạo hoặc dùng lại yêu cầu đang mở của cặp `(chi nhánh, mặt hàng)`, đặt `so_luong_de_xuat` và trạng thái `DA_DE_XUAT`, rồi gửi `OFFER` đến đúng chi nhánh.
- Cho phép sửa/gửi lại đề xuất khi còn `CHO` hoặc `DA_DE_XUAT`. Không ghi đè yêu cầu đã được chấp nhận hoặc đang giao.
- Chưa trừ kho tổng, chưa cộng kho chi nhánh, chưa tạo phiếu xuất hoặc công nợ. Yêu cầu không giữ chỗ tồn kho, vì vậy được gửi cả khi kho hiện tại chưa đủ.

### Bước 2 — Chi nhánh chấp nhận bổ sung

- Tại Nhận hàng, chi nhánh được chấp nhận số lượng đề xuất hoặc sửa thành một số nguyên dương rồi chấp nhận; cũng có thể từ chối đề xuất.
- Server kiểm tra mã chi nhánh từ phiên TCP, khóa yêu cầu trong transaction và lưu `so_luong_chot`, chuyển sang `DA_CHAP_NHAN`.
- Sau commit, server trả `ACCEPTED`; giao diện hiển thị **Đã chấp nhận, chờ xuất hàng**. Chưa cho xác nhận đã nhận hàng.
- Admin nhận thông báo nổi ghi rõ chi nhánh, mặt hàng, số lượng đã đồng ý và mã yêu cầu. Tổng quan có mục **Chờ xuất hàng** kèm nút **Xuất hàng**; danh sách được khôi phục từ CSDL khi mở lại trang, không phụ thuộc việc đã đọc thông báo hay chưa. Cùng một xác nhận được gửi lại không làm lặp thông báo nổi trong phiên Admin.
- Bước này không thay đổi tồn kho, phiếu xuất hay công nợ. Gửi lại cùng số lượng trả kết quả cũ; gửi số khác khi đã chốt bị từ chối.

### Bước 3 — Admin xuất hàng

- Nút **Xuất hàng** xuất hiện tại Tổng quan → Chờ xuất hàng, Yêu cầu cấp hàng và danh sách đơn gần đây khi đã có số lượng chốt.
- Tại Kho chi nhánh, dòng có yêu cầu `DA_CHAP_NHAN` có nút **Xuất kho** ngay bên cạnh trạng thái. Nút dùng cùng API xuất hàng, lấy đúng số lượng chi nhánh đã chốt, giữ kiểm tra hạn mức và tồn kho; không yêu cầu chuyển trang. Xuất thành công tải lại chi tiết kho để hiện **Đã xuất kho** và ẩn nút. Dòng chưa được chấp nhận không có nút này.
- Admin chỉ được xuất đúng `so_luong_chot`; API từ chối xuất khi còn `CHO`/`DA_DE_XUAT`, khi thiếu xác nhận hoặc khi số lượng không khớp.
- Kiểm tra hạn mức công nợ theo hành vi hiện có. Kho tổng được kiểm tra lại tại thời điểm xuất, không dùng tồn kho lúc đề xuất.
- Trong cùng transaction: khóa yêu cầu, trừ kho tổng có điều kiện đủ hàng, tạo một phiếu xuất với giá xuất hiện tại, lưu số lượng giao và chuyển `DA_GIAO`. Hủy lời mời điều chuyển đang chờ cho yêu cầu này.
- Nếu không đủ kho: rollback toàn bộ, giữ nguyên trạng thái chờ xuất để Admin nhập thêm hàng và thử lại. Không giao một phần một cách ngầm định.
- Gửi lại lệnh xuất với cùng số lượng khi đã giao/hoàn tất không tạo phiếu hoặc trừ kho lần hai.

### Bước 4 — Chi nhánh nhận hàng

- Chỉ cho nhận khi `DA_GIAO`; nhập số thực nhận nguyên, không âm.
- Giữ nguyên xác nhận chênh lệch khi nhận thừa/thiếu. Server cộng đúng số thực nhận vào kho chi nhánh, lưu chênh lệch, ghi công nợ theo phiếu xuất gốc và chuyển `HOAN_TAT` trong một transaction.
- Xác nhận nhận thừa/thiếu và từ chối hàng đã gửi hiển thị bằng hộp xác nhận trong giao diện web, không dùng hộp `confirm` của trình duyệt. Hiển thị mã yêu cầu, mặt hàng và số lượng; nút Quay lại hoặc phím Escape không gửi thao tác. Chỉ gửi dữ liệu sau khi người dùng bấm nút xác nhận, dùng đúng số lượng đã hiển thị trong hộp và chặn bấm lặp khi đang xử lý.
- `RECEIVED_OK` chỉ gửi sau commit. Gửi lại cùng số thực nhận không cộng kho hoặc ghi nợ lần hai; đổi số bằng cách gửi lại bị từ chối.
- Sau khi nhận, Admin nhận thông báo số lượng giao/thực nhận và tình trạng đủ, thừa hoặc thiếu; yêu cầu kết thúc ở `HOAN_TAT` và không còn nằm trong mục Chờ xuất hàng.
- Nghiệp vụ từ chối toàn bộ hàng đã gửi và hoàn về nguồn giữ nguyên.

## 4. Giao diện

- Admin/Kho chi nhánh: dùng nút **Yêu cầu bổ sung**, thông báo rõ đang chờ chi nhánh chấp nhận. Bỏ nút **Hỏi cần hàng** vì yêu cầu bổ sung đã bao gồm bước hỏi và xác nhận này.
- Admin/Tổng quan: cảnh báo chỉ gửi yêu cầu; không còn nút xuất thẳng trước xác nhận. Mục Chờ xuất hàng hiển thị các yêu cầu chi nhánh đã đồng ý với nút Xuất hàng; đơn gần đây tiếp tục hiển thị trạng thái và thao tác hợp lệ.
- Admin/Yêu cầu cấp hàng: bổ sung trạng thái lọc `DA_CHAP_NHAN`; nút Xuất hàng dùng số lượng chốt, vô hiệu hóa khi đang xử lý hoặc tồn kho chưa đủ.
- Chi nhánh/Nhận hàng: có **Chấp nhận bổ sung** ở đề xuất; sau chấp nhận chỉ hiện số lượng chốt và thông báo chờ công ty xuất. Khi nhận `DELIVERED`, chuyển sang giao diện nhập số thực nhận hiện có.
- Giữ nguyên các phần thống kê, bố cục còn lại và bộ lọc khác.

## 5. API và giao thức

| Điểm vào | Nội dung | Kết quả |
| --- | --- | --- |
| Admin `POST /api/warehouses/{maCn}/replenish` | `{maSp, soLuong}` | `{maYc}`; tạo/gửi yêu cầu, không xuất hàng |
| Admin `POST /api/requests/{id}/offer` | `{soLuong}` | `DA_DE_XUAT`, gửi `OFFER` |
| Client `POST /api/requests/{id}/accept` | `{soLuong}` | Gateway gửi `ACCEPT`; trạng thái xác nhận từ server qua TCP/SSE |
| TCP `ACCEPTED\|maYc\|maHang\|soLuongChot` | Server → chi nhánh, sau commit | `DA_CHAP_NHAN` |
| Admin `POST /api/requests/{id}/ship` | `{soLuong}` bằng số chốt | `DA_GIAO`, gửi `DELIVERED` |
| Client `POST /api/requests/{id}/received` | `{soLuongNhan}` | Giữ giao thức `RECEIVED`/`RECEIVED_OK` |

Lỗi sai trạng thái: `E03`; không tìm thấy yêu cầu thuộc chi nhánh hiện tại: `E04`; số lượng không hợp lệ hoặc không đủ kho khi xuất: `E05`. Các đường Admin tiếp tục dùng xác thực Admin hiện có; chi nhánh không được gọi API xuất hàng.

## 6. Lưu trữ, mất kết nối và triển khai

- Thêm `DA_CHAP_NHAN` vào CHECK của `yeu_cau.trang_thai`; dùng cột `so_luong_chot` sẵn có, không thêm cột tồn kho hay sửa giao dịch lịch sử.
- `ReplenishmentSchema.ensure` tự nâng cấp constraint trong transaction lúc server khởi động; chạy lặp an toàn. Schema cài mới cũng có trạng thái này.
- Khi chi nhánh đăng nhập lại, server khôi phục yêu cầu chờ xuất bằng `ACCEPTED`, không phát lại thành đề xuất chờ chấp nhận. Client không cho tin `OFFER`/`ACCEPTED` cũ làm lùi đơn đã giao/hoàn tất/từ chối.
- Triển khai server và client cùng phiên bản vì có lệnh TCP mới. Không thay cổng mạng hoặc công khai TCP 5000.
- Dùng `deploy.bat` hiện có. Kiểm thử nghiệp vụ trên PostgreSQL riêng; không tạo/giao/nhận hàng thử bằng dữ liệu sản xuất.

## 7. Tiêu chí nghiệm thu

1. Admin gửi yêu cầu: chỉ tạo đề xuất, mọi tồn kho và công nợ không đổi.
2. Chi nhánh chấp nhận: chỉ lưu số lượng chốt và `DA_CHAP_NHAN`.
3. API chặn xuất trước chấp nhận, nhận trước xuất, chấp nhận hộ chi nhánh khác và xuất khác số lượng chốt.
4. Chỉ bước Admin xuất mới trừ kho tổng và tạo phiếu xuất; chỉ bước nhận mới cộng kho chi nhánh/ghi nợ.
5. Nhận thiếu/thừa được ghi nhận đúng, giữ dữ liệu đối soát hiện có.
6. Gọi lặp chấp nhận/xuất/nhận không nhân đôi giao dịch; xuất đồng thời cùng yêu cầu cũng chỉ trừ một lần.
7. Hai yêu cầu cùng tranh tồn không được xuất vượt kho với chiến lược mặc định `CONDITIONAL`.
8. Thiếu kho khi xuất phải rollback; nhập thêm kho rồi thử lại được.
9. Mất kết nối/đăng nhập lại giữ đúng trạng thái chờ xuất; dữ liệu lịch sử không bị chuyển trạng thái ngược.
10. Build UI, kiểm thử Java và integration PostgreSQL đạt trước khi triển khai.

Kiểm thử liên quan: `ReceiptIntegrationTest` (transaction, đủ bốn bước, chống gọi lặp, cạnh tranh tồn kho, migration) và `ReplenishmentTest` (trạng thái client và đồng bộ lại).

Các kịch bản giả lập E1/E6 cũng chờ chi nhánh chấp nhận rồi bot Admin mới gọi API xuất hàng. Chỉ số thời gian ACCEPT của báo cáo E1 cũ nay bao gồm bước xuất hàng riêng; cần ghi rõ phiên bản luồng khi so sánh với kết quả lịch sử.
