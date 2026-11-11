# Kiểm tra UI — System-Validation-Framework

Ngày: 11/11/2026 (Asia/Saigon). Công cụ: skill agent-browser, CLI chạy qua `docker exec codex-browser agent-browser`, phiên trình duyệt riêng.

## Kết quả

Xác nhận 8 vấn đề: 1 high, 5 medium, 2 low. Đã sửa và kiểm thử lại 7 vấn đề UI trong source local. Dịch vụ cổng 10000 vẫn trả HTTP 502, ngoài phạm vi sửa UI. **Chưa triển khai bản sửa lên public**, vì vậy kết quả sau sửa dưới đây thuộc bản build local.

| ID | Mức độ | Vấn đề | Trạng thái |
| --- | --- | --- | --- |
| ISSUE-001 | High | Cổng 10000 trả HTTP 502 | Còn lỗi; không thay đổi hạ tầng |
| ISSUE-002 | Low | Favicon 404 trên admin/client | Sửa local, icon mới trả 200 |
| ISSUE-003 | Medium | Tương phản chữ phụ thấp | Sửa local, kiểm tra axe đạt trong phạm vi quét |
| ISSUE-004 | Medium | Dấu kết nối có aria-label thiếu role | Sửa local, kiểm tra lại đạt |
| ISSUE-005 | Medium | Vùng cuộn thiếu focus bàn phím | Sửa local, kiểm tra lại đạt |
| ISSUE-006 | Medium | Nút thêm giỏ bị cắt ở 320px | Sửa local, kiểm tra lại đạt |
| ISSUE-007 | Low | Tên hàng admin bị rút gọn thiếu title | Sửa local, kiểm tra lại đạt |
| ISSUE-008 | Medium | Số tiền gây tràn trang công nợ ở tablet | Sửa local cả admin/client, kiểm tra lại đạt |

## Phạm vi và cách kiểm tra

- Admin live: https://desktop-flfkcet-1.tailab761f.ts.net — Tổng quan, Hàng hóa, Kho chi nhánh, Đặt ngưỡng, Lịch sử, Công nợ, Điều chuyển, Giám sát, Đối soát.
- Client live: https://desktop-flfkcet-1.tailab761f.ts.net:8443 — Sản phẩm, Đề xuất nhận hàng, Điều chuyển, Đặt ngưỡng, Lịch sử nhập, Công nợ, Hóa đơn, Nhật ký, Bảo mật, Giỏ hàng trống.
- Màn đăng nhập của cả hai bên cũng được kiểm tra.
- Dịch vụ chưa xác định: https://desktop-flfkcet-1.tailab761f.ts.net:10000 — chỉ xác nhận trang lỗi 502, không suy đoán vai trò dịch vụ.
- Desktop 1440×1000, tablet 768×1024, mobile 390×844; thêm màn hẹp 320×800 cho Tổng quan/danh mục và các màn bị ảnh hưởng.
- Log geometry lưu 62 trường hợp live. Ảnh Tổng quan live ở 4 kích thước còn được lưu riêng; không cộng các ảnh này vào số trường hợp geometry.
- Kiểm tra lại local: 5 màn (Tổng quan admin, Hàng hóa admin, Công nợ admin, Sản phẩm client, Công nợ client) × 4 kích thước, cộng 2 màn đăng nhập × 3 kích thước = 26 trường hợp.
- Local dùng bản production export tại `http://host.docker.internal:4319`, dữ liệu fixture: danh mục repository, chi nhánh và số tiền giả. API fixture không kết nối dữ liệu thật và chặn ghi nghiệp vụ.

Tương tác chỉ đọc đã thử: mở/đóng menu bằng Escape, chuyển trang điều hướng, tìm TB16, tìm chuỗi không có kết quả, xóa bộ lọc, sắp xếp, chuyển thẻ/bảng, phân trang yêu cầu, mở/đóng ngăn chi tiết YC507. Không bấm xử lý yêu cầu hay lưu biểu mẫu.

## Chi tiết lỗi và bước tái hiện

### ISSUE-001 — Cổng 10000 trả HTTP 502

- Mức độ: high đối với endpoint này; loại availability/network.
- Tái hiện: mở URL cổng 10000, tải lại. Chromium hiện “This page isn’t working” và “HTTP ERROR 502”; GET document trả 502.
- Kiểm tra lại cuối phiên vẫn lỗi: [ảnh lần đầu](screenshots/service-10000-error.png), [ảnh kiểm tra lại](screenshots/service-10000-retest.png).
- Chưa sửa: cần xác định dịch vụ và nguyên nhân phía hạ tầng; không thay đổi Docker/Tailscale theo ràng buộc người dùng.

### ISSUE-002 — Thiếu favicon

