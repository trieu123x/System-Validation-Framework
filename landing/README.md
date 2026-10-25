# Landing TOBOKI — phần bàn giao của Minh

Trang giới thiệu bằng Vite + React + TypeScript + Tailwind CSS, nằm độc lập với `ui/`.
Frontend tĩnh, không gọi API backend, không có form đặt hàng/thu thập thông tin.
Ảnh được tải từ Cloudinary; các liên kết hệ thống mở trang công ty hoặc chi nhánh.

## 1. Chạy trên máy

Dùng Node.js LTS đáp ứng yêu cầu Vite: Node 20.19+ hoặc 22.12+ (máy phát triển hiện dùng Node 24).
Mở terminal ở thư mục gốc repo:

```powershell
cd landing
npm ci
# Chỉ copy nếu chưa có .env.local; giữ cấu hình cá nhân nếu file đã tồn tại.
Copy-Item .env.example .env.local
npm run dev
```

Mở URL Vite in ra, thường là http://localhost:5173/.
Không cần chạy Java/PostgreSQL để xem landing. Muốn thử nút đăng nhập local thì chạy hệ thống Docker của repo.
Nếu `npm` bị PowerShell chặn script, dùng `npm.cmd` thay cho `npm`.

## 2. Cấu hình trước khi build

| Biến | Ý nghĩa | Local |
|---|---|---|
| `VITE_ADMIN_URL` | URL đầy đủ của trang công ty | `http://localhost:8080/admin/` |
| `VITE_BRANCH_URL` | URL đầy đủ của một trang chi nhánh | `http://localhost:8081/branch/` |
| `VITE_SITE_URL` | URL gốc landing sau deploy, tạo canonical/ảnh Open Graph tuyệt đối | Để trống |

Lâm thay URL local bằng các URL HTTPS thực tế trong `.env.local` hoặc biến môi trường của tiến trình build.
Các biến `VITE_*` là thông tin công khai và được chốt vào file JavaScript/HTML **lúc build**.
Đổi URL sau đó phải build lại; đổi trong development thì khởi động lại Vite.
Link công ty/chi nhánh không hiển thị nếu biến tương ứng trống hoặc không phải URL HTTP(S).
Không đặt mật khẩu, token hoặc khóa SSH vào biến Vite. Không commit file `.env.local`.

Landing hiện thiết kế phục vụ tại đường dẫn gốc `/`, như phương án Caddy của nhóm.
`VITE_SITE_URL` nên là URL gốc có dấu `/` cuối, ví dụ `https://demo.example.org/`.
Khi có biến này, HTML build có canonical, `og:url` và `og:image` tuyệt đối.
Khi chưa có tên miền, giữ ảnh OG tương đối `/social-preview.png`; metadata công khai cần nghiệm thu lại sau deploy.

## 3. Dữ liệu và nội dung

- 31 mặt hàng TB01–TB31, dùng đúng **giá bán lẻ** trong SQL.
- Mặc định hiển thị 12 sản phẩm nổi bật; có thể lọc cả danh mục và mở rộng xem đủ 31 sản phẩm.
- Khối ảnh hero là bộ trình chiếu đủ 31 sản phẩm, bắt đầu ở TB01. Bộ đếm `01 / 31`
  là vị trí hiện tại trên tổng số sản phẩm. Nút trước/sau hoặc phím mũi tên khi focus
  trên nút đổi sản phẩm; cuối danh sách quay về đầu, không đổi bộ lọc ở phần bên dưới.
- 7 danh mục chủ lực DM01–DM07; dữ liệu mới có thêm DM08–DM10.
  Trang phân biệt **7 chủ lực + 3 nhóm mới**, không ghi nhầm toàn bộ dữ liệu chỉ có 7 danh mục.
- 15 chi nhánh CN01–CN15; không đưa chi nhánh ảo SIM vào landing.
- Thông tin liên hệ từ `ui/lib/company.ts`; dữ liệu chi nhánh và chính sách phân phối phục vụ demo.
- Model/giá của TB29–TB31 là giả định theo ghi chú seed.
- Ảnh Wikimedia là ảnh minh họa, có thể khác hãng/model. Không dùng chúng để cam kết đặc tính thật.
- Footer ghi rõ “Trang demo cho bài tập lớn môn Lập trình mạng”.

