# Kết quả thực nghiệm

Chạy lúc 2026-10-23 01:01 trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

| Thông số | Giá trị |
|---|---|
| Hệ điều hành | Windows 11 10.0 (amd64) |
| CPU | 16 luồng logic |
| RAM | 15 GB |
| Java | 17.0.20.1 |
| CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |

## E9 – Server broadcast tới n chi nhánh (100 broadcast × 256 byte, cách nhau 50 ms)

Một nguồn (server) gửi cùng một tin tới mọi chi nhánh đang online. Độ trễ tính từ lúc gọi API broadcast tới lúc chi nhánh đọc xong dòng tin; "tới CN cuối" là lúc chi nhánh cuối cùng nhận được một broadcast; "vòng gửi" là thời gian luồng gọi broadcast trên server bị giữ.

| Server | Số CN | Tin nhận / kỳ vọng | Mất | Độ trễ p50 (ms) | p95 | p99 | Max | Tới CN cuối TB (ms) | Tới CN cuối max | Vòng gửi TB (ms) | Vòng gửi max | Luồng server (đỉnh) | Mất kết nối |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BIO + ghi trực tiếp (baseline) | 100 | 10000 / 10000 | 0 | 4.05 | 6.70 | 8.46 | 10.18 | 6.07 | 10.18 | 4.12 | 7.34 | 118 | 0 |
| BIO + ghi trực tiếp (baseline) | 250 | 25000 / 25000 | 0 | 6.60 | 10.97 | 11.77 | 14.71 | 11.16 | 14.71 | 9.59 | 13.50 | 268 | 0 |
| BIO + ghi trực tiếp (baseline) | 500 | 50000 / 50000 | 0 | 10.34 | 18.70 | 20.49 | 24.17 | 19.28 | 24.17 | 18.07 | 22.78 | 518 | 0 |
| BIO + ghi trực tiếp (baseline) | 750 | 75000 / 75000 | 0 | 14.20 | 26.52 | 28.93 | 34.34 | 27.15 | 34.34 | 26.10 | 33.22 | 768 | 0 |
| BIO + ghi trực tiếp (baseline) | 1000 | 100000 / 100000 | 0 | 20.58 | 37.38 | 39.53 | 44.09 | 39.03 | 44.09 | 37.92 | 43.07 | 1018 | 0 |
| BIO + hàng đợi gửi | 100 | 10000 / 10000 | 0 | 2.20 | 3.15 | 3.71 | 5.24 | 2.95 | 5.24 | 1.65 | 3.87 | 218 | 0 |
| BIO + hàng đợi gửi | 250 | 25000 / 25000 | 0 | 3.06 | 4.65 | 5.71 | 8.30 | 4.59 | 8.30 | 3.34 | 7.23 | 518 | 0 |
| BIO + hàng đợi gửi | 500 | 50000 / 50000 | 0 | 4.44 | 7.18 | 8.09 | 12.63 | 7.44 | 12.63 | 6.29 | 11.57 | 1018 | 0 |
| BIO + hàng đợi gửi | 750 | 75000 / 75000 | 0 | 5.88 | 9.83 | 10.60 | 30.15 | 10.44 | 30.15 | 9.23 | 13.51 | 1518 | 0 |
| BIO + hàng đợi gửi | 1000 | 100000 / 100000 | 0 | 7.40 | 12.78 | 15.35 | 32.27 | 13.50 | 32.27 | 12.29 | 17.38 | 2018 | 0 |
| NIO + ghi thẳng (đề xuất) | 100 | 10000 / 10000 | 0 | 3.36 | 5.40 | 6.03 | 8.07 | 5.28 | 8.07 | 4.04 | 6.97 | 34 | 0 |
| NIO + ghi thẳng (đề xuất) | 250 | 25000 / 25000 | 0 | 6.03 | 10.34 | 11.31 | 13.65 | 10.60 | 13.65 | 9.50 | 12.75 | 34 | 0 |
| NIO + ghi thẳng (đề xuất) | 500 | 50000 / 50000 | 0 | 10.60 | 19.29 | 20.53 | 21.99 | 19.86 | 21.99 | 18.89 | 21.22 | 33 | 0 |
| NIO + ghi thẳng (đề xuất) | 750 | 75000 / 75000 | 0 | 15.14 | 28.10 | 30.65 | 35.79 | 28.79 | 35.79 | 27.84 | 34.92 | 33 | 0 |
| NIO + ghi thẳng (đề xuất) | 1000 | 100000 / 100000 | 0 | 20.25 | 36.89 | 39.51 | 45.79 | 38.36 | 45.79 | 37.49 | 45.01 | 33 | 0 |

"Mất" = không tới trong 15 giây sau broadcast cuối. Mỗi mức tải gửi trước 10 broadcast khởi động không tính. Client ảo, server và CSDL cùng một máy (loopback).

### E9b – Broadcast dồn dập: 1000 chi nhánh, 100 broadcast gửi liên tiếp không nghỉ

| Server | Payload (byte) | Tin nhận / kỳ vọng | Mất | Thời gian xả hết (ms) | Thông lượng (tin/s) | MB/s | Độ trễ p95 (ms) | Max | Vòng gửi TB (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BIO + ghi trực tiếp (baseline) | 100 | 100000 / 100000 | 0 | 3235.0 | 30912.4 | 3.59 | 30.70 | 38.95 | 31.24 |
| BIO + ghi trực tiếp (baseline) | 1000 | 100000 / 100000 | 0 | 4299.4 | 23258.9 | 23.63 | 41.19 | 52.60 | 41.96 |
| BIO + ghi trực tiếp (baseline) | 3000 | 100000 / 100000 | 0 | 6868.1 | 14560.1 | 43.91 | 65.06 | 77.87 | 67.49 |
| BIO + hàng đợi gửi | 100 | 100000 / 100000 | 0 | 1081.2 | 92489.5 | 10.73 | 9.63 | 30.75 | 9.90 |
| BIO + hàng đợi gửi | 1000 | 100000 / 100000 | 0 | 2126.8 | 47018.6 | 47.77 | 20.07 | 36.93 | 20.28 |
| BIO + hàng đợi gửi | 3000 | 100000 / 100000 | 0 | 4280.6 | 23361.0 | 70.46 | 40.86 | 57.86 | 41.85 |
| NIO + ghi thẳng (đề xuất) | 100 | 100000 / 100000 | 0 | 3202.2 | 31228.7 | 3.62 | 30.79 | 38.66 | 31.18 |
| NIO + ghi thẳng (đề xuất) | 1000 | 100000 / 100000 | 0 | 4374.7 | 22858.7 | 23.22 | 41.47 | 52.59 | 42.83 |
| NIO + ghi thẳng (đề xuất) | 3000 | 100000 / 100000 | 0 | 6808.1 | 14688.5 | 44.30 | 65.50 | 90.96 | 67.17 |

Thời gian xả hết: từ broadcast đầu tiên tới khi chi nhánh cuối cùng nhận tin cuối cùng. MB/s tính theo số byte dòng tin chi nhánh nhận được.

