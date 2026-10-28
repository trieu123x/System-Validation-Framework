# Cập nhật nội dung ngày 28/10/2026

- Đã bỏ khối quy trình nghiệp vụ và các ghi chú demo, trích dẫn, nguồn ảnh khỏi giao diện.
- Đã cập nhật metadata, ảnh chia sẻ PNG/SVG và cấu hình URL mặc định trống.
- `npm run data:check`: đạt; dữ liệu sản phẩm, danh mục và chi nhánh giữ nguyên.
- Kiểm tra cú pháp TS/TSX, import nội bộ, liên kết neo và nội dung giao diện: đạt.
- `node --check scripts/verify-browser.mjs`: đạt.
- Chưa chạy build, lint, browser QA hoặc Lighthouse cho bản này: `npm ci` bị HTTP 403 khi tải thư viện từ npm.
- Các báo cáo và ảnh chụp bên dưới thuộc bản cũ, không xác nhận giao diện sau chỉnh sửa này.

---

# Biên bản kiểm tra landing TOBOKI

Kiểm tra trên **bản build production**, phục vụ bằng Vite Preview tại
`http://127.0.0.1:4173/`. Đây là kết quả đo cục bộ của landing, không phải số liệu
kiểm thử tầng TCP hoặc bản deploy Internet của hệ thống phân phối.

## Môi trường và thời điểm

- Ngày kiểm tra: **25/10/2026**, múi giờ **Asia/Saigon (UTC+7)**.
- Browser QA bắt đầu: **01:07:26**, tương ứng `2026-10-24T18:07:26.956Z` trong file gốc.
- Lighthouse mobile: **01:07:47**, tương ứng `2026-10-24T18:07:47.318Z`.
- Lighthouse desktop: **01:07:58**, tương ứng `2026-10-24T18:07:58.878Z`.
- Windows x64, OS release `10.0.26200`; AMD Ryzen 7 7435HS, 16 CPU logic, khoảng 16 GB RAM.
- Node.js `v24.22.1`; Chrome `155.0.8059.85`, chạy headless; Lighthouse `13.5.0`.
- Không tải browser riêng; dùng Chrome đã cài. Các công cụ QA nằm trong
  `artifacts/tooling/`, được bỏ qua bởi Git, không thêm vào dependency của ứng dụng.

## Kiểm tra trình duyệt

**91/91 kiểm tra đạt**, không có JavaScript/page error, browser console error hoặc
request lỗi được ghi nhận trong lượt kiểm tra cuối.

| Viewport | Chiều rộng nội dung | Cuộn ngang | Ảnh tải thành công | Ảnh lỗi/dự phòng | Thiếu alt |
|---|---:|---|---:|---:|---:|
| Desktop 1440 × 1000 | 1440 px | Không | 20 | 0 | 0 |
| Tablet 768 × 1024 | 768 px | Không | 20 | 0 | 0 |
| Mobile 360 × 800 | 360 px | Không | 20 | 0 | 0 |

Các kích thước trên là viewport mô phỏng trong Chrome; chưa thử trên điện thoại vật lý.
20 ảnh được quan sát gồm ảnh hero, danh mục và 12 sản phẩm nổi bật sau khi cuộn trang
để kích hoạt lazy-load. Con số này không có nghĩa đã kiểm tra ảnh của toàn bộ 31 mặt hàng.

Các hành vi đã kiểm tra:

- Trang trả HTTP 200; ngôn ngữ `vi`, title TOBOKI và một heading H1.
- Mặc định có 12 sản phẩm nổi bật; nút mở rộng hiển thị đủ 31; đặt lại trở về 12.
- Cả 10 bộ lọc danh mục trả đúng số lượng và đúng mã danh mục theo JSON.
- Khối danh mục có 7 nhóm chủ lực; 3 nhóm mới được giới thiệu riêng.
- Nhấn thẻ danh mục lọc sản phẩm và chuyển focus đến heading sản phẩm.
- Có đủ 15 chi nhánh; không đưa chi nhánh ảo SIM vào trang giới thiệu.
- Menu tablet/mobile mở và đóng đúng trạng thái `aria-expanded`; Escape đóng menu
  và trả focus về nút menu.
- Liên kết bỏ qua điều hướng được kích hoạt bằng bàn phím và chuyển focus tới nội dung chính.
- Các liên kết không chứa URL scheme `javascript:` hoặc `data:`.
- Mục ghi công ảnh mở/đóng được và chứa danh sách tác giả, nguồn, giấy phép.
- Các hộp ảnh sản phẩm giữ đúng tỷ lệ ở cả ba kích thước; không giãn theo ảnh nguồn dọc.
- Bộ trình chiếu hero bắt đầu ở TB01 với bộ đếm `01 / 31` ở cả ba viewport.
- Nút tiếp chuyển TB01 → TB02, nút trước chuyển về TB01; đi ngược từ đầu tới TB31,
  đi tiếp từ cuối về TB01. Bộ đếm, tên, model, danh mục, ảnh, alt và liên kết nguồn
  ảnh đều khớp mặt hàng đang hiển thị.
- Enter kích hoạt nút tiếp; ArrowLeft và ArrowRight chuyển slide khi focus ở nút điều khiển.
  Chuyển slide giữ focus trên nút, không thay scroll, hash, bộ lọc đang chọn hoặc danh sách sản phẩm.
- TB26/TB27 không có model: caption hiển thị tên sản phẩm thay thế.
- Mô phỏng lỗi ảnh trên một slide cho thấy fallback có tên truy cập; chuyển slide tiếp theo
  khôi phục ảnh của sản phẩm mới, không giữ trạng thái lỗi của ảnh cũ.
