// Chương 6. Hiện thực tầng mạng phía server (N2)
module.exports = (L) => {
  const { add, P, H1, H2, H3, B, N, newList, table, figure, code } = L;

  add(H1("6. Hiện thực tầng mạng phía server", "6"));
  add(P("Chương này mô tả cách tầng mạng của `server.jar` được hiện thực: cách tách phần vận chuyển byte khỏi phần xử lý phiên để cùng một mã nghiệp vụ chạy được trên hai mô hình I/O, server BIO, server NIO, cách giữ thứ tự tin, đường ghi, nhật ký bất đồng bộ và broadcast."));

  add(H2("6.1. Tổ chức mã nguồn"));
  add(P("Project là một dự án Maven nhiều module. {tab:modules} là quy mô từng module (đếm cả dòng trống và chú thích)."));
  add(table("Các module và số dòng mã nguồn", [
    ["Module", "Nội dung", "Mã chính", "Mã test"],
    ["common", "`Protocol`, `Command`, `ErrorCode`, `LineReader`, `LineSplitter`, `ReconnectPolicy`; tiện ích HTTP/SSE dùng chung (`Router`, `SseHub`, `OriginGuard`)", "996", "376"],
    ["server", "Tầng mạng BIO/NIO, phiên, nghiệp vụ, Outbox, nhật ký, giám sát an ninh, API admin và thực nghiệm", "5 636", "501"],
    ["client", "`ServerLink`, `BranchAgent`, `Discovery`, `ClientSecurity`, API cục bộ", "1 470", "199"],
    ["loadsim", "Giả lập tải (TC-11) và bộ thực nghiệm E1–E9", "2 623", "—"],
    ["ui", "Next.js/TypeScript: trang đăng nhập, trang công ty, trang chi nhánh", "3 640", "—"],
  ], [1.4, 7, 1.6, 1.4], [2, 3], "modules"));
  add(table("Các lớp quan trọng của tầng mạng", [
    ["Lớp", "Vai trò"],
    ["`NetServer`", "Lớp cha của hai server: mở cổng, bộ hẹn giờ heartbeat chạy mỗi giây cho mọi kết nối"],
    ["`Transport`", "Giao diện vận chuyển byte của một kết nối: `write(byte[])`, `close()`, `remote()`, `ip()`"],
    ["`BioServer`", "Luồng accept và một luồng đọc cho mỗi kết nối; ghi trực tiếp (baseline) hoặc qua hàng đợi và luồng ghi riêng"],
    ["`NioServer`", "Một luồng Selector, worker pool, hàng đợi tuần tự theo kết nối, ghi không chặn có giới hạn"],
    ["`ClientHandler`", "Một phiên: tách tin, kiểm tra đăng nhập và chiều lệnh, gọi nghiệp vụ, heartbeat; không biết I/O là BIO hay NIO"],
    ["`SessionRegistry`", "Mọi kết nối đang mở và bảng mã CN → phiên đang đăng nhập (`ConcurrentHashMap`)"],
    ["`DiscoveryResponder`", "Luồng nghe UDP 5001, trả `HERE` với địa chỉ cùng mạng con với client"],
    ["`MessageLog`", "Ghi mọi tin vào bảng `nhat_ky` bất đồng bộ theo lô"],
  ], [3, 9]));

  add(H2("6.2. Tách vận chuyển khỏi phiên"));
  add(P("`ClientHandler` chỉ làm việc với dòng tin (chuỗi) và giao diện `Transport`. Nó không biết bên dưới là socket chặn hay channel không chặn. Mỗi server chỉ cần làm hai việc: đưa từng dòng đọc được vào `handler.onLine(line)` theo đúng thứ tự, và cung cấp một `Transport` để handler gửi tin. Nhờ vậy:"));
  add(B("Toàn bộ nghiệp vụ, kiểm tra giao thức, giám sát an ninh và heartbeat dùng chung cho cả hai mô hình I/O."));
  add(B("Chọn mô hình chỉ là một dòng cấu hình (`io.mode=nio|bio`). Thực nghiệm E3, E4, E7, E9 so sánh được hai mô hình trên cùng một mã nghiệp vụ, nên khác biệt đo được chỉ đến từ tầng I/O."));
  add(B("Kiểm thử tích hợp TC-01..TC-12 chạy trên cả hai chế độ."));
  add(figure("docs/img/io-models.png", "Hai mô hình I/O của server: BIO mỗi kết nối hai luồng, NIO một Selector và worker pool", "io-models"));

  add(H2("6.3. Server BIO"));
  add(P("`BioServer` mở `ServerSocket(port, 1000)` và chạy một luồng `tcp-accept`. Mỗi kết nối được nhận thì bật `TCP_NODELAY`, `SO_KEEPALIVE`, kiểm tra giới hạn kết nối và IP bị chặn, rồi giao cho một luồng đọc riêng. Luồng này lặp `LineReader.readLine()` → `handler.onLine(line)` tới khi client đóng. Vì một kết nối chỉ có một luồng đọc, các dòng của nó tự nhiên được xử lý đúng thứ tự. Phần ghi có hai biến thể, chọn bằng `write.mode`:"));
  add(B("**`direct` (baseline):** luồng gọi `send` ghi thẳng vào `OutputStream` của socket trong một khối `synchronized`. Nếu client không đọc, bộ đệm TCP đầy và luồng gọi bị chặn. Nếu luồng gọi đang lặp gửi broadcast cho mọi chi nhánh, nó đứng lại ở chi nhánh treo (E3)."));
  add(B("**`queued`:** mỗi kết nối có một `ArrayBlockingQueue` giới hạn `send.queue.limit` tin và một luồng `writer` riêng lấy tin ra ghi. `send` chỉ `offer` vào hàng đợi rồi trả về ngay. Hàng đợi đầy nghĩa là client đọc quá chậm: server đóng kết nối đó."));
  add(P("Với `queued`, mỗi kết nối tốn **hai luồng** (đọc và ghi). Đây là lý do số luồng của server BIO tăng từ 117 lên 1017 khi số chi nhánh tăng từ 50 lên 500, và lên 2017 ở 1000 chi nhánh (E4, E7)."));

  add(H2("6.4. Server NIO"));
  add(H3("6.4.1. Vòng lặp Selector"));
  add(P("`NioServer` mở `ServerSocketChannel` không chặn với backlog 1000, đăng ký `OP_ACCEPT` với một `Selector`, rồi chạy **một luồng `nio-selector`** duy nhất. Rút gọn từ mã nguồn:"));
  add(code([
    "while (running) {",
    "    selector.select(500);",
    "    Runnable task;                 // việc luồng khác nhờ làm trên luồng Selector",
    "    while ((task = selectorTasks.poll()) != null) task.run();",
    "    for (SelectionKey key : selector.selectedKeys()) {   // (đã xoá key khỏi tập)",
    "        if (key.isAcceptable()) { accept(); continue; }",
    "        Conn c = (Conn) key.attachment();",
    "        if (key.isReadable()) c.read();             // đọc → tách dòng → hàng đợi",
    "        if (key.isValid() && key.isWritable()) c.flush();   // ghi phần còn lại",
    "    }",
    "}",
  ]));
  add(P("Mọi thao tác thay đổi `SelectionKey` (bật/tắt `OP_WRITE`, hủy key, đóng channel) chỉ chạy trên luồng Selector. Luồng khác muốn làm thì đặt một `Runnable` vào `selectorTasks` rồi gọi `selector.wakeup()`. Cách này tránh tranh chấp trên các cấu trúc của Selector, vốn không an toàn khi dùng từ nhiều luồng."));
  add(H3("6.4.2. Đường đọc và giữ thứ tự tin"));
  add(P("Mỗi kết nối (`Conn`) có một bộ đệm đọc 8 KB, một `LineSplitter` và một **`SerialExecutor`**. Khi kênh sẵn sàng đọc, luồng Selector đọc vào bộ đệm, cho `LineSplitter` tách dòng, và với mỗi dòng gọi `serial.execute(() -> handler.onLine(line))`. `SerialExecutor` là một hàng đợi tác vụ riêng của kết nối chạy trên **worker pool chung 16 luồng**. Tại mỗi thời điểm, hàng đợi đó có tối đa một tác vụ đang chạy, và tác vụ kế tiếp chỉ được đẩy vào pool khi tác vụ trước xong. Kết quả là:"));
  add(B("Các dòng của **cùng một chi nhánh** được xử lý tuần tự, đúng thứ tự gửi. Nhờ vậy `SALE` luôn xong trước `LOW_STOCK` mà nó gây ra."));
  add(B("Các chi nhánh **khác nhau** được xử lý song song trên 16 worker."));
  add(B("Luồng Selector không bao giờ chờ CSDL. Việc nặng nằm ở worker, đúng tinh thần mẫu Reactor (mục 2.5.2)."));
  add(P("Khi kết nối đóng, `handler.onClosed()` cũng được đưa vào chính `SerialExecutor` đó, nên phiên chỉ bị dọn sau khi mọi dòng đã nhận trước đó được xử lý xong."));
  add(H3("6.4.3. Đường ghi không chặn"));
  add(P("Tin gửi đi được bọc thành `ByteBuffer` và đặt vào một hàng đợi không khóa của kết nối. Vấn đề khó là **không được để hai luồng cùng ghi một channel**, trong khi tin có thể được gửi từ bất kỳ worker nào (trả lời của chính chi nhánh, push do admin bấm, broadcast). Cờ nguyên tử `writeScheduled` đóng vai trò “quyền ghi”: luồng nào đổi được cờ từ false sang true bằng compare-and-set thì luồng đó ghi. Rút gọn:"));
  add(code([
    "public boolean write(byte[] line) {",
    "    if (pending.incrementAndGet() > sendQueueLimit) {   // client đọc quá chậm",
    "        close(); return false;",
    "    }",
    "    out.add(ByteBuffer.wrap(line));",
    "    if (writeScheduled.compareAndSet(false, true)) {        // giành quyền ghi",
    "        if (writeThrough && writeNow()) return true;         // ghi thẳng trên worker",
    "        selectorTasks.add(() -> key.interestOps(OP_READ | OP_WRITE));",
    "        selector.wakeup();                                    // phần còn lại: Selector ghi",
    "    }",
    "    return true;",
    "}",
  ]));
  add(P("Với `nio.write.through=true` (mặc định), worker giành được quyền ghi sẽ ghi luôn hàng đợi vào channel không chặn. Thường bộ đệm TCP còn trống nên tin đi ngay mà không phải đánh thức luồng Selector. Chỉ khi bộ đệm đầy (`write` trả về chưa hết), quyền ghi mới được giao cho Selector qua `OP_WRITE`, và Selector ghi tiếp khi socket sẵn sàng. Baseline `nio.write.through=false` luôn đi đường Selector. Ở 1000 chi nhánh × 10 tin/giây, mỗi tin phải đánh thức Selector một lần, làm p95 tăng từ 1,49 ms lên 8,50 ms (E7, mục 10.1). Sau khi ghi xong, cờ được trả về false và hàng đợi được kiểm tra lại một lần nữa. Bước kiểm tra lại này đóng lỗ hổng khi có tin mới được thêm đúng lúc luồng ghi vừa thấy hàng đợi rỗng."));
  add(P("**Giới hạn hàng đợi gửi** (`send.queue.limit`, mặc định 2000 tin) là cơ chế áp lực ngược (mục 2.5.3). Chi nhánh không đọc làm số tin chờ tăng, và khi vượt giới hạn, server đóng đúng kết nối đó. Không luồng nào bị chặn, không chi nhánh nào khác bị ảnh hưởng."));

  add(H2("6.5. Phiên làm việc: ClientHandler và SessionRegistry"));
  add(P("Mỗi dòng đi qua `ClientHandler.onLine` theo một đường ống cố định:"));
  const p = newList();
  add(N("Cập nhật thời điểm nhận gần nhất (cho heartbeat) và xóa hạn chót PONG nếu đang chờ.", p));
  add(N("Dòng `TOO_LONG` hoặc giải mã lỗi → `ERROR|E01`, ghi nhật ký, đếm vào quy tắc FUZZING.", p));
  add(N("Ghi tin vào nhật ký; báo `SecurityMonitor` để đếm tần suất. Nếu phiên gửi lệnh dồn dập ở chế độ `block`: `ERROR|E06` rồi đóng.", p));
  add(N("Kiểm tra chiều lệnh (chỉ nhận lệnh từ chi nhánh lên) và trạng thái đăng nhập (`E02`).", p));
  add(N("Gọi dịch vụ nghiệp vụ với **mã chi nhánh của phiên**; trả kết quả qua `send`.", p));
  add(N("Ánh xạ ngoại lệ thành mã lỗi: lỗi nghiệp vụ mang sẵn mã E01–E05, lỗi CSDL thành E03 (transaction đã rollback), lỗi ngoài dự kiến thành E03. Không ngoại lệ nào thoát ra làm chết luồng.", p));
  add(P("`SessionRegistry` giữ hai cấu trúc an toàn luồng: tập mọi kết nối đang mở (để áp `max.clients` và để heartbeat duyệt), và bảng `maCN → ClientHandler` của các phiên đã đăng nhập. Đăng nhập dùng `putIfAbsent`, nên hai kết nối cùng mã chi nhánh không thể cùng thành công, kể cả khi tới đúng cùng một thời điểm."));

  add(H2("6.6. Nhật ký mọi tin, ghi bất đồng bộ theo lô"));
  add(P("FR-25 yêu cầu ghi mọi tin vào và ra tới mili-giây. Ghi đồng bộ, mỗi tin một câu `INSERT`, thì mỗi tin phải chờ một vòng tới CSDL, và với hàng nghìn tin/giây CSDL thành nút cổ chai. `MessageLog` đẩy bản ghi vào một hàng đợi giới hạn 100 000 phần tử. Một luồng riêng lấy ra từng lô tới **2000 dòng** và ghi bằng batch JDBC, với tùy chọn `reWriteBatchedInserts` của driver PostgreSQL để gộp thành câu `INSERT` nhiều dòng. Thực nghiệm E7 ở 1000 chi nhánh (khoảng 20 000 bản ghi/giây) phát hiện bản trước, với lô 500 dòng, không theo kịp và bỏ 20–30 nghìn bản ghi khi hàng đợi đầy. Sau khi tăng lô và bật ghi gộp, không lần chạy nào bỏ bản ghi."));

  add(H2("6.7. Broadcast tới nhiều chi nhánh"));
  add(P("`Outbox.broadcast` lặp qua mọi chi nhánh: chi nhánh đang online thì gọi `send` trên phiên của nó, chi nhánh offline thì tin được xếp vào `hang_doi_tin`. Chi phí của một broadcast vì vậy tỉ lệ với số chi nhánh. Thực nghiệm E9 (mục 10.2) cho thấy ở chế độ NIO ghi thẳng, chính luồng gọi broadcast thực hiện lần lượt 1000 lời gọi `write` không chặn, mỗi lời gọi khoảng 37 µs trên loopback Windows. Trong khi đó, BIO kiểu `queued` chỉ đưa tin vào 1000 hàng đợi và để 1000 luồng ghi chạy song song. Đây là một đánh đổi thật giữa số luồng và độ trễ broadcast, được thảo luận ở mục 10.5."));
};
