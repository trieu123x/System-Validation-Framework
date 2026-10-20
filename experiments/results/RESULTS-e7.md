# Kết quả thực nghiệm

Chạy lúc 2026-10-21 00:43 trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

| Thông số | Giá trị |
|---|---|
| Hệ điều hành | Windows 11 10.0 (amd64) |
| CPU | 16 luồng logic |
| RAM | 15 GB |
| Java | 17.0.20.1 |
| CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |

## E7 – Tầng mạng thuần: mỗi chi nhánh gửi 10 PING/giây trong 20 giây

Server trả PONG ngay trên luồng worker NIO, không chạm CSDL, nên số đo phản ánh riêng tầng TCP/NIO (đọc dòng, tách tin, hàng đợi gửi, Selector).

| Số CN | Tin gửi | Mất | Thông lượng (tin/s) | RTT TB (ms) | p95 | p99 | Max | Mất kết nối | Luồng server (đỉnh) | Heap (MB, đỉnh) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 19990 | 0 | 994.7 | 0.27 | 0.44 | 0.59 | 5.64 | 0 | 33 | 148.8 |
| 500 | 99845 | 0 | 4968.0 | 0.37 | 0.69 | 0.91 | 3.39 | 0 | 33 | 149.2 |

"Mất" = không có PONG trong 5 giây. Client ảo, server và CSDL cùng một máy (loopback).

