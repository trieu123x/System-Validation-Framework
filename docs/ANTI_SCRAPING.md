# Anti-scraping V1 — triển khai và vận hành

Ngày: 26/10/2026. Áp dụng cho source đi kèm, Java 17 trở lên, PostgreSQL, React/Next.js.

## 1. Đã triển khai

- Detector dùng chung trong `common/security`: cửa sổ trượt chính xác khi có nhiều luồng, quota tài khoản, tổng hợp HTTP/TCP trong cùng tiến trình, điểm rủi ro, giới hạn bộ nhớ và TTL.
- TCP `INVENTORY_GET` và `HISTORY_GET`: danh tính lấy từ phiên đã xác thực. Giữ giới hạn cũ `security.scrape.max.per.minute=30` theo `security.mode`; luật mới có mode riêng.
- HTTP Admin: bảo vệ các GET dữ liệu sau xác thực; trả `429` và `Retry-After` khi giới hạn. API giám sát dùng quota riêng 600 GET/phút để quản trị viên vẫn xử lý được sự cố. Các POST quản lý khóa vẫn yêu cầu cookie Admin và kiểm tra Origin/Host.
- HTTP chi nhánh: bảo vệ đọc cache `/api/state`, `/api/debt`, mở `/api/events`, `/api/history`, `/api/inventory/refresh`. Có phiên trình duyệt riêng, cookie HttpOnly/SameSite=Strict, hạn 12 giờ, tối đa 100 phiên/gateway. Cookie riêng theo port và gắn với mã chi nhánh; biết URL không còn đủ để xem dữ liệu.
- SSE: tối đa 64 kết nối/hub; kiểm tra phiên trước khi gửi, ngắt stream khi đăng xuất. `/api/state` chưa xác thực chỉ trả thông tin đăng nhập tối thiểu. Request JSON giới hạn 64 KiB.
- Sự kiện `SCRAPING`: UUID đối chiếu email, kênh, tài nguyên, số request/cửa sổ, risk, hành động và thời gian thử lại; ghi vào bảng event hiện hữu và phát SSE sau commit. SMTP/SSE không chạy trên luồng đánh giá scraping.
- Tạm khóa quyền **đọc dữ liệu theo tài khoản** khi đủ điểm, không chặn toàn bộ IP NAT. Thao tác bán hàng, PING, đăng xuất không nằm trong khóa scraping.
- Lưu khóa server vào PostgreSQL bằng queue riêng và nạp lại khi khởi động. Admin bỏ chặn, nhập lý do và reset bằng chứng của detector mới; đánh dấu đúng/nhầm có audit.
- Email gửi Admin và đúng email chi nhánh được cấu hình. Không lấy người nhận từ request. Chống trùng theo loại/chi nhánh/mức độ/người nhận (15 phút); nâng mức có thể gửi ngay; tối đa 20 email scraping/giờ/người nhận, kể cả khi nhiều chi nhánh cùng báo.
- Retry SMTP bất đồng bộ với số lần và timeout hữu hạn; không retry lỗi xác thực/địa chỉ hay các phản hồi SMTP 5xx được nhận diện. Các trạng thái `QUEUED/SENT/FAILED/SUPPRESSED/REJECTED/INTERRUPTED` có audit.
- Dashboard: KPI scraping, trạng thái mail, cảnh báo lỗi persistence, bảng khóa và bỏ chặn; event có phân trang, risk, email status, đánh giá đúng/nhầm; xuất JSON của trang hiện tại đã che IP và bỏ chi tiết tự do.

## 2. Điều chỉnh so với kế hoạch ban đầu

Source này dùng **PostgreSQL**, không phải MySQL. Không chạy migration MySQL và không tạo database mới để nâng cấp.

Chi nhánh là một Java gateway giữ kết nối TCP và cache dữ liệu. HTTP chi nhánh được đếm tại client.jar; sự kiện gửi lên server qua `SECURITY_REPORT` thành `CLIENT_SCRAPING`, lấy mã chi nhánh từ phiên TCP. Đây là **telemetry do client báo**, không phải bằng chứng độc lập từ server: không dùng để khóa tài khoản ở server; nội dung tự do không được đưa vào email. Chỉ báo lên khi client đã giới hạn hoặc có risk cao. Mail ghi rõ nguồn chưa xác minh độc lập.

Detector dùng chung thuật toán, nhưng bộ đếm của từng gateway/server là riêng. Chưa có tổng hợp chính xác quota xuyên nhiều tiến trình hoặc nhiều gateway. Chính sách tạm khóa server là theo tài khoản, do đó các phiên cùng tài khoản bị hạn chế đọc; tài khoản khác dùng chung IP không bị ảnh hưởng. Chưa có khóa riêng từng browser/session, whitelist job theo vai trò, hay tự động kick session ở risk 90.

