# Chỉnh sửa menu, nhãn và thanh công cụ — 11/11/2026

Đã thực hiện 4 thay đổi theo ảnh người dùng và xác nhận bắt đầu:

- Gỡ Đặt ngưỡng khỏi menu và danh sách màn admin; liên kết cũ `#view=thresholds` về Tổng quan. Client vẫn truy cập Đặt ngưỡng bình thường.
- Đổi nhãn hiển thị của `DA_GIAO` thành “Đã xuất kho”. Giữ nguyên mã trạng thái và xử lý nghiệp vụ.
- Đổi nút chọn sản phẩm thành “+ Thêm hàng” trong cả thẻ và bảng client, dùng chung component hiện có.
- Giữ thanh công cụ ở đầu viewport khi cuộn trên admin/client. Đo chiều cao thực của thanh để đặt khoảng cuộn bàn phím, poster client, bộ lọc, thông báo và khối tổng tiền bên dưới.

## Đã kiểm tra

- Next.js production build, kiểm tra kiểu/lint và static export: thành công. `git diff --check`: thành công, chỉ có cảnh báo LF/CRLF của working tree.
- Dùng agent-browser qua `docker exec codex-browser agent-browser`, phiên riêng; bản export local phục vụ tại `http://host.docker.internal:4319`, không gọi API production.
- Client Sản phẩm tại 1440×1000, 768×1024, 390×844 và 320×800: cuộn sâu, header giữ top=0, nút giỏ nằm trong viewport và nhận click; không tràn ngang trang/thẻ, không còn nút mang nhãn cũ.
- Admin Tổng quan tại 1440×1000, 768×1024 và 390×844: header giữ top=0 khi cuộn, không tràn ngang trang; poster admin vẫn ẩn.
- Thêm một sản phẩm fixture vào giỏ local, cuộn 3704px ở 320px, bấm nút giỏ và mở đúng “Giỏ hàng & thanh toán”. Không bấm thanh toán.
- Thử giỏ dài 7 mặt hàng fixture: khối tổng tiền tại desktop có top=120px, nằm dưới header cao 100px; poster client vẫn hiển thị.
- Thử focus số lượng rồi Tab sang nút Thêm hàng ở mobile: cả hai nằm hoàn toàn dưới thanh công cụ, trong viewport.
- Menu admin xổ xuống còn Hàng hóa/Kho chi nhánh, chiều cao 80px sau hiệu ứng; Escape đóng menu. Không còn Đặt ngưỡng trong DOM admin.
- Mở trực tiếp màn Đặt ngưỡng client: có bảng và các trường ngưỡng; không chỉnh/lưu ngưỡng.
- Bảng Đơn hàng gần đây admin hiển thị “Đã xuất kho” cho yêu cầu `DA_GIAO` của fixture.
- Axe WCAG 2A/2AA riêng thanh công cụ admin desktop và mobile: 0 violations. Không chạy lại audit toàn hệ thống.
- Không ghi nhận JavaScript exception hay console error trong phiên kiểm thử.
- Đồng bộ nhãn và danh sách màn admin trong script smoke hiện có; `node --check` thành công. Không chạy lại toàn bộ suite smoke; kiểm chứng UI dùng agent-browser như trên.

## Bằng chứng

- [Kết quả chi tiết](checks.json), [network đã loại headers/body](network.json).
- [Client 320px khi cuộn](client-stock-narrow-scrolled.png).
- [Menu admin](admin-menu-without-thresholds.png).
- [Giỏ dài sau cuộn](client-cart-long-desktop-scrolled.png).

## Giới hạn

Các thay đổi mới chỉ ở source local, chưa triển khai lên public và chưa kiểm chứng tích hợp sau triển khai. Không tạo đơn, thanh toán, đổi tồn kho, lưu ngưỡng hay thay đổi dữ liệu nghiệp vụ thật. Dữ liệu giỏ dùng trong kiểm tra là fixture local. Không thay đổi Docker/Tailscale hay logic backend.

Đã đóng phiên trình duyệt riêng và tắt server fixture cổng 4319 sau kiểm thử.

## Cập nhật triển khai public

Ngày 11/11/2026, sau khi người dùng xác nhận triển khai, bản UI này đã được đưa lên cả admin và client public. Phần “chưa triển khai” phía trên mô tả trạng thái tại thời điểm kiểm thử local. Xem [báo cáo triển khai và giới hạn kiểm chứng admin](../public-release-20261111-194447/report.md).
