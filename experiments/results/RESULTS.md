# Kết quả thực nghiệm

Chạy lúc 2026-10-20 20:50 trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

| Thông số | Giá trị |
|---|---|
| Hệ điều hành | Windows 11 10.0 (amd64) |
| CPU | 16 luồng logic |
| RAM | 15 GB |
| Java | 17.0.20.1 |
| CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |

## E1 – Tranh chấp kho tổng (50 chi nhánh cùng ACCEPT 8, kho tổng 200, 5 lần lặp)

| Chiến lược | Số DELIVERED (kỳ vọng 25) | Tổng xuất | Bán vượt kho | Lần vi phạm bất biến | ACCEPT TB (ms) | ACCEPT p95 (ms) | Thời gian xong cả loạt (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| CHECK_THEN_ACT | 50.0 | 400.0 | 200.0 | 5/5 | 46.63 | 96.82 | 78.09 |
| SYNCHRONIZED | 25.0 | 200.0 | 0.0 | 0/5 | 57.46 | 107.60 | 109.46 |
| CONDITIONAL | 25.0 | 200.0 | 0.0 | 0/5 | 18.60 | 29.60 | 31.37 |

Các cột là trung bình mỗi lần lặp. Bất biến: tổng xuất + tồn cuối = tồn đầu, và tổng xuất ≤ tồn đầu.

## E2 – Giao tin push khi mất kết nối (30 chi nhánh, 60 giây, ~10 OFFER/giây, mỗi chi nhánh online 3–8 s rồi mất mạng 2–5 s)

| Chế độ giao tin | OFFER đã gửi | Chi nhánh nhận được | Mất | Tỉ lệ mất | Nhận trùng | Độ trễ nhận TB (ms) | Độ trễ nhận p95 (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| NONE | 321 | 207 | 114 | 35.5% | 0 | 0.00 | 0.00 |
| QUEUE | 399 | 319 | 80 | 20.1% | 0 | 299.39 | 2394.00 |
| QUEUE_RESYNC | 541 | 541 | 0 | 0.0% | 0 | 657.51 | 3224.00 |

Mất kết nối gồm hai loại xen kẽ: đóng socket (server biết ngay CN offline) và "rút dây" (socket vẫn mở, mọi byte tới client bị mất, server không biết). Chi nhánh nhận OFFER thì REJECT ngay để đóng YC. Sau khi hết giờ, mọi chi nhánh nối lại và chờ thêm 8 giây trước khi đếm.

Độ trễ nhận tính từ lúc API gửi OFFER trả về tới lúc chi nhánh nhận; tin giao ngay thường tới trước khi API trả về nên được tính là 0 ms. Ở NONE chỉ có tin giao ngay (tin của CN mất mạng thì mất luôn), ở QUEUE/QUEUE_RESYNC có thêm tin được giao sau khi CN nối lại.

_E2 được chạy lại riêng sau khi sửa cách đo độ trễ (bản đầu bỏ sót các tin tới ngay); số mất tin của hai lần chạy nhất quán (34,2/15,8/0 % và 35,5/20,1/0 %)._

## E3 – Client chậm khi broadcast (20 chi nhánh bình thường + 1 chi nhánh treo, 300 broadcast × 3000 byte)

| Server | Broadcast hoàn tất | Lần gọi lâu nhất (ms) | Tin tới CN bình thường | Độ trễ p50 (ms) | Độ trễ p95 (ms) | Độ trễ max (ms) | CN treo bị cắt |
|---|---:|---:|---:|---:|---:|---:|---|
| BIO + ghi trực tiếp (baseline) | 26/300 | 5016.44 | 540/6000 | 3.00 | 10.00 | 26.00 | không |
| BIO + hàng đợi gửi | 300/300 | 40.98 | 6000/6000 | 1.00 | 3.00 | 22.00 | có |
| NIO + hàng đợi gửi | 300/300 | 48.39 | 6000/6000 | 1.00 | 3.00 | 18.00 | có |

CN treo đặt bộ đệm nhận 4 KB và ngừng đọc socket sau khi đăng nhập. Mỗi lần gọi broadcast chờ tối đa 5 giây; bị treo thì dừng gửi. Hàng đợi gửi giới hạn 256 tin/kết nối.

## E4 – Khả năng mở rộng BIO và NIO (mỗi chi nhánh 1 SALE/giây trong 30 giây)

| Server | Số client | Tin gửi | Mất | Thông lượng (tin/s) | Độ trễ TB (ms) | p95 (ms) | p99 (ms) | Max (ms) | Luồng server (đỉnh) | Heap server (MB, đỉnh) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BIO | 50 | 1500 | 0 | 48.4 | 1.37 | 1.82 | 2.06 | 9.57 | 117 | 33.8 |
| BIO | 200 | 5997 | 0 | 193.5 | 1.12 | 1.62 | 1.98 | 5.52 | 416 | 88.9 |
| BIO | 500 | 14992 | 0 | 483.6 | 0.95 | 1.26 | 1.49 | 36.34 | 1017 | 145.5 |
| NIO | 50 | 1499 | 0 | 48.4 | 1.65 | 2.21 | 2.60 | 6.94 | 33 | 34.6 |
| NIO | 200 | 6000 | 0 | 193.6 | 1.21 | 1.73 | 2.10 | 4.60 | 33 | 123.1 |
| NIO | 500 | 14986 | 0 | 483.5 | 1.01 | 1.34 | 1.56 | 27.06 | 32 | 149.0 |

Độ trễ đo từ lúc gửi SALE tới khi nhận SALE_OK (gồm một transaction CSDL). "Mất" = không có trả lời trong 5 giây. Luồng server: số luồng JVM của server.jar (ThreadMXBean, đỉnh trong lần chạy).

## E5 – Kết nối lại hàng loạt (300 chi nhánh; server bị tắt đột ngột rồi bật lại sau 6–10 giây ngẫu nhiên; 5 lần mỗi chính sách)

| Chính sách | Đã nối lại | Thời gian nối lại TB (ms) | p95 (ms) | Max (ms) | Lần thử / client | Đỉnh lần thử / 100 ms |
|---|---:|---:|---:|---:|---:|---:|
| Cố định 5 s (baseline SRS) | 1500/1500 | 3223.92 | 4854.00 | 4874.00 | 2.40 | 300.0 |
| Exponential backoff + full jitter | 1500/1500 | 1668.74 | 3884.00 | 4891.00 | 6.76 | 92.0 |
| Jitter lệch pha (đề xuất) | 1500/1500 | 1922.32 | 3995.00 | 4982.00 | 3.31 | 16.4 |

Thời gian nối lại tính từ lúc cổng TCP của server mới bắt đầu lắng nghe tới khi chi nhánh nhận LOGIN_OK. Cả ba chính sách chờ tối đa 5 giây giữa hai lần thử (FR-05). Đỉnh lần thử là số lần kết nối rơi vào cùng một khung 100 ms, trung bình qua các lần lặp.

