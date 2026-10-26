> **Anti-scraping V1 (26/10/2026):** xem [hướng dẫn nâng cấp](docs/ANTI_SCRAPING.md). Database cũ cần chạy `db/migrate_anti_scraping.sql` trước khi dùng bản server mới. Luật mới mặc định `detect`; SMTP cần cấu hình riêng.

# Hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động

Bài tập lớn môn Lập trình mạng, Chủ đề 3 (ứng dụng mạng Client/Server).

**Email bổ sung:** server có thể gửi cảnh báo đăng nhập bất thường và email khi công ty tạo thông báo
cho chi nhánh. Mặc định tắt; xem [cấu hình SMTP, thử Mailpit và giải thích thiết kế](docs/EMAIL.md).

## 1. Mô tả

**Bài toán.** Một công ty có kho tổng và 10–20 chi nhánh. Chi nhánh bán hàng hằng ngày. Khi tồn kho xuống dưới ngưỡng, chi nhánh cần được cấp hàng nhanh và đúng số lượng. Nếu làm thủ công qua điện thoại hoặc email thì báo chậm, dễ trùng yêu cầu, và kho tổng có thể bị xuất vượt khi nhiều chi nhánh cùng xin một mặt hàng.

**Mục tiêu.**
- Chi nhánh tự báo thiếu hàng qua mạng.
- Công ty nhận cảnh báo theo thời gian thực rồi **gửi hàng ngay** hoặc **báo không đủ hàng** (hoặc gửi đề xuất để chi nhánh xác nhận); server trừ kho tổng trong một transaction.
- Đơn hàng đi qua các trạng thái *Đã gửi* → chi nhánh bấm *Đã nhận hàng* → *Đã nhận*; cả hai phía thấy thay đổi ngay (TCP push + SSE).
- Đúng dữ liệu khi nhiều chi nhánh thao tác đồng thời.
- Không mất yêu cầu khi mất mạng, và tự nối lại khi server khởi động lại.

**Server (công ty).**
- Nhận nhiều kết nối TCP đồng thời. Xác thực, quản lý phiên, heartbeat.
- Xử lý bán hàng, cảnh báo, đề xuất, xác nhận, xuất kho.
- Đẩy (push) tin tới chi nhánh. Giữ tin cho chi nhánh offline và gửi lại khi nó đăng nhập.
- Điều phối điều chuyển hàng giữa các chi nhánh.
- Theo dõi công nợ hai chiều: chi nhánh nợ công ty tiền hàng đã nhận (phiếu thu, hạn mức nợ chỉ cảnh báo), công ty nợ nhà cung cấp tiền phiếu nhập (phiếu chi).
- Quản lý kho chi nhánh: mỗi chi nhánh một thẻ (số mặt hàng thiếu / sắp thiếu / đủ, giá trị tồn, công nợ), chi tiết theo danh mục, ma trận mặt hàng × chi nhánh, bổ sung chủ động (tạo YC và gửi hàng ngay).
- Thông báo có phản hồi tới tất cả hoặc một vài chi nhánh: tin thường, hỏi chi nhánh sắp chạm ngưỡng có cần hàng không, giới thiệu sản phẩm mới. Chi nhánh bấm *Cần hàng* / *Muốn nhập* thì server tạo yêu cầu cấp hàng để admin duyệt (`NOTICE`, `NOTICE_REPLY`).
- Mỗi mặt hàng có ảnh tượng trưng (Wikimedia Commons, nén bằng Python, lưu trên Cloudinary).
- Ghi nhật ký mọi tin.
- Giám sát an ninh: phát hiện dò mật khẩu, gửi lệnh dồn dập, cào dữ liệu, gửi rác, dò mã YC của chi nhánh khác, mở kết nối dồn dập; tự chặn IP tạm thời hoặc ngắt phiên (`security.mode=off|detect|block`).
- Trả lời UDP discovery để chi nhánh tự tìm server.

**Client (chi nhánh).**
- Giữ một kết nối TCP duy nhất, có luồng Listener riêng.
- Ghi nhận bán hàng; tự gửi LOW_STOCK khi tồn dưới ngưỡng.
- Trả lời đề xuất cấp và yêu cầu điều chuyển; xem lịch sử nhập.
- Theo dõi trạng thái kết nối, tự nối lại và đăng nhập lại.
- Xem công nợ với công ty (tin `DEBT`).
- Hộp thư thông báo: trả lời *Cần hàng* / *Không cần*, *Muốn nhập* / *Bỏ qua* kèm số lượng.
- Trang mở theo tên chi nhánh, ví dụ `http://127.0.0.1:8081/da-nang/`.
- Tự bảo vệ API cục bộ (chặn CSRF, DNS rebinding), cảnh báo khi nhiều server cùng trả lời discovery hoặc server đổi địa chỉ, báo sự kiện lên công ty (`SECURITY_REPORT`).

Đặc tả chi tiết (SRS): 25 yêu cầu chức năng, 10 yêu cầu phi chức năng, 12 ca kiểm thử. Thiết kế thực nghiệm nằm ở [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md).

## 2. Kiến trúc

```
 Máy công ty                                           Máy chi nhánh (mỗi máy 1 tiến trình)
┌─────────────────────────────────────┐  TCP :5000   ┌─────────────────────────────────┐
│ server.jar                          │◄────────────►│ client.jar                      │
│  NioServer: 1 luồng Selector        │  giao thức   │  ServerLink: socket + Listener  │
│    (hoặc BioServer: luồng/kết nối)  │  dòng văn bản│  BranchAgent: logic chi nhánh,  │
│  ClientHandler: phiên, heartbeat    │              │    heartbeat, tự nối lại        │
│  worker pool 16 luồng → services:   │◄─ UDP :5001 ─│  Discovery: DISCOVER/HERE       │
│    Auth, Stock, Request, Transfer,  │   broadcast  │  HTTP :8081 (chỉ localhost)     │
│    Outbox (hàng đợi + gửi lại)      │              │        ▲ fetch + SSE            │
│  MessageLog: ghi nhat_ky theo lô    │              │  trình duyệt: /branch (Next.js) │
│  HikariCP ─ JDBC ─► PostgreSQL      │              └─────────────────────────────────┘
│  HTTP :8080 (chỉ localhost) ◄─ trình duyệt /admin (Next.js)
└─────────────────────────────────────┘
```

- **Phần lõi là giao tiếp mạng.** Chi nhánh và server chỉ nói chuyện qua TCP bằng giao thức tự thiết kế (`common/.../Protocol.java`). Không dùng HTTP, RMI hay thư viện messaging cho phần này.
- **Giao diện** viết bằng Next.js, build ra file tĩnh. `server.jar` và `client.jar` tự phục vụ các file này kèm một HTTP API chỉ mở trên localhost, để trình duyệt trên cùng máy điều khiển tiến trình Java. Mọi I/O mạng nằm trong Java, ngoài luồng giao diện.
- **Chỉ server truy cập CSDL.**

