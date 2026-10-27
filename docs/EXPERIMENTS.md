# Thiết kế thực nghiệm

Mỗi cải tiến của nhóm có một **cờ cấu hình** để bật lại cách làm baseline. Cùng một kịch bản được chạy cho từng biến thể, nên mọi khác biệt trong số liệu đến từ cải tiến đó.

Chế độ thực nghiệm chỉ bật khi công cụ tải khởi động server riêng trên localhost (`experiment.api=true` truyền bằng tham số). Trên Docker/Funnel, `EXPERIMENT_API=false` và `/api/experiment/*` trả 404.

Toàn bộ thực nghiệm chạy tự động bằng một lệnh. Bộ chạy tự khởi động `server.jar` với cấu hình từng biến thể, giả lập các chi nhánh ảo `SIM001..SIM1000` nói đúng giao thức TCP, rồi ghi CSV và bảng Markdown vào `experiments/results/`. Log của từng server nằm trong `experiments/results/logs/`.

```bat
scripts\run-experiments.bat run=all           :: khoảng 15–20 phút
scripts\run-experiments.bat run=e1 e1.reps=10 :: chạy riêng một thực nghiệm
```

Điều kiện chạy: đã build, đã nạp `db/seed_loadsim.sql`, cổng 5000 và 8080 đang trống. Thực nghiệm chỉ ghi vào dữ liệu của chi nhánh ảo (`chi_nhanh.gia_lap = TRUE`). Riêng E1 có đặt lại tồn kho tổng của SP05.

Kết quả đo được nằm ở [experiments/results/RESULTS.md](../experiments/results/RESULTS.md).

---

## E1 – Tranh chấp kho tổng khi nhiều chi nhánh cùng ACCEPT

**Câu hỏi.** Khi nhiều `ClientHandler` cùng trừ một dòng `kho_tong`, cách nào vừa đúng vừa nhanh?

| Biến thể | Cấu hình `accept.strategy` | Cách trừ kho |
|---|---|---|
| Baseline 1 | `check_then_act` | `SELECT so_luong`, so sánh trong Java, rồi `UPDATE SET so_luong = <giá trị đã tính>` |
| Baseline 2 | `synchronized` | Như trên nhưng bọc cả transaction trong `synchronized` của Java |
| Đề xuất | `conditional` | Một câu `UPDATE kho_tong SET so_luong = so_luong - ? WHERE ma_sp = ? AND so_luong >= ?` |

**Kịch bản.** 50 chi nhánh ảo, mỗi chi nhánh có một YC ở trạng thái DA_DE_XUAT cho SP05 với số lượng 8. Kho tổng chỉ có 200, tức là đủ cho đúng 25 chi nhánh. Cả 50 chi nhánh đăng nhập và nhận OFFER, chờ ở cùng một vạch xuất phát (`CountDownLatch`), rồi cùng gửi `ACCEPT`. Lặp lại 5 lần.

**Số đo.** Số DELIVERED (đúng phải là 25), tổng xuất kho, số bán vượt kho, số lần vi phạm bất biến (tổng xuất + tồn cuối = tồn đầu), độ trễ ACCEPT, và thời gian để cả loạt 50 ACCEPT xong.

**Giả thuyết.** `check_then_act` bị lost update: hai transaction cùng đọc 200, cùng ghi 192, nên bán vượt kho. `synchronized` đúng, nhưng xếp hàng toàn bộ ACCEPT, và chỉ đúng khi chạy một server. `conditional` vừa đúng vừa nhanh, vì CSDL chỉ khóa dòng của mặt hàng đó.

## E2 – Độ tin cậy của tin push khi mất kết nối

**Câu hỏi.** OFFER gửi cho chi nhánh đúng lúc mất mạng có bị mất không?

| Biến thể | Cấu hình `delivery` | Cơ chế |
|---|---|---|
| Baseline 1 | `none` | Gửi được thì gửi, chi nhánh offline thì mất tin |
| Baseline 2 (theo SRS) | `queue` | Chi nhánh offline: tin vào `hang_doi_tin`, gửi lại sau `LOGIN_OK` |
| Đề xuất | `queue_resync` | `queue` cộng thêm: sau `LOGIN_OK` server gửi lại trạng thái mọi YC còn mở, lấy từ CSDL |

**Kịch bản.** 30 chi nhánh ảo chạy trong 60 giây. Mỗi chi nhánh online 3–8 giây rồi mất mạng 2–5 giây, lặp lại. Có hai kiểu mất mạng xen kẽ ngẫu nhiên:

- **Đóng socket**: server biết ngay chi nhánh offline.
- **Rút dây**: socket vẫn mở, nhưng mọi byte gửi tới đều mất, và server không biết.

Trong suốt thời gian đó, server gửi khoảng 10 OFFER mỗi giây tới các chi nhánh ngẫu nhiên. Chi nhánh nhận được OFFER thì REJECT ngay để đóng YC. Hết 60 giây, mọi chi nhánh nối lại và chờ thêm 8 giây rồi mới đếm.

**Số đo.** Số OFFER đã gửi, đã nhận, bị mất, tỉ lệ mất, số lần nhận trùng, độ trễ từ lúc gửi tới lúc nhận.

**Giả thuyết.**
- `none` mất cả hai kiểu.
- `queue` cứu được kiểu đóng socket, nhưng vẫn mất kiểu rút dây, vì server tưởng đã gửi thành công.
- `queue_resync` không mất tin nào, vì trạng thái YC nằm trong CSDL và được gửi lại.

## E3 – Một chi nhánh treo khi server broadcast

**Câu hỏi.** Một client không đọc socket có làm chậm các client khác không?

| Biến thể | Cấu hình | Cách ghi |
|---|---|---|
| Baseline | `io.mode=bio`, `write.mode=direct` | Luồng gọi `send()` ghi thẳng vào socket |
| Đề xuất 1 | `io.mode=bio`, `write.mode=queued` | Mỗi kết nối có hàng đợi tối đa 256 tin và một luồng ghi riêng; tràn hàng đợi thì cắt kết nối |
| Đề xuất 2 | `io.mode=nio` | Selector ghi khi socket sẵn sàng; tràn hàng đợi thì cắt kết nối |

**Kịch bản.** 20 chi nhánh bình thường và 1 chi nhánh treo. Chi nhánh treo đặt bộ đệm nhận 4 KB và ngừng đọc socket ngay sau khi đăng nhập. Server lần lượt broadcast 300 tin, mỗi tin 3 KB. Mỗi lần gọi broadcast chờ tối đa 5 giây; nếu bị treo thì dừng gửi.

**Số đo.** Số broadcast hoàn tất, lần gọi lâu nhất, số tin tới được chi nhánh bình thường (tối đa 300 × 20), độ trễ, và chi nhánh treo có bị server cắt không.

## E4 – Khả năng mở rộng: BIO và NIO

**Câu hỏi.** Mô hình mỗi kết nối một luồng (BIO) và mô hình Selector (NIO) khác nhau thế nào khi số client tăng?

**Kịch bản.** Lần lượt 50, 200 và 500 chi nhánh ảo. Mỗi chi nhánh gửi 1 `SALE` mỗi giây trong 30 giây. Mỗi `SALE` là một transaction CSDL. Chạy với `io.mode=bio` và `io.mode=nio`.

**Số đo.** Thông lượng, độ trễ SALE→SALE_OK (trung bình, p95, p99, max), số tin mất (không có trả lời trong 5 giây), số luồng JVM cao nhất của server, và heap cao nhất.

## E5 – Kết nối lại hàng loạt khi server khởi động lại

**Câu hỏi.** Khi server tắt đột ngột, mọi chi nhánh mất kết nối cùng một lúc. Chính sách nối lại nào tránh dồn cục (thundering herd) mà vẫn giữ yêu cầu "nối lại ≤ 5 giây"?

| Biến thể | `reconnect.strategy` | Thời gian chờ trước lần thử thứ n |
|---|---|---|
| Baseline (SRS FR-05) | `fixed` | luôn 5 s |
| So sánh | `backoff` | ngẫu nhiên trong [0, min(5 s, 0,5 s·2ⁿ)] (exponential backoff + full jitter) |
| Đề xuất | `jitter` | lần đầu ngẫu nhiên trong [0, 5 s], các lần sau ngẫu nhiên trong [2,5 s, 5 s] |

**Kịch bản.** 300 chi nhánh ảo đang online. Server bị tắt đột ngột (`destroyForcibly`), sau 6–10 giây ngẫu nhiên thì bật lại. Mỗi chính sách lặp 5 lần.

**Số đo.** Thời gian từ lúc cổng TCP của server mới bắt đầu lắng nghe tới khi chi nhánh nhận `LOGIN_OK` (trung bình, p95, max), số lần thử trên mỗi client, và số lần thử cao nhất rơi vào cùng một khung 100 ms (đỉnh tải).

