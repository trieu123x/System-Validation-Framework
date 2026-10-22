// Chương 10. Kết quả và thảo luận
// 10.1: N1 · 10.2: N2 · 10.3: N3 · 10.4: N4 · 10.5: cả nhóm
// Mọi số liệu lấy từ experiments/results (CSV và RESULTS-*.md), không làm tròn khác bản gốc quá 1 chữ số.
module.exports = (L) => {
  const { add, P, H1, H2, H3, B, table, figure } = L;

  add(H1("10. Kết quả và thảo luận", "10"));
  add(P("Chương này trình bày số liệu đo thật của chín thực nghiệm, nhóm theo bốn mảng của tầng mạng. Mỗi mục gồm bảng số liệu, biểu đồ, và phần giải thích vì sao có kết quả đó. Số liệu gốc (CSV) và log server của từng lần chạy nằm trong `experiments/results/`, biểu đồ nằm trong `experiments/charts/`."));

  // ================= 10.1 =================
  add(H2("10.1. Tầng TCP thuần (E7)"));
  add(P("E7 tách riêng tầng mạng khỏi CSDL: mỗi chi nhánh ảo gửi 10 `PING` mỗi giây trong 20 giây, và server trả `PONG` ngay trên luồng worker, không chạm CSDL. Số đo vì vậy phản ánh đúng chi phí của đọc socket, tách dòng, giải mã, hàng đợi tuần tự, ghi socket và ghi nhật ký."));
  add(table("Kết quả E7 – mỗi chi nhánh 10 PING/giây trong 20 giây", [
    ["Server", "Số CN", "Tin gửi", "Mất", "Thông lượng (tin/s)", "RTT TB (ms)", "p95", "p99", "Max", "Luồng (đỉnh)"],
    ["NIO", "100", "19 990", "0", "994,7", "0,27", "0,44", "0,59", "5,64", "33"],
    ["NIO", "500", "99 845", "0", "4 968,0", "0,37", "0,69", "0,91", "3,39", "33"],
    ["NIO ghi thẳng (đề xuất)", "1000", "199 058", "0", "9 905,0", "0,66", "1,49", "3,00", "27,88", "33"],
    ["NIO qua Selector (baseline)", "1000", "199 247", "0", "9 914,1", "5,30", "8,50", "9,80", "35,11", "33"],
    ["BIO", "1000", "199 292", "0", "9 914,6", "0,36", "0,90", "2,19", "26,92", "2 017"],
  ], [2.8, 0.9, 1.3, 0.8, 1.5, 1.2, 0.9, 0.9, 1, 1.2], [1, 2, 3, 4, 5, 6, 7, 8, 9], "e7"));
  add(P("“Mất” là không có PONG trong 5 giây; không có kết nối nào bị đóng trong cả năm lượt chạy. Hai hàng 100 và 500 chi nhánh đo với bản server trước khi sửa đường ghi NIO."));
  add(H3("Nhận xét"));
  add(B("**Thông lượng tăng tuyến tính** theo số chi nhánh (995 → 4968 → 9905 tin/s, đúng 10 tin/s mỗi chi nhánh), và không mất tin nào. Ở 500 chi nhánh, p99 vẫn dưới 1 ms và server chỉ dùng 33 luồng. Trong thực nghiệm E4 (có CSDL) ở cùng số chi nhánh, độ trễ do CSDL quyết định. Như vậy tầng mạng không phải là giới hạn của hệ thống ở quy mô này."));
  add(B("**Ở 1000 chi nhánh lộ ra một điểm nghẽn** của bản NIO ban đầu: mọi tin gửi đều phải nhờ luồng Selector ghi, tức mỗi tin một lần `wakeup()` và một vòng chuyển luồng. Ở khoảng 10 000 tin/giây, luồng Selector trở thành nút cổ chai và p95 lên 8,50 ms. Cho worker **ghi thẳng** khi kết nối không còn tin chờ (mục 6.4.3) đưa p95 về **1,49 ms (nhanh 5,7 lần)** mà vẫn giữ 33 luồng."));
  add(B("**BIO có độ trễ thấp nhất** (p95 0,90 ms) vì mỗi kết nối có luồng ghi riêng, chạy song song trên 16 nhân CPU. Đổi lại nó cần **2 017 luồng**, gấp 61 lần NIO. Ở quy mô lớn hơn, hoặc trên máy ít bộ nhớ, số luồng này mới là giới hạn thật."));
  add(B("Cùng lần đo này phát hiện bộ ghi nhật ký cũ (lô 500 dòng) không theo kịp khoảng 20 000 bản ghi/giây và bỏ 19 663 (NIO) đến 29 654 (BIO) bản ghi khi hàng đợi đầy. Sau khi tăng lô lên 2000 dòng và bật `reWriteBatchedInserts` (mục 6.6), không lần chạy nào bỏ bản ghi."));

  // ================= 10.2 =================
  add(H2("10.2. Mô hình I/O: client chậm, mở rộng, broadcast (E3, E4, E9)"));
  add(H3("10.2.1. E3 – Một chi nhánh treo khi server broadcast"));
  add(table("Kết quả E3 – 300 broadcast × 3 KB tới 20 chi nhánh bình thường và 1 chi nhánh treo", [
    ["Server", "Broadcast hoàn tất", "Lần gọi lâu nhất (ms)", "Tin tới CN bình thường", "p50 (ms)", "p95 (ms)", "Max (ms)", "CN treo bị cắt"],
    ["BIO ghi trực tiếp (baseline)", "26/300", "5 016", "540/6000", "3", "10", "26", "không"],
    ["BIO + hàng đợi gửi", "300/300", "41", "6000/6000", "1", "3", "22", "có"],
    ["NIO + hàng đợi gửi", "300/300", "48", "6000/6000", "1", "3", "18", "có"],
  ], [2.8, 1.5, 1.6, 1.8, 1, 1, 1, 1.3], [1, 2, 3, 4, 5, 6], "e3"));
  add(figure("experiments/charts/e3_slow_consumer.png", "E3: số tin broadcast tới các chi nhánh bình thường (tối đa 6000)", "e3-chart"));
  add(P("Với ghi trực tiếp, sau khoảng 26 broadcast thì bộ đệm nhận 4 KB của chi nhánh treo và bộ đệm gửi của server đều đầy. Cửa sổ TCP về 0 (mục 2.2.2), `write` bị chặn vô hạn, và luồng broadcast đứng lại. Lần gọi broadcast thứ 27 bị treo tới khi hết thời hạn 5 giây. Con số 540 = 27 × 20 cho thấy tin thứ 27 chỉ kịp tới các chi nhánh đứng trước chi nhánh treo trong vòng lặp. **Một máy chi nhánh lỗi đã làm cả 20 máy khác không nhận được thông báo.** Với hàng đợi gửi (cả BIO lẫn NIO), chi nhánh treo chỉ làm đầy hàng đợi của chính nó rồi bị cắt khi vượt giới hạn (256 tin trong lần đo này), còn 20 chi nhánh khác nhận đủ 6000/6000 tin với p95 3 ms. Chi nhánh bị cắt sẽ nối lại và nhận lại trạng thái nhờ cơ chế ở mục 7.1."));

  add(H3("10.2.2. E4 – BIO và NIO khi tăng số chi nhánh"));
  add(table("Kết quả E4 – mỗi chi nhánh 1 SALE/giây trong 30 giây (không tin nào bị mất)", [
    ["Server", "Số CN", "Tin gửi", "Thông lượng (tin/s)", "TB (ms)", "p95 (ms)", "p99 (ms)", "Max (ms)", "Luồng (đỉnh)", "Heap (MB)"],
    ["BIO", "50", "1 500", "48,4", "1,37", "1,82", "2,06", "9,57", "117", "33,8"],
    ["BIO", "200", "5 997", "193,5", "1,12", "1,62", "1,98", "5,52", "416", "88,9"],
    ["BIO", "500", "14 992", "483,6", "0,95", "1,26", "1,49", "36,34", "1 017", "145,5"],
    ["NIO", "50", "1 499", "48,4", "1,65", "2,21", "2,60", "6,94", "33", "34,6"],
    ["NIO", "200", "6 000", "193,6", "1,21", "1,73", "2,10", "4,60", "33", "123,1"],
    ["NIO", "500", "14 986", "483,5", "1,01", "1,34", "1,56", "27,06", "32", "149,0"],
  ], [1, 1, 1.2, 1.6, 1, 1, 1, 1, 1.3, 1.2], [1, 2, 3, 4, 5, 6, 7, 8, 9], "e4"));
  add(figure("experiments/charts/e4_bio_nio.png", "E4: số luồng server và độ trễ p95 của SALE theo số chi nhánh", "e4-chart"));
  add(P("Mỗi `SALE` là một giao dịch CSDL khoảng 1 ms, nên ở mức tải này (tối đa khoảng 480 tin/giây) **CSDL quyết định độ trễ** và hai mô hình I/O cho kết quả gần như nhau. NIO chậm hơn BIO 0,1–0,4 ms vì mỗi tin phải chuyển từ luồng Selector sang worker. Khác biệt rõ ràng nằm ở tài nguyên: BIO cần 2 luồng cho mỗi kết nối nên tăng từ 117 lên 1017 luồng, còn NIO giữ 32–33 luồng ở mọi mức. Điều này khớp với phân tích lý thuyết ở {tab:io-compare}. Lợi ích của NIO không phải là nhanh hơn, mà là **chịu được nhiều kết nối với tài nguyên cố định**."));

  add(H3("10.2.3. E9 – Server broadcast tới 1000 chi nhánh"));
  add(P("Vì mọi chi nhánh ảo chạy trên cùng một máy và cùng một IP, việc 1000 client cùng gửi lên chủ yếu đo khả năng của máy chạy client (mục 9.8). E9 đo chiều ngược lại: **một nguồn (server) gửi cùng một tin tới mọi chi nhánh đang online**, như khi công ty phát thông báo. Số chi nhánh online tăng dần 100 → 250 → 500 → 750 → 1000. Chi nhánh mới đăng nhập thêm mà không ngắt chi nhánh cũ. Ở mỗi mức, server gửi 100 broadcast 256 byte, cách nhau 50 ms. Độ trễ tính từ lúc gọi API broadcast tới lúc chi nhánh đọc xong dòng tin. “Tới CN cuối” là lúc chi nhánh cuối cùng nhận được một broadcast. “Vòng gửi” là thời gian luồng gọi broadcast trên server bị giữ."));
  add(table("Kết quả E9 ở 1000 chi nhánh – 100 broadcast × 256 byte (100 000 tin mỗi biến thể)", [
    ["Server", "Tin nhận", "p50 (ms)", "p95 (ms)", "p99 (ms)", "Tới CN cuối TB (ms)", "Vòng gửi TB (ms)", "Luồng (đỉnh)", "Mất kết nối"],
    ["BIO ghi trực tiếp (baseline)", "100 000 / 100 000", "20,58", "37,38", "39,53", "39,03", "37,92", "1 018", "0"],
    ["BIO + hàng đợi gửi", "100 000 / 100 000", "7,40", "12,78", "15,35", "13,50", "12,29", "2 018", "0"],
    ["NIO ghi thẳng (đề xuất)", "100 000 / 100 000", "20,25", "36,89", "39,51", "38,36", "37,49", "33", "0"],
  ], [2.6, 2, 1, 1, 1, 1.4, 1.4, 1.1, 1.1], [2, 3, 4, 5, 6, 7, 8], "e9"));
  add(figure("experiments/charts/e9_broadcast_latency.png", "E9: độ trễ p95 và thời gian tới chi nhánh cuối theo số chi nhánh online", "e9-lat"));
  add(figure("experiments/charts/e9_broadcast_server.png", "E9: thời gian vòng gửi trên server và số luồng JVM theo số chi nhánh online", "e9-srv"));
  add(P("Sau đó, với đủ 1000 chi nhánh, server gửi **dồn dập** 100 broadcast liên tiếp không nghỉ, với tin 100 byte, 1 KB và 3 KB ({fig:e9-burst}). Cả ba biến thể nhận đủ 100 000/100 000 tin ở mọi kích thước. Thời gian xả hết của NIO là 3,2 / 4,4 / 6,8 giây, gần bằng BIO ghi trực tiếp; BIO + hàng đợi là 1,1 / 2,1 / 4,3 giây, đạt tối đa 92 490 tin/s với tin 100 byte và 70,5 MB/s với tin 3 KB. Số liệu đầy đủ nằm trong `e9_broadcast_burst.csv`."));
  add(figure("experiments/charts/e9_broadcast_burst.png", "E9b: thông lượng broadcast dồn dập tới 1000 chi nhánh theo kích thước tin", "e9-burst"));
  add(P("**Nhận xét.** Cả ba biến thể giao đủ **100 % tin** tới 1000 chi nhánh, không rớt kết nối nào, kể cả khi dồn 100 000 tin trong 1–7 giây. Thời gian tới chi nhánh cuối **tăng tuyến tính** theo số chi nhánh ({fig:e9-lat}), vì cùng một tin phải ghi vào n socket."));
  add(P("Điều đáng chú ý là với broadcast, **NIO ghi thẳng gần như trùng BIO ghi trực tiếp**, và BIO + hàng đợi nhanh gấp khoảng 3 lần (p95 12,78 ms so với 36,89 ms). Nguyên nhân nằm ở đường ghi. Với `nio.write.through=true`, chính luồng gọi broadcast giành quyền ghi và gọi `write` không chặn lần lượt cho 1000 socket. Mỗi lời gọi tốn khoảng 37 µs trên loopback Windows, nên vòng gửi mất khoảng 37 ms ({fig:e9-srv}). BIO + hàng đợi chỉ đưa tin vào 1000 hàng đợi (khoảng 12 µs mỗi chi nhánh), rồi 1000 luồng ghi chạy song song trên 16 nhân CPU. Đổi lại, BIO cần **2 018 luồng**, còn NIO giữ **33 luồng**."));
  add(P("Kết quả này không mâu thuẫn với E7. Ở E7, mỗi tin đi tới **một** chi nhánh, nên ghi thẳng trên worker tránh được việc đánh thức Selector. Ở E9, một tin đi tới **1000** chi nhánh trên **một** luồng gọi, nên việc ghi bị tuần tự hóa. Hướng cải tiến tự nhiên là chia vòng ghi của broadcast cho các worker NIO, để ghi song song mà không tăng số luồng (mục 12.2). Dù vậy, ở quy mô 1000 chi nhánh, tin vẫn tới chi nhánh cuối trong khoảng 40 ms, nhỏ hơn nhiều so với thời gian con người nhận ra trên giao diện."));
  add(P("Ảnh chụp dưới đây lấy từ trang công ty **trong lúc 1000 chi nhánh ảo đang online** và nhận broadcast (chạy `run-experiments.bat run=e9 e9.hold=120`, server NIO). Trang Tổng quan hiện 1000/1015 chi nhánh online, 583 250 tin/phút và 38 luồng JVM. Tab Giám sát hiện 1 000 phiên TCP. Tab Luồng tin cho thấy cùng một BROADCAST tới SIM977…SIM999 trong cùng một mili-giây."));
  add(figure("docs/img/e9-admin-tong-quan-1000cn.png", "Trang công ty khi 1000 chi nhánh ảo online: 1000/1015 online, 583 250 tin/phút, 38 luồng JVM", "e9-shot1", 520));
  add(figure("docs/img/e9-admin-giam-sat-1000cn.png", "Tab Giám sát: 1 000 kết nối TCP, mỗi phiên một dòng với số tin vào/ra", "e9-shot2", 520));
  add(figure("docs/img/e9-admin-luong-tin-broadcast.png", "Tab Luồng tin: cùng một BROADCAST được ghi vào socket của SIM977…SIM999 trong 1 ms", "e9-shot3", 520));

  // ================= 10.3 =================
  add(H2("10.3. Tin cậy và tranh chấp (E1, E2, E5)"));
  add(H3("10.3.1. E1 – Tranh chấp kho tổng"));
  add(P("50 chi nhánh ảo, mỗi chi nhánh có một yêu cầu đã đề xuất 8 đơn vị cùng một mặt hàng. Kho tổng có 200, chỉ đủ cho 25 chi nhánh. Cả 50 chi nhánh chờ ở cùng một vạch xuất phát (`CountDownLatch`) rồi cùng gửi `ACCEPT`. Kịch bản lặp 5 lần cho mỗi chiến lược."));
  add(table("Kết quả E1 (trung bình 5 lần; đúng phải là 25 DELIVERED, tổng xuất 200)", [
    ["Chiến lược", "DELIVERED", "Tổng xuất", "Bán vượt", "Vi phạm bất biến", "ACCEPT TB (ms)", "ACCEPT p95 (ms)", "Xong cả loạt (ms)"],
    ["check_then_act", "50", "400", "200", "5/5", "46,63", "96,82", "78,09"],
    ["synchronized", "25", "200", "0", "0/5", "57,46", "107,60", "109,46"],
    ["conditional (đề xuất)", "25", "200", "0", "0/5", "18,60", "29,60", "31,37"],
  ], [2.8, 1.4, 1.4, 1.3, 1.6, 1.5, 1.5, 1.5], [1, 2, 3, 4, 5, 6, 7], "e1"));
  add(figure("experiments/charts/e1_accept.png", "E1: tổng xuất kho và thời gian xong cả loạt 50 ACCEPT", "e1-chart"));
  add(P("Với `check_then_act`, **cả 50 chi nhánh đều được giao hàng** từ kho chỉ có 200 ở tất cả 5 lần lặp. Tổng xuất 400 tức bán vượt 200 đơn vị, và tồn cuối còn sai thêm (120–168 thay vì −200). Ở READ COMMITTED, các giao dịch đọc tồn gần như cùng lúc, cùng thấy đủ hàng, rồi lần lượt ghi đè giá trị mình đã tính: đúng kịch bản lost update của mục 2.7. `synchronized` đúng vì khóa giữ suốt giao dịch, nhưng biến 50 yêu cầu thành một hàng đợi duy nhất nên chậm nhất, và vẫn sai nếu có hai tiến trình server. `conditional` vừa đúng vừa **nhanh hơn `synchronized` 3,5 lần**, vì phép kiểm tra nằm trong câu `UPDATE` mà PostgreSQL đánh giá lại sau khi chờ khóa, và khóa chỉ giữ trong lúc cập nhật một dòng."));

  add(H3("10.3.2. E2 – Giao tin khi chi nhánh mất kết nối"));
  add(P("30 chi nhánh ảo chạy 60 giây. Mỗi chi nhánh online 3–8 giây rồi mất mạng 2–5 giây, lặp lại, xen kẽ ngẫu nhiên hai kiểu: **đóng socket** (server biết ngay) và **rút dây** (socket vẫn mở nhưng mọi byte tới đều bị bỏ, server không biết). Trong suốt thời gian đó, server gửi khoảng 10 OFFER/giây tới các chi nhánh ngẫu nhiên. Hết 60 giây, mọi chi nhánh nối lại và chờ thêm 8 giây rồi mới đếm."));
  add(table("Kết quả E2 (30 chi nhánh, 60 giây)", [
    ["Chế độ", "OFFER gửi", "Nhận được", "Mất", "Tỉ lệ mất", "Nhận trùng", "Độ trễ nhận TB (ms)", "p95 (ms)"],
    ["none", "321", "207", "114", "35,5 %", "0", "0*", "0*"],
    ["queue (SRS)", "399", "319", "80", "20,1 %", "0", "299", "2 394"],
    ["queue_resync (đề xuất)", "541", "541", "0", "0,0 %", "0", "658", "3 224"],
  ], [2.8, 1.3, 1.3, 1, 1.3, 1.3, 1.8, 1.2], [1, 2, 3, 4, 5, 6, 7], "e2"));
  add(P("~~* Tin giao ngay tới chi nhánh trước khi API gửi OFFER kịp trả về được tính 0 ms; ở chế độ none chỉ có loại tin này. Một lần chạy trước khi sửa cách đo độ trễ cho tỉ lệ mất 34,2 %, 15,8 % và 0 %, nhất quán với bảng trên.~~"));
  add(figure("experiments/charts/e2_delivery.png", "E2: tỉ lệ OFFER bị mất theo chế độ giao tin", "e2-chart"));
  add(P("Phần mất còn lại của `queue` (20,1 %) chủ yếu là tin gửi trong lúc rút dây: server vẫn thấy chi nhánh online và ghi vào socket thành công, nên không có lý do gì để xếp hàng. Đây chính là tình huống được phân tích ở mục 2.2.4 và 7.1.1. `queue_resync` không cần biết tin nào đã tới: sau khi đăng nhập lại, chi nhánh nhận lại mọi yêu cầu còn mở từ CSDL, nên **không mất tin nào**. Độ trễ p95 khoảng 3,2 giây phản ánh đúng thời gian mất mạng (2–5 giây) cộng thời gian nối lại, vì tin chỉ có thể tới khi kết nối đã phục hồi. Số OFFER gửi khác nhau giữa các chế độ vì kịch bản chỉ gửi OFFER mới cho cặp (chi nhánh, mặt hàng) chưa có OFFER nào đang chờ. Mỗi OFFER bị mất giữ cặp đó lại tới hết lượt chạy, nên chế độ càng mất nhiều tin thì càng gửi được ít."));

  add(H3("10.3.3. E5 – Kết nối lại hàng loạt"));
  add(P("300 chi nhánh ảo đang online. Server bị tắt đột ngột (`destroyForcibly`), sau 6–10 giây ngẫu nhiên thì bật lại. Thời gian nối lại tính từ lúc cổng TCP của server mới bắt đầu lắng nghe tới khi chi nhánh nhận `LOGIN_OK`. Mỗi chính sách lặp 5 lần, tổng 1500 lần nối lại."));
  add(table("Kết quả E5 (300 chi nhánh × 5 lần mỗi chính sách)", [
    ["Chính sách", "Đã nối lại", "TB (ms)", "p95 (ms)", "Max (ms)", "Lần thử / client", "Đỉnh lần thử / 100 ms"],
    ["fixed 5 s (SRS)", "1500/1500", "3 224", "4 854", "4 874", "2,40", "300,0"],
    ["backoff + full jitter", "1500/1500", "1 669", "3 884", "4 891", "6,76", "92,0"],
    ["jitter lệch pha (đề xuất)", "1500/1500", "1 922", "3 995", "4 982", "3,31", "16,4"],
  ], [3, 1.6, 1.1, 1.1, 1.1, 1.6, 1.9], [1, 2, 3, 4, 5, 6], "e5"));
  add(figure("experiments/charts/e5_reconnect.png", "E5: thời gian nối lại, đỉnh lần thử và số lần thử mỗi client", "e5-chart"));
  add(P("Với `fixed`, cả 300 chi nhánh mất kết nối cùng lúc nên thử lại cùng lúc: **300 lần kết nối rơi vào một khung 100 ms**, đúng hiện tượng thundering herd. Thời gian nối lại phụ thuộc vào việc server lên ở pha nào của chu kỳ 5 giây. `backoff` nối lại nhanh nhất về trung bình nhưng thử gấp 2,8 lần `fixed`, vì liên tục thử với khoảng chờ ngắn trong lúc server còn tắt. `jitter` lệch pha **giảm đỉnh tải 18 lần so với `fixed`** và 5,6 lần so với `backoff`, nối lại nhanh hơn `fixed` 40 % về trung bình, và số lần thử chỉ nhỉnh hơn `fixed`. Cả ba chính sách đều giữ được giới hạn 5 giây: giá trị lớn nhất là 4,98 s."));

  // ================= 10.4 =================
  add(H2("10.4. Luồng trọn vẹn và an ninh (E6, E8)"));
  add(H3("10.4.1. E6 – Luồng cấp hàng trọn vẹn khi nhiều chi nhánh cùng báo thiếu"));
  add(P("E6 chạy toàn bộ đường đi của {fig:arch}: n chi nhánh ảo (tồn 12, ngưỡng 10) cùng bán xuống 9, tự gửi `LOW_STOCK`; một bot admin đã đăng nhập nghe `/api/events` như trình duyệt, thấy cảnh báo thì gọi API Gửi hàng (kho không đủ thì Báo hết hàng); chi nhánh nhận `DELIVERED` thì gửi `RECEIVED`, nhận `OUT_OF_STOCK` thì `REJECT`; vòng kết thúc khi admin thấy trạng thái cuối qua SSE. Kho tổng chỉ đủ 80 % số lần gửi để luôn có nhánh báo hết hàng. Vòng đầu mọi chi nhánh bắt đầu cùng lúc."));
  add(table("Kết quả E6 – tính đúng và độ ổn định của tầng mạng", [
    ["Số CN × vòng", "Cảnh báo", "Gửi / báo hết", "Mất tin", "Trùng", "Lỗi", "Mất kết nối", "Kho tổng (xuất + còn = ban đầu)", "Luồng server"],
    ["50 × 5", "250/250", "200 / 50", "0", "0", "0", "0", "2 000 + 0 = 2 000", "40"],
    ["100 × 5", "500/500", "400 / 100", "0", "0", "0", "0", "4 000 + 0 = 4 000", "41"],
    ["500 × 5", "2500/2500", "2000 / 500", "0", "0", "0", "0", "20 000 + 0 = 20 000", "41"],
    ["500 × 20", "10000/10000", "8000 / 2000", "0", "0", "0", "0", "80 000 + 0 = 80 000", "65"],
    ["1000 × 5", "5000/5000", "4000 / 1000", "0", "0", "0", "0", "40 000 + 0 = 40 000", "41"],
    ["1000 × 20", "20000/20000", "16000 / 4000", "0", "0", "0", "0", "160 000 + 0 = 160 000", "41"],
  ], [1.5, 1.6, 1.6, 0.9, 0.8, 0.7, 1.1, 2.8, 1], [3, 4, 5, 6, 8], "e6"));
  add(table("Kết quả E6 – độ trễ từng chặng (ms, trung bình / p95)", [
    ["Số CN × vòng", "SALE → SALE_OK", "LOW_STOCK → admin thấy", "Admin bấm → CN nhận", "CN nhận → admin thấy", "Trọn vòng"],
    ["50 × 5", "17,2 / 38,8", "26,8 / 106,3", "16,3 / 39,1", "12,7 / 32,6", "146,8 / 256,1"],
    ["100 × 5", "9,2 / 32,1", "15,7 / 50,7", "19,1 / 39,2", "10,1 / 24,2", "250,4 / 329,1"],
    ["500 × 5", "38,1 / 194,0", "85,3 / 395,9", "11,5 / 27,9", "29,9 / 219,4", "882,1 / 1 484,6"],
    ["500 × 20", "85,5 / 336,8", "282,5 / 483,3", "25,4 / 72,8", "295,5 / 593,9", "627,2 / 1 024,1"],
    ["1000 × 5", "68,7 / 415,7", "149,3 / 771,0", "9,1 / 22,6", "39,8 / 274,5", "1 410,7 / 2 297,8"],
    ["1000 × 20", "23,3 / 164,9", "42,1 / 219,6", "8,1 / 20,5", "13,3 / 7,1", "1 210,0 / 1 869,2"],
  ], [1.6, 2, 2.2, 2, 2, 2.2], [1, 2, 3, 4, 5], "e6-lat"));
  add(P("**Nhận xét.** Ở mọi quy mô, tầng mạng **không mất, không trùng tin và không rớt kết nối nào**, kể cả với 20 000 vòng cấp hàng của 1000 chi nhánh. Kho tổng luôn đúng bất biến dù hàng nghìn lệnh gửi hàng tranh nhau một mặt hàng, và số lần báo hết hàng đúng bằng 20 % như thiết kế. Server giữ 40–65 luồng nhờ NIO."));
  add(P("Chặng **thuần mạng** “admin bấm → chi nhánh nhận tin” có p95 chỉ 20–73 ms ở mọi quy mô, vì đó là một push trên kết nối TCP đã mở sẵn. Các chặng có giao dịch CSDL (SALE, LOW_STOCK) mới là phần tăng khi số chi nhánh tăng: 1000 chi nhánh cùng bán trong vòng đầu tạo ra 1000 giao dịch đồng thời trên một pool 20 kết nối CSDL. Trọn vòng p95 lên 1–2,3 giây ở 500–1000 chi nhánh, nhưng vẫn ổn định và không có lỗi. Một lần thử tăng pool CSDL lên 40 và worker NIO lên 32 không làm đổi kết quả này, nên giới hạn ở đây là năng lực ghi của CSDL trên cùng một máy, không phải tầng mạng. Ở hàng 1000 × 20, chặng cuối có giá trị trung bình lớn hơn p95. Điều này xảy ra khi phân bố lệch: đa số mẫu rất nhanh, nhưng một số ít mẫu ở vòng đầu rất chậm (lớn nhất 1015 ms) kéo trung bình lên."));

  add(H3("10.4.2. E8 – Bị tấn công"));
  add(P("20 chi nhánh thật mỗi chi nhánh gửi 2 SALE/giây từ 127.0.0.1. Sau 10 giây bình thường, 5 kẻ tấn công cùng hoạt động trong 30 giây, mỗi kẻ dùng một IP nguồn khác: dò mật khẩu CN01 (20 lần/s), flood PING 500 tin/s, cào INVENTORY_GET/HISTORY_GET 200 tin/s bằng một tài khoản hợp lệ, gửi rác 50 dòng/s, và mở 50 kết nối không đăng nhập. Riêng kẻ cào dữ liệu đứng **chung IP 127.0.0.1** với các chi nhánh thật, để kiểm tra việc không chặn nhầm."));
  add(table("Kết quả E8 theo chế độ giám sát", [
    ["security.mode", "Kẻ tấn công bị chặn/ngắt", "CN thật bị chặn nhầm", "Tin tấn công được xử lý", "SALE p95 bình thường (ms)", "SALE p95 khi bị tấn công (ms)", "SALE mất"],
    ["off (baseline)", "0/5", "0", "18 928", "1,81", "1,87", "0"],
    ["detect", "0/5 (có sự kiện sau 22–2 179 ms)", "0", "13 126", "2,06", "1,98", "0"],
    ["block (đề xuất)", "5/5 sau 27–1 336 ms", "0", "645", "2,69", "2,17", "0"],
  ], [1.8, 2.4, 1.4, 1.6, 1.6, 1.8, 1], [2, 3, 4, 5, 6], "e8"));
  add(table("Chi tiết E8 ở chế độ block", [
    ["Kẻ tấn công", "Tin được xử lý", "Tới khi bị chặn (ms)", "Bị chặn bởi"],
    ["Dò mật khẩu CN01", "5", "254", "BRUTE_FORCE: E06, IP bị chặn"],
    ["Flood PING 500 tin/s", "430", "1 336", "CMD_FLOOD: E06, ngắt phiên"],
    ["Cào dữ liệu (chung IP với CN thật)", "150", "27", "SCRAPING: E06 cho tin vượt mức"],
    ["Gửi rác 50 dòng/s", "10", "312", "FUZZING: server đóng kết nối, chặn IP"],
    ["50 kết nối không LOGIN", "50", "31", "IP bị chặn, kết nối mới nhận E06"],
  ], [3.4, 1.8, 2, 4.8], [1, 2], "e8-detail"));
  add(figure("experiments/charts/e8_security.png", "E8: độ trễ SALE, số tin tấn công được xử lý và số kẻ tấn công bị chặn theo chế độ", "e8-chart"));
  add(P("Chế độ `block` chặn hoặc ngắt cả 5 kẻ tấn công trong 27 ms – 1,3 giây, giảm số tin tấn công server phải xử lý **96,6 %** (18 928 → 645), và **không chặn nhầm chi nhánh thật nào**. Kể cả khi kẻ cào dữ liệu dùng chung IP với chúng, chỉ phiên vi phạm bị xử lý theo nguyên tắc ở mục 8.4.1. Kẻ flood mất lâu nhất (1,3 giây) vì quy tắc CMD_FLOOD chỉ kích hoạt khi vượt ngưỡng liên tục 3 giây, để tránh phạt một đợt bùng ngắn hợp lệ. Ở cường độ tấn công này, server NIO vẫn đủ sức: p95 SALE gần như không đổi khi bị tấn công ở cả ba chế độ. Khác biệt 1,8–2,7 ms giữa các lượt, ngay cả trước khi bị tấn công, là dao động giữa các lần khởi động server, không do chế độ giám sát."));

  // ================= 10.5 =================
  add(H2("10.5. Thảo luận chung"));
  add(H3("10.5.1. Vì sao các giải pháp hoạt động"));
  add(P("Năm giải pháp có chung một ý: **đặt tính đúng đắn ở nơi không bị ảnh hưởng bởi lỗi mạng**. Tính đúng của kho nằm trong một câu lệnh SQL nguyên tử chứ không trong bộ nhớ của một luồng (E1). Tính đầy đủ của tin nằm trong trạng thái bền vững của CSDL chứ không trong bộ đệm của một socket (E2). Ảnh hưởng của một client chậm bị giới hạn trong hàng đợi của chính nó (E3). Thời điểm thử lại được làm ngẫu nhiên để không còn phụ thuộc vào thời điểm lỗi xảy ra (E5). Phản ứng an ninh gắn với đúng phiên hoặc IP gây ra vi phạm (E8). Nhờ vậy, lỗi mạng chỉ biến thành **độ trễ** chứ không thành **sai dữ liệu**."));
  add(H3("10.5.2. Ưu điểm, nhược điểm và phạm vi áp dụng"));
  add(B("**NIO** không làm hệ thống nhanh hơn khi CSDL là nút cổ chai (E4). Với broadcast tới rất nhiều chi nhánh, nó còn chậm hơn BIO + hàng đợi (E9). Lợi ích của nó là **tài nguyên cố định** khi số kết nối tăng: 33 luồng so với 2017 ở 1000 chi nhánh. Với 10–20 chi nhánh như đề bài, cả hai mô hình đều thừa sức. Với vài nghìn chi nhánh, chỉ NIO còn khả thi."));
  add(B("**Gửi lại theo trạng thái** chấp nhận nhận trùng và chỉ áp dụng cho tin gắn với trạng thái trong CSDL. BROADCAST gửi vào socket “chết” mà server chưa phát hiện vẫn có thể mất."));
  add(B("**Cắt client chậm** là một đánh đổi: chi nhánh bị cắt phải nối lại, nhưng hệ thống chung không bị kéo chậm."));
  add(B("**Giám sát an ninh** dựa trên ngưỡng tần suất. Kẻ tấn công đủ kiên nhẫn để đi dưới ngưỡng sẽ không bị phát hiện; bộ giám sát giảm thiệt hại chứ không thay thế được TLS và xác thực mạnh."));
  add(H3("10.5.3. Ý nghĩa"));
  add(P("Kết quả cho thấy trong một ứng dụng Client/Server, các lỗi nguy hiểm nhất không đến từ trường hợp thông thường mà từ **đồng thời và mất kết nối**, và mỗi lỗi chỉ lộ ra khi được tái hiện có chủ đích: 50 ACCEPT cùng một lúc, một client ngừng đọc, 300 client cùng nối lại, 1000 kết nối cùng nhận tin. Việc giữ baseline bằng cờ cấu hình và có bộ thực nghiệm tự động vì vậy là một phần của giải pháp, chứ không chỉ để viết báo cáo: chính E7 và E9 đã phát hiện hai điểm nghẽn mà kiểm thử chức năng không thấy."));
};
