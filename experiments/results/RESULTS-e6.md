# Kết quả thực nghiệm

Chạy lúc 2026-10-21 00:29 trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

| Thông số | Giá trị |
|---|---|
| Hệ điều hành | Windows 11 10.0 (amd64) |
| CPU | 16 luồng logic |
| RAM | 15 GB |
| Java | 17.0.20.1 |
| CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |

## E6 – Luồng cấp hàng trọn vẹn: [50, 100] chi nhánh cùng báo thiếu, 5 vòng mỗi chi nhánh

Mỗi vòng: chi nhánh bán xuống dưới ngưỡng → tự gửi LOW_STOCK → bot admin nhận cảnh báo qua SSE → bấm "Gửi hàng" (kho tổng hết thì "Báo hết hàng") → chi nhánh nhận DELIVERED và gửi RECEIVED (hoặc nhận OUT_OF_STOCK và gửi REJECT) → admin thấy trạng thái "Đã nhận"/"Từ chối" qua SSE. Kho tổng chỉ đủ 80% số lần gửi để luôn có nhánh báo hết hàng. Vòng đầu mọi chi nhánh bán cùng lúc.

| Số CN | Cảnh báo (kỳ vọng) | Gửi hàng | Báo hết hàng | CN nhận DELIVERED | CN nhận OUT_OF_STOCK | Mất tin | Trùng | Lỗi | Mất kết nối | Kho tổng đúng (không bán vượt) | YC còn treo | Thời gian (s) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 50 | 250 (250) | 200 | 50 | 200 | 50 | 0 | 0 | 0 | 0 | Đúng (xuất 2000 + còn 0 = 2000) | 0 | 0.9 |
| 100 | 500 (500) | 400 | 100 | 400 | 100 | 0 | 0 | 0 | 0 | Đúng (xuất 4000 + còn 0 = 4000) | 0 | 1.4 |

Độ trễ (ms, TB / p95 / max):

| Số CN | SALE → SALE_OK | LOW_STOCK → admin thấy cảnh báo | HTTP gửi hàng | Admin bấm → CN nhận tin | CN bấm nhận → admin thấy "Đã nhận" | Trọn vòng | Luồng server (đỉnh) | Heap (MB, đỉnh) |
|---:|---|---|---|---|---|---|---:|---:|
| 50 | 17.2 / 38.8 / 51.2 | 26.8 / 106.3 / 137.5 | 26.3 / 44.7 / 105.5 | 16.3 / 39.1 / 75.6 | 12.7 / 32.6 / 68.2 | 146.8 / 256.1 / 297.8 | 40 | 18.0 |
| 100 | 9.2 / 32.1 / 40.7 | 15.7 / 50.7 / 79.4 | 24.0 / 45.9 / 282.6 | 19.1 / 39.2 / 344.8 | 10.1 / 24.2 / 67.0 | 250.4 / 329.1 / 606.1 | 41 | 76.5 |

"Mất tin": chi nhánh không nhận được DELIVERED/OUT_OF_STOCK trong 30 s, hoặc admin không thấy trạng thái cuối trong 10 s. "Trọn vòng": từ lúc chi nhánh gửi LOW_STOCK tới lúc admin thấy "Đã nhận"/"Từ chối", gồm cả thời gian bot admin phản ứng. Mọi thời điểm đo bằng cùng một đồng hồ (System.nanoTime trong tiến trình giả lập).