## 3. Nâng cấp Docker đang có dữ liệu (Windows)

Giải nén và chép đè source vào đúng thư mục project đang chạy để Docker sử dụng mount `db/` hiện tại; giữ `.env` và cấu hình riêng của bạn. **Không chạy `setup-db.bat`, không chạy lại schema/seed trên database cũ, không dùng `docker compose down -v`.**

1. Sao lưu database trước khi sửa schema (chạy CMD ở thư mục project):

```bat
docker compose exec -T db pg_dump -U postgres -d phan_phoi_hang > backup-before-anti-scraping.sql
```

2. Áp dụng migration cộng thêm, có thể chạy lại:

```bat
scripts\migrate-anti-scraping.bat
```

Tương đương:

```bat
docker compose exec -T db psql -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f /db/migrate_anti_scraping.sql
```

3. Build/chạy bản mới:

```bat
docker compose up -d --build
docker compose logs --tail=100 server
```

4. Đăng nhập lại Admin/chi nhánh. Mỗi trình duyệt chi nhánh phải đăng nhập; mở tab mới cùng trình duyệt dùng lại cookie. Tên cookie có port nên CN01/CN02 cùng hostname không ghi đè nhau.

Database mới: `db/schema.sql` đã chứa các cột/bảng bổ sung, Docker init không cần chạy migration riêng. Database cũ thiếu migration: server dừng sớm và thông báo tên migration cần chạy.

Các script Tailscale/Funnel tùy chỉnh không có trong ZIP đầu vào, vì vậy không bị thay đổi. Giữ chúng nếu đang dùng trên máy.

## 4. Chạy không dùng Docker

```bat
psql -h 127.0.0.1 -U postgres -d phan_phoi_hang -v ON_ERROR_STOP=1 -f db/migrate_anti_scraping.sql
mvn clean package
cd ui
npm ci
npm run build
cd ..
scripts\run-server.bat
```

Mở client bằng script hiện hữu. Dùng `config/server.local.properties`, `config/client.local.properties` để ghi đè cấu hình local. Docker entrypoint tự tạo `server.local.properties`, nên khi chạy Docker hãy dùng biến môi trường/CLI hoặc cấu hình chính đã build vào image.

## 5. Mode, quota và phản ứng

| Khóa | Mặc định | Ý nghĩa |
|---|---:|---|
| `security.mode` | `block` (giữ cũ) | Luật cũ: brute force, flood, quota TCP 30/phút… |
| `scraping.mode` | `detect` | `off`, `detect`, `block` cho detector mới |
| `scraping.enabled` | true | Bật detector mới; không tắt luật TCP cũ |
| `scraping.http.enabled` / `scraping.tcp.enabled` | true | Bật theo kênh của detector mới |
| `scraping.window.seconds` | 60 | Cửa sổ 10–600 giây |
| `scraping.tcp.max.per.window` | 60 | Quota tổng TCP/tài khoản của detector mới |
| `scraping.http.max.per.window` | 120 | Quota HTTP/tài khoản/gateway |
| `scraping.risk.warning` | 40 | Mốc MEDIUM; phải nhỏ hơn block |
| `scraping.risk.block` | 70 | Điểm để tạm khóa khi mode=block |
| `scraping.block.duration.seconds` | 900 | Thời gian khóa, không gia hạn theo mỗi request bị từ chối |
| `security.scrape.history.max.days` | 366 | Khoảng lịch sử tối đa theo luật scraping |
| `scraping.max.subjects` | 10000 | Giới hạn danh tính trong bộ nhớ; TTL ít nhất 10 phút |
| `scraping.email.enabled` | true | Cho phép mail scraping; vẫn cần MAIL_ENABLED |
| `scraping.email.cooldown.seconds` | 900 | Dedupe 15 phút |
| `scraping.email.max.per.recipient.hour` | 20 | Giới hạn mail scraping/người nhận |
| `http.allow.server.override` (client) | false | Không cho browser chưa xác thực đổi địa chỉ TCP backend |

Khi chạy Docker, thêm vào `.env` để bật enforcement mới ở cả server/CN01/CN02:

```dotenv
SCRAPING_MODE=block
```

Rồi `docker compose up -d --force-recreate`. Để quan sát: `SCRAPING_MODE=detect`.

