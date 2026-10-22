# Kết quả thực nghiệm

Chạy lúc 2026-10-22 00:51 trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

| Thông số | Giá trị |
|---|---|
| Hệ điều hành | Windows 11 10.0 (amd64) |
| CPU | 16 luồng logic |
| RAM | 15 GB |
| Java | 17.0.20.1 |
| CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |

## E8 – Bị tấn công (20 chi nhánh thật SALE 2 tin/s ở 127.0.0.1, 10 s bình thường rồi 30 s bị tấn công)

5 kẻ tấn công: dò mật khẩu CN01 (192.168.1.103, 20 lần/s), flood PING 500 tin/s (172.16.0.2), cào INVENTORY_GET/HISTORY_GET 200 tin/s bằng tài khoản SIM900 (127.0.0.1), gửi rác 50 dòng/s (2606:4700:110:89b3:d8dd:408e:2daf:32d1), mở 50 kết nối không LOGIN (::1).

| security.mode | Kẻ tấn công bị chặn/ngắt | CN thật bị chặn nhầm | SALE p95 bình thường (ms) | SALE p95 khi bị tấn công (ms) | SALE mất | Tin tấn công được xử lý |
|---|---:|---:|---:|---:|---:|---:|
| off | 0/5 | 0 | 1.81 | 1.87 | 0 | 18928 |
| detect | 0/5 | 0 | 2.06 | 1.98 | 0 | 13126 |
| block | 5/5 | 0 | 2.69 | 2.17 | 0 | 645 |

| security.mode | Kẻ tấn công | IP | Tin được xử lý | Tới sự kiện đầu (ms) | Tới khi bị chặn (ms) | Bị chặn bởi |
|---|---|---|---:|---:|---:|---|
| off | do_mat_khau | 192.168.1.103 | 563 | — | — | — |
| off | flood_ping | 172.16.0.2 | 12665 | — | — | — |
| off | cao_du_lieu | 127.0.0.1 | 4331 | — | — | — |
| off | gui_rac | 2606:4700:110:89b3:d8dd:408e:2daf:32d1 | 1319 | — | — | — |
| off | khong_login | ::1 | 50 | — | — | — |
| detect | do_mat_khau | 192.168.1.103 | 485 | 249.0 | — | — |
| detect | flood_ping | 172.16.0.2 | 9685 | 2179.0 | — | — |
| detect | cao_du_lieu | 127.0.0.1 | 1937 | 22.0 | — | — |
| detect | gui_rac | 2606:4700:110:89b3:d8dd:408e:2daf:32d1 | 969 | 281.0 | — | — |
| detect | khong_login | ::1 | 50 | 26.0 | — | — |
| block | do_mat_khau | 192.168.1.103 | 5 | 250.0 | 254.0 | E06: Dang nhap sai qua nhieu lan, IP bi chan |
| block | flood_ping | 172.16.0.2 | 430 | 1332.0 | 1336.0 | E06: Gui lenh don dap, ngat phien |
| block | cao_du_lieu | 127.0.0.1 | 150 | 24.0 | 27.0 | E06: Vuot gioi han doc du lieu, thu lai sau |
| block | gui_rac | 2606:4700:110:89b3:d8dd:408e:2daf:32d1 | 10 | 281.0 | 312.0 | server dong ket noi |
| block | khong_login | ::1 | 50 | 28.0 | 31.0 | E06: IP bi chan den 01:03 |

"Tin được xử lý": số trả lời bình thường kẻ tấn công nhận được (LOGIN_FAIL, PONG, INVENTORY/HISTORY, ERROR|E01, kết nối được nhận). "Bị chặn": nhận ERROR|E06 hoặc bị server đóng kết nối. Thời gian tính từ lúc kẻ tấn công bắt đầu.