| Thư mục | Nội dung |
|---|---|
| `common/` | `Protocol` (encode/decode, escape, danh sách), `Command`, `ErrorCode`, `LineReader`/`LineSplitter` (giới hạn 4096 byte, cho BIO/NIO), `ReconnectPolicy`, tiện ích HTTP/SSE; unit test |
| `server/net/` | `NioServer`, `BioServer`, `Transport`, `ClientHandler`, `SessionRegistry`, `DiscoveryResponder` |
| `server/service/` | `AuthService`, `StockService` (kho, hàng, kho chi nhánh), `RequestService` (vòng đời YC, ACCEPT, bổ sung chủ động), `TransferService`, `DebtService` (công nợ), `Outbox` |
| `server/security/` | `SecurityMonitor` (quy tắc, chặn IP, ngắt phiên), `SecurityRules`, `RateCounter` (cửa sổ trượt không khóa), `BanList`, `SecurityEventLog` (ghi `su_kien_bao_mat` theo lô) |
| `server/` | `ServerMain`, `ServerSettings` (cờ cải tiến/baseline), `AdminApi`, `ExperimentApi`, `MessageLog` |
| `client/` | `ServerLink`, `BranchAgent`, `Discovery`, `ClientSecurity`, `ClientMain` |
| `loadsim/` | `LoadSimulator` (TC-11), `Experiments` (E1–E8), `SimClient`, `ServerProcess` |
| `ui/` | Next.js: `/admin` (công ty), `/branch` (chi nhánh) |
| `db/` | `schema.sql`, `dieu_chuyen.sql`, `seed.sql`, `seed_loadsim.sql`, `seed_demo.sql`, `migrate_toboki.sql` (chuyển CSDL cũ) |
| `config/`, `scripts/`, `docs/` | Cấu hình, script chạy, tài liệu và sơ đồ (`docs/img`) |
| `Dockerfile`, `docker-compose.yml`, `docker/` | Chạy cả hệ thống bằng Docker (mục 4) |
| `experiments/` | Số liệu (`results/`), biểu đồ (`charts/`), script vẽ biểu đồ |
| `report/` | Báo cáo `.docx` |

## 3. Công nghệ và thư viện

| Thành phần | Công nghệ |
|---|---|
| Mạng | Java 17: `java.net.Socket`/`ServerSocket` (BIO), `java.nio.channels.Selector` (NIO), `DatagramSocket` (UDP broadcast) |
| Đồng thời | Thread pool, worker pool + hàng đợi tuần tự theo kết nối, `ConcurrentHashMap`, transaction CSDL |
| CSDL | PostgreSQL, JDBC |
| Thư viện Java ngoài | PostgreSQL JDBC 42.7.4, HikariCP 5.1.0 (pool kết nối), Gson 2.11.0 (JSON cho API cục bộ), SLF4J NOP 1.7.36, JUnit 5.11.3 (test) |
| Giao diện | Next.js 15.5, React 19.1, TypeScript 5.9 (build tĩnh, không chạy Node khi vận hành) |
| Build | Maven 3.9 (đóng gói fat jar bằng maven-shade-plugin), npm |
| Ảnh hàng hoá (công cụ, chạy một lần) | Python 3 + Pillow (`scripts/images/upload_images.py`): tải ảnh Wikimedia Commons, nén WebP, upload có chữ ký lên Cloudinary; giao diện lấy ảnh qua CDN Cloudinary |

## 4. Cài đặt và chạy

**Yêu cầu:** JDK 17, Maven 3.9, Node.js 18 trở lên, PostgreSQL 14 trở lên. Các script sẽ dùng JDK và Maven trong `tools/` nếu có (bản portable, không nộp kèm).

```bat
:: 1. Tạo CSDL phan_phoi_hang và nạp dữ liệu mẫu + 1000 chi nhánh ảo cho thực nghiệm
scripts\setup-db.bat
::    CSDL tạo từ bản cũ (hàng SP01..SP05): chuyển sang hàng Toboki. XOÁ toàn bộ giao dịch, kho và mặt hàng cũ
scripts\migrate-db.bat
::    CSDL Toboki đã có: thêm ảnh, thông báo, 3 mặt hàng mới TB29..TB31, CN01 Lĩnh Nam. KHÔNG xoá dữ liệu
scripts\migrate-thong-bao.bat
:: (tuỳ chọn) dữ liệu demo lớn: 15 chi nhánh, 28 mặt hàng, ~60 ngày lịch sử, công nợ. XOÁ giao dịch hiện có
scripts\seed-demo.bat

:: 2. Đặt mật khẩu PostgreSQL: copy config\server.local.properties.example thành config\server.local.properties rồi điền db.password
::    (file *.local.properties nằm trong .gitignore, không đưa lên git)

:: 3. Build giao diện + 4 module Java
scripts\build.bat

:: 4. Máy công ty
scripts\run-server.bat                  :: mở http://127.0.0.1:8080/admin/ (đăng nhập admin / admin123)

:: 5. Mỗi máy chi nhánh (cần client\target\client.jar, ui\out, config)
scripts\run-client.bat                  :: mở http://127.0.0.1:8081/branch/, đăng nhập xong thành /<tên chi nhánh>/
scripts\run-client.bat http.port=8082   :: chi nhánh thứ 2 trên cùng máy
```

Dữ liệu mẫu mô phỏng một đại lý máy móc theo mẫu Công ty TNHH XNK Toboki Việt Nam (ngành 4653, bán buôn máy móc, thiết bị): 28 mặt hàng `TB01`..`TB28` chia 7 danh mục (máy hút bụi, máy cắt gạch, máy tời, máy rửa xe, máy đầm, phụ kiện máy đầm, máy khoan), giá bán lẻ lấy từ meta.vn; giá nhập = 70%, giá xuất cho chi nhánh = 85% giá bán lẻ. Ba nhà cung cấp `NCC01`..`NCC03` là tên hư cấu. `seed_hang_moi.sql` thêm 3 mặt hàng `TB29`..`TB31` (máy bơm, bình phun bọt tuyết, máy xoa vữa: các nhóm có trên toboki.vn, model và giá là giả định), có ở kho tổng nhưng chưa có ở chi nhánh thật, để demo thông báo *Sản phẩm mới*. `CN01` là "Chi nhánh Lĩnh Nam", trùng chi nhánh đăng ký thật của công ty (MST 0109227055-001); các chi nhánh khác là mô phỏng. Chính sách đại lý, chiết khấu, công nợ của Toboki không công khai; luồng cấp hàng và công nợ ở đây là giả định theo thông lệ bán buôn máy móc.

Ảnh hàng hoá: `db/seed_images.sql` do `scripts/images/upload_images.py` sinh ra (đừng sửa tay), tác giả và giấy phép từng ảnh ở `scripts/images/credits.json`. Chạy lại script khi đổi ảnh trong `scripts/images/sources.json`: `pip install -r scripts/images/requirements.txt`, tạo `config/cloudinary.local.properties` (`cloud.name`, `api.key`, `api.secret`; gitignored), rồi `python scripts/images/upload_images.py` (`--dry-run` chỉ tải và nén, in kích thước trước/sau).

Tài khoản mẫu: `CN01`, `CN02`, `CN03`, mật khẩu `123456`. Ô "Server" để `auto` thì client tự tìm server bằng UDP broadcast; nếu mạng chặn broadcast thì nhập IP, ví dụ `192.168.1.10`.

### Chạy bằng Docker

Không cần cài JDK, Maven, Node hay PostgreSQL; chỉ cần Docker Desktop (hoặc Docker Engine + Compose v2).

```bat
:: (tuỳ chọn) đổi mật khẩu CSDL, mật khẩu admin, cổng: copy .env.example thành .env rồi sửa
docker compose up --build -d
```

| Dịch vụ | Địa chỉ trên máy host | Ghi chú |
|---|---|---|
| `db` (PostgreSQL 17) | `127.0.0.1:5433` | Lần đầu tạo volume `pgdata` thì nạp `schema.sql`, `seed.sql`, `seed_loadsim.sql` và dữ liệu demo (`SEED_DEMO=1`) |
| `server` | TCP `5000`, http://localhost:8080/admin/ | Đăng nhập `admin` / `admin123`; trang công ty chỉ mở trên `127.0.0.1` |
| `cn01`, `cn02` | http://localhost:8081/branch/, http://localhost:8082/branch/ | Đăng nhập `CN01` / `123456`, `CN02` / `123456`; đã trỏ sẵn tới `server:5000` |
| `loadsim` (profile `tools`) | — | `docker compose run --rm loadsim clients=100 duration=60` |