**Detect không có nghĩa toàn bộ hệ thống không chặn:** luật TCP cũ vẫn theo `security.mode`. Muốn thử toàn bộ ở chế độ quan sát, đặt cả hai mode về detect. Các kiểm tra quyền, Origin, kích thước body, số phiên/SSE và quota API giám sát luôn được giữ.

Điểm risk V1: vượt quota +25; >2 lần quota của kênh +25; lịch sử quá rộng +45; từ 3 IP cùng account và vượt quota +15; tiếp tục gửi sau ít nhất 3 lần bị giới hạn còn hiệu lực trong cửa sổ +30. Tổng tối đa 100; mỗi tín hiệu chỉ cộng một lần trên mỗi lần đánh giá. Không giả định request đều là bot.

Ở block, vượt quota trả THROTTLE trước khi đủ risk tạm khóa. HTTP dùng 429 + Retry-After; TCP giữ lỗi E06 và thông điệp thử lại. Không sleep trên request. Để trống một đầu khoảng lịch sử được xem là không giới hạn theo logic cũ.

Bộ đếm mới theo tổng account và kênh. Có thể đặt quota riêng bằng `scraping.resource.quotas=HISTORY_GET=10,/api/products=60,/api/state=90` (tối đa 16 khóa, giá trị tính theo cửa sổ cấu hình). Chỉ khóa trùng đúng command/đường dẫn đã chuẩn hóa mới áp dụng; ID số trong URL Admin được chuẩn hóa thành `{id}`. Quota của tài nguyên không bỏ qua quota account. Lịch sử TCP đã có `LIMIT 200` trong source; truy vấn yêu cầu có `LIMIT 500`. Chưa thêm pagination cho tất cả endpoint nghiệp vụ.

## 6. Email — thử Mailpit trước

```bat
docker compose -f docker-compose.yml -f docker-compose.mailpit.yml up -d --build
```

Mở `http://localhost:8025`. File override dùng người nhận test và Mailpit, không gửi tới hộp thư Internet. `SCRAPING_MODE=block` giúp kiểm tra HTTP 429 trong staging.

Email thật cấu hình trong `.env`, không đưa mật khẩu thật vào source:

```dotenv
MAIL_ENABLED=true
MAIL_SMTP_HOST=smtp.example.com
MAIL_SMTP_PORT=587
MAIL_SMTP_SECURITY=starttls
MAIL_SMTP_USERNAME=your-account
MAIL_SMTP_PASSWORD=your-app-password
MAIL_FROM=alerts@example.com
MAIL_ADMIN_RECIPIENTS=admin@example.com
MAIL_BRANCH_RECIPIENTS=CN01=cn01@example.com;CN02=cn02@example.com
```

Gửi khi scraping server có HIGH, đã giới hạn/tạm khóa, hoặc nhận CLIENT_SCRAPING được chuẩn hóa từ phiên chi nhánh. Sự kiện quan sát mức thấp trên server không gửi mail ngay. Không cấu hình email CN02 thì không tự suy đoán người nhận. `SENT` là SMTP chấp nhận thư, không bảo đảm người nhận đã đọc/không vào spam.

Hệ thống chỉ tạo mã gửi mail; quá trình sửa project chưa gửi email thật cho ai.

## 7. Lưu dữ liệu và giới hạn bảo đảm

- Security event dùng queue hiện hữu. Ghi DB thất bại/queue đầy có đếm số rơi; không làm lỗi giao dịch nghiệp vụ. SSE riêng bị chậm có thể bỏ cập nhật realtime, dashboard tự tải snapshot lại mỗi 3 giây.
- Block/audit dùng queue giới hạn 2.000 tác vụ. Khóa **đã ghi thành công** còn hiệu lực sau restart; có khoảng trễ giữa khóa RAM và commit DB. Nếu DB lỗi hoặc tiến trình bị kill ngay trước commit, khóa/audit có thể mất. Dashboard hiển thị số lỗi persistence. Chưa có bảo đảm exactly-once.
- Mail vẫn dùng queue RAM có giới hạn, chưa phải transactional DB outbox. Restart không tự gửi lại thư đang chờ; audit QUEUED cũ đổi thành INTERRUPTED để không gây hiểu nhầm. Dedupe và giới hạn giờ cũng reset khi restart. SMTP timeout sau DATA có thể gây gửi trùng khi retry; không cam kết exactly-once.
- Khóa HTTP riêng ở gateway chi nhánh hiện chỉ ở RAM, không xuất hiện trong danh sách khóa server và mất khi restart client.jar. Chờ hết hạn hoặc restart riêng gateway khi cần gỡ khóa local; chưa có lệnh Admin gỡ khóa gateway từ xa.
- Bộ đếm đầy: không gộp các tài khoản lạ vào cùng một bucket. Detector mới bỏ theo dõi danh tính mới và tăng capacityMisses; khóa server đã có vẫn được thực thi. Cần giám sát chỉ số này và chỉnh quota/capacity theo tải hợp lệ.
- IP lấy từ socket peer, không tin X-Forwarded-For. Khi có reverse proxy, IP trong log có thể là proxy; danh tính tài khoản vẫn là cơ sở quota.
- File retention tại `scripts/security-retention.sql` xóa log bảo mật quá 30 ngày và khóa hết hạn khi quản trị chủ động chạy. Không tự xóa dữ liệu trên startup.

