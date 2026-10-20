# Kết quả thực nghiệm

Chạy lúc 2026-10-21 00:41 trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

| Thông số | Giá trị |
|---|---|
| Hệ điều hành | Windows 11 10.0 (amd64) |
| CPU | 16 luồng logic |
| RAM | 15 GB |
| Java | 17.0.20.1 |
| CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |

## E6 – Luồng cấp hàng trọn vẹn: [500] chi nhánh cùng báo thiếu, 20 vòng mỗi chi nhánh

Mỗi vòng: chi nhánh bán xuống dưới ngưỡng → tự gửi LOW_STOCK → bot admin nhận cảnh báo qua SSE → bấm "Gửi hàng" (kho tổng hết thì "Báo hết hàng") → chi nhánh nhận DELIVERED và gửi RECEIVED (hoặc nhận OUT_OF_STOCK và gửi REJECT) → admin thấy trạng thái "Đã nhận"/"Từ chối" qua SSE. Kho tổng chỉ đủ 80% số lần gửi để luôn có nhánh báo hết hàng. Vòng đầu mọi chi nhánh bán cùng lúc.

| Số CN | Cảnh báo (kỳ vọng) | Gửi hàng | Báo hết hàng | CN nhận DELIVERED | CN nhận OUT_OF_STOCK | Mất tin | Trùng | Lỗi | Mất kết nối | Kho tổng đúng (không bán vượt) | YC còn treo | Thời gian (s) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 500 | 10000 (10000) | 8000 | 2000 | 8000 | 2000 | 0 | 0 | 0 | 0 | Đúng (xuất 80000 + còn 0 = 80000) | 0 | 14.2 |

Độ trễ (ms, TB / p95 / max):

| Số CN | SALE → SALE_OK | LOW_STOCK → admin thấy cảnh báo | HTTP gửi hàng | Admin bấm → CN nhận tin | CN bấm nhận → admin thấy "Đã nhận" | Trọn vòng | Luồng server (đỉnh) | Heap (MB, đỉnh) |
|---:|---|---|---|---|---|---|---:|---:|
| 500 | 85.5 / 336.8 / 983.3 | 282.5 / 483.3 / 1230.4 | 35.3 / 91.4 / 513.0 | 25.4 / 72.8 / 445.4 | 295.5 / 593.9 / 1170.8 | 627.2 / 1024.1 / 1784.3 | 65 | 152.3 |

"Mất tin": chi nhánh không nhận được DELIVERED/OUT_OF_STOCK trong 30 s, hoặc admin không thấy trạng thái cuối trong 10 s. "Trọn vòng": từ lúc chi nhánh gửi LOW_STOCK tới lúc admin thấy "Đã nhận"/"Từ chối", gồm cả thời gian bot admin phản ứng. Mọi thời điểm đo bằng cùng một đồng hồ (System.nanoTime trong tiến trình giả lập).

