# Kết quả thực nghiệm

Chạy lúc 2026-10-21 00:56 trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

| Thông số | Giá trị |
|---|---|
| Hệ điều hành | Windows 11 10.0 (amd64) |
| CPU | 16 luồng logic |
| RAM | 15 GB |
| Java | 17.0.20.1 |
| CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |

## E6 – Luồng cấp hàng trọn vẹn: [1000] chi nhánh cùng báo thiếu, 20 vòng mỗi chi nhánh

Mỗi vòng: chi nhánh bán xuống dưới ngưỡng → tự gửi LOW_STOCK → bot admin nhận cảnh báo qua SSE → bấm "Gửi hàng" (kho tổng hết thì "Báo hết hàng") → chi nhánh nhận DELIVERED và gửi RECEIVED (hoặc nhận OUT_OF_STOCK và gửi REJECT) → admin thấy trạng thái "Đã nhận"/"Từ chối" qua SSE. Kho tổng chỉ đủ 80% số lần gửi để luôn có nhánh báo hết hàng. Vòng đầu mọi chi nhánh bán cùng lúc.

| Số CN | Cảnh báo (kỳ vọng) | Gửi hàng | Báo hết hàng | CN nhận DELIVERED | CN nhận OUT_OF_STOCK | Mất tin | Trùng | Lỗi | Mất kết nối | Kho tổng đúng (không bán vượt) | YC còn treo | Thời gian (s) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 1000 | 20000 (20000) | 16000 | 4000 | 16000 | 4000 | 0 | 0 | 0 | 0 | Đúng (xuất 160000 + còn 0 = 160000) | 0 | 25.1 |

Độ trễ (ms, TB / p95 / max):

| Số CN | SALE → SALE_OK | LOW_STOCK → admin thấy cảnh báo | HTTP gửi hàng | Admin bấm → CN nhận tin | CN bấm nhận → admin thấy "Đã nhận" | Trọn vòng | Luồng server (đỉnh) | Heap (MB, đỉnh) |
|---:|---|---|---|---|---|---|---:|---:|
| 1000 | 23.3 / 164.9 / 853.8 | 42.1 / 219.6 / 1050.4 | 10.9 / 26.3 / 226.8 | 8.1 / 20.5 / 219.6 | 13.3 / 7.1 / 1015.1 | 1210.0 / 1869.2 / 2988.5 | 41 | 158.2 |

"Mất tin": chi nhánh không nhận được DELIVERED/OUT_OF_STOCK trong 30 s, hoặc admin không thấy trạng thái cuối trong 10 s. "Trọn vòng": từ lúc chi nhánh gửi LOW_STOCK tới lúc admin thấy "Đã nhận"/"Từ chối", gồm cả thời gian bot admin phản ứng. Mọi thời điểm đo bằng cùng một đồng hồ (System.nanoTime trong tiến trình giả lập).

