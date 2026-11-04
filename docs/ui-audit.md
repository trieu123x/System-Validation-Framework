# Kiểm kê UI trước thiết kế lại

Ngày: 04/11/2026. Mốc nguồn: `92614b3` (`new ui and bill`), workspace sạch trước khi làm. Kiểm kê từ source thực tế; không thêm nghiệp vụ từ sơ đồ minh họa trong plan.

## Kỹ thuật và ranh giới

- Next.js 15.5.28 / React 19.1 / TypeScript 5.9. CSS thuần, component chung `ui/components/ui.tsx`; không có UI library cần thay thế.
- Hai route nghiệp vụ `/admin/`, `/branch/`; đăng nhập được kiểm tra trong từng route. Route `/` chọn ứng dụng. Next export ra `ui/out`, Java phục vụ static; dev proxy `/api` về server/client Java theo `API_TARGET`.
- Admin dùng session `/api/auth/me`, sự kiện `UNAUTHORIZED`, SSE `/api/events`. Chi nhánh dùng cookie/session của gateway, snapshot `/api/state`, SSE và browser heartbeat. Giữ các guard và điều kiện online/busy hiện có.
- React state tại trang/component, giỏ và ID đơn lưu theo mã chi nhánh trong localStorage. Giữ idempotency, server-authoritative prices và logic phục hồi đơn.
- Số/tiền qua `fmtNumber`/`fmtMoney`, nhãn trạng thái qua `api.ts` và `ui.tsx`. Hóa đơn dùng giờ Việt Nam và hỗ trợ in/PDF.
- Build: `cd ui; npm run typecheck; npm run build`. Backend Maven riêng; không đổi API, DB, tính tiền hoặc phân quyền trong đợt UI này.

## Màn hình thực tế

| Module / component | Route, role | Chức năng hiện có và API chính | Trạng thái / vấn đề trước đổi | Ưu tiên | Route sau / regression |
|---|---|---|---|---|---|
| Login / PasswordRecovery | `/admin/`, admin; `/branch/`, chi nhánh | Đăng nhập username/email, quên/reset mật khẩu; `/api/auth/*`, `/api/login`, `/api/password/*` | Busy/error có; form nhỏ, hệ chữ cũ | P0 | Giữ; kiểm tra form/guard |
| Admin Overview | `/admin/`, admin | KPI thật, cảnh báo/cấp hàng, lọc, đơn gần đây, hoạt động; `/api/branches`, `/api/alerts`, `/api/requests`, `/api/products`, `/api/stats`, SSE | Empty và push có; chữ/bảng dày, phân cấp yếu | P0 | Giữ; menu/back/KPI/cảnh báo |
| Products | `/admin/`, admin | Danh sách/tạo/sửa/xóa, phiếu nhập, nhập kho; `/api/products`, `/api/imports`, `/api/categories`, `/api/suppliers` | Busy/native confirm có; form và bảng tranh diện tích; thiếu search | P0 | Giữ; sửa/hủy/payload/lọc |
| Warehouses | `/admin/`, admin | Thẻ/matrix/chi tiết kho, bổ sung, hỏi nhu cầu; `/api/warehouses/*`, `/api/stock/branches`, `/api/notices` | Empty có; back theo chi tiết đã có | P0 | Giữ; mở chi tiết/quay lại/bổ sung |
| AdminThresholds | `/admin/`, admin | Theo dõi ngưỡng, lọc/sort/reload; GET `/api/stock/branches` | Loading/error/empty có; đây là màn đọc, không tự thêm sửa | P1 | Giữ; lọc/sort |
| Debts | `/admin/`, admin | Sổ CN/NCC, phiếu thu/chi, hạn mức; `/api/debts/*`, PUT `/api/branches/*/credit-limit` | Busy/form/cancel có; nhiều KPI nhỏ | P0 | Giữ; sổ/back/form/validation |
| RequestHistory / Transfers / Reconcile | `/admin/`, admin | Lọc YC, điều chuyển, đối soát; `/api/requests`, `/api/transfers`, `/api/reconcile` | Bảng cuộn/empty có; header cần rõ | P1 | Giữ; bộ lọc/trạng thái |
| Notices | `/admin/`, admin | Soạn, gợi ý nhu cầu, chi tiết phản hồi; `/api/notices`, `/api/notices/suggest`, `/api/notices/{id}` | Giữ chọn CN, form và phản hồi | P1 | Giữ; soạn/chi tiết |
| Security | `/admin/`, admin | An ninh, kết nối, luồng tin, audit; `/api/security/*`, `/api/network/*`, `/api/audit*` | Tab/bảng/pagination hiện có; không đổi quyền | P1 | Giữ; tab/dữ liệu đọc |
| Stock / POS | `/branch/`, chi nhánh | Tìm/lọc/sort, ảnh, chọn SL, thêm giỏ, refresh; snapshot và POST `/api/inventory/refresh` | Chỉ bảng; nhiều thông tin trên hàng nhỏ | P0 | Giữ; thêm chế độ thẻ, giữ bảng/sort |
| Checkout | `/branch/`, chi nhánh | Sửa/xóa giỏ, customer tùy chọn, QR mẫu, confirm; POST `/api/checkout`, `/api/checkout/{id}/confirm`, GET `/api/invoices/{id}` | Có chống lặp, phục hồi, offline/busy/error; giữ nguyên | P0 | Giữ; toàn luồng tiền/SL/timeout |
| InvoiceHistory / InvoiceView | `/branch/`, chi nhánh | Xem lại/in/PDF; GET `/api/invoices`, `/api/invoices/{id}` | Layout giấy và CSS in riêng; cần tránh CSS global làm đổi bản in | P0 | Giữ; chi tiết/back/PDF |
| Thresholds | `/branch/`, chi nhánh | Tìm/lọc/sort/lưu; POST `/api/threshold` | Validation số nguyên, busy/online/empty có | P0 | Giữ; giá trị nhập/payload |
| Offers / TransferList | `/branch/`, chi nhánh | Đồng ý/từ chối/nhận thực tế, điều chuyển; `/api/requests/*`, `/api/transfers/*` | Điều kiện theo trạng thái, online, stock giữ nguyên | P0 | Giữ; phản hồi/validation |
| Debt / News / History / Activity / SecurityTab | `/branch/`, chi nhánh | Công nợ, hộp thư/phản hồi, nhập hàng, nhật ký, an ninh; snapshot, `/api/notices/*`, `/api/history` | Empty/nhãn có; dùng chung bảng/filter/card | P1 | Giữ; menu/back/đọc |

## Kết luận thiết kế

Nền tối hiện tự theo hệ điều hành nên trái yêu cầu nền sáng mặc định. Thay bằng light cố định; không thêm cài đặt theme. Dùng sidebar desktop thu gọn, drawer tablet/mobile, header trắng, tiêu đề và mô tả từng module. Giữ vị trí Giỏ hàng cạnh Tải lại ở POS, không lặp trong menu. POS có thẻ ảnh và bảng tùy chọn; các màn quản trị giữ bảng. Không tạo landing, quảng cáo, khuyến mãi, rating, doanh thu giả hoặc module khách hàng/nhân sự chưa tồn tại.

Baseline và screenshot dùng dữ liệu fixture trong công cụ kiểm tra, nằm ở `tools/ui-redesign/`; fixture không được đưa vào bundle production. Kết quả kiểm tra cuối ghi tại `docs/regression-checklist.md`. Không tự commit/đổi branch; mọi thay đổi UI được giữ trong workspace để review.