## 8. Kiểm thử

Chạy đủ dependencies trên máy phát triển:

```bat
scripts\check-anti-scraping.bat
```

Chạy smoke test với Docker staging đang hoạt động:

```bat
python scripts\smoke-anti-scraping.py
python scripts\smoke-anti-scraping.py --exercise-rate-limit
```

Lệnh thứ hai hỏi mật khẩu bằng getpass, không in cookie/token. Chỉ chấp nhận localhost, cần block và nên dùng Mailpit. Kiểm tra 429/Retry-After và khả năng vào API xử lý khóa.

Trong môi trường thực hiện thay đổi đã chạy:

- **237 assertions** của detector bằng Java 17 thật: quota, detect/off/block, NAT, TTL, reconnect/account aggregation, tổng hợp HTTP/TCP trong cùng detector, restore/revoke, giới hạn RAM, nhiều luồng và cấu hình lỗi.
- **32 phương thức test hồi quy an ninh cũ** qua assertion runner offline, dùng stub duy nhất cho hằng định dạng thời gian DB; không chạy JDBC.
- **6 phương thức test browser/SSE/body** qua runner offline với test doubles cho thư viện ngoài; kiểm tra cookie giả, account/port binding, hết hạn, logout, cap và quyền mở SSE. Không phải kiểm thử trình duyệt end-to-end.
- Java toàn source qua kiểm tra biên dịch với API stubs cho các dependency ngoài để bắt lỗi cú pháp/tham chiếu nội bộ; **không thay thế Maven build với thư viện thật**.
- **18 tệp TypeScript/TSX** qua parser; không thay thế `tsc` hoặc Next production build.

**Chưa chạy được:** Maven/JUnit với dependencies thật, npm typecheck/build, PostgreSQL/Mailpit thật, restart qua Docker và load benchmark. Môi trường chặn tải dependencies (HTTP 403), không có PostgreSQL/Docker. Có sẵn test mới `ScrapingEmailTest` kiểm tra đúng người nhận, dedupe, nâng mức, giới hạn giờ và không đưa detail không tin cậy vào email; cần chạy cùng Maven suite hiện hữu.

Trước khi bật production cần kiểm tra staging: CN01 bị hạn chế không ảnh hưởng CN02; restart server sau khi queue audit trống vẫn thấy khóa; bỏ chặn có lý do; tắt Mailpit không làm lỗi SALE/PING; reconnect SSE và tải snapshot; đọc email trong Mailpit; chạy tải nghiệp vụ hợp lệ để hiệu chỉnh quota.

## 9. Phần nâng cao chưa triển khai

Đây là bản V1 mở rộng, không tuyên bố hoàn tất mọi hạng mục P2 trong roadmap:

- Transactional outbox bền vững, email digest theo chiến dịch.
- Redis/shared limiter, quota xuyên các server/gateway.
- Phân tích ID tuần tự, byte/row xuất, nhịp truy cập và chiến dịch phân tán.
- Whitelist job có thời hạn/audit, cô lập từng session ở risk cao.
- Đồ thị xu hướng 5 phút/1 giờ/24 giờ, top tài nguyên và đo tỉ lệ cảnh báo đúng/sai. Hiện KPI là số từ lúc tiến trình chạy, bảng event đọc từ DB.

## 10. Rollback

- Chuyển `SCRAPING_MODE=detect` và recreate container để ngừng enforcement mới. Luật cũ vẫn theo `security.mode`.
- Nếu trở về binary/source cũ: các cột/bảng thêm là additive, có thể giữ nguyên. Không DROP bảng nghiệp vụ; không cần phục hồi toàn database chỉ để tắt tính năng mới.
- Bỏ chặn reset detector mới; quota legacy theo phiên TCP có thể còn hiệu lực tới khi hết cửa sổ 60 giây.