- Một image `phanphoi` dùng cho cả ba vai: build giao diện Next.js, build 4 module Maven, rồi đóng vào JRE 17. Lệnh `server`, `client`, `loadsim` chọn tiến trình; tham số `key=value` phía sau ghi đè cấu hình như khi chạy `.bat`, ví dụ `docker compose run --rm cn01 client http.port=8083`.
- Mật khẩu CSDL đi qua biến môi trường `DB_PASSWORD`; `docker/entrypoint.sh` ghi nó vào `config/server.local.properties` bên trong container, không nằm trong image.
- Chi nhánh chạy ngoài Docker (máy khác trong LAN) nối vào `server=<ip máy chạy Docker>:5000`. UDP discovery không đi qua mạng NAT của Docker Desktop nên phải ghi rõ địa chỉ.
- Cổng 5000/8080/8081/8082 trùng với lúc chạy bằng `.bat`: tắt bản đang chạy, hoặc đổi `SERVER_TCP_PORT`, `ADMIN_HTTP_PORT`, `CN01_HTTP_PORT`, `CN02_HTTP_PORT` trong `.env`.
- Nạp lại dữ liệu từ đầu: `docker compose down -v` (xoá volume `pgdata`) rồi `docker compose up -d`.
- Chi nhánh ngoài Docker nối qua NAT của Docker Desktop hiện cùng một IP với server (IP gateway), và `loadsim` mở nhiều kết nối từ một container: dễ chạm `CONN_FLOOD`. Khi đó nâng `security.conn.max.per.ip` hoặc chạy server với `security.mode=detect`. Quy tắc theo IP không bao giờ chặn IP đang có phiên đăng nhập hợp lệ.

### Log demo: 1000 chi nhánh cùng xin hàng

`scripts\sim-log.bat` (chỉ cần Node.js) in log theo 4 phần: CSDL ban đầu → 1000 chi nhánh kết nối và gửi `LOW_STOCK`, kèm tình trạng mạng (RTT, mất gói, truyền lại, hàng đợi accept, KB/s) → server xử lý (pool DB, khóa dòng `kho_tong`, Gửi hàng / Báo hết hàng, `DELIVERED`/`OUT_OF_STOCK`) → CSDL sau xử lý, kèm 7 kiểm tra (kho tổng = đã xuất + còn lại, không còn YC treo, không mất/trùng tin, `nhat_ky` đủ dòng...).

Script có hai chế độ:

| | Giả lập (mặc định) | Chạy thật (`--real`) |
|---|---|---|
| Cần gì | Node.js | `server.jar` đã build, PostgreSQL có `seed_loadsim.sql` (SIM001..SIM1000), `psql`, `config\server.local.properties` có mật khẩu CSDL |
| Mạng | Mô phỏng LAN/WAN/4G, mất gói, backlog đầy, ECONNRESET | Socket TCP thật tới server; đo connect, LOGIN, SALE, LOW_STOCK → cảnh báo SSE |
| Server, admin | Mô phỏng pool 20 kết nối DB và bot admin | Server thật; bot admin đăng nhập `admin`/`admin123`, nghe SSE, gọi `/api/requests/{id}/ship` (kho không đủ thì `/shortage`), như E6 |
| CSDL | Bảng trong bộ nhớ, in giống psql | Truy vấn `psql` thật trước và sau |
| Dữ liệu thật | Không đụng tới | Chỉ đụng tới CN ảo và kho tổng của 1 mặt hàng (mặc định TB05); xong thì tự dọn |

```bat
:: Giả lập, không cần server/CSDL (chạy khoảng 35 s)
scripts\sim-log.bat
scripts\sim-log.bat --speed=2 --log=demo.log   :: nhanh gấp đôi, ghi thêm file log không màu
scripts\sim-log.bat --speed=0 --verbose        :: in ngay, in mọi sự kiện thay vì lấy mẫu

:: Chạy thật: script tự bật server.jar (max.clients=1100) ở cổng 5100/8180, chạy xong thì tắt
scripts\sim-log.bat --real --start-server

:: Chạy thật với server đang chạy sẵn (phải bật với max.clients đủ lớn, mặc định chỉ 100, và security.mode=off hoặc detect: 1000 CN ảo cùng IP sẽ dính CONN_FLOOD)
scripts\run-server.bat max.clients=2000 security.mode=detect
scripts\sim-log.bat --real --port=5000 --admin-port=8080
```

Tham số khác: `--clients=N` (giả lập tối đa 9999, chạy thật tối đa 1000), `--seed=` (đổi kịch bản giả lập), `--no-color`, `--host=`, `--product=TB05`, `--ship=10`, `--psql=<đường dẫn psql.exe>` (mặc định tìm trong `C:\Program Files\PostgreSQL\*\bin`), `--admin-user=`, `--admin-password=`, `--branch-password=`, `--keep`. Xem đầy đủ bằng `scripts\sim-log.bat --help`.

Ở chế độ chạy thật, script gọi `/api/experiment/prepare-live` để đặt tồn của các CN ảo là 12, ngưỡng 10, và kho tổng bằng 80% nhu cầu (để luôn có nhánh Báo hết hàng). Bot admin giữ cảnh báo tới khi đủ 1000 yêu cầu rồi mới xử lý, để phần 2 và phần 3 tách riêng. Xong (kể cả khi bấm Ctrl+C) script gọi `/api/experiment/finish-live` để trả kho về như cũ, và xoá các dòng `nhat_ky`, `ban_hang` do lượt chạy sinh ra. Thêm `--keep` để giữ lại dữ liệu cho xem trên trang công ty.

### Cấu hình

Cấu hình đọc từ file `.properties`, rồi file `*.local.properties` cùng tên nếu có (giá trị riêng của máy như mật khẩu CSDL, không đưa lên git). Có thể ghi đè bằng tham số dạng `key=value` khi chạy, ví dụ `run-server.bat io.mode=bio`.

