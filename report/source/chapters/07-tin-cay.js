// Chương 7. Cơ chế tin cậy và chịu lỗi (N3)
module.exports = (L) => {
  const { add, P, H1, H2, H3, B, N, newList, table, figure, code } = L;

  add(H1("7. Cơ chế tin cậy và chịu lỗi", "7"));
  add(P("Chương 6 bảo đảm server phục vụ được nhiều kết nối mà không để một kết nối kéo chậm kết nối khác. Chương này giải quyết câu hỏi tiếp theo: **khi kết nối đứt hoặc nhiều kết nối tranh nhau một dữ liệu, làm sao hệ thống vẫn đúng?** Nguyên tắc chung là coi CSDL là nguồn sự thật duy nhất, còn kết nối TCP chỉ là kênh truyền có thể đứt bất cứ lúc nào. Mất kết nối hay gửi lặp chỉ được phép làm chậm, không được làm sai dữ liệu."));

  add(H2("7.1. Giao tin theo trạng thái"));
  add(H3("7.1.1. Vấn đề"));
  add(P("Đặc tả ban đầu (FR-21) yêu cầu: nếu chi nhánh offline thì xếp tin vào bảng `hang_doi_tin` và gửi khi chi nhánh đăng nhập lại. Cách này chỉ đúng khi server **biết** chi nhánh đã offline. Trong trường hợp rút dây mạng (mục 2.2.4), server vẫn thấy phiên còn sống trong khoảng 30–40 giây cho tới khi heartbeat hết hạn. Mọi tin gửi trong khoảng đó đều “thành công” ở phía server, vì `write` chỉ chép vào bộ đệm, nhưng không bao giờ tới chi nhánh. Một OFFER mất theo cách này để lại một yêu cầu treo mãi ở trạng thái “đã đề xuất” mà chi nhánh không hề biết."));
  add(H3("7.1.2. Giải pháp"));
  add(P("Lớp `Outbox` có hai thao tác. `send(maCN, tin)` gửi ngay nếu chi nhánh có phiên đang mở, nếu không thì ghi vào `hang_doi_tin`. `deliverOnLogin` được gọi ngay sau khi gửi `LOGIN_OK`. Ở chế độ đề xuất `queue_resync`, `deliverOnLogin` làm hai bước:"));
  const s = newList();
  add(N("Gửi các tin **không gắn với trạng thái** còn trong `hang_doi_tin` (như BROADCAST), đánh dấu đã gửi. Các tin gắn với trạng thái trong hàng đợi (OFFER, OUT_OF_STOCK, DELIVERED, TRANSFER_REQ, NOTICE) được bỏ qua, vì bước 2 sẽ gửi bản mới nhất của chúng.", s));
  add(N("Hỏi lần lượt các **nguồn đồng bộ** đã đăng ký (yêu cầu cấp hàng, điều chuyển, thông báo) để lấy trạng thái hiện tại của mọi việc còn mở của chi nhánh, rồi gửi lại thành tin: YC ở DA_DE_XUAT → `OFFER`; THIEU_HANG → `OFFER` + `OUT_OF_STOCK`; DA_GIAO → `DELIVERED`; điều chuyển đang chờ chi nhánh này đồng ý → `TRANSFER_REQ`; thông báo 30 ngày gần nhất → `NOTICE`.", s));
  add(figure("docs/img/resync.png", "Rút dây mạng: OFFER bị mất, heartbeat đóng phiên, chi nhánh nối lại và nhận lại OFFER từ trạng thái trong CSDL", "resync", 560));
  add(P("Bước 2 **không cần biết tin nào đã tới**. Nó không dựa vào việc server phát hiện mất kết nối đúng lúc, nên phủ được cả ba trường hợp: chi nhánh đóng ứng dụng, rút dây, và server khởi động lại (khi đó mọi phiên đều mới). Đây là cách đồng bộ theo mức (level-triggered) đã nêu ở mục 2.6. Cái giá phải trả là chi nhánh có thể nhận **trùng**, chẳng hạn một OFFER đã tới trước khi rút dây sẽ tới lần nữa. Hệ thống chịu được trùng nhờ ba điều:"));
  add(B("Client lưu yêu cầu theo mã YC (`BranchState.requests` là một bảng theo mã). Tin trùng chỉ ghi đè cùng một mục, không tạo mục mới trên giao diện."));
  add(B("Mọi lệnh trả lời của chi nhánh đều **idempotent** ở server. `ACCEPT` một YC đã giao trả lại `DELIVERED` cũ, không trừ kho lần hai. `RECEIVED` một YC đã hoàn tất không cộng kho lần hai. `TRANSFER_ACCEPT` lặp trả lại kết quả cũ."));
  add(B("CSDL có ràng buộc làm lớp bảo vệ cuối: `phieu_xuat.ma_yc` UNIQUE (một YC chỉ xuất kho một lần), `uq_cong_no_yc` (một YC chỉ ghi nợ một lần)."));
  add(table("Ba chế độ giao tin (cờ `delivery`)", [
    ["Chế độ", "Chi nhánh offline (server biết)", "Rút dây (server chưa biết)", "Nhận trùng"],
    ["`none` (baseline 1)", "Mất", "Mất", "Không"],
    ["`queue` (theo SRS, baseline 2)", "Xếp hàng, gửi khi đăng nhập", "Mất: server tưởng đã gửi", "Không"],
    ["`queue_resync` (đề xuất)", "Gửi lại trạng thái hiện tại", "Gửi lại trạng thái hiện tại", "Có thể; client và server chịu được"],
  ], [3, 3.2, 3.2, 2.6], [], "delivery-modes"));
  add(P("Thực nghiệm E2 (mục 10.3) đo đúng ba chế độ này với 30 chi nhánh liên tục mất kết nối theo cả hai kiểu. Lưu ý: `BROADCAST` không thuộc trạng thái của yêu cầu nào, nên một broadcast gửi vào socket “chết” mà server chưa phát hiện vẫn có thể mất (mục 12.1)."));

  add(H2("7.2. Phía chi nhánh: giữ kết nối và tự phục hồi"));
  add(P("Ở `client.jar`, `ServerLink` mở socket (timeout 3 giây) và chạy một luồng **Listener** riêng, đọc từng dòng bằng `LineReader`, giải mã rồi chuyển cho `BranchAgent`. Dòng nào không giải mã được thì bị bỏ qua và ghi sự kiện, kết nối vẫn tiếp tục. Luồng giao diện (các request HTTP từ trình duyệt) không bao giờ đọc socket. Nó chỉ gửi tin qua `ServerLink.send` và đọc trạng thái mà Listener đã cập nhật vào `BranchState`."));
  add(P("Một luồng định kỳ của `BranchAgent` chạy mỗi 200 ms và làm hai việc. **Heartbeat:** im lặng 30 giây thì gửi PING, quá 10 giây không nhận được gì thì đóng kết nối. **Tự nối lại:** khi kết nối đã đóng mà người dùng chưa đăng xuất, nó chờ tới thời điểm `nextAttemptAt` rồi thử kết nối và tự gửi lại `LOGIN` bằng thông tin đăng nhập đã lưu. Mỗi lần thất bại, `nextAttemptAt` được dời thêm một khoảng do `ReconnectPolicy` quyết định. Trạng thái kết nối (đang tìm server, đang kết nối, online, mất kết nối) được đẩy lên giao diện qua SSE, nên nhân viên chi nhánh luôn biết hệ thống có đang nối với công ty hay không."));
  add(P("Chi nhánh cũng tự chống gửi trùng cảnh báo (FR-13): chỉ gửi `LOW_STOCK` cho một mặt hàng khi tồn dưới ngưỡng **và** chưa có yêu cầu nào còn mở cho mặt hàng đó. Server có thêm chỉ mục `uq_yeu_cau_dang_mo` làm lớp chống trùng thứ hai (`INSERT … ON CONFLICT DO NOTHING`). Vì vậy, kể cả khi client gửi lặp sau khi nối lại, server vẫn chỉ có một yêu cầu mở."));

  add(H2("7.3. Chính sách nối lại jitter lệch pha"));
  add(P("Đặc tả yêu cầu chi nhánh tự nối lại, mỗi lần chờ 5 giây (FR-05). Như đã phân tích ở mục 2.8, nếu 300 chi nhánh cùng mất kết nối khi server khởi động lại thì nhịp cố định làm tất cả thử lại cùng lúc. Exponential backoff có full jitter rải đều các lần thử nhưng lại thử rất dày lúc đầu. Nhóm đề xuất chính sách **jitter lệch pha**. Gọi C là trần chờ (`reconnect.cap.ms` = 5000 ms) và n là số lần đã thất bại:"));
  add(code([
    "fixed   (baseline SRS) : d(n) = C",
    "backoff (so sánh)      : d(n) ~ U[0, min(C, 500 ms · 2^n)]        -- full jitter",
    "jitter  (đề xuất)      : d(0) ~ U[0, C];   d(n ≥ 1) ~ U[C/2, C]",
  ]));
  add(P("Lần thử đầu tiên rải các chi nhánh **đều trong khoảng [0, C]**, làm lệch pha chúng với nhau ngay từ đầu. Các lần sau giữ chu kỳ trong [C/2, C]: đủ dài để không thử dồn dập khi server còn tắt, đủ ngẫu nhiên để các chi nhánh không “bắt nhịp” lại với nhau. Vì d(n) ≤ C ở mọi lần thử, mỗi chi nhánh thử ít nhất một lần trong mỗi khoảng C, nên luôn nối lại trong vòng C = 5 giây sau khi server lên. Đặc tả được giữ nguyên. Hiện thực trong lớp `ReconnectPolicy` (dùng chung cho client và trình giả lập):"));
  add(code([
    "public long delayMs(int attempt) {",
    "    if (kind == Kind.FIXED) return capMs;",
    "    if (kind == Kind.JITTER) {",
    "        long low = attempt == 0 ? 0 : capMs / 2;",
    "        return low + (long) (random.nextDouble() * (capMs - low + 1));",
    "    }",
    "    long ceiling = Math.min(capMs, baseMs << Math.min(attempt, 20));   // BACKOFF",
    "    return (long) (random.nextDouble() * (ceiling + 1));",
    "}",
  ]));

  add(H2("7.4. Trừ kho nguyên tử khi nhiều kết nối tranh nhau"));
  add(P("Nhiều chi nhánh có thể gửi `ACCEPT` cho cùng một mặt hàng trong vài mili-giây, và admin có thể bấm Gửi hàng cho nhiều yêu cầu liên tiếp. Trên server NIO, các tin này chạy song song trên các worker khác nhau (mục 6.4.2), nên đúng là tình huống lost update của mục 2.7. Khi nhận `ACCEPT|maYC|soLuong`, `RequestService` chạy các bước sau trong **một transaction**:"));
  add(code([
    "BEGIN",
    "SELECT … FROM yeu_cau WHERE ma_yc = ? AND ma_cn = <mã trong phiên> FOR UPDATE",
    "  -- DA_GIAO / HOAN_TAT: trả lại DELIVERED cũ (idempotent), dừng",
    "  -- khác DA_DE_XUAT / THIEU_HANG: ERROR|E03",
    "UPDATE kho_tong SET so_luong = so_luong - ? WHERE ma_sp = ? AND so_luong >= ?",
    "  -- 0 dòng bị ảnh hưởng: YC → THIEU_HANG, COMMIT, trả OUT_OF_STOCK|maYC|tồn còn|maHang",
    "INSERT INTO phieu_xuat (ma_yc UNIQUE, …);  UPDATE yeu_cau SET trang_thai = 'DA_GIAO'",
    "COMMIT;  gửi DELIVERED|maYC|maHang|soLuong",
  ]));
  add(P("Điểm then chốt là **phép kiểm tra đủ hàng và phép trừ nằm trong cùng một câu `UPDATE`**. Khi hai giao dịch cùng trừ một mặt hàng, giao dịch sau phải chờ khóa dòng `kho_tong`. Khi giao dịch trước commit, PostgreSQL đánh giá lại điều kiện `so_luong >= ?` trên giá trị mới {cite:pgdocs}. Nếu không còn đủ, câu lệnh cập nhật 0 dòng và yêu cầu chuyển sang THIEU_HANG thay vì bị xuất vượt. Khóa dòng chỉ giữ trong lúc cập nhật một dòng (vài mili-giây), không phải suốt cả giao dịch như khi dùng khóa Java."));
  add(P("Nút **Gửi hàng** trên trang công ty dùng đúng câu `UPDATE` có điều kiện này, chỉ khác là không chờ chi nhánh ACCEPT. Thêm vào đó có ba lớp bảo vệ khác:"));
  add(B("`SELECT … FOR UPDATE` trên dòng yêu cầu tuần tự hóa các thao tác trên **cùng một** yêu cầu, ví dụ ACCEPT lặp tới gần như cùng lúc."));
  add(B("`phieu_xuat.ma_yc` UNIQUE: kể cả khi có lỗi lập trình, một yêu cầu không thể được xuất kho hai lần."));
  add(B("**Thứ tự khóa cố định:** giao dịch cấp hàng và giao dịch điều chuyển đều khóa yêu cầu trước rồi mới khóa bản ghi điều chuyển. Điều kiện chờ vòng của deadlock vì thế bị phá (mục 2.7)."));
  add(P("Để đo tác dụng, `RequestService` giữ hai cách làm baseline, chọn bằng cờ `accept.strategy` ({tab:accept})."));
  add(table("Ba chiến lược trừ kho (cờ `accept.strategy`)", [
    ["Chiến lược", "Cách trừ kho", "Đúng?", "Ghi chú"],
    ["`check_then_act` (baseline 1)", "`SELECT so_luong`, so sánh trong Java, rồi `UPDATE SET so_luong = <giá trị đã tính>`", "Sai", "Lost update: hai giao dịch cùng đọc rồi ghi đè nhau"],
    ["`synchronized` (baseline 2)", "Như trên nhưng bọc cả giao dịch trong một khối `synchronized` của Java", "Đúng khi chỉ có một tiến trình", "Mọi ACCEPT xếp hàng qua một khóa; sai khi chạy nhiều server"],
    ["`conditional` (đề xuất)", "`UPDATE … SET so_luong = so_luong - ? WHERE … AND so_luong >= ?`", "Đúng", "Khóa dòng ngắn nhất; đúng cả khi nhiều tiến trình dùng chung CSDL"],
  ], [2.8, 4.6, 1.6, 3], [], "accept"));

  add(H2("7.5. Lỗi CSDL và giao dịch"));
  add(P("Mọi thao tác ghi đi qua hàm `Db.tx`: lấy một kết nối từ pool HikariCP, tắt auto-commit, chạy thân hàm, rồi commit; có ngoại lệ thì rollback và trả kết nối về pool. `ClientHandler` bắt `SQLException` và trả `ERROR|E03|Loi CSDL, thu lai sau`, nên lỗi CSDL không bao giờ làm đóng kết nối TCP hay làm chết luồng worker. Vì chỉ server truy cập CSDL, và mọi tin đẩy đều gửi **sau khi** commit, chi nhánh không bao giờ thấy một trạng thái sẽ bị rollback."));
};