- Mức độ: low; loại UI/network.
- Tái hiện: mở gốc admin/client trong phiên mới. GET `/favicon.ico` trả 404 ở cả hai origin; CSS/JS/font chính tải được.
- Bằng chứng trước: [network đã lọc](logs/live-initial-network.json).
- Sửa: thêm `ui/app/icon.svg`; Next sinh liên kết icon cho trang.
- Kiểm tra lại: bản local yêu cầu `/icon.svg?...` và nhận HTTP 200. Không khẳng định endpoint cũ `/favicon.ico` đã được tạo.
- Bằng chứng sau: [diagnostics](logs/local-diagnostics.json).

### ISSUE-003 — Tương phản chữ phụ thấp

- Mức độ: medium; loại accessibility/readability.
- Tái hiện: mở màn đăng nhập, chạy axe WCAG 2A/2AA; tab chưa chọn 3,89:1, nhãn hỗ trợ 3,18:1, đoạn hỗ trợ 3,79:1, footer 2,88:1. Các chữ nhỏ này cần 4,5:1 theo kết quả axe.
- Trên các trang đã đăng nhập, nhiều nhãn phụ và trạng thái lặp lại cũng bị báo. Đây là một nhóm nguyên nhân màu sắc, không đếm từng node thành lỗi độc lập.
- Trước: [đăng nhập](screenshots/admin-login-desktop.png), [axe danh mục admin](logs/a11yAdminProductsLive.json), [axe client](logs/a11yClientLive.json).
- Sửa: tăng độ đậm chữ phụ trong `trade.css`, `industry.css`, `admin.css`, `login.css`, `admin/overview.css`; chỉnh chữ nhãn màu và nền nút đăng xuất để đủ tương phản.
- Sau: [đăng nhập admin](screenshots/after-admin-login-desktop.png), [đăng nhập client mobile](screenshots/after-client-login-mobile.png), [kết quả axe cuối](logs/a11y-final.json).
- Kết quả: 16 lượt quét sau sửa không còn vi phạm được axe xác định. Một số kiểm tra trên nền gradient/đối tượng chồng lớp vẫn thuộc `incomplete`; không coi đây là chứng nhận đáp ứng toàn bộ WCAG.

### ISSUE-004 — Dấu kết nối dùng aria-label thiếu role

- Mức độ: medium; loại accessibility.
- Tái hiện: đăng nhập, mở Tổng quan hoặc danh mục; axe báo `aria-prohibited-attr` ở `.dot[aria-label]`.
- Sửa: thêm `role="img"` cho component `Dot` trong `ui/components/ui.tsx`. Giữ nguyên điều kiện online/offline.
- Kiểm tra lại: quy tắc không còn báo trên các màn được quét; [log sau sửa](logs/a11y-final.json).

### ISSUE-005 — Vùng cuộn không nhận focus bàn phím

- Mức độ: medium; loại accessibility.
- Tái hiện: Tổng quan có danh sách 15 chi nhánh hoặc bảng có nội dung cuộn; axe báo `scrollable-region-focusable` ở `.overview-branch-list` và `.table-wrap`.
- Sửa: thêm `tabIndex={0}` cho các vùng bảng xác định được trong Overview, ProductCatalog, Products, Debts, Records, Sales; thêm tên cho danh sách kết nối chi nhánh.
- Kiểm tra lại: danh sách nhận focus, PageDown làm `scrollTop` tăng lên 297; `tabIndex=0`. Các lượt axe liên quan không còn báo lỗi.
- Bằng chứng: [kiểm tra bàn phím](logs/keyboard.json), [axe sau sửa](logs/a11y-final.json).

### ISSUE-006 — Nút thêm giỏ bị cắt ở thẻ client 320px

- Mức độ: medium; loại responsive/visual.
- Tái hiện: client → Sản phẩm → viewport 320×800, cuộn đến thẻ TB01. Không bấm thêm giỏ.
- Trước: thẻ có `scrollWidth 146 > clientWidth 138`; vùng ngoài không tràn vì thẻ ẩn overflow. [Ảnh lỗi](screenshots/issue-006-client-card-narrow.png).
- Sửa: cho chữ nút xuống dòng trong CSS mobile, giữ nguyên hành vi thêm giỏ.
- Sau: [ảnh thẻ 320px](screenshots/after-issue-006-client-card-narrow.png). Toàn bộ chữ nút hiển thị, không còn tràn nội bộ thẻ trong geometry được kiểm tra.

### ISSUE-007 — Tên hàng admin bị rút gọn thiếu title

- Mức độ: low; loại content/readability.
- Tái hiện: admin → Hàng hóa, viewport 320×800, xem TB01/TB28. Heading bị clamp hai dòng nhưng thiếu `title`; client đã có thuộc tính này.
- Trước: [danh mục hẹp](screenshots/admin-products-narrow.png).
- Sửa: thêm `title={p.ten}` vào heading trong `ProductCatalog.tsx`.
- Kiểm tra lại: heading TB01 vẫn clamp theo bố cục, thuộc tính title chứa đầy đủ “Máy hút bụi công nghiệp khô và ướt 16 lít”; các heading bị clamp trong geometry không còn thiếu title.
- Sau: [danh mục admin hẹp](screenshots/after-admin-products-narrow.png).
- Giới hạn: title hỗ trợ hover; chưa bổ sung cách xem tên đầy đủ riêng cho thiết bị cảm ứng.