| Khóa (`config/server.properties`) | Mặc định | Ý nghĩa |
|---|---|---|
| `tcp.port`, `discovery.port` | 5000, 5001 | Cổng TCP và cổng UDP discovery |
| `max.clients` | 100 | Vượt giới hạn thì kết nối mới nhận `ERROR\|E03` rồi bị đóng |
| `heartbeat.idle.seconds`, `heartbeat.pong.timeout.seconds` | 30, 10 | Im lặng 30 s → PING; không có PONG sau 10 s → đóng kết nối |
| `io.mode` | `nio` | `nio` (Selector) hoặc `bio` (mỗi kết nối một luồng) |
| `nio.workers`, `nio.write.through` | 16, `true` | Số worker NIO; `true` = worker ghi thẳng vào socket khi kết nối không còn tin chờ, `false` = mọi tin đi qua luồng Selector (baseline, E7) |
| `write.mode` | `queued` | Chỉ dùng với BIO: `queued` (hàng đợi gửi) hoặc `direct` (baseline) |
| `send.queue.limit` | 2000 | Số tin chờ gửi tối đa của một kết nối; vượt thì cắt client chậm |
| `accept.strategy` | `conditional` | `conditional`, `check_then_act` hoặc `synchronized` (E1) |
| `delivery` | `queue_resync` | `queue_resync`, `queue` hoặc `none` (E2) |
| `db.url`, `db.user`, `db.password`, `db.pool.size` | | Kết nối PostgreSQL |
| `admin.http.port`, `experiment.api` | 8080, true | API admin và API thực nghiệm (chỉ localhost) |
| `admin.user`, `admin.salt`, `admin.password.hash` | `admin`, `pp-admin-2026`, rỗng | Tài khoản trang công ty; hash = hex SHA-256(salt + mật khẩu), để rỗng = mật khẩu mặc định `admin123` |
| `security.mode` | `block` | Giám sát an ninh (E8): `off` (baseline, không làm gì), `detect` (chỉ ghi sự kiện), `block` (ghi sự kiện và tự chặn IP / ngắt phiên / giới hạn) |
| `security.ban.minutes` | 10 | Thời gian chặn IP vì `BRUTE_FORCE`, `CONN_FLOOD` (các quy tắc khác chặn 5 phút) |
| `security.login.fail.max`, `security.login.fail.window.seconds` | 5, 60 | `BRUTE_FORCE`: số `LOGIN_FAIL` từ một IP trong cửa sổ |
| `security.flood.msgs.per.second` | 50 | `CMD_FLOOD`: vượt mức này liên tục 3 s thì ngắt phiên, chặn IP |
| `security.scrape.max.per.minute` | 30 | `SCRAPING`: `INVENTORY_GET` + `HISTORY_GET` của một phiên trong 60 s (và `HISTORY_GET` khoảng > 366 ngày) |
| `security.fuzz.max.per.minute`, `security.idor.max.per.minute` | 10, 5 | `FUZZING` (E01/dòng quá dài theo IP), `IDOR_PROBE` (E04 với mã YC/điều chuyển của chi nhánh khác, theo phiên) |
| `security.conn.max.per.ip` | 20 | `CONN_FLOOD`: kết nối đồng thời từ một IP (hoặc > 30 kết nối mới trong 10 s) |
| `security.prelogin.timeout.seconds` | 10 | Kết nối không `LOGIN` sau thời gian này thì đóng (`PRELOGIN_IDLE`) |
| `security.allowed.origins` | `http://localhost:3000,http://localhost:3001` | Origin được gọi API admin ngoài chính trang (cho `next dev`) |
| `admin.lock.fails`, `admin.lock.minutes` | 5, 5 | Sai mật khẩu trang công ty 5 lần trong 5 phút thì khoá đăng nhập 5 phút (`ADMIN_BRUTE_FORCE`, cả ở `detect`) |

| Khóa (`config/client.properties`) | Mặc định | Ý nghĩa |
|---|---|---|
| `server` | `auto` | `auto` = UDP discovery; hoặc `ip` / `ip:port` |
| `reconnect.strategy`, `reconnect.cap.ms` | `jitter`, 5000 | `jitter` (đề xuất), `fixed` (baseline) hoặc `backoff` (E5) |
| `http.port` | 8081 | Cổng giao diện chi nhánh |
| `security.allowed.origins`, `security.api.max.per.second` | như server, 30 | Origin được gọi API cục bộ ngoài chính trang; vượt số request/giây thì ghi `CLIENT_API_FLOOD` |

### Cơ sở dữ liệu

10 bảng theo SRS mục 6, cộng bảng `dieu_chuyen` và cột `chi_nhanh.gia_lap` (đánh dấu chi nhánh ảo). Thêm cho đại lý máy móc:
- `danh_muc`, `nha_cung_cap`; `san_pham` có `model`, `ma_dm` và 3 giá `gia_nhap`, `gia_xuat`, `gia_ban_le` (đồng, `NUMERIC(15,0)`).
- `phieu_nhap` ghi `ma_ncc` và `don_gia`; `phieu_xuat`, `dieu_chuyen` có `don_gia` chốt lúc gửi hàng.
- `cong_no_cn` (sổ công nợ chi nhánh), `thanh_toan_ncc` (phiếu chi nhà cung cấp), `chi_nhanh.han_muc_no`, `su_kien_bao_mat` (giám sát an ninh).
- `thong_bao`, `thong_bao_cn` (thông báo và trạng thái từng chi nhánh: đã xem, cần hàng, ... kèm mã YC tạo ra); `san_pham.anh_url`; `yeu_cau.so_luong_xin` (số chi nhánh xin khi trả lời thông báo).

Các ràng buộc quan trọng:
- `kho_tong.so_luong >= 0`: kho tổng không âm.
- Chỉ mục UNIQUE riêng `uq_yeu_cau_dang_mo`: mỗi cặp (chi nhánh, sản phẩm) chỉ có một yêu cầu chưa đóng.
- `phieu_xuat.ma_yc` UNIQUE: một yêu cầu chỉ được xuất kho một lần.
- `uq_cong_no_yc`, `uq_cong_no_dc`: một yêu cầu hoặc một điều chuyển chỉ ghi nợ một lần.

Mật khẩu lưu dạng `hex(SHA-256(salt + matKhau))`.

## 5. Giao tiếp mạng

### Kết nối

1. Client gửi UDP `DISCOVER` tới cổng 5001 bằng broadcast; server trả `HERE|ip|5000`.
2. Client mở **một** kết nối TCP và gửi `LOGIN|maCN|matKhau`.
3. Sau `LOGIN_OK`, kết nối được giữ mở và dùng chung cho request của client lẫn push của server.
4. Đóng kết nối có ba cách:
   - Client gửi `LOGOUT`.
   - Heartbeat: im lặng 30 s thì server gửi PING; không có PONG sau 10 s thì server đóng.
   - Server cắt client đọc quá chậm.

Mất kết nối thì client tự nối lại (mỗi lần chờ tối đa 5 s) và tự đăng nhập lại.

### Định dạng tin

UTF-8, mỗi tin một dòng tối đa 4096 byte, dạng `LENH|thamSo1|thamSo2`. Tham số dùng escape `\\` `\p` `\n`. Danh sách có bản ghi ngăn bởi `;`, trường ngăn bởi `,`, và trong trường dùng escape `\c` `\s`.

