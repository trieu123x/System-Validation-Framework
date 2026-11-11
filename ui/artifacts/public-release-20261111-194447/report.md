# Triển khai UI public — 11/11/2026

Người dùng đã xác nhận: “Triển khai lên admin và client public”.

## Kết quả

Đã triển khai UI lên:
- Admin: https://desktop-flfkcet-1.tailab761f.ts.net/admin/
- Client: https://desktop-flfkcet-1.tailab761f.ts.net:8443/branch/

Cả hai container đã dùng image mới và chạy bình thường; server health check đạt. Hai origin trả HTML đúng mã băm của bản build đã kiểm thử. Toàn bộ 37 tệp trong manifest trên mỗi origin đều trả 200 và khớp mã băm bản phát hành.

Bản UI bao gồm việc gỡ Đặt ngưỡng admin, thẻ yêu cầu gọn, nhãn “Đã xuất kho”, nút “Thêm hàng”, thanh công cụ giữ ở đầu màn hình khi cuộn và các sửa UI đã kiểm thử trước đó.

## Cách triển khai

- Dùng production export đã kiểm thử trong `ui/out`; xác nhận không có source UI nào sửa sau bản build này.
- Giữ image trước triển khai: `phanphoi:before-ui-20261111-194447`.
- Tạo image `phanphoi:ui-20261111-194447` trên đúng image backend đang chạy; chỉ COPY tệp UI. Giữ các tài nguyên cũ có tên băm để các tab đang mở còn tải được.
- Đặt tag `phanphoi:latest` sang image mới và cập nhật đúng server/client bằng `docker compose up -d --no-deps --no-build --wait --wait-timeout 90 server client`.
- Không chạy `deploy.bat`, migration hay script cấu hình Tailscale.
- Hai JAR backend trước/sau có mã băm giống nhau. Cấu hình runtime image và mã cấu hình Compose của hai dịch vụ giữ nguyên. PostgreSQL không khởi động lại.

## Kiểm chứng public

- Admin HTML SHA-256: `4149894023F90DF25AACBE53BE525C6978990F11FB13AED1179C1B44FB6D924D`.
- Client HTML SHA-256: `0C56AA73701AB072A03D0055885C84F33A2801F88AF644130AD82F11E6DC54EC`.
- Kiểm tra tài nguyên: 37/37 trên mỗi origin khớp SHA-256; favicon mới trả 200.
- Client đăng nhập bằng tài khoản kiểm thử đã được cung cấp. Xem Sản phẩm ở 1440×1000, 768×1024, 390×844 và 320×800: không tràn ngang trang/thẻ; nút hiển thị “+ Thêm hàng”; header giữ top=0, nút giỏ trong viewport và không bị lớp khác che.
- Client desktop vẫn có hai poster; mobile ẩn poster theo bố cục sẵn có.
- Mở giỏ trống bằng nút giỏ sau khi cuộn: hiển thị “Giỏ hàng & thanh toán”. Không thêm hàng hay tạo đơn trên public.
- Client vẫn mở được Đặt ngưỡng; không thay đổi/lưu ngưỡng.
- Không ghi nhận JavaScript exception hay console error trên tab client đã kiểm chứng.
- Đã đăng xuất CN01 sau kiểm thử, xóa hai hồ sơ auth tạm và đóng phiên trình duyệt riêng.
- Network đã bỏ headers/body: [network.json](network.json). Có đăng nhập/đăng xuất, heartbeat và refresh tự động; không có API ghi nghiệp vụ.

## Giới hạn

Ban đầu admin chặn đăng nhập kiểm thử bằng HTTP 409 vì còn phiên trên thiết bị khác. Sau khi người dùng xác nhận đã đăng xuất và đợi đủ thời hạn phiên 300 giây, đã đăng nhập thành công và kiểm tra trực tiếp admin public. Không cưỡng chế ngắt phiên, không sửa cơ chế xác thực.

## Kiểm tra bổ sung admin sau đăng nhập

- Tổng quan ở 1440×1000, 768×1024, 390×844 và 320×800: không tràn ngang trang hay nội bộ thẻ. Thẻ cao 412px trên desktop/tablet, 368px ở 390px; tại 320px một số thẻ cao 382–397px do nội dung xuống dòng, không bị cắt.
- Menu Hàng hóa & kho xổ xuống còn Hàng hóa và Kho chi nhánh; không còn nút Đặt ngưỡng. Escape đóng menu.
- Liên kết admin cũ `#view=thresholds` chuyển về Tổng quan, không hiển thị màn đã gỡ.
- Trang Hàng hóa & kho tổng mở bình thường và không có mục Đặt ngưỡng.
- Bảng Đơn hàng gần đây có 3 trạng thái “Đã xuất kho”, không còn nhãn trạng thái cũ “Đã gửi” tại các dòng được kiểm tra.
- Header giữ top=0 khi cuộn 1200px; poster admin ẩn. Không ghi nhận ảnh hỏng, JavaScript exception hay console error trong phần đã kiểm tra.
- Đã đăng xuất phiên admin kiểm thử, giải phóng tài khoản; không thực hiện yêu cầu xuất kho hay bất kỳ thao tác ghi nghiệp vụ nào.
- [Kết quả kiểm tra admin](admin-retest-checks.json), [network admin đã lọc](admin-retest-network.json), [ảnh mobile](screenshots/admin-overview-mobile.png), [ảnh menu](screenshots/admin-menu-no-thresholds.png).
- Lượt này chỉ kiểm chứng public, không sửa source hay triển khai lại.

Không kiểm thử thanh toán, tạo đơn, nhập/xuất kho hay các luồng ghi dữ liệu thật. Không thay đổi backend, cơ sở dữ liệu, Docker Compose, môi trường hay Tailscale. Cổng 10000 không thuộc lần triển khai này.

Khi tab cũ vẫn hiện giao diện trước, tải lại bằng Ctrl+F5.

## Bằng chứng

- [Kết quả máy đọc](checks.json).
- [Client mobile khi cuộn](screenshots/client-stock-mobile.png).
- [Client 320px](screenshots/client-stock-narrow.png).
- [Giỏ trống mở từ thanh công cụ](screenshots/client-empty-cart-mobile.png).

## Khôi phục khi cần

Image trước triển khai được giữ với tag `phanphoi:before-ui-20261111-194447`. Các lệnh dưới đây chỉ dùng khi có yêu cầu khôi phục; **chưa chạy**:

```powershell
docker image tag phanphoi:before-ui-20261111-194447 phanphoi:latest
docker compose up -d --no-deps --no-build --wait --wait-timeout 90 server client
```