### ISSUE-008 — Số tiền công nợ gây tràn trang tablet

- Mức độ: medium; loại responsive/readability.
- Tái hiện admin: Quản lý → Công nợ (`#view=debts`), viewport 768×1024. Trang rộng 800px trong viewport 768px.
- Tái hiện client: Công nợ (`#view=debt`), cùng viewport; trang rộng 771px.
- Nguyên nhân: lưới cho phép ô quá hẹp đối với số tiền lớn; giá trị KPI có nội dung rộng khoảng 210px trong vùng 126px.
- Trước: [admin tablet](screenshots/issue-008-admin-debts-tablet.png), [client tablet](screenshots/client-debt-tablet.png).
- Sửa: gắn lớp `financial-kpis` vào các dải thống kê công nợ admin/client; lưới tự chọn số cột theo độ rộng tối thiểu 260px, có phương án xuống dòng cho giá trị quá dài. Không sửa số tiền, cách tính hay dữ liệu.
- Sau: [admin tablet](screenshots/after-admin-debts-tablet.png), [client tablet](screenshots/after-client-debt-tablet.png).
- Kiểm tra lại: tablet 2 cột, mobile 1 cột; số tiền fixture hàng tỷ hiển thị đầy đủ. Cả hai trang đều có documentWidth bằng viewport ở 1440/768/390/320px, không còn overflow KPI.

Các lỗi trên đều có trạng thái tĩnh để chụp bằng chứng; không cần video tái hiện.

## Console, network và an toàn dữ liệu

- Không ghi nhận JavaScript exception hoặc console error của ứng dụng trong các lượt đã kiểm tra; [diagnostics local](logs/local-diagnostics.json).
- Ghi nhận favicon 404 và dịch vụ 502 như trên. Không thấy ảnh hỏng trên các màn đã đo.
- [258 request API live đã lọc](logs/live-network.json): chỉ lưu method, URL, status và loại tài nguyên; không lưu headers, cookie, body hay token.
- Ngoài GET, ứng dụng tự phát sinh heartbeat (78 POST) và inventory refresh (3 POST) trong phiên; có 2 POST đăng nhập được người dùng cho phép. Đối chiếu source cho thấy refresh cập nhật snapshot đọc, không phải thao tác đổi tồn kho.
- Không thực hiện checkout, tạo đơn, nhập/xuất kho, duyệt/từ chối yêu cầu, ghi phiếu thu/chi, đổi hạn mức, đổi mật khẩu hay lưu ngưỡng.
- Không mở luồng thông báo có thể đánh dấu đã đọc. Không thực hiện các hành động làm thay đổi dữ liệu nghiệp vụ thật.
- Screenshot live là bằng chứng nội bộ, để ở thư mục artifact chưa commit; không đăng tải công khai.
- Đã xóa hai hồ sơ đăng nhập tạm do đợt audit tạo, đóng hai phiên trình duyệt riêng và tắt server fixture cổng 4319. Không đóng phiên hay dịch vụ khác.
- Không sửa Docker, Tailscale, API, auth hay logic nghiệp vụ. Các thay đổi VAT/backend đã tồn tại trước đợt audit này không được tính là bản sửa audit.
- Ghi chú trong ảnh người dùng đính kèm chỉ dùng tham khảo; không tự triển khai yêu cầu thêm thống kê kinh doanh hay thay đổi bố cục theo chữ trong ảnh.

## Kiểm thử lại và giới hạn

- Next.js production build, lint/type checking và static export thành công.
- [26 trường hợp geometry sau sửa](logs/geometry-final.json): 5 màn chính × 4 kích thước và 2 màn đăng nhập × 3 kích thước. Không tràn ngoài trang, không tràn nội bộ thẻ/KPI trong các trường hợp này.
- [16 lượt axe sau sửa](logs/a11y-final.json): 5 màn chính × desktop/mobile, 2 màn đăng nhập × desktop/tablet/mobile; tổng số violations = 0.
- Các màn live khác được duyệt để kiểm tra responsive và tương tác an toàn; không khẳng định đã chạy axe hoặc kiểm thử lại local toàn bộ các màn đó.
- Kiểm tra lại menu local: mở Quản lý thấy danh sách mục con, Escape đóng menu.
- Bản local dùng dữ liệu fixture và không thay thế kiểm chứng tích hợp production sau triển khai. Không kiểm thử luồng ghi dữ liệu hay tính toán nghiệp vụ trong nhiệm vụ này.
- Chưa triển khai/restart production. Cần quy trình triển khai được cho phép, sau đó kiểm tra lại public để xác nhận 7 bản sửa đã đến người dùng.
- Cổng 10000 vẫn lỗi 502; chưa thể kiểm tra giao diện sau endpoint này.
- Thông tin tổng hợp máy đọc: [validation.json](logs/validation.json). Toàn bộ ảnh: [screenshots](screenshots/).
