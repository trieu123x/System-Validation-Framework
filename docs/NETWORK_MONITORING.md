# Theo dõi kết nối chi nhánh (TCP / heartbeat)

## Mới trong bản cập nhật

- Máy chủ ghi `[NETWORK] CN03 | CONNECTED / TIMEOUT / DISCONNECTED / RECONNECTED`, IP, phiên, nguyên nhân, thời gian gián đoạn (khi có).
- `TIMEOUT` được phát ra khi heartbeat đã vượt `heartbeat.pong.timeout.seconds` mà không có phản hồi. Ngay sau đó là `DISCONNECTED | PONG_TIMEOUT` (chỉ **một** sự cố khi thống kê).
- Các lỗi đóng kết nối tự nhiên (TCP EOF), I/O, client đọc quá chậm và lỗi ghi đều được phân biệt với `CLIENT_LOGOUT`, `ADMIN_KICK`, `IP_BANNED`, `SECURITY_KICK`, `SERVER_SHUTDOWN`.
- Client gateway ghi thêm `RECONNECTING`, `RETRY_FAILED` trong **container client**. Không lưu các lần thử kết nối thất bại ở DB server khi server chưa thể liên lạc với client.
- Server lưu sự kiện trong bảng PostgreSQL `network_events` (tạo tự động khi khởi động, không xóa dữ liệu cũ).
- Admin: **Giám sát → Kết nối chi nhánh**. Bảng trạng thái cập nhật mỗi 5 giây, số sự cố/timeouts/kết nối lại trong 24 giờ, và lịch sử 150 sự kiện mới nhất, có lọc theo chi nhánh.
- Hai API cần phiên Admin: `GET /api/network/branches` và `GET /api/network/events?maCn=CN03&limit=100`. Hai API được miễn phân loại anti-scraping của API nghiệp vụ; vẫn bị giới hạn quota đọc giám sát.

## Triển khai (Windows PowerShell)

Giữ nguyên `.env` hiện tại. Tại thư mục gốc project:

```powershell
.\scripts\docker-deploy.bat
```

Không dùng `docker compose down -v` vì lệnh đó xóa dữ liệu PostgreSQL.

Xem log **server**:

```powershell
docker compose logs -f -t server | Select-String '\[NETWORK\]'
```

Xem cả kết nối và các lần **client** đang thử nối lại:

```powershell
docker compose logs -f -t server client | Select-String '\[NETWORK\]'
```

Xem trực tiếp trong DB:

```powershell
docker compose exec db psql -U postgres -d phan_phoi_hang -c 'SELECT thoi_gian,ma_cn,su_kien,ly_do,gian_doan_ms FROM network_events WHERE ma_cn = ''CN03'' ORDER BY id DESC LIMIT 30;'
```

## Kiểm tra

1. Đăng nhập CN03 trên URL client, kiểm tra `CONNECTED` trên Docker và trong Admin.
2. Thử **Đăng xuất**: phải ghi `DISCONNECTED | CLIENT_LOGOUT`, **không** tăng số sự cố 24 giờ.
3. Kiểm tra lỗi TCP đột ngột **chỉ trong môi trường thử nghiệm** bằng cách tắt cưỡng bức container `client` (`docker compose kill client`). Thao tác này sẽ cắt tất cả chi nhánh dùng gateway chung. Khi client được khởi động lại và CN03 đăng nhập, kiểm tra `DISCONNECTED | REMOTE_CLOSED` (hoặc `IO_ERROR`), `RECONNECTED` và thời gian gián đoạn. Đừng làm trên môi trường sản xuất khi chi nhánh đang làm việc.
4. Mất PONG (nếu mô phỏng được): sau khoảng thời gian idle + timeout, server ghi `TIMEOUT` và `DISCONNECTED | PONG_TIMEOUT`.

## Giới hạn

- Đây là **giám sát TCP giữa client gateway và server**. Trong cấu hình một URL client dùng chung, browser ở chi nhánh có thể mất Internet nhưng agent phía gateway vẫn giữ kết nối TCP. Khi đó bảng có thể vẫn hiển thị ONLINE. Để phát hiện **mất kết nối browser cuối** tức thời, cần thêm heartbeat trực tiếp từ browser và một kênh báo về server; tính năng này không nằm trong phiên bản hiện tại.
- `REMOTE_CLOSED` không tự chứng minh mất Internet: có thể do đóng tiến trình, Tailscale hoặc proxy.
- Thời gian gián đoạn (`gian_doan_ms`) chỉ được tính khi server ghi nhận mất kết nối và sau đó chi nhánh nối lại **trong cùng lần chạy server**. Không suy diễn thời gian gián đoạn nếu server đã restart.
- `AWAITING_PONG` chỉ là trạng thái kiểm tra idle, chưa phải sự cố.
- Writer bất đồng bộ có hàng đợi giới hạn; khi đầy hoặc DB lỗi có thể mất bản ghi và sẽ in cảnh báo trong logs. Dữ liệu cũ của bảng `nhat_ky`, `audit_log`, cũng như chống scraping và cấu hình email không bị thay đổi.