- Sau chuỗi kiểm tra, carousel trở lại TB01. Ảnh chụp toàn trang ghi lại trạng thái ban đầu TB01.

Script chờ ảnh hiện tại tải và decode trước các lần chuyển slide. Request ảnh bị hủy hợp lệ
khi thay slide, nếu có, được lưu riêng trong `cancelledImageRequests`; lượt cuối ghi nhận **0**.

File gốc: [qa/browser-checks.json](qa/browser-checks.json).

Ảnh chụp toàn trang trong lượt cuối:

- [Desktop 1440 px](screenshots/desktop-1440.png)
- [Tablet 768 px](screenshots/tablet-768.png)
- [Mobile 360 px](screenshots/mobile-360.png)

Ảnh Open Graph được render từ SVG trong repo: `public/social-preview.png`,
kích thước **1200 × 630 px**. Đây là tài nguyên tĩnh của landing.

## Lighthouse trên bản build

| Profile | Performance | Accessibility | LCP | CLS |
|---|---:|---:|---:|---:|
| Mobile | **100** | **100** | 1,4 s | 0 |
| Desktop tùy chỉnh | **99** | **100** | 0,9 s | 0 |

Cả hai profile đạt ngưỡng Performance và Accessibility **≥ 90** theo bản giao việc.
Không có accessibility audit thất bại trong `failedAccessibilityAudits` của lượt cuối.

Điều kiện mô phỏng được lưu nguyên trong `configSettings` của các report JSON:

- **Mobile:** Lighthouse mặc định, viewport 412 × 823, device scale 1,75,
  CPU slowdown 4×; simulated RTT 150 ms và throughput 1638,4 Kbps.
- **Desktop tùy chỉnh:** viewport 1440 × 900, device scale 1,
  CPU slowdown 1×; simulated RTT 40 ms và throughput 10240 Kbps.
- Mỗi profile dùng phiên Chrome mới; đo trang cục bộ, có tải ảnh từ Cloudinary.
  Mô phỏng throttling không biến kết quả này thành phép đo từ điện thoại hoặc Internet thật.

Giữ kết quả của lượt kiểm tra cuối tương ứng source đã sửa; không lấy điểm cao nhất
từ các lượt trước. Điểm có thể thay đổi theo máy, độ trễ CDN và điều kiện chạy lại.
Accessibility 100 là kết quả kiểm tra tự động, không thay thế đánh giá thủ công đầy đủ.

Minh chứng:

- [Bảng tổng hợp JSON](lighthouse/summary.json)
- [Mobile HTML](lighthouse/mobile.report.html) · [Mobile JSON](lighthouse/mobile.report.json)
- [Desktop HTML](lighthouse/desktop.report.html) · [Desktop JSON](lighthouse/desktop.report.json)

## Kiểm tra source và build

Các bước liên quan đã chạy thành công trước lượt kiểm tra trình duyệt cuối:

- `npm run data:check`: JSON khớp dữ liệu SQL, gồm 31 mặt hàng, 10 danh mục,
  15 chi nhánh và nguồn/giấy phép ảnh. Có 7 danh mục ban đầu và 3 nhóm hàng mới;
  trang trình bày rõ khác biệt này thay vì ghi sai tổng danh mục là 7.
- `npm run build`: TypeScript và Vite build thành công, tạo `landing/dist/`.
- Ảnh Open Graph PNG được đưa vào bản build; metadata tiếng Việt, favicon,
  title, description và thông tin chia sẻ được khai báo trong trang.

Tham khảo [README của landing](../README.md) để cài tooling và chạy lại đúng thứ tự:
build, mở production preview, rồi `npm run verify` ở terminal khác.
Nếu thay nội dung hoặc CSS, cần build lại trước khi chạy lại QA.

## Phần cần kiểm tra khi Lâm ghép bản deploy

- Chưa có URL triển khai công khai để đo. Lượt này **không xác nhận** HTTPS, Caddy,
  đăng nhập hoặc hành vi server/client trên máy chủ của Lâm.
- Đặt `VITE_ADMIN_URL`, `VITE_BRANCH_URL` và `VITE_SITE_URL` theo URL thật **trước khi build**;
  biến môi trường Vite được đưa vào file tĩnh lúc build, không tự đổi sau khi chép `dist` lên host.
- Bản thử local sử dụng các liên kết localhost; trước khi bàn giao công khai phải thay bằng URL deploy.
- Kiểm tra lại các liên kết, canonical và URL Open Graph tuyệt đối sau khi deploy.
- Kiểm tra ảnh qua mạng điện thoại và chạy lại Lighthouse trên URL công khai;
  độ trễ và cache CDN có thể khác môi trường local.
- Kiểm tra thêm bằng điện thoại vật lý. Các ảnh chụp hiện tại là viewport Chrome mô phỏng.
- Landing không gửi form hoặc gọi API nghiệp vụ. Ảnh minh họa lấy từ Cloudinary;
  các liên kết ghi công dẫn tới Wikimedia Commons và trang giấy phép.

Biên bản này chỉ ghi các kiểm tra đã thực hiện và giới hạn hiện tại; không thay thế
biên bản kiểm thử chức năng/tải qua Internet thuộc phần việc của Đạt.

## Phiên bản được kiểm tra

Các ảnh chụp, 91 kiểm tra trình duyệt và hai Lighthouse report được liên kết ở trên
đều thuộc lượt kiểm tra **sau cập nhật carousel 31 sản phẩm**, không dùng lại kết quả
của phiên bản hero tĩnh trước đó. Bản build đã chạy thành công trước khi kiểm tra.
