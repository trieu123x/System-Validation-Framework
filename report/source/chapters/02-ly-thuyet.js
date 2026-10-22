// Chương 2. Cơ sở lý thuyết và công trình liên quan
// 2.1–2.4: N1 · 2.5: N2 · 2.6–2.8: N3 · 2.9–2.10: N4 · 2.11: cả nhóm
module.exports = (L) => {
  const { add, P, H1, H2, H3, B, N, newList, table, code } = L;

  add(H1("2. Cơ sở lý thuyết và công trình liên quan", "2"));
  add(P("Chương này trình bày các kiến thức nền mà mọi quyết định thiết kế ở Chương 4–8 dựa vào. Mỗi mục đi từ khái niệm chung tới hệ quả cụ thể đối với hệ thống phân phối hàng hóa, để người đọc thấy vì sao hệ thống được thiết kế như vậy, chứ không chỉ biết nó được thiết kế thế nào."));

  // ---------------- 2.1 ----------------
  add(H2("2.1. Mô hình phân tầng TCP/IP và giao diện socket"));
  add(P("Bộ giao thức Internet chia việc truyền dữ liệu thành các tầng, mỗi tầng chỉ dùng dịch vụ của tầng ngay dưới và cung cấp dịch vụ cho tầng ngay trên {cite:kurose}. Tầng liên kết (Ethernet, Wi-Fi) chuyển khung tin trong một đoạn mạng. Tầng mạng (IP) chuyển gói tin giữa các máy theo địa chỉ IP, nhưng không bảo đảm gói tới nơi, tới đúng thứ tự hay không bị nhân đôi. Tầng giao vận (TCP, UDP) dùng số cổng (port) để phân biệt các tiến trình trên cùng một máy, và quyết định có bù đắp những thiếu sót của IP hay không. Tầng ứng dụng là nơi các chương trình như HTTP, SMTP, hay giao thức của project này định nghĩa nội dung và ý nghĩa của thông điệp."));
  add(table("Các tầng của mô hình TCP/IP và vị trí của project", [
    ["Tầng", "Ví dụ giao thức", "Đơn vị dữ liệu", "Trong project"],
    ["Ứng dụng", "HTTP, SMTP, DNS, giao thức của nhóm", "Thông điệp", "33 lệnh dạng `LENH|thamSo…` (Chương 5); HTTP/SSE cho giao diện cục bộ"],
    ["Giao vận", "TCP, UDP", "Đoạn (segment) / datagram", "TCP cổng 5000 cho chi nhánh ↔ server; UDP cổng 5001 cho khám phá server"],
    ["Mạng", "IPv4, IPv6, ICMP", "Gói (packet)", "Địa chỉ LAN của server; loopback 127.0.0.1 khi thực nghiệm"],
    ["Liên kết", "Ethernet, Wi-Fi", "Khung (frame)", "Mạng LAN của công ty và chi nhánh"],
  ], [1.6, 3.2, 2.4, 4.8]));
  add(P("**Socket** là giao diện lập trình mà hệ điều hành cung cấp cho tầng ứng dụng để dùng TCP và UDP {cite:stevens}. Một kết nối TCP được xác định duy nhất bởi bộ bốn (IP nguồn, cổng nguồn, IP đích, cổng đích). Phía server tạo socket lắng nghe (`bind` vào một cổng, `listen` với một hàng đợi chờ – backlog), rồi gọi `accept` để nhận từng kết nối mới thành một socket riêng. Phía client gọi `connect` tới địa chỉ và cổng của server; hệ điều hành tự gán một cổng nguồn tạm (ephemeral port). Sau khi kết nối, hai bên dùng `read`/`write` trên socket như trên một tệp, và `close` khi xong."));
  add(P("Trong Java, các thao tác này tương ứng với `ServerSocket`, `Socket` (kiểu chặn) và `ServerSocketChannel`, `SocketChannel` (kiểu không chặn) {cite:javaapi}. Server của project mở `ServerSocket(5000, 1000)` hoặc `ServerSocketChannel.bind(…, 1000)`, tức backlog 1000: hệ điều hành giữ tối đa 1000 kết nối đã bắt tay xong nhưng ứng dụng chưa kịp `accept`. Giá trị này quan trọng khi 1000 chi nhánh ảo cùng kết nối trong thực nghiệm."));

  // ---------------- 2.2 ----------------
  add(H2("2.2. Giao thức TCP"));
  add(P("TCP cung cấp cho ứng dụng một **luồng byte hai chiều, tin cậy và có thứ tự** giữa hai tiến trình {cite:rfc9293}. “Tin cậy” nghĩa là byte nào đã được giao cho ứng dụng bên nhận thì đúng nội dung, đúng thứ tự, không trùng. TCP đạt được điều này bằng số thứ tự (sequence number) cho từng byte, xác nhận (ACK) tích lũy, đặt hẹn giờ và truyền lại khi không nhận được ACK."));
  add(H3("2.2.1. Thiết lập kết nối: bắt tay ba bước"));
  add(P("Trước khi truyền dữ liệu, hai bên phải đồng bộ số thứ tự ban đầu. Client gửi đoạn SYN mang số thứ tự ban đầu x. Server trả SYN-ACK mang số thứ tự ban đầu y của mình và ACK = x + 1. Client gửi ACK = y + 1. Sau ba bước này, kết nối ở trạng thái ESTABLISHED ở cả hai đầu. Bắt tay do hệ điều hành thực hiện. Với ứng dụng, `connect` trả về khi bắt tay xong, còn `accept` trả về một kết nối đã ở trạng thái ESTABLISHED và lấy từ hàng đợi backlog. Hệ quả cho thiết kế: chi phí một lần kết nối gồm ít nhất một vòng khứ hồi (RTT) trước khi gửi được byte đầu tiên. Vì vậy project giữ **một kết nối bền vững** cho mỗi chi nhánh thay vì mở kết nối mới cho từng yêu cầu."));
  add(H3("2.2.2. Truyền dữ liệu, kiểm soát luồng và bộ đệm"));
  add(P("Mỗi socket TCP có một bộ đệm gửi và một bộ đệm nhận do hệ điều hành quản lý. Lệnh `write` của ứng dụng chỉ chép byte vào bộ đệm gửi rồi trả về. Việc gửi thật, chờ ACK và truyền lại diễn ra sau đó, bất đồng bộ với ứng dụng {cite:stevens}. Bên nhận quảng bá kích thước cửa sổ nhận (receive window) bằng phần còn trống của bộ đệm nhận. Đây là cơ chế **kiểm soát luồng** (flow control): nếu ứng dụng bên nhận không đọc, cửa sổ giảm về 0 và bên gửi phải dừng."));
  add(P("Hai hệ quả của cơ chế này là nền tảng cho Chương 6 và 7:"));
  add(B("**`write` thành công không có nghĩa bên kia đã nhận.** Nó chỉ có nghĩa dữ liệu đã vào bộ đệm gửi của máy mình. Nếu đường truyền đứt ngay sau đó, dữ liệu sẽ không bao giờ tới, và ứng dụng gửi không được báo ngay."));
  add(B("**Một bên nhận không đọc có thể chặn bên gửi.** Khi cửa sổ của bên nhận bằng 0 và bộ đệm gửi đầy, `write` kiểu chặn sẽ đứng chờ vô hạn, còn `write` không chặn trả về 0 byte. Nếu luồng đang chờ đó cũng là luồng phục vụ những client khác, cả hệ thống đứng theo. Đây chính là tình huống “client chậm” của thực nghiệm E3."));
  add(P("Với thông điệp nhỏ, thuật toán **Nagle** gom các mảnh nhỏ lại khi còn dữ liệu chưa được xác nhận {cite:rfc896}. Kết hợp với ACK trễ (delayed ACK) ở bên nhận, Nagle có thể làm một thông điệp ngắn chờ thêm hàng chục tới hàng trăm mili-giây. Các ứng dụng tương tác như project này tắt Nagle bằng tùy chọn `TCP_NODELAY` trên mỗi socket, chấp nhận gửi nhiều gói nhỏ hơn để đổi lấy độ trễ thấp."));
  add(H3("2.2.3. Đóng kết nối, TIME_WAIT và RST"));
  add(P("TCP đóng từng chiều một cách độc lập. Bên muốn đóng gửi FIN; bên kia ACK. Khi bên kia cũng xong việc, nó gửi FIN của mình và nhận ACK. Bên đóng trước (active close) phải ở trạng thái **TIME_WAIT** trong 2 × MSL (thời gian sống tối đa của một đoạn, thường cho tổng cộng 1–4 phút tùy hệ điều hành). Trạng thái này giúp các đoạn cũ còn lạc trên mạng không bị nhầm vào một kết nối mới cùng bộ bốn địa chỉ {cite:rfc9293}. Ngoài cách đóng êm này, một bên có thể gửi **RST** để hủy kết nối ngay, ví dụ khi tiến trình bị tắt đột ngột hoặc khi có đoạn tin tới một cổng không ai lắng nghe. Với ứng dụng, FIN biểu hiện thành `read` trả về −1 (hết luồng), còn RST biểu hiện thành ngoại lệ “connection reset”."));
  add(H3("2.2.4. Kết nối nửa mở và keep-alive"));
  add(P("Nếu một bên biến mất mà không kịp gửi FIN hay RST (rút dây mạng, mất điện, máy treo), bên còn lại **không nhận được bất kỳ tín hiệu nào**. Kết nối khi đó gọi là **nửa mở** (half-open). Bên còn sống chỉ phát hiện ra khi nó gửi dữ liệu và hết số lần truyền lại, việc có thể mất nhiều phút, hoặc khi cơ chế keep-alive của TCP thăm dò. Theo RFC 1122, khoảng chờ mặc định trước khi keep-alive thăm dò không được dưới hai giờ {cite:rfc1122}. Khoảng này quá dài với một ứng dụng nghiệp vụ cần biết chi nhánh có online hay không. Vì vậy hầu hết giao thức tầng ứng dụng tự cài **heartbeat**: gửi một tin nhỏ định kỳ khi kết nối im lặng, và coi kết nối đã chết nếu không có trả lời trong một thời hạn. Project dùng PING/PONG với ngưỡng 30 giây im lặng và 10 giây chờ trả lời (mục 5.7)."));

  // ---------------- 2.3 ----------------
  add(H2("2.3. Đóng khung thông điệp và thiết kế giao thức tầng ứng dụng"));
  add(P("Vì TCP chỉ là một luồng byte, nó **không giữ ranh giới thông điệp**. Hai lần `write` của bên gửi có thể tới bên nhận thành một lần `read`, và một lần `write` có thể bị chia ra nhiều lần `read`, tùy kích thước gói, bộ đệm và thời điểm {cite:stevens}. Giao thức tầng ứng dụng vì thế phải tự **đóng khung** (framing), tức tự quy định chỗ một thông điệp kết thúc. Có ba cách phổ biến:"));
  add(table("Các cách đóng khung thông điệp trên TCP", [
    ["Cách đóng khung", "Ví dụ", "Ưu điểm", "Nhược điểm"],
    ["Ký tự phân cách (thường là xuống dòng)", "SMTP, POP3, Redis RESP (một phần), giao thức của project", "Dễ đọc, dễ gõ thử bằng netcat/telnet, dễ quan sát bằng Wireshark", "Nội dung chứa ký tự phân cách phải escape; phải giới hạn độ dài dòng để chống tràn bộ nhớ"],
    ["Tiền tố độ dài", "HTTP/1.1 với Content-Length, nhiều giao thức nhị phân", "Đọc đúng số byte, không cần escape; hợp với dữ liệu nhị phân", "Khó quan sát bằng mắt; độ dài sai làm lệch cả luồng"],
    ["Độ dài cố định", "Một số giao thức điều khiển công nghiệp", "Đơn giản nhất", "Lãng phí; không hợp với thông điệp dài ngắn khác nhau"],
  ], [2.6, 3, 3.2, 3.2]));
  add(P("SMTP là ví dụ kinh điển của giao thức dòng văn bản: mỗi lệnh là một dòng kết thúc bằng CRLF, có độ dài tối đa, và trả lời có mã số {cite:rfc5321}. Redis dùng RESP, kết hợp dòng văn bản với tiền tố độ dài cho chuỗi lớn {cite:resp}. Cả hai cho thấy giao thức văn bản đủ hiệu quả cho thông điệp ngắn, lại rất dễ gỡ lỗi."));
  add(P("Một giao thức tầng ứng dụng đầy đủ còn phải định nghĩa: **cú pháp** (cách mã hóa tên lệnh và tham số, bảng mã ký tự), **ngữ nghĩa** (lệnh nào hợp lệ ở trạng thái nào, ai được gửi lệnh nào), **trình tự** (thứ tự trao đổi, ví dụ phải đăng nhập trước), và **xử lý lỗi** (trả mã lỗi gì, có đóng kết nối không). Một nguyên tắc quan trọng là phía nhận phải phòng thủ: không tin độ dài, số tham số hay giá trị do bên kia gửi, và một thông điệp sai không được làm sập cả tiến trình phục vụ."));

  // ---------------- 2.4 ----------------
  add(H2("2.4. UDP, broadcast và khám phá dịch vụ"));
  add(P("UDP là giao thức giao vận không kết nối: mỗi datagram được gửi độc lập, có tiêu đề 8 byte, không có bắt tay, không xác nhận, không truyền lại và không bảo đảm thứ tự {cite:rfc768}. Đổi lại, UDP có thể gửi tới **địa chỉ broadcast**: địa chỉ giới hạn 255.255.255.255, hoặc địa chỉ broadcast của một mạng con như 192.168.1.255. Mọi máy trong cùng đoạn mạng đều nhận được gói, nhưng router không chuyển tiếp gói broadcast ra mạng khác."));
  add(P("Đặc tính này phù hợp với bài toán **khám phá dịch vụ** (service discovery): một máy mới vào mạng chưa biết địa chỉ server, nên nó hỏi tất cả máy cùng mạng. DHCP dùng broadcast để tìm máy chủ cấp địa chỉ {cite:rfc2131}. Multicast DNS dùng multicast để phân giải tên trong mạng cục bộ {cite:rfc6762}. Vì UDP không tin cậy, bên hỏi phải tự đặt thời hạn chờ và chấp nhận có thể không nhận được trả lời. Vì broadcast không có xác thực, bên hỏi cũng phải tính tới việc **một máy giả mạo trả lời trước** server thật. Project dùng cặp tin `DISCOVER`/`HERE` trên UDP cổng 5001 theo đúng mô hình này, và phía client cảnh báo khi có nhiều server cùng trả lời (mục 5.6, 8.5)."));

  // ---------------- 2.5 ----------------
  add(H2("2.5. Mô hình I/O và xử lý đồng thời ở server"));
  add(P("Một server phải phục vụ nhiều client cùng lúc, trong khi phần lớn thời gian mỗi client chỉ im lặng chờ. Có hai họ mô hình chính để tổ chức việc này {cite:stevens,kegel}."));
  add(H3("2.5.1. I/O chặn và mỗi kết nối một luồng"));
  add(P("Với I/O chặn (blocking I/O), lệnh `read` dừng luồng gọi cho tới khi có dữ liệu. Cách tự nhiên nhất là dành **một luồng cho mỗi kết nối** (thread-per-connection): luồng đó đọc, xử lý và trả lời tuần tự, nên mã dễ viết và dễ hiểu. Nhược điểm là số luồng tăng tuyến tính theo số client. Mỗi luồng Java cần một ngăn xếp riêng (thường cỡ 512 KB – 1 MB bộ nhớ ảo trên 64 bit), và hệ điều hành phải chuyển ngữ cảnh giữa hàng nghìn luồng hầu hết đang ngủ {cite:goetz}. Nếu thêm một luồng ghi riêng cho mỗi kết nối để bên gọi không bị chặn khi ghi, con số này nhân đôi. Thread pool giới hạn được số luồng, nhưng với I/O chặn thì một luồng trong pool vẫn bị giữ suốt lúc chờ client, nên pool chỉ dời giới hạn chứ không bỏ được nó."));
  add(H3("2.5.2. I/O không chặn, ghép kênh và mẫu Reactor"));
  add(P("Bài toán phục vụ hàng chục nghìn kết nối trên một máy (C10K) thúc đẩy mô hình **hướng sự kiện** {cite:kegel}. Socket được đặt ở chế độ không chặn: `read`/`write` trả về ngay, kể cả khi chưa có dữ liệu hoặc bộ đệm đầy. Một lời gọi ghép kênh (I/O multiplexing) theo dõi nhiều socket cùng lúc và cho biết socket nào đã sẵn sàng. Trên Unix là `select`/`poll`, trên Linux là `epoll`, trên BSD là `kqueue`. Windows có thêm IOCP theo mô hình hoàn tất (completion). Từ đó, một hoặc vài luồng phục vụ được mọi kết nối."));
  add(P("Mẫu thiết kế **Reactor** mô tả cấu trúc chuẩn của server kiểu này {cite:reactor}. Bộ tách sự kiện (demultiplexer) chờ các sự kiện sẵn sàng, rồi phân phát (dispatch) từng sự kiện cho bộ xử lý (handler) gắn với kết nối đó. Handler phải làm việc thật nhanh, vì trong lúc nó chạy, luồng Reactor không phục vụ được kết nối khác. Do đó, việc nặng (như truy vấn CSDL) thường được đẩy sang một **worker pool**."));
  add(P("Java cung cấp mô hình này qua gói `java.nio.channels` {cite:javaapi}: `Selector` là bộ tách sự kiện, mỗi `SocketChannel` đăng ký các sự kiện quan tâm (`OP_ACCEPT`, `OP_READ`, `OP_WRITE`) và nhận lại một `SelectionKey`. Dữ liệu đi qua `ByteBuffer`. Các framework như Netty xây dựng trên chính các thành phần này {cite:netty}. Project tự hiện thực Reactor trên Java NIO để thể hiện rõ cơ chế ở mức socket."));
  add(table("So sánh hai mô hình I/O của server", [
    ["Tiêu chí", "Mỗi kết nối một luồng (BIO)", "Selector + worker pool (NIO)"],
    ["Số luồng", "Tăng tuyến tính: 1–2 luồng/kết nối", "Cố định: 1 luồng Selector + k worker"],
    ["Độ phức tạp mã", "Thấp: đọc–xử lý–ghi tuần tự", "Cao: phải tự tách dòng, quản lý bộ đệm, trạng thái ghi dở"],
    ["Thứ tự tin trong một kết nối", "Tự nhiên (một luồng đọc)", "Phải tự giữ (hàng đợi tuần tự theo kết nối)"],
    ["Client chậm", "Ghi chặn có thể treo luồng gọi", "Ghi không chặn; phần dư chờ OP_WRITE"],
    ["Khi tải do CSDL quyết định", "Độ trễ tương đương", "Độ trễ tương đương, thêm một bước chuyển luồng"],
  ], [2.6, 4.6, 4.8], [], "io-compare"));
  add(H3("2.5.3. Áp lực ngược và client chậm"));
  add(P("Khi tốc độ sinh dữ liệu lớn hơn tốc độ tiêu thụ, dữ liệu phải chờ ở đâu đó. Nếu hàng đợi không giới hạn, một client chậm sẽ làm bộ nhớ server tăng mãi. Nếu hàng đợi giới hạn mà bên gửi bị chặn khi đầy, client chậm sẽ làm chậm bên gửi. Cách xử lý chuẩn là **áp lực ngược** (backpressure): giới hạn hàng đợi của từng người tiêu thụ, và khi vượt giới hạn thì chọn một chính sách rõ ràng như bỏ tin, ngắt kết nối hay báo lỗi. Chỉ người tiêu thụ chậm chịu hậu quả {cite:kleppmann}. Project chọn ngắt kết nối của chi nhánh đọc quá chậm, rồi dựa vào cơ chế gửi lại theo trạng thái (mục 7.1) để chi nhánh đó phục hồi khi nối lại."));

  // ---------------- 2.6 ----------------
  add(H2("2.6. Độ tin cậy ở tầng ứng dụng"));
  add(P("TCP chỉ bảo đảm tin cậy **trong phạm vi một kết nối còn sống**. Khi kết nối đứt, những byte đang nằm trong bộ đệm hoặc trên đường truyền có thể mất, và bên gửi không biết chính xác byte nào đã tới. Một kết nối mới không mang theo bất kỳ trạng thái nào của kết nối cũ. Vì vậy, nếu ứng dụng cần “tin đã gửi thì chắc chắn tới”, nó phải tự làm thêm ở tầng ứng dụng {cite:kleppmann}."));
  add(table("Các mức bảo đảm giao tin", [
    ["Mức", "Ý nghĩa", "Cách thường đạt được", "Hệ quả"],
    ["At-most-once", "Tin tới tối đa một lần, có thể mất", "Gửi một lần, không thử lại", "Đơn giản; mất tin khi mạng lỗi"],
    ["At-least-once", "Tin tới ít nhất một lần, có thể trùng", "Lưu tin, gửi lại tới khi được xác nhận hoặc khi kết nối lại", "Không mất; bên nhận phải chịu được tin trùng"],
    ["Exactly-once (hiệu quả)", "Kết quả như thể tin tới đúng một lần", "At-least-once + thao tác idempotent hoặc khử trùng theo mã", "Đúng nhất; đòi hỏi thiết kế ở cả hai đầu"],
  ], [2.2, 3, 3.8, 3]));
  add(P("Giao thức MQTT định nghĩa đúng ba mức này thành QoS 0, 1, 2, với xác nhận và định danh gói ở tầng ứng dụng {cite:mqtt}. Có hai cách phổ biến để đạt at-least-once:"));
  add(B("**Hàng đợi lưu-và-chuyển-tiếp** (store-and-forward): tin cho người nhận đang offline được ghi vào kho bền vững và gửi khi người nhận quay lại. Cách này chỉ hoạt động khi bên gửi **biết** người nhận đang offline."));
  add(B("**Xác nhận ở tầng ứng dụng:** mỗi tin có số thứ tự, bên nhận gửi ACK, bên gửi giữ tin tới khi có ACK. Cách này tổng quát nhưng phải thêm trường vào giao thức và quản lý cửa sổ chưa xác nhận."));
  add(P("Có một cách thứ ba thường bị bỏ qua: **đồng bộ theo trạng thái**. Nếu mọi tin quan trọng đều là hệ quả của một trạng thái bền vững trong CSDL (ví dụ “yêu cầu 57 đang ở trạng thái đã đề xuất 5 cái”), thì không cần nhớ tin nào đã tới. Mỗi lần kết nối được thiết lập lại, server chỉ cần gửi lại **trạng thái hiện tại** của mọi việc còn dang dở. Cách này giống sự khác biệt giữa kích hoạt theo cạnh (edge-triggered, phản ứng với từng sự kiện) và kích hoạt theo mức (level-triggered, phản ứng với trạng thái hiện tại). Kiểu theo mức tự phục hồi được sau mọi lần lỡ sự kiện. Đổi lại, bên nhận có thể nhận trùng, nên mọi thao tác trả lời phải **idempotent**: làm lại lần thứ hai không thay đổi kết quả. Project dùng chính cách này (mục 7.1)."));

  // ---------------- 2.7 ----------------
  add(H2("2.7. Đồng thời trên dữ liệu dùng chung"));
  add(P("Khi nhiều kết nối được xử lý song song, các luồng xử lý tranh nhau cùng một dữ liệu: ở đây là số tồn của một mặt hàng trong kho tổng. **Điều kiện tranh chấp** (race condition) xảy ra khi kết quả phụ thuộc vào thứ tự xen kẽ của các luồng {cite:goetz}. Dạng nguy hiểm nhất với CSDL là **lost update** {cite:kleppmann,berenson}: hai giao dịch cùng đọc tồn 200, cùng tính 200 − 8 = 192 trong ứng dụng, rồi lần lượt ghi 192. Một lần trừ kho bị mất, và cả hai đều tin rằng đã giao hàng thành công."));
  add(P("Ở mức cô lập READ COMMITTED, mặc định của PostgreSQL, lost update kiểu đọc-rồi-ghi không bị ngăn {cite:pgdocs}. Có bốn cách phòng tránh phổ biến:"));
  add(B("**Cập nhật nguyên tử trong CSDL:** `UPDATE kho_tong SET so_luong = so_luong - 8 WHERE ma_sp = ? AND so_luong >= 8`. Phép kiểm tra và phép trừ nằm trong một câu lệnh. PostgreSQL bảo đảm rằng nếu câu `UPDATE` phải chờ khóa dòng do giao dịch khác giữ, sau khi giao dịch đó commit nó sẽ **đánh giá lại điều kiện WHERE trên phiên bản mới nhất** của dòng {cite:pgdocs}."));
  add(B("**Khóa tường minh:** `SELECT … FOR UPDATE` khóa dòng tới hết giao dịch; giao dịch khác muốn khóa cùng dòng phải chờ."));
  add(B("**Mức cô lập cao hơn** (REPEATABLE READ, SERIALIZABLE): CSDL phát hiện xung đột và hủy một giao dịch, nên ứng dụng phải thử lại."));
  add(B("**Khóa trong ứng dụng** (ví dụ `synchronized` của Java): đúng khi chỉ có một tiến trình, nhưng tuần tự hóa toàn bộ thao tác và vô dụng khi chạy nhiều tiến trình server."));
  add(P("Khi một giao dịch phải giữ nhiều khóa, có thể xảy ra **deadlock**: giao dịch A giữ khóa X chờ Y, giao dịch B giữ Y chờ X. Bốn điều kiện cần cho deadlock là loại trừ lẫn nhau, giữ và chờ, không tước đoạt, và chờ vòng. Cách phòng tránh đơn giản nhất là phá điều kiện chờ vòng bằng một **thứ tự khóa cố định** cho mọi giao dịch. Project quy định luôn khóa yêu cầu cấp hàng trước, rồi mới khóa bản ghi điều chuyển."));

  // ---------------- 2.8 ----------------
  add(H2("2.8. Kết nối lại: backoff, jitter và hiệu ứng dồn cục"));
  add(P("Khi kết nối mất, client phải thử kết nối lại. Thử liên tục làm phí tài nguyên và dội tải lên server đang gặp sự cố, còn chờ quá lâu thì người dùng mất dịch vụ. Chiến lược phổ biến là **exponential backoff**: khoảng chờ tăng gấp đôi sau mỗi lần thất bại, có trần. Khi **nhiều client mất kết nối cùng lúc** (server khởi động lại), một nhịp chờ xác định khiến tất cả thử lại cùng lúc, lặp lại mãi, tạo các đỉnh tải dồn cục gọi là **thundering herd**. Thêm thời gian chờ ngẫu nhiên (**jitter**) làm các client lệch pha nhau {cite:brooker}. Gọi C là trần, b là khoảng cơ sở và n là số lần đã thất bại:"));
  add(code([
    "Cố định           :  d(n) = C",
    "Exponential       :  d(n) = min(C, b · 2^n)",
    "Full jitter [AWS] :  d(n) ~ Ngẫu nhiên đều trên [0, min(C, b · 2^n)]",
  ]));
  add(P("Full jitter rải đều các lần thử, nhưng với trần nhỏ thì các lần thử sớm rất dày: lúc server còn tắt, client thử nhiều lần vô ích. Đặc tả của project còn có một ràng buộc riêng: chi nhánh phải nối lại **trong vòng 5 giây** kể từ khi server lên (FR-05). Mục 7.3 trình bày chính sách “jitter lệch pha” mà nhóm đề xuất để thỏa cả hai yêu cầu."));

  // ---------------- 2.9 ----------------
  add(H2("2.9. HTTP, REST và đẩy tin tới trình duyệt"));
  add(P("HTTP là giao thức yêu cầu–trả lời không trạng thái, chạy trên TCP {cite:rfc9110}. Client gửi phương thức (GET, POST…), đường dẫn và tiêu đề; server trả mã trạng thái, tiêu đề và thân. Trạng thái đăng nhập được mang qua cookie. Kiểu API REST tổ chức tài nguyên thành các đường dẫn và dùng phương thức HTTP cho thao tác trên tài nguyên đó. Điểm yếu của HTTP với ứng dụng thời gian thực là **chỉ client được mở lời**: server không thể tự gửi tin khi có cảnh báo mới. Có bốn cách khắc phục:"));
  add(table("Các cách đẩy tin từ server tới trình duyệt", [
    ["Cách", "Cơ chế", "Ưu điểm", "Nhược điểm"],
    ["Polling", "Trình duyệt hỏi định kỳ (ví dụ mỗi 2 s)", "Đơn giản nhất", "Trễ tới một chu kỳ; tốn request khi không có gì mới"],
    ["Long polling", "Server giữ request tới khi có tin rồi mới trả", "Gần thời gian thực, chỉ dùng HTTP thường", "Mỗi tin một request; dễ rối khi có nhiều tin liên tiếp"],
    ["Server-Sent Events (SSE)", "Một response HTTP không đóng, kiểu `text/event-stream`; mỗi sự kiện là các dòng `event:`/`data:`", "Một chiều server → trình duyệt, đúng nhu cầu; trình duyệt tự kết nối lại; chạy trên HTTP thường", "Chỉ một chiều; dữ liệu văn bản"],
    ["WebSocket", "Nâng cấp kết nối HTTP thành kênh hai chiều", "Hai chiều, độ trễ thấp", "Giao thức riêng, phức tạp hơn; thừa khi chỉ cần một chiều"],
  ], [2.2, 3.6, 3.2, 3], [], "push-compare"));
  add(P("SSE được chuẩn hóa trong HTML Living Standard {cite:sse}. WebSocket được chuẩn hóa trong RFC 6455 {cite:rfc6455}. Trong project, mọi thao tác của người dùng (bấm Gửi hàng, Bán…) đã là request HTTP bình thường, chỉ chiều ngược lại cần đẩy, nên SSE là lựa chọn vừa đủ (mục 8.1)."));

  // ---------------- 2.10 ----------------
  add(H2("2.10. An ninh cho dịch vụ mạng"));
  add(P("Một server mở cổng TCP trong mạng sẽ nhận cả lưu lượng không thiện chí. Với ứng dụng nội bộ như project, các mối đe dọa thực tế nhất là:"));
  add(B("**Dò mật khẩu** (brute force) và **thử thông tin đăng nhập bị lộ** (credential stuffing): gửi rất nhiều lần đăng nhập sai từ một nguồn {cite:owasp}."));
  add(B("**Làm ngập** (flood) và từ chối dịch vụ: gửi lệnh dồn dập, mở thật nhiều kết nối mà không đăng nhập để chiếm hết số kết nối tối đa, hoặc gửi dữ liệu rác (fuzzing) để tìm lỗi phân tích cú pháp."));
  add(B("**Lạm dụng tài khoản hợp lệ:** đọc dữ liệu liên tục để cào (scraping), hoặc đoán mã yêu cầu của chi nhánh khác (lỗi tham chiếu đối tượng trực tiếp không an toàn – IDOR)."));
  add(B("**Tấn công qua trình duyệt vào API cục bộ.** Một trang web độc hại mà nhân viên chi nhánh mở có thể khiến trình duyệt gửi request tới `http://127.0.0.1:8081`, gọi là **CSRF** {cite:owasp}. Kẻ tấn công cũng có thể trỏ tên miền của chúng về 127.0.0.1 sau khi trang đã tải, gọi là **DNS rebinding** {cite:rebinding}. Cách phòng thủ chuẩn là kiểm tra tiêu đề `Origin` và `Host` của mọi request."));
  add(P("Công cụ cơ bản để phát hiện các hành vi trên là **giới hạn tần suất** (rate limiting): đếm số sự kiện trong một cửa sổ thời gian theo từng IP hoặc từng phiên. Cửa sổ cố định dễ cài nhưng bị lách ở ranh giới cửa sổ. **Cửa sổ trượt** chia thời gian thành các ô nhỏ (ví dụ mỗi giây một ô) rồi cộng các ô gần nhất. Token bucket cho phép một đợt bùng ngắn rồi giới hạn tốc độ trung bình. Bộ đếm phải đủ nhẹ để không làm chậm đường xử lý tin bình thường. Phản ứng cũng phải phân biệt đúng đối tượng: chặn theo IP có thể chặn nhầm nhiều chi nhánh thật đứng sau cùng một NAT, nên các hành vi gắn với phiên nên xử lý theo phiên."));

  // ---------------- 2.11 ----------------
  add(H2("2.11. Công trình liên quan và hạn chế của cách làm thông thường"));
  add(table("Các hướng giải quyết liên quan", [
    ["Hướng / hệ thống", "Cách làm", "Hạn chế so với yêu cầu của project"],
    ["Phần mềm quản lý bán hàng dạng đám mây (KiotViet, Sapo, Odoo…)", "Ứng dụng web/di động gọi API HTTP tới máy chủ trung tâm; cập nhật bằng polling hoặc WebSocket", "Phụ thuộc Internet và dịch vụ bên ngoài; giao thức đóng, không thể hiện được cơ chế mạng mà môn học yêu cầu"],
    ["Hàng đợi thông điệp / MQTT broker {cite:mqtt}", "Publish/subscribe qua broker, QoS 0/1/2 có xác nhận", "Thêm một thành phần trung gian; không giải quyết tranh chấp kho; đề bài yêu cầu tự thiết kế giao thức"],
    ["Framework mạng như Netty {cite:netty}", "Reactor trên Java NIO, pipeline xử lý", "Che giấu cơ chế Selector, bộ đệm, đóng khung mà báo cáo cần trình bày; thêm phụ thuộc lớn"],
    ["Đồ án Client/Server thông thường", "Mỗi kết nối một luồng; đọc tồn rồi trừ trong Java; ghi thẳng ra socket; thử lại theo nhịp cố định; tin offline chỉ xếp hàng khi server biết", "Đúng trong trường hợp thuận lợi nhưng hỏng ở đúng các tình huống của mục 1.2"],
  ], [3, 4.4, 4.6], [], "related-baseline"));
  add(P("Project giữ lại từng cách làm thông thường ở dòng cuối của bảng trên làm **baseline** bằng một cờ cấu hình (Phụ lục B). Nhờ vậy, mọi khác biệt trong số liệu ở Chương 10 đến từ đúng một thay đổi thiết kế."));
};
