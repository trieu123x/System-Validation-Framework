# Kết quả thực nghiệm

Chạy lúc 2026-10-21 00:54 trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

| Thông số | Giá trị |
|---|---|
| Hệ điều hành | Windows 11 10.0 (amd64) |
| CPU | 16 luồng logic |
| RAM | 15 GB |
| Java | 17.0.20.1 |
| CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |

## E7 – Tầng mạng thuần ở 1000 chi nhánh: mỗi chi nhánh 10 PING/giây trong 20 giây

Server trả PONG ngay trên luồng worker, không chạm CSDL. Nhật ký ghi bất đồng bộ theo lô 2000 dòng với reWriteBatchedInserts; không lần chạy nào bỏ bản ghi nhật ký.

| Server | Số CN | Tin gửi | Mất | Thông lượng (tin/s) | RTT TB (ms) | p95 | p99 | Max | Mất kết nối | Luồng server (đỉnh) | Heap (MB, đỉnh) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| NIO ghi thẳng (`nio.write.through=true`, đề xuất) | 1000 | 199058 | 0 | 9905.0 | 0.66 | 1.49 | 3.00 | 27.88 | 0 | 33 | 162.9 |
| NIO ghi qua Selector (`nio.write.through=false`, baseline) | 1000 | 199247 | 0 | 9914.1 | 5.30 | 8.50 | 9.80 | 35.11 | 0 | 33 | 153.5 |
| BIO, mỗi kết nối một luồng | 1000 | 199292 | 0 | 9914.6 | 0.36 | 0.90 | 2.19 | 26.92 | 0 | 2017 | 180.3 |

Trước khi sửa (cùng tải, bản server cũ): NIO p95 11,17 ms, p99 28,30 ms; bộ ghi nhật ký bỏ 19 663 bản ghi (NIO) và 29 654 bản ghi (BIO) vì hàng đợi đầy.