| Lệnh | Chiều | Tham số |
|---|---|---|
| `LOGIN` / `LOGIN_OK` / `LOGIN_FAIL` | CN→S / S→CN | maCN, matKhau / tên CN / lý do |
| `INVENTORY_GET` / `INVENTORY` | CN→S / S→CN | — / danh sách maHang,tenHang,soLuong,nguong,model,danhMuc,giaXuat,giaBanLe,anh (các trường sau trường 4 thêm sau, client cũ chỉ đọc 4 trường đầu vẫn chạy; tiền là số nguyên đồng; `anh` là phần URL Cloudinary sau `/image/upload/`, ví dụ `v1792609532/toboki/TB01.webp`, rỗng nếu chưa có ảnh: 31 mặt hàng thật dài 3358 byte, URL đầy đủ sẽ vượt 4096) |
| `SALE` / `SALE_OK` | CN→S / S→CN | maHang, soLuong / maHang, soLuongCon |
| `SET_THRESHOLD` | CN→S | maHang, nguong (server trả `INVENTORY`) |
| `LOW_STOCK` | CN→S | maHang, soLuongCon, nguong |
| `OFFER` | S→CN | maYC, maHang, soLuongDeXuat |
| `ACCEPT` / `REJECT` / `RECEIVED` | CN→S | maYC, soLuong / maYC / maYC |
| `DELIVERED` / `OUT_OF_STOCK` | S→CN | maYC, maHang, soLuong / maYC, soLuongCoThe, maHang |
| `HISTORY_GET` / `HISTORY` | CN→S / S→CN | từ ngày, đến ngày / danh sách maYC,maHang,tenHang,soLuong,thoiGian,nguon |
| `TRANSFER_REQ` / `TRANSFER_DONE` | S→CN | maDC, maHang, soLuong, tenCnNhan / maDC, maHang, soLuongCon |
| `TRANSFER_ACCEPT` / `TRANSFER_REJECT` | CN→S | maDC |
| `BROADCAST` | S→CN | noiDung |
| `NOTICE` | S→CN | id, loai (`TIN`/`HOI_NHU_CAU`/`SP_MOI`), trangThai, taoLuc, tieuDe, noiDung, maHang, deXuat, soLuong, maYC, anh (trường không áp dụng để rỗng). Mang trạng thái mới nhất, client ghi đè theo id. Server gửi khi tạo thông báo, sau mỗi `NOTICE_REPLY` và sau `LOGIN_OK` (thông báo 30 ngày gần nhất, tối đa 50) |
| `NOTICE_REPLY` | CN→S | id, traLoi (`XEM`; `CAN_HANG`/`KHONG_CAN` cho `HOI_NHU_CAU`; `MUON_NHAP`/`BO_QUA` cho `SP_MOI`), soLuong (0 khi không cần). Server trả `NOTICE` mới; thông báo của chi nhánh khác → `E04`, đã trả lời → `E03`, sai loại → `E01`, số lượng ≤ 0 → `E05` |
| `DEBT_GET` / `DEBT` | CN→S / S→CN | — / tongNhan, daTra, conNo, hanMuc, danh sách id,loai,soTien,thoiGian,ghiChu (50 bút toán mới nhất; tiền là số nguyên đồng). Server tự đẩy `DEBT` khi sổ công nợ của chi nhánh đổi và chi nhánh đang online (không xếp hàng); sau `LOGIN_OK` client tự gửi `DEBT_GET` |
| `SECURITY_REPORT` | CN→S | loai, chiTiet (≤ 500 ký tự): sự kiện an ninh client phát hiện; chỉ sau khi đăng nhập, tối đa 1 tin/giây/phiên, mã CN lấy từ phiên |
| `ERROR` | S→CN | E01 định dạng, E02 chưa đăng nhập, E03 sai trạng thái/server đầy, E04 không tìm thấy, E05 số lượng sai, E06 bị giới hạn tần suất hoặc IP bị chặn |
| `PING` / `PONG`, `LOGOUT` | hai chiều, CN→S | — |
| UDP `DISCOVER` / `HERE` | CN→S / S→CN | — / ip, cổngTCP |

Luồng cấp hàng có hai cách, cùng kết thúc bằng `RECEIVED`:

- **Gửi thẳng (mặc định trên trang Tổng quan):** `LOW_STOCK` → admin bấm *Gửi hàng* → server trừ kho tổng, YC thành *Đã gửi* và đẩy `DELIVERED` → chi nhánh bấm *Đã nhận hàng* (`RECEIVED`) → YC thành *Đã nhận*. Admin bấm *Báo hết hàng* thì server đẩy `OUT_OF_STOCK`; chi nhánh nhận số còn lại (`ACCEPT`), từ chối (`REJECT`) hoặc chờ điều chuyển.
- **Đề xuất rồi xác nhận:** `LOW_STOCK` → `OFFER` → `ACCEPT` → `DELIVERED` → `RECEIVED`. Nếu lúc ACCEPT kho tổng thiếu, server trả `OUT_OF_STOCK`.

- **Hỏi nhu cầu / sản phẩm mới:** admin gửi `NOTICE` (`HOI_NHU_CAU` cho chi nhánh có tồn < 1,5 × ngưỡng, hoặc `SP_MOI`) → chi nhánh bấm *Cần hàng* / *Muốn nhập* kèm số lượng (`NOTICE_REPLY`) → server tạo YC *CHO* với số chi nhánh xin (dùng chung chỉ mục chống trùng với `LOW_STOCK`; `SP_MOI` tạo thêm dòng kho chi nhánh tồn 0, ngưỡng 3) và đẩy cảnh báo lên Tổng quan → admin *Gửi hàng* như trên.

Khi có `OUT_OF_STOCK`, server tìm chi nhánh khác có hàng dư và gửi `TRANSFER_REQ`. `OUT_OF_STOCK` mang `maHang` để chi nhánh hiển thị được YC chưa từng nhận `OFFER`.

### Đồng thời

- **Server NIO:** một luồng Selector làm mọi accept/đọc/ghi. Dòng tin được đẩy sang worker pool, mỗi kết nối có một hàng đợi tuần tự riêng. Nhờ vậy tin của cùng một chi nhánh luôn xử lý đúng thứ tự, còn các chi nhánh khác nhau chạy song song.
- **Ghi:** bên gọi chỉ xếp tin vào hàng đợi của kết nối, nên một client chậm không chặn được ai.
- **Kho tổng:** trừ bằng `UPDATE ... WHERE so_luong >= ?` trong transaction, và khóa dòng YC bằng `SELECT ... FOR UPDATE`. Hai transaction điều chuyển và cấp hàng khóa theo cùng thứ tự (YC trước, điều chuyển sau) để tránh deadlock.
- **Công nợ:** bút toán ghi trong cùng transaction với nghiệp vụ (`XUAT` khi RECEIVED, `DC_NHAN`/`DC_GIAO` khi điều chuyển hoàn tất); đơn giá chốt ở `phieu_xuat.don_gia` lúc gửi hàng. Phiếu thu khóa dòng `chi_nhanh ... FOR NO KEY UPDATE` trước khi tính số còn nợ, nên hai phiếu cùng lúc không thu quá (khóa này không chặn các INSERT có khóa ngoại tới chi nhánh).
- **Nhật ký:** ghi vào `nhat_ky` bất đồng bộ theo lô, nên ClientHandler không phải chờ CSDL.

### Xử lý lỗi

| Tình huống | Cách xử lý |
|---|---|
| Dòng rác, sai số tham số, escape sai, dòng > 4096 byte | `ERROR\|E01`, kết nối vẫn tiếp tục |
| Lệnh trước khi đăng nhập | `ERROR\|E02` |
| Sai trạng thái (ACCEPT YC đã đóng...), sai chiều lệnh | `ERROR\|E03` / `E01` |
| Mã CN khác trong tham số | Bị bỏ qua: mã CN luôn lấy từ phiên, YC của CN khác trả `E04` |
| ACCEPT gửi lặp | Trả lại `DELIVERED` cũ, không trừ kho lần hai |
| Client mất kết nối / treo | Heartbeat đóng phiên; tin push vào hàng đợi; gửi lại trạng thái khi đăng nhập |
| Đăng nhập trùng khi server chưa biết phiên cũ đã chết | `LOGIN_FAIL` + server PING phiên cũ, đóng nó sau 5 s |
| Server mất / khởi động lại | Client báo trạng thái, tự nối lại theo `ReconnectPolicy` |
| Quá số kết nối | `ERROR\|E03\|Server da du N ket noi` rồi đóng |
| Lỗi CSDL | Rollback transaction, trả `ERROR\|E03` |
| IP đang bị chặn kết nối tới | `ERROR\|E06\|IP bi chan den HH:mm` rồi đóng |
| Dò mật khẩu, gửi rác, mở kết nối dồn dập (theo IP) | Ghi sự kiện; ở `block` chặn IP 5–10 phút, trừ IP đang có phiên hợp lệ |
| Gửi lệnh dồn dập, dò mã YC của chi nhánh khác (theo phiên) | Ghi sự kiện; ở `block` gửi `ERROR\|E06` rồi ngắt đúng phiên đó |
| Cào dữ liệu (`INVENTORY_GET`/`HISTORY_GET` quá nhiều) | Ghi sự kiện; ở `block` trả `ERROR\|E06` cho tin vượt mức |

## 6. Kiểm thử

