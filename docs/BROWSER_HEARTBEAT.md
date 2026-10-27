# Browser Heartbeat Monitoring — phiên đăng nhập chi nhánh

## Mục đích

Bản trước chỉ theo dõi TCP gateway `client` → `server`. Bản này theo dõi thêm **trình duyệt đăng nhập thực tế**. Khi máy đang mở `/branch/` mất Wi-Fi nhưng gateway vẫn hoạt động, `server` vẫn phát hiện mất heartbeat.

## Luồng

1. Sau khi đăng nhập, trang `/branch/` gửi `POST /api/browser/heartbeat` về gateway mỗi **10 giây**, gửi thêm khi trình duyệt có lại Internet hoặc được đưa ra tiền cảnh.
2. Gateway xác thực bằng **cookie HttpOnly** đang có; ID phiên giám sát là UUID ngẫu nhiên do gateway tạo, **không** lấy mã chi nhánh hoặc ID từ request của browser. Gateway giới hạn chuyển tiếp TCP tối đa 1 heartbeat/5 giây/phiên.
3. Client relay lệnh `BROWSER_PRESENCE|browser-id|ip` qua kết nối TCP đã đăng nhập. Server xác định mã CN từ phiên TCP, không tin giá trị do browser cung cấp. Heartbeat **không** ghi `nhat_ky`/`audit_log`, tránh tạo hàng nghìn bản ghi.
4. Server phát hiện mất liên lạc nếu quá **35 giây** không thấy heartbeat (worker kiểm tra mỗi 5 giây): log `BROWSER_OFFLINE | HEARTBEAT_TIMEOUT`. Khi có heartbeat mới, log `BROWSER_RECONNECTED | HEARTBEAT_RESTORED`, kèm khoảng thời gian từ lúc *server xác nhận offline*.
5. Nếu gateway TCP đứt, các phiên browser mà TCP đó đại diện được ghi `BROWSER_OFFLINE | GATEWAY_DISCONNECTED` (không kết luận lỗi mạng tại browser). Đăng xuất chủ động ghi `BROWSER_OFFLINE | USER_LOGOUT` nhưng **không** tính sự cố.
6. Lưu chuyển trạng thái (không lưu từng heartbeat) trong `network_events`, thêm `browser_id` (UUID ngẫu nhiên, không phải cookie); server tự nâng cấp schema khi khởi động, giữ nguyên dữ liệu cũ.
7. Admin **Giám sát → Kết nối chi nhánh** hiển thị tình trạng trình duyệt, sự cố trong 24h và lịch sử; API mới `/api/network/browsers` chỉ cho Admin đã xác thực.

## Chạy PowerShell (một tab)

```powershell
cd D:\System-Validation-Framework
.\scripts\docker-deploy.bat
# Sau khi build xong, chạy lệnh sau trong cùng tab:
.\scripts\watch-network.ps1
```

## Test mất mạng CN03

1. Mở Client URL trên **máy dùng để thử**, đăng nhập CN03, giữ tab mở. Kiểm tra server xuất hiện `CN03 | BROWSER_CONNECTED`.
2. Trên chính máy mở Chrome CN03, tắt Wi-Fi. **Không** tắt Docker hoặc ngắt mạng máy chủ. Sau khoảng 35–40 giây kể từ heartbeat cuối (có thể hơn do độ trễ), PowerShell server phải hiện `CN03 | BROWSER_OFFLINE | HEARTBEAT_TIMEOUT`.
3. Bật lại Wi-Fi; Chrome vẫn đang mở, phải xuất hiện `CN03 | BROWSER_RECONNECTED | HEARTBEAT_RESTORED` khi gửi được heartbeat tiếp theo.
4. Trong Admin, kiểm tra mục **Giám sát → Kết nối chi nhánh** và số sự cố browser 24 giờ.
5. Bấm đăng xuất bình thường: `BROWSER_OFFLINE | USER_LOGOUT`; không tăng thống kê sự cố browser.

## Giới hạn

- Đây là đo **mất liên lạc đến trình duyệt**, không thể tự kết luận nguyên nhân là mất Internet (cũng có thể trình duyệt bị đóng, laptop ngủ, mất điện, proxy hoặc mạng chập chờn). Tab chạy nền có thể bị trình duyệt giới hạn timer; có thể sinh cảnh báo khi bị ngủ/tạm dừng lâu.
- IP được gateway thấy có thể là IP reverse proxy/Tailscale; không bảo đảm là IP thật của thiết bị cuối.
- Nếu toàn bộ server offline, nó không thể tạo log tại thời điểm sự cố; trạng thái chỉ hiện sau khi server chạy trở lại. Các phiên cũ trong bộ nhớ sẽ được làm mới.
- Nếu trình duyệt dùng nhiều tab cùng một phiên cookie, chúng được tính là **một phiên browser**; chỉ khi tất cả tab dừng heartbeat mới báo offline.
- `network_events` giữ lịch sử thay đổi trạng thái; trạng thái browser hiện tại giữ trong bộ nhớ, được làm mới khi server khởi động lại.
- Không cần xóa PostgreSQL volume, không cần sửa `.env`, không ảnh hưởng các chức năng anti-scraping / email hiện có.

Nếu PowerShell chặn script do ExecutionPolicy, có thể dùng trực tiếp `docker compose logs -f -t server client | Select-String 'BROWSER_|\[NETWORK\]'` tại thư mục project.