Nguồn trích:

| Nguồn trong repo | Dữ liệu |
|---|---|
| `db/seed.sql` | TB01–TB28, 7 danh mục, CN01–CN03 |
| `db/seed_hang_moi.sql` | TB29–TB31, 3 danh mục mới |
| `db/seed_demo.sql` | CN04–CN15 |
| `db/seed_images.sql` | URL ảnh Cloudinary |
| `scripts/images/credits.json` | Tác giả, nguồn Wikimedia, giấy phép |
| `ui/lib/company.ts` | Công ty, địa chỉ, hotline, MST |

Dữ liệu đã xuất thành JSON trong `src/data/`, không cần database khi chạy landing.
Cập nhật lại JSON sau khi SQL thay đổi bằng:

```powershell
npm run data:sync
npm run data:check
```

`data:check` kiểm tra JSON khớp SQL, số lượng, liên kết danh mục, URL ảnh và ghi công.
Hai lệnh này cần các file nguồn ở repo cha; không cần khi chỉ phục vụ bản `dist`.
Không chạy các script seed SQL chỉ để cập nhật landing.

## 4. Build và bàn giao cho Lâm

```powershell
npm run data:check
npm run build
npm run preview
```

Build gồm TypeScript kiểm tra kiểu và Vite tạo HTML/CSS/JS tĩnh vào `dist/`.
`preview` dùng để nghiệm thu trên máy, không phải web server production.

Bàn giao toàn bộ nội dung `landing/dist/`, giữ nguyên cấu trúc `assets/`, ảnh OG và favicon.
Lâm phục vụ bằng web server/Caddy, không cần Node trên host để chạy bản tĩnh.
URL hệ thống đúng là điều kiện để nút đăng nhập hoạt động; landing không triển khai server Java thay Lâm.

Ví dụ tạo gói build sau khi đã cấu hình URL:

```powershell
Compress-Archive -Path .\dist\* -DestinationPath .\artifacts\toboki-landing-dist.zip -Force
```

`dist/`, ZIP và `node_modules/` được ignore. Bàn giao build riêng hoặc tạo lại từ source cùng `package-lock.json`.
Không cần sửa Dockerfile, `docker-compose.yml` hay `ui/` cho phần việc này.

Thành phần bàn giao:

- Mã nguồn `landing/` trên nhánh `landing`.
- `dist/` hoặc `artifacts/toboki-landing-dist.zip`.
- README này và `.env.example`.
- Ảnh desktop/mobile trong `artifacts/screenshots/`.
- Kết quả kiểm tra thực tế trong `artifacts/VALIDATION.md` và báo cáo Lighthouse liên quan.

## 5. Cách đọc code để bảo vệ

| File | Giải thích |
|---|---|
| `src/App.tsx` | Ghép các section, giữ danh mục đang chọn |
| `src/components/Header.tsx` | Menu responsive; Escape đóng menu và trả focus |
| `src/components/Hero.tsx` | Tiêu đề, hai CTA và bộ trình chiếu 31 sản phẩm; nút trước/sau cập nhật ảnh, tên, model, nguồn ảnh và bộ đếm |
| `src/components/Categories.tsx` | 7 thẻ danh mục chính và 3 nhóm mới |
| `src/components/ProductCatalog.tsx` | Lọc dữ liệu tại trình duyệt, xem thêm/thu gọn |
| `src/components/ProductCard.tsx` | Tên, model, định dạng tiền Việt, nguồn ảnh |
| `src/components/ProductImage.tsx` | Ảnh responsive Cloudinary, lazy-load, alt và fallback |
| `src/components/Distribution.tsx` | Quy mô dữ liệu và luồng báo thiếu → điều phối → xác nhận |
| `src/components/Branches.tsx` | Danh sách 15 chi nhánh |
| `src/components/Footer.tsx` | Liên hệ mẫu, demo disclaimer và đầy đủ ghi công ảnh |
| `src/lib/catalog.ts` | Danh sách nổi bật, format giá, biến URL và link giấy phép |
| `src/index.css` | Tailwind, bố cục desktop/mobile, focus và reduced-motion |
| `scripts/extract-data.mjs` | Trích SQL sang JSON có kiểm tra nguồn |
| `vite.config.ts` | React + Tailwind plugin, metadata theo URL deploy |