- **Unit test** (`mvn test`): 129 test.
  - `common`: 78 test cho giao thức (escape, ghép/tách từng lệnh, danh sách, `INVENTORY` 8 và 9 trường, `NOTICE`, `NOTICE_REPLY`, `DEBT`, `SECURITY_REPORT`, `E06`, dòng quá dài, tách dòng NIO qua ranh giới gói tin và ký tự UTF-8) và cho chính sách nối lại.
  - `server`: 37 test cho các quy tắc giám sát an ninh và danh sách chặn (`SecurityRulesTest`, `BanListTest`), quy tắc trả lời thông báo và độ dài dòng `NOTICE` (`NoticeServiceTest`).
  - `client`: 14 test cho kiểm tra Origin/Host, phát hiện discovery giả mạo, hàng đợi `SECURITY_REPORT` (`ClientSecurityTest`), đường dẫn theo tên chi nhánh (`BranchSlugTest`).
- **Kiểm thử tích hợp** theo SRS mục 8: chạy bằng script gửi lệnh TCP thật, trên cả `io.mode=nio` lẫn `io.mode=bio`.

| Ca | Kết quả đã kiểm |
|---|---|
| TC-01 đăng nhập đúng/sai/trùng | `LOGIN_OK`, `LOGIN_FAIL` kèm lý do, `LOGIN_FAIL` vì trùng mã |
| TC-02 bán dưới ngưỡng rồi bán tiếp | 1 LOW_STOCK, 1 YC |
| TC-03 luồng đủ 5 tin | Kho tổng giảm, kho CN tăng đúng số chốt, YC ở HOAN_TAT |
| TC-04 REJECT | YC ở TU_CHOI, không kho nào đổi |
| TC-05 kho 10, hai CN cùng ACCEPT 8 | 1 DELIVERED, 1 `OUT_OF_STOCK\|..\|2`, kho tổng = 2 |
| TC-06 OFFER khi CN offline | CN nhận OFFER ngay sau LOGIN_OK |
| TC-07 tắt server 20 s | Client tự nối lại (đo được 3,5 s) |
| TC-08 client không trả PONG | PING ở giây 31, đóng ở giây 41 |
| TC-09 netcat gửi rác | `ERROR\|E01`, `ERROR\|E02`, server vẫn chạy |
| TC-10 broadcast có `\|` và xuống dòng | Hiển thị nguyên văn |
| TC-11 20 client | Xem E4 và `scripts\run-loadsim.bat clients=20 duration=600` |
| TC-12 ACCEPT hai lần | Kho tổng trừ một lần, một phiếu xuất |
| TC-13 công nợ: Gửi hàng 5 × TB01 cho CN01 → RECEIVED hai lần → thu 2.000.000 → thu 3.000.000 | Một bút toán `XUAT` 4.635.000; `DEBT` tới CN01 sau 29 ms với còn nợ 2.635.000; phiếu thu 3.000.000 bị 400 "Số tiền lớn hơn số còn nợ"; đối soát khớp |
| TC-14 bổ sung chủ động: CN02 tồn TB06 = 1, ngưỡng 3 | `POST /api/warehouses/CN02/replenish` tạo đúng một YC và một phiếu xuất, CN02 nhận `DELIVERED\|..\|TB06\|5`, Đã nhận → tồn 6; bổ sung lần 2 → 409; kho tổng không đủ → 409, không tạo YC |
| TC-15 dò mật khẩu từ một IP (6 `LOGIN` sai) | `block`: sự kiện `BRUTE_FORCE`, kết nối bị đóng, kết nối mới nhận `ERROR\|E06\|IP bi chan den HH:mm`, CN02 từ IP khác vẫn đăng nhập; `detect`: có sự kiện, không `E06`; `off`: không sự kiện. Admin sai mật khẩu 5 lần → lần 6 đúng mật khẩu vẫn 429 |
| TC-16 `curl -H "Origin: http://evil.example" -X POST http://127.0.0.1:8081/api/sale` | 403; `/api/security` của client có `CLIENT_CSRF`, server lưu sự kiện nguồn `CLIENT` với mã CN lấy từ phiên; `Host` lạ (DNS rebinding) cũng 403; admin API tương tự (`ADMIN_CSRF`) |

TC-15 trên Windows: không bind được IP nguồn 127.0.0.x khác (mọi kết nối loopback hiện là 127.0.0.1), nên kẻ tấn công nối tới địa chỉ LAN / IPv6 của chính máy, và server thấy IP nguồn là địa chỉ đó.

Tab **Đối soát** trên trang admin kiểm tra NFR-03 và sổ công nợ; tab **Giám sát** hiện sự kiện an ninh, bảng IP, bảng phiên, và tab con **Luồng tin** (luồng tin realtime, tra cứu `nhat_ky`).

## 7. Kết quả thực nghiệm

Toàn bộ số liệu dưới đây là kết quả đo thật, chạy ngày 20/10/2026 trên một máy: Windows 11, 16 luồng CPU, 15 GB RAM, Java 17.0.20, PostgreSQL trên localhost. Client ảo và server cùng máy, nói chuyện qua loopback.

- Kết quả đầy đủ: [experiments/results/RESULTS.md](experiments/results/RESULTS.md); CSV gốc nằm cùng thư mục.
- Biểu đồ: `experiments/charts/`.
- Cách đo: [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md).
- Chạy lại: `scripts\run-experiments.bat run=all`.

**E1 – 50 chi nhánh cùng ACCEPT 8, kho tổng 200 (đủ cho 25), 5 lần lặp**

| Chiến lược | DELIVERED | Tổng xuất | Bán vượt kho | Vi phạm bất biến | Thời gian xong cả loạt |
|---|---:|---:|---:|---:|---:|
| `check_then_act` (baseline) | 50 | 400 | **200** | 5/5 | 78 ms |
| `synchronized` (baseline) | 25 | 200 | 0 | 0/5 | 109 ms |
| `conditional` (đề xuất) | 25 | 200 | 0 | 0/5 | **31 ms** |

**E2 – OFFER khi chi nhánh liên tục mất kết nối (30 CN, 60 s)**

| Chế độ | OFFER gửi | Nhận được | Tỉ lệ mất |
|---|---:|---:|---:|
| `none` | 321 | 207 | 35,5 % |
| `queue` (theo SRS) | 399 | 319 | 20,1 % |
| `queue_resync` (đề xuất) | 541 | 541 | **0 %** |

**E3 – 1 chi nhánh treo, 300 broadcast tới 20 chi nhánh bình thường**

| Server | Broadcast hoàn tất | Tin tới CN bình thường | CN treo bị cắt |
|---|---:|---:|---|
| BIO ghi trực tiếp (baseline) | 26/300 (treo 5 s rồi dừng) | 540/6000 | không |
| BIO + hàng đợi gửi | 300/300 | 6000/6000 | có |
| NIO + hàng đợi gửi | 300/300 | 6000/6000 | có |

**E4 – BIO và NIO, mỗi client 1 SALE/giây, 30 s**

| Số client | Luồng server BIO | Luồng server NIO | p95 BIO | p95 NIO | Mất tin |
|---:|---:|---:|---:|---:|---:|
| 50 | 117 | 33 | 1,82 ms | 2,21 ms | 0 |
| 200 | 416 | 33 | 1,62 ms | 1,73 ms | 0 |
| 500 | 1017 | **32** | 1,26 ms | 1,34 ms | 0 |

**E6 – Luồng cấp hàng trọn vẹn: 50 đến 1000 chi nhánh cùng báo thiếu, 5 vòng mỗi chi nhánh (21/10/2026)**

