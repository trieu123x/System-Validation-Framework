# Bỏ poster client và thời gian khóa tự động 60 giây — 11/11/2026

Đã sửa và triển khai lên admin/client public, tiếp tục áp dụng AGENTS.md. Người dùng xác nhận 60 giây áp dụng cho tất cả khóa tự động: phiên, sai mật khẩu và truy cập quá mức.

## Thay đổi

- Gỡ hai poster khỏi khung giao diện dùng chung; admin trước đó đã ẩn poster, client hiện dùng toàn bộ chiều ngang. Poster không còn trong DOM và không còn request tải ảnh poster.
- Phiên admin bỏ dở được giải phóng sau 60 giây không có hoạt động. Phiên đang dùng tiếp tục được gia hạn qua heartbeat; không cưỡng chế ngắt người đang hoạt động.
- Khóa tự động do sai mật khẩu admin/chi nhánh, chặn IP ngắn/dài và chặn scraping đều đặt mặc định/cấu hình hoạt động về 60 giây.
- Thông báo admin có phiên khác hiển thị số giây theo cấu hình, bỏ chữ 5 phút cố định.
- Khi hết chặn scraping, xóa bằng chứng và bản ghi block cũ để các request bị từ chối trong thời gian khóa không làm bị khóa lại ngay. Một đợt vi phạm mới vẫn có thể bị chặn.
- Block scraping cũ được nạp lại sau restart sẽ giới hạn thời gian còn lại theo chính sách mới; thời hạn rút ngắn được ghi lại để tránh phục hồi block dài ở lần restart sau.
- Giữ nguyên thời gian khóa thủ công do quản trị viên chọn, các ngưỡng phát hiện và logic đơn hàng/tồn kho.

## Kiểm tra

- Production build Next.js, lint/type checking và static export: thành công.
- Biên dịch source Java với `--release 17`. Chạy 46 kiểm thử JUnit liên quan đến phiên admin, khóa sai mật khẩu, IP ban và scraping: 46 thành công; có 237 kiểm tra acceptance anti-scraping.
- Chạy lại đúng 46 kiểm thử bằng Java 17 và JAR trong image phát hành, trong container tạm không có mạng: tất cả thành công.
- Đồng hồ giả xác nhận ngay trước mốc 60 giây còn chặn, đúng mốc 60 giây được giải phóng; thử đăng nhập bị từ chối không gia hạn phiên cũ, request lúc đang bị chặn không kéo dài block, và hoạt động hợp lệ sau hết hạn không bị khóa lại từ bằng chứng cũ.
- Unit test xác nhận block đã lưu với thời hạn cũ dài hơn được rút ngắn và phát sinh cập nhật lưu trữ.
- Không cố tình nhập sai mật khẩu, flood hay tạo block trên public.
- UI local qua agent-browser ở 1920/1440/768/390px: không poster, không tải ảnh poster, nội dung phủ hết chiều ngang và không tràn trang/thẻ.
- UI public qua agent-browser ở 1920/1440/390px: kết quả tương tự, không ảnh hỏng hoặc JavaScript/console error.
- HTML admin/client public trả 200 và khớp mã băm image phát hành; endpoint phiên admin trả 200.
- Không tạo đơn, thanh toán, lưu ngưỡng hay thay đổi tồn kho. Network public đã loại headers/body: [public-network.json](public-network.json).

## Triển khai

- Image mới: `phanphoi:block60-20261111-202643`.
- Image trước để khôi phục: `phanphoi:before-block60-20261111-202643`.
- Đóng gói từ image đang chạy; chỉ cập nhật UI, các nhóm class AdminAuth/AdminApi/SecurityRules/ScrapingStore và ScrapingPolicy/ScrapingGuard cùng cấu hình thời gian liên quan.
- Đối chiếu từng entry JAR: 2015 entry server và 339 entry client; không có thay đổi ngoài các nhóm class được phép. Xem [jar-verification.json](jar-verification.json).
- Cập nhật đúng server/client bằng `docker compose up -d --no-deps --no-build --wait --wait-timeout 90 server client`. Hai dịch vụ lên lại thành công; server health check đạt.
- Không chạy migration, không sửa Docker Compose/Tailscale; PostgreSQL giữ nguyên thời điểm khởi động.
- Runtime đã xác nhận cấu hình server/client mới. `security.short.ban.minutes` không có dòng override trong image cũ nên dùng giá trị mặc định mới là 1 phút, đã được kiểm thử trong chính JAR phát hành.

## Bằng chứng

- [Kết quả chi tiết](checks.json).
- [Client desktop public](screenshots/public-client-desktop.png).
- [Client màn rộng public](screenshots/public-client-wide.png).
- [Client mobile public](screenshots/public-client-mobile.png).
- [Client tablet local](screenshots/client-no-posters-tablet.png).

Đã đăng xuất CN01, xóa hồ sơ mật khẩu tạm, đóng phiên trình duyệt riêng và tắt server fixture local sau kiểm thử.

Có thể tải lại trang bằng Ctrl+F5 để bỏ tài nguyên cũ trong tab đang mở. Các hành vi khóa được kiểm thử bằng đồng hồ giả và image cô lập; không tạo sự cố khóa thật trên public.

## Khôi phục khi cần

Chưa chạy các lệnh này:

```powershell
docker image tag phanphoi:before-block60-20261111-202643 phanphoi:latest
docker compose up -d --no-deps --no-build --wait --wait-timeout 90 server client
```