React render JSON thành giao diện. Bộ lọc chỉ thay đổi state và chọn phần tử trong mảng.
Vite dùng cho phát triển và đóng gói; Tailwind được biên dịch thành CSS. Sau build, trình duyệt tải file tĩnh.
Ảnh được gắn kích thước, dùng `srcSet`, tối ưu qua Cloudinary và tải trì hoãn; ảnh hero ưu tiên tải sớm.
Các icon và ảnh chia sẻ thương hiệu được dựng bằng SVG trong repo, không cần thư viện UI nặng.

## 6. Ghi công ảnh

Xem khối “Ghi công ảnh” ở footer hoặc `src/data/image-credits.json`.
Mỗi ảnh có tác giả, link trang nguồn và giấy phép; source `scripts/images/credits.json` được giữ nguyên.
Ảnh đã được chuyển WebP/thu nhỏ theo pipeline có sẵn của repo, không khẳng định là ảnh chụp sản phẩm TOBOKI.
`public/social-preview.svg` là bản vector gốc của ảnh chia sẻ `public/social-preview.png`.

## 7. Nghiệm thu

Mốc giao việc của Minh: 22:00 ngày 27/10/2026.
Kết quả build/browser/Lighthouse và giới hạn kiểm tra ghi trong `artifacts/VALIDATION.md`.
Không suy ra điểm Lighthouse từ việc build thành công; cần đo trên bản build thật.
Kiểm tra lại sau khi Lâm thay tên miền: nút đăng nhập, HTTPS, ảnh và metadata chia sẻ.

### Chạy lại kiểm tra tự động

Công cụ QA cài riêng, không đưa vào dependencies của landing và không đi vào bản build:

```powershell
npm install --prefix artifacts/tooling --no-audit --no-fund playwright-core lighthouse
npm run preview -- --host 127.0.0.1 --port 4173
```

Giữ terminal preview chạy; mở terminal thứ hai trong `landing/`:

```powershell
npm run verify
```

Mặc định dùng Chrome tại `C:/Program Files/Google/Chrome/Application/chrome.exe`.
Có thể đặt biến `CHROME_PATH` để chỉ tới Chrome khác và `QA_URL` để đổi địa chỉ preview.
Kiểm tra chạy headless với profile riêng, không dùng tài khoản/cookie Chrome cá nhân.
Trên môi trường hạn chế, cần quyền chạy Chrome và truy cập mạng để tải ảnh.

- `scripts/verify-browser.mjs`: kiểm tra responsive, ảnh, menu, bàn phím, lọc và console; chụp 3 viewport và render ảnh Open Graph PNG từ SVG gốc.
- `scripts/audit-lighthouse.mjs`: tạo báo cáo HTML/JSON cho mobile và desktop, trả lỗi nếu Performance hoặc Accessibility dưới 90.
- `scripts/verify-landing.mjs`: chạy lần lượt hai bước trên, không chạy song song để tránh ảnh hưởng phép đo.

Sau khi sửa SVG ảnh chia sẻ, chạy kiểm tra để tạo lại PNG rồi build lại để PNG được chép vào `dist/`.
Điểm Lighthouse phụ thuộc máy và mạng; các báo cáo đính kèm là kết quả lần đo local cụ thể.
Cũng có thể đo bằng tab Lighthouse trong Chrome DevTools trên URL `npm run preview` phục vụ,
theo [hướng dẫn Chrome](https://developer.chrome.com/docs/lighthouse/overview).

## 8. Gửi mã nguồn và pull request

Từ thư mục gốc repo, sau khi đã xem lại thay đổi:

```powershell
git status
git add landing
git commit -m "feat: add Toboki landing page"
git push -u origin landing
```

Trên GitHub, mở pull request từ `landing` vào nhánh nhóm thống nhất (bản giao việc ghi `main`).
Đính kèm ảnh desktop/mobile và kết quả trong `artifacts/VALIDATION.md`.
Gửi ZIP bản build riêng cho Lâm; file ZIP/dist và cấu hình local không được `git add landing` đưa vào commit.
Các lệnh này là hướng dẫn bàn giao, không phải bước của `npm run build`.