Bot admin nghe SSE và bấm *Gửi hàng*/*Báo hết hàng* qua API có đăng nhập; kho tổng chỉ đủ 80 % số lần gửi.

| Số CN | Cảnh báo | Gửi hàng / báo hết | Mất tin | Trùng | Lỗi | Mất kết nối | Bán vượt kho | Trọn vòng TB / p95 | Luồng server |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 50 | 250/250 | 200 / 50 | 0 | 0 | 0 | 0 | 0 | 147 / 256 ms | 40 |
| 100 | 500/500 | 400 / 100 | 0 | 0 | 0 | 0 | 0 | 250 / 329 ms | 41 |
| 100 × 20 vòng | 2000/2000 | 1600 / 400 | 0 | 0 | 0 | 0 | 0 | 175 / 280 ms | 41 |
| 500 | 2500/2500 | 2000 / 500 | 0 | 0 | 0 | 0 | 0 | 882 / 1 485 ms | 41 |
| 500 × 20 vòng | 10000/10000 | 8000 / 2000 | 0 | 0 | 0 | 0 | 0 | 627 / 1 024 ms | 65 |
| 1000 | 5000/5000 | 4000 / 1000 | 0 | 0 | 0 | 0 | 0 | 1 411 / 2 298 ms | 41 |
| 1000 × 20 vòng | 20000/20000 | 16000 / 4000 | 0 | 0 | 0 | 0 | 0 | 1 210 / 1 869 ms | 41 |

Chi tiết từng chặng (SALE, LOW_STOCK → admin, admin bấm → chi nhánh nhận, đã nhận → admin): [RESULTS-e6.md](experiments/results/RESULTS-e6.md), [RESULTS-e6-500.md](experiments/results/RESULTS-e6-500.md), [RESULTS-e6-500x20.md](experiments/results/RESULTS-e6-500x20.md), [RESULTS-e6-1000.md](experiments/results/RESULTS-e6-1000.md), [RESULTS-e6-1000x20.md](experiments/results/RESULTS-e6-1000x20.md). Chạy lại: `scripts\run-experiments.bat run=e6 e6.clients=50,100,500,1000` (cần nạp lại `db/seed_loadsim.sql` để có SIM001..SIM1000).

**E7 – Tầng mạng thuần: mỗi chi nhánh 10 PING/giây trong 20 s (server trả PONG không chạm CSDL)**

| Số CN | Tin gửi | Mất | Thông lượng | RTT TB | p95 | p99 | Max | Mất kết nối | Luồng server |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 19 990 | 0 | 995 tin/s | 0,27 ms | 0,44 ms | 0,59 ms | 5,6 ms | 0 | 33 |
| 500 | 99 845 | 0 | 4 968 tin/s | 0,37 ms | 0,69 ms | 0,91 ms | 3,4 ms | 0 | 33 |
| 1000, NIO ghi thẳng (đề xuất) | 199 058 | 0 | 9 905 tin/s | 0,66 ms | 1,49 ms | 3,00 ms | 27,9 ms | 0 | 33 |
| 1000, NIO qua Selector (baseline) | 199 247 | 0 | 9 914 tin/s | 5,30 ms | 8,50 ms | 9,80 ms | 35,1 ms | 0 | 33 |
| 1000, BIO | 199 292 | 0 | 9 915 tin/s | 0,36 ms | 0,90 ms | 2,19 ms | 26,9 ms | 0 | 2 017 |

Hai hàng 100 và 500 đo với bản trước khi sửa đường ghi NIO. Chi tiết: [RESULTS-e7.md](experiments/results/RESULTS-e7.md), [RESULTS-e7-1000.md](experiments/results/RESULTS-e7-1000.md). Chạy lại: `scripts\run-experiments.bat run=e7 e7.clients=1000` (thêm `e7.server=nio.write.through=false` hoặc `e7.server=io.mode=bio` để so sánh).

**E5 – 300 chi nhánh nối lại khi server khởi động lại, 5 lần**

| Chính sách | Nối lại TB | p95 | Lần thử / client | Đỉnh lần thử / 100 ms |
|---|---:|---:|---:|---:|
| `fixed` 5 s (baseline SRS) | 3 224 ms | 4 854 ms | 2,40 | 300 |
| `backoff` + full jitter | 1 669 ms | 3 884 ms | 6,76 | 92 |
| `jitter` lệch pha (đề xuất) | 1 922 ms | 3 995 ms | 3,31 | **16,4** |

**E8 – Bị tấn công: 20 chi nhánh thật SALE 2 tin/s (127.0.0.1), 10 s bình thường rồi 30 s bị 5 kẻ tấn công (22/10/2026)**

Kẻ tấn công: dò mật khẩu CN01 (20 lần/s), flood `PING` 500 tin/s, cào `INVENTORY_GET`/`HISTORY_GET` 200 tin/s bằng một tài khoản hợp lệ, gửi rác 50 dòng/s, mở 50 kết nối không `LOGIN`. Mỗi kẻ một IP nguồn (địa chỉ LAN, WARP, `::1` của máy); kẻ cào dữ liệu dùng 127.0.0.1 cùng các chi nhánh thật.

| `security.mode` | Kẻ tấn công bị chặn/ngắt | CN thật bị chặn nhầm | Tin tấn công được xử lý | SALE p95 bình thường | SALE p95 khi bị tấn công |
|---|---:|---:|---:|---:|---:|
| `off` (baseline) | 0/5 | 0 | 18 928 | 1,81 ms | 1,87 ms |
| `detect` | 0/5 (có sự kiện sau 22–2 179 ms) | 0 | 13 126 | 2,06 ms | 1,98 ms |
| `block` (đề xuất) | **5/5** sau 27–1 336 ms | **0** | **645** | 2,69 ms | 2,17 ms |

Chi tiết từng kẻ tấn công: [RESULTS-e8.md](experiments/results/RESULTS-e8.md), [e8.csv](experiments/results/e8.csv). Chạy lại: `scripts\run-experiments.bat run=e8` (đổi IP kẻ tấn công bằng `e8.attacker.hosts=a,b,c,d`).

**E7 với giám sát an ninh bật (22/10/2026):** `security.mode=detect` so với `off`, 500 chi nhánh × 10 PING/s: p99 1,16 ms so với 1,13 ms (+0,03 ms); 100 chi nhánh: 0,82 ms so với 0,91 ms. Bộ đếm cửa sổ trượt không khóa, không gọi CSDL trên đường đọc tin.

**Đọc kết quả.**
- **E1:** `check_then_act` cho cả 50 chi nhánh nhận hàng từ kho chỉ có 200 (lost update). `synchronized` đúng nhưng chậm hơn `conditional` khoảng 3,5 lần, vì mọi ACCEPT phải xếp hàng qua một khóa Java.
- **E2:** `queue` chỉ cứu được trường hợp server biết chi nhánh đã offline. Trường hợp "rút dây", server tưởng đã gửi thành công nên tin vẫn mất. `queue_resync` gửi lại theo trạng thái lưu trong CSDL nên không mất tin nào.
- **E3:** khi ghi trực tiếp, chỉ một client không đọc socket là đủ để làm treo luồng broadcast và chặn mọi chi nhánh khác.
- **E4:** ở tải này độ trễ do CSDL quyết định nên BIO và NIO ngang nhau. Khác biệt nằm ở số luồng: BIO tăng tuyến tính theo số client (2 luồng mỗi kết nối), còn NIO giữ cố định khoảng 32.
- **E6:** với 50–100 chi nhánh cùng báo thiếu, tầng mạng không mất, không trùng tin và không rớt kết nối nào; p95 mỗi chặng mạng dưới 55 ms, luồng server giữ khoảng 40 nhờ NIO. Kho tổng không bị xuất vượt dù 100 lệnh gửi hàng tranh nhau. Ở 500 chi nhánh vẫn 0 mất/trùng/rớt và kho đúng; trọn vòng p95 lên khoảng 1–1,5 s vì 2 500 vòng (mỗi vòng khoảng 5 transaction) dồn vào CSDL trong 5 giây. Tăng pool CSDL lên 40 và worker NIO lên 32 không đổi kết quả này, còn chặng thuần mạng (admin bấm → chi nhánh nhận) vẫn p95 khoảng 26–28 ms.
- **E7:** bỏ CSDL ra thì tầng TCP/NIO trả lời 500 client × 10 tin/giây với p99 dưới 1 ms, không mất tin, server giữ 33 luồng. Giới hạn ở 500 chi nhánh là CSDL, không phải tầng mạng. Ở 1000 chi nhánh (khoảng 10 000 tin/giây) lộ ra hai điểm yếu, đã sửa: (1) mỗi tin gửi đều phải đánh thức luồng Selector, p95 lên 8,5–11 ms; cho worker ghi thẳng khi kết nối không còn tin chờ thì p95 còn 1,49 ms (nhanh 5,7 lần) mà vẫn 33 luồng, trong khi BIO cần 2 017 luồng; (2) bộ ghi `nhat_ky` không theo kịp 20 000 bản ghi/giây và bỏ 20–30 nghìn bản ghi; lô 2 000 dòng với `reWriteBatchedInserts` thì không bỏ bản ghi nào. E3 chạy lại sau khi sửa: client treo vẫn bị cắt, 20 chi nhánh khác nhận đủ 6 000/6 000 tin.
- **E5:** `jitter` giảm đỉnh tải lúc server vừa lên 18 lần so với `fixed`, thời gian nối lại trung bình giảm 40 %, và số lần thử chỉ bằng một nửa `backoff`.
- **E8:** `block` chặn hoặc ngắt cả 5 kẻ tấn công trong 27 ms–1,3 s, số tin tấn công server phải xử lý giảm 96,6 % (18 928 → 645), không chặn nhầm chi nhánh thật nào, kể cả khi kẻ cào dữ liệu đứng chung IP với chúng (CMD_FLOOD chỉ ngắt phiên đó, không chặn IP còn phiên hợp lệ). Ở cường độ tấn công này server NIO vẫn đủ sức: p95 SALE gần như không đổi khi bị tấn công ở cả ba chế độ. Khác biệt p95 giữa các lượt (1,8–2,7 ms ngay cả trước khi bị tấn công) là dao động giữa các lần khởi động server, không do chế độ giám sát.

## 8. Novelty và đóng góp

| # | Đóng góp | Khác gì cách làm thông thường / baseline | Bằng chứng |
|---|---|---|---|
| 1 | Trừ kho bằng một câu `UPDATE … WHERE so_luong >= ?` kèm khóa dòng YC, không dùng khóa Java | Cách "đọc rồi ghi" bị lost update; `synchronized` đúng nhưng tuần tự hóa toàn hệ thống và chỉ đúng khi có một server | E1: bán vượt 200 → 0, nhanh hơn `synchronized` 3,5 lần; TC-05, TC-12 |
| 2 | Giao tin theo trạng thái: hàng đợi offline + gửi lại mọi YC còn mở từ CSDL sau LOGIN_OK, client loại trùng theo mã YC | SRS chỉ xếp hàng khi server biết chi nhánh offline; tin ghi vào socket "chết" thì mất | E2: tỉ lệ mất 35,5 % → 20,1 % (SRS) → 0 %; TC-06 |
| 3 | Hàng đợi gửi có giới hạn cho từng kết nối, cắt client đọc chậm | Ghi trực tiếp: một client treo chặn broadcast tới mọi client | E3: 540/6000 → 6000/6000 tin |
| 4 | Server NIO: một Selector + worker pool + hàng đợi tuần tự theo kết nối (giữ thứ tự tin của từng chi nhánh) | Mỗi kết nối 1–2 luồng | E4: 1017 → 32 luồng ở 500 client, độ trễ tương đương, 0 tin mất |
| 5 | Nối lại kiểu "jitter lệch pha" vẫn giữ giới hạn ≤ 5 s của SRS | Nhịp cố định 5 s làm mọi client dồn cục; exponential backoff thử quá dày khi server tắt lâu | E5: đỉnh 300 → 16,4 lần thử/100 ms, nối lại TB 3,2 s → 1,9 s |
| 6 | Bộ thực nghiệm tái lập được: mỗi cải tiến có cờ bật lại baseline, một lệnh chạy hết, xuất CSV | Đo tay hoặc chỉ demo | `scripts\run-experiments.bat`, `experiments/results/*.csv` |

Ngoài ra còn các tính năng mở rộng theo SRS 7.2: tự tìm server qua UDP broadcast (A) và điều chuyển hàng giữa chi nhánh qua server làm trung gian (B).

## 9. Hạn chế

- Thực nghiệm chạy client ảo, server và CSDL trên cùng một máy qua loopback. Số liệu tuyệt đối sẽ khác trong LAN thật; điều đáng tin là so sánh tương đối giữa các biến thể.
- Mật khẩu vẫn đi trên mạng dạng rõ trong `LOGIN`. Chưa có TLS (SRS 7.2-I).
- Chỉ có một server. Cơ chế `conditional` vẫn đúng khi chạy nhiều server dùng chung CSDL, nhưng phiên, hàng đợi gửi và Selector đều nằm trong một tiến trình.
- Gửi lại theo trạng thái cho phép nhận trùng (at-least-once). Client tự loại trùng theo mã YC; protocol chưa có số thứ tự/ACK tổng quát cho mọi loại tin.
- Danh sách quá 4096 byte bị cắt bớt (HISTORY tối đa 200 phiếu), chưa có phân trang.
- `INVENTORY` chỉ còn chỗ cho khoảng 5–6 mặt hàng nữa (3358/4096 byte); quá thì server cắt bớt mặt hàng cuối. Muốn nhiều hơn phải chia trang.
- `BROADCAST` gửi cho chi nhánh "rút dây" mà server chưa phát hiện thì vẫn có thể mất, vì broadcast không thuộc trạng thái YC để gửi lại.
- Trang công ty có đăng nhập (một tài khoản, cookie HttpOnly) nhưng chạy HTTP thường trên localhost; phiên giữ trong bộ nhớ nên server khởi động lại thì phải đăng nhập lại. API `/api/experiment/*` không đòi đăng nhập khi `experiment.api=true`.

## 10. Tài liệu tham khảo

1. Oracle. *Java SE 17 API: java.nio.channels.Selector, java.net.Socket, java.net.DatagramSocket.* https://docs.oracle.com/en/java/javase/17/docs/api/
2. PostgreSQL Global Development Group. *PostgreSQL Documentation: 13.2 Transaction Isolation; SELECT … FOR UPDATE.* https://www.postgresql.org/docs/current/transaction-iso.html
3. M. Brooker. *Exponential Backoff And Jitter.* AWS Architecture Blog, 2015. https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
4. D. Kegel. *The C10K problem.* http://www.kegel.com/c10k.html
5. W. R. Stevens, B. Fenner, A. M. Rudoff. *UNIX Network Programming, Vol. 1: The Sockets Networking API*, 3rd ed. Addison-Wesley, 2003.
6. M. Kleppmann. *Designing Data-Intensive Applications*, ch. 7 (Transactions: lost updates). O'Reilly, 2017.
7. ISO/IEC/IEEE 29148:2018. *Systems and software engineering — Requirements engineering.*