## E6 – Luồng cấp hàng trọn vẹn khi 50–100 chi nhánh cùng báo thiếu

**Câu hỏi.** Khi 50–100 chi nhánh cùng xin hàng một lúc, tầng mạng (TCP push tới chi nhánh, SSE tới trang admin) có mất, trùng hoặc chậm tin không, và kho tổng có bị xuất vượt không?

**Kịch bản.** n chi nhánh ảo (50, 100) có tồn 12, ngưỡng 10 cho SP05. Kho tổng chỉ đủ 80 % số lần gửi. Mỗi chi nhánh làm 5 vòng; vòng đầu tất cả bắt đầu cùng lúc:

1. Bán xuống 9 (`SALE`), rồi tự gửi `LOW_STOCK`.
2. Bot admin đã đăng nhập, nghe `/api/events` như trình duyệt. Thấy cảnh báo là gọi `POST /api/requests/{id}/ship`; kho không đủ (HTTP 400) thì gọi `/shortage`.
3. Chi nhánh nhận `DELIVERED` thì gửi `RECEIVED`; nhận `OUT_OF_STOCK` thì gửi `REJECT`.
4. Bot admin thấy sự kiện YC *Đã nhận*/*Từ chối* qua SSE. Chi nhánh sang vòng sau.

**Số đo.** Số cảnh báo admin thấy so với kỳ vọng, số tin mất (không tới trong 30 s/10 s), tin trùng, lỗi, kết nối bị đóng, kiểm tra kho (tổng xuất + còn lại = kho ban đầu), và độ trễ từng chặng: SALE→SALE_OK, LOW_STOCK→admin thấy cảnh báo, HTTP gửi hàng, admin bấm→chi nhánh nhận tin, chi nhánh bấm nhận→admin thấy *Đã nhận*, trọn vòng.

Chạy: `scripts\run-experiments.bat run=e6` (thêm `e6.clients=50,100 e6.rounds=5`; `tcp.port=… admin.port=…` khi 5000/8080 đang bận).

## E7 – Tầng mạng thuần (PING/PONG)

**Câu hỏi.** Tách riêng tầng TCP/NIO khỏi CSDL thì nó chịu được bao nhiêu client và tin mỗi giây?

**Kịch bản.** 100, 500 và 1000 chi nhánh ảo đăng nhập rồi mỗi chi nhánh gửi 10 `PING`/giây trong 20 giây. Ở 1000 chi nhánh so sánh ba biến thể: NIO ghi thẳng (`nio.write.through=true`, đề xuất), NIO ghi qua Selector (`false`, baseline) và BIO. Server trả `PONG` ngay trên luồng worker, không chạm CSDL; nhật ký ghi bất đồng bộ theo lô.

**Số đo.** Số tin gửi, số tin mất (không có PONG trong 5 s), thông lượng, RTT (trung bình, p95, p99, max), kết nối bị đóng, số luồng và heap đỉnh của server.

Chạy: `scripts\run-experiments.bat run=e7` (thêm `e7.clients=100,500 e7.rate=10 e7.seconds=20`). E6 và E7 nhận `e6.server=` / `e7.server=` để truyền thêm cấu hình server, ví dụ `e6.server=db.pool.size=40;nio.workers=32`.

Lưu ý: mỗi lượt E6/E7 ghi hàng trăm nghìn dòng `nhat_ky` cho các chi nhánh ảo; xoá bằng `DELETE FROM nhat_ky WHERE ma_cn LIKE 'SIM%'` nếu không cần.

---

## Hạn chế của thực nghiệm

- Client ảo, server và PostgreSQL chạy trên cùng một máy và nói chuyện qua loopback. Vì vậy không có độ trễ mạng thật, và client cạnh tranh CPU với server. Số liệu tuyệt đối sẽ khác khi chạy trong LAN thật; cái đáng tin là so sánh tương đối giữa các biến thể.
- "Rút dây" ở E2 là mô phỏng ở tầng ứng dụng: byte vẫn tới nhưng client bỏ đi. Muốn có bằng chứng ở tầng mạng thì dùng thêm Wireshark hoặc rút dây thật như TC-06.
- E4 chạy 30 giây cho mỗi mức tải. Lần chạy 10 phút như TC-11 làm riêng: `scripts\run-loadsim.bat clients=20 duration=600`.
