// Tạo bản phân công viết báo cáo (4 người, 60–70 trang) kèm khung báo cáo chi tiết.
// Chạy: node build-phan-cong.js ../PhanCong_VietBaoCao.docx
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType,
  ShadingType, Footer, PageNumber, LevelFormat, BorderStyle, PageBreak,
} = require("docx");

const OUT = process.argv[2] || path.join(__dirname, "..", "PhanCong_VietBaoCao.docx");

const FONT = "Times New Roman";
const BODY = 26; // 13 pt
const CONTENT_W = 9071; // A4 trừ lề trái 3 cm, phải 2 cm

// ---------------- tiện ích (cùng kiểu với build-report.js) ----------------

/** Chuỗi có **đậm**, `mã`, ~~nghiêng~~, [[cần điền]] → TextRun[] */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\[\[[^\]]+\]\])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, size: BODY, ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, size: BODY, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", size: BODY - 4, ...base }));
    else if (t.startsWith("[[")) out.push(new TextRun({ text: t.slice(2, -2), font: FONT, size: BODY, highlight: "yellow", ...base }));
    else out.push(new TextRun({ text: t.slice(2, -2), italics: true, font: FONT, size: BODY, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, size: BODY, ...base }));
  return out;
}

const P = (text) => new Paragraph({ children: runs(text), alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 312 } });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 360, after: 160 } });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 240, after: 120 } });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 180, after: 80 } });
// gạch đầu dòng căn trái: nhiều đường dẫn file dài, căn đều sẽ giãn chữ xấu
const B = (text, level = 0) => new Paragraph({ children: runs(text), numbering: { reference: "bullets", level }, spacing: { after: 60, line: 300 } });
const PB = () => new Paragraph({ children: [new PageBreak()] });

const border = { style: BorderStyle.SINGLE, size: 4, color: "9AA4B1" };
const borders = { top: border, bottom: border, left: border, right: border };
const FILL = { 1: "E3EEFB", 2: "E5F4E4", 3: "F9EEDA", 4: "EFEDFF" };

function cell(text, width, { header = false, align, fill } = {}) {
  const lines = String(text).split("\n");
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders,
    shading: header ? { fill: "DCE6F5", type: ShadingType.CLEAR, color: "auto" }
      : fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: lines.map((l) => new Paragraph({ alignment: align ?? AlignmentType.LEFT, spacing: { after: 20 },
      children: runs(l, { size: BODY - 4, bold: header || undefined }) })),
  });
}

let tabNo = 0;

/** Bảng: rows[0] là tiêu đề; ratios = tỉ lệ cột; numCols = cột căn phải; ownerCol = cột "Người" để tô màu. */
function table(title, rows, ratios, { numCols = [], ownerCol = -1 } = {}) {
  const sum = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.floor((r / sum) * CONTENT_W));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  tabNo++;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }, keepNext: true,
      children: runs(`Bảng ${tabNo}. ${title}`, { italics: true, size: BODY - 2 }) }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
      rows: rows.map((r, i) => {
        const who = ownerCol >= 0 && i > 0 ? String(r[ownerCol]).match(/^N(\d)/) : null;
        return new TableRow({
          tableHeader: i === 0, cantSplit: true,
          children: r.map((c, j) => cell(c, widths[j], {
            header: i === 0,
            align: i > 0 && numCols.includes(j) ? AlignmentType.RIGHT : undefined,
            fill: who && j === ownerCol ? FILL[who[1]] : undefined,
          })),
        });
      }),
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

const body = [];
const add = (...xs) => xs.flat().forEach((x) => body.push(x));

// ---------------- đầu trang ----------------

add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
  children: [new TextRun({ text: "PHÂN CÔNG VIẾT BÁO CÁO BÀI TẬP LỚN LẬP TRÌNH MẠNG", bold: true, font: FONT, size: 32 })] }));
add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
  children: runs("Hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động qua Socket TCP · cập nhật 23/10/2026", { italics: true }) }));

add(P("Báo cáo cuối dài **khoảng 68 trang A4**: phần nội dung khoảng 65 trang, cộng bìa và mục lục. Bốn người chia theo **bốn mảng của lập trình mạng**. Mỗi người viết trọn mảng của mình theo mạch: **lý thuyết → vấn đề trong hệ thống → thiết kế → mã nguồn → số liệu đo**. Nhờ vậy ai cũng có phần kỹ thuật riêng và trả lời được câu hỏi bảo vệ về phần đó."));
add(P("**Hạn nộp bản nháp cho người gộp: 22:00 ngày 28/10.** Hạn nộp chính thức là 23:59 ngày 31/10, file `NhomXX_PhanPhoiHangHoa_Report.docx`, Compilatio phải ≤ 20 % (Submission.md, Instruction.md mục 10)."));
add(P("Bản báo cáo hiện có trong thư mục `report/` (30 trang, 14 chương) là bản nền: mỗi người chép phần của mình từ đó rồi viết mở rộng, không viết lại từ đầu."));

// ---------------- 1. Phân công ----------------

add(H1("1. Phân công theo mảng mạng"));
add(table("Bốn mảng, mỗi người một mảng", [
  ["Người", "Mảng mạng", "Chương / mục phụ trách", "Thực nghiệm", "Trang"],
  ["N1 – [[Họ tên]]", "Socket TCP/UDP và giao thức tầng ứng dụng", "2.1, 2.2 · Ch.5 · 10.1 · Ch.13 · Tài liệu tham khảo · PL A", "E7, ảnh Wireshark, TC-08/09/10", "16,5"],
  ["N2 – [[Họ tên]]", "Mô hình I/O và xử lý đồng thời ở server (BIO, NIO)", "2.3 · Ch.6 · Ch.9 · 10.2 · Ch.11 · PL B", "E3, E4, E9, TC-11", "17,5"],
  ["N3 – [[Họ tên]]", "Độ tin cậy, chịu lỗi và tranh chấp giữa các kết nối", "2.4 · Ch.3 · Ch.7 · 10.3 · Ch.12 · PL C", "E1, E2, E5, TC-05/06/07/12", "15,5"],
  ["N4 – [[Họ tên]]", "Kiến trúc, cổng HTTP/SSE và an ninh mạng; gộp báo cáo", "Tóm tắt · Ch.1 · 2.5 · Ch.4 · Ch.8 · 10.4 · PL D · bìa, mục lục", "E6, E8, TC-01..04", "19"],
  ["", "", "", "Tổng", "68,5"],
], [2.3, 3.1, 3.7, 2.4, 1.3], { numCols: [4], ownerCol: 0 }));
add(P("19 trang của N4 gồm 3 trang bìa và mục lục, nên phần phải viết chỉ khoảng 16 trang. N4 viết ít nội dung hơn vì còn phải gộp file, đánh số hình/bảng, làm mục lục và chạy Compilatio. Phần Novelty (Ch.11) do N2 tổng hợp, nhưng mỗi người tự viết dòng đóng góp và bằng chứng của mảng mình."));

// ---------------- 2. Khung báo cáo ----------------

add(H1("2. Khung báo cáo và số trang"));
add(P("Khung bám đúng cấu trúc technical paper trong Instruction.md mục 8. Phần lý thuyết (Ch.2) và phần kết quả (Ch.10) được chia nhỏ để mỗi người viết đúng mảng của mình. Số trang tính với Times New Roman 13, giãn dòng 1,3; hình và bảng được tính vào số trang."));
add(table("Khung báo cáo chi tiết", [
  ["Mục", "Nội dung chính", "Người", "Trang"],
  ["Bìa, mục lục, danh mục hình/bảng", "Theo mẫu của bản nền; điền tên nhóm, thành viên, giảng viên", "N4", "3"],
  ["Tóm tắt, từ khóa", "Bài toán, cách làm, kết quả chính (có số), đóng góp; 4–6 từ khóa", "N4", "1"],
  ["Ch.1 Giới thiệu", "Bối cảnh chuỗi phân phối, vấn đề, động lực, phát biểu bài toán, mục tiêu, phạm vi, đóng góp, cấu trúc báo cáo", "N4", "3"],
  ["2.1 Bộ giao thức TCP/IP và socket TCP", "Mô hình phân tầng; socket API; bắt tay 3 bước, đóng 4 bước, TIME_WAIT, RST; TCP là luồng byte nên phải tự đóng khung tin; bộ đệm gửi/nhận, Nagle và TCP_NODELAY", "N1", "3,5"],
  ["2.2 UDP và broadcast", "Datagram không kết nối, không đảm bảo; địa chỉ broadcast; dùng UDP để khám phá dịch vụ trong LAN", "N1", "1"],
  ["2.3 Mô hình I/O và đồng thời", "Blocking I/O, mỗi kết nối một luồng, thread pool; I/O multiplexing (select/epoll/IOCP), Java NIO (Channel, Buffer, Selector), mẫu Reactor; bài toán C10K; backpressure", "N2", "3,5"],
  ["2.4 Độ tin cậy ở tầng ứng dụng", "ACK của TCP khác với ứng dụng đã xử lý tin; kết nối nửa mở, keepalive và heartbeat; at-most/at-least/exactly-once, idempotency; race condition, lost update, giao dịch; exponential backoff, jitter, thundering herd", "N3", "3"],
  ["2.5 HTTP, đẩy tin tới trình duyệt và an ninh mạng", "HTTP/1.1 và REST; polling, long polling, SSE, WebSocket; dò mật khẩu, flood/DoS, rate limiting (cửa sổ trượt), CSRF, DNS rebinding", "N4", "2"],
  ["Ch.3 Định nghĩa bài toán", "Mô hình mạng (1 server công ty, 10–20 chi nhánh, tới 1000 chi nhánh ảo; LAN/WAN), đầu vào/đầu ra, ràng buộc, giả định, yêu cầu chức năng và phi chức năng", "N3", "2,5"],
  ["Ch.4 Kiến trúc hệ thống", "Sơ đồ thành phần (server, client, trình duyệt, PostgreSQL); thành phần nào nói chuyện với thành phần nào, bằng giao thức gì, cổng nào (5000 TCP, 5001 UDP, 8080/8081 HTTP); vì sao chọn client làm cổng HTTP cục bộ", "N4", "3,5"],
  ["Ch.5 Thiết kế giao thức và giao tiếp mạng", "Định dạng dòng `LỆNH|tham số`, ký tự thoát, giới hạn 4096 byte; bảng lệnh và mã lỗi; sơ đồ tuần tự: đăng nhập, bán hàng → cảnh báo → cấp hàng, điều chuyển, thông báo; mở/đóng kết nối; PING/PONG; UDP DISCOVER/HERE; xử lý tin sai", "N1", "6,5"],
  ["Ch.6 Hiện thực tầng mạng phía server", "NetServer, BioServer, NioServer, ClientHandler, SessionRegistry; worker pool và thứ tự tin trong một kết nối; đường ghi thẳng, qua Selector, OP_WRITE; hàng đợi gửi có giới hạn; timeout; broadcast", "N2", "6"],
  ["Ch.7 Cơ chế tin cậy và chịu lỗi", "Outbox và bảng hang_doi_tin; gửi lại theo trạng thái sau LOGIN_OK; client loại tin trùng; ReconnectPolicy (fixed, backoff, jitter); trừ kho nguyên tử, thứ tự khóa YC trước điều chuyển; lỗi CSDL", "N3", "5"],
  ["Ch.8 Cổng HTTP/SSE và an ninh mạng", "Client là cổng HTTP cục bộ: Router, Http, SseHub, OriginGuard; API admin và đăng nhập bằng cookie, mật khẩu SHA-256 có salt; SecurityMonitor, RateCounter, BanList, SecurityRules; SECURITY_REPORT; cảnh báo khi nhiều server cùng trả lời discovery", "N4", "4"],
  ["Ch.9 Thiết lập thực nghiệm và kiểm thử", "Phần cứng, hệ điều hành, Java 17, PostgreSQL; công cụ loadsim (SimClient, ServerProcess, Experiments); cách đo độ trễ và thông lượng; cờ baseline; bảng TC-01..12; hạn chế khi mọi client chạy trên một máy", "N2", "3,5"],
  ["10.1 Kết quả: tầng TCP thuần", "E7 (PING/PONG 100–1000 client) và phân tích gói bắt bằng Wireshark", "N1", "2"],
  ["10.2 Kết quả: mô hình I/O", "E3 client chậm, E4 BIO và NIO, E9 broadcast tới 1000 chi nhánh", "N2", "2,5"],
  ["10.3 Kết quả: tin cậy và tranh chấp", "E1 tranh chấp kho, E2 mất kết nối, E5 kết nối lại hàng loạt", "N3", "2,5"],
  ["10.4 Kết quả: luồng trọn vẹn và an ninh", "E6 luồng cấp hàng 50–1000 chi nhánh, E8 bị tấn công", "N4", "2"],
  ["Ch.11 Novelty và đóng góp", "Bảng Đóng góp – Khác baseline thế nào – Bằng chứng; mỗi dòng có số liệu", "N2", "1,5"],
  ["Ch.12 Hạn chế và hướng phát triển", "Những gì chưa giải quyết, hạn chế của thực nghiệm, hướng mở rộng", "N3", "1,5"],
  ["Ch.13 Kết luận", "Bài toán, giải pháp, kết quả, đóng góp; khoảng 1 trang", "N1", "1"],
  ["Tài liệu tham khảo", "Kiểu IEEE, đánh số [1], [2]… theo thứ tự xuất hiện; N1 gom từ cả nhóm", "N1", "1,5"],
  ["Phụ lục A. Bảng lệnh giao thức", "Đầy đủ lệnh, chiều gửi, tham số, ví dụ", "N1", "1"],
  ["Phụ lục B. Cấu hình và cờ baseline", "`config/*.properties`, các cờ io.mode, write.mode, delivery, accept.strategy, reconnect.strategy, security.mode", "N2", "0,5"],
  ["Phụ lục C. Ca kiểm thử chi tiết", "TC-01..12: các bước, kết quả mong đợi, kết quả thực tế", "N3", "1"],
  ["Phụ lục D. Phân công và đóng góp", "Bảng ai làm gì trong mã nguồn và trong báo cáo", "N4", "0,5"],
], [3.2, 6.6, 0.9, 0.9], { numCols: [3], ownerCol: 2 }));

// ---------------- 3. Chi tiết từng người ----------------

add(PB(), H1("3. Việc cụ thể của từng người"));
add(P("Mỗi người có năm phần: lý thuyết cần viết, phần hiện thực trong mã nguồn, số liệu và hình dùng làm bằng chứng, việc thực hành cần làm thêm, và câu hỏi bảo vệ cần chuẩn bị. Đường dẫn tính từ thư mục gốc của repo."));

const people = [
  {
    title: "N1 – Socket TCP/UDP và giao thức tầng ứng dụng",
    goal: "Giải thích được một tin đi từ chi nhánh tới server như thế nào: từ gói TCP trên dây, qua việc tách dòng, tới khi thành một lệnh của giao thức.",
    theory: [
      "Mô hình TCP/IP; socket là gì; vòng đời kết nối TCP (SYN, SYN-ACK, ACK; FIN, TIME_WAIT; RST khi tiến trình chết).",
      "TCP là luồng byte, không giữ ranh giới tin → các cách đóng khung: độ dài cố định, tiền tố độ dài, ký tự phân cách. Nhóm chọn ký tự xuống dòng và lý do chọn.",
      "Bộ đệm gửi/nhận, thuật toán Nagle và `TCP_NODELAY`.",
      "UDP: datagram, không kết nối; địa chỉ broadcast; vì sao khám phá server dùng UDP mà không dùng TCP.",
      "Công trình liên quan: giao thức dạng dòng như SMTP, Redis RESP; so sánh với JSON và nhị phân.",
    ],
    impl: [
      "`common/.../Protocol.java`, `Message.java`, `Command.java`, `ErrorCode.java`, `ProtocolException.java`: mã hóa/giải mã, ký tự thoát, giới hạn 4096 byte.",
      "`common/.../LineReader.java` (BIO) và `LineSplitter.java` (NIO): tách dòng từ luồng byte, xử lý dòng quá dài.",
      "`server/.../net/DiscoveryResponder.java` và `client/.../Discovery.java`: DISCOVER/HERE qua UDP 5001.",
      "Phần PING/PONG và timeout trong `ClientHandler.java` (phối hợp với N2).",
      "README §5 \"Định dạng tin\" và 65 unit test trong `common` (ProtocolTest, NetUtilTest).",
    ],
    evidence: [
      "E7: `experiments/results/RESULTS-e7.md`, `RESULTS-e7-1000.md`.",
      "TC-08 (client không trả PONG), TC-09 (netcat gửi rác), TC-10 (broadcast có `|` và xuống dòng).",
      "Hình sơ đồ tuần tự `docs/img/sequence.png`.",
    ],
    practice: [
      "Bắt gói bằng Wireshark (cài Npcap, chọn \"Adapter for loopback traffic capture\"; nếu có 2 máy cùng LAN thì bắt trên card mạng thật). Bộ lọc `tcp.port == 5000 || udp.port == 5001`.",
      "Chụp 5 ảnh: bắt tay 3 bước; LOGIN → LOGIN_OK (Follow TCP Stream); PING/PONG; FIN khi LOGOUT và RST khi tắt client đột ngột; DISCOVER/HERE.",
      "Chụp `netstat -ano | findstr 5000` khi có client để thấy trạng thái ESTABLISHED và TIME_WAIT.",
    ],
    questions: [
      "Vì sao không thể đọc một lần `read()` là được một tin?",
      "Tin chứa ký tự `|` hoặc xuống dòng thì được truyền thế nào?",
      "Nếu bỏ `TCP_NODELAY` thì độ trễ thay đổi ra sao, vì sao?",
      "UDP broadcast không qua được router hay NAT của Docker thì client tìm server bằng cách nào?",
    ],
  },
  {
    title: "N2 – Mô hình I/O và xử lý đồng thời ở server",
    goal: "Giải thích được server phục vụ 1000 kết nối bằng khoảng 33 luồng như thế nào, và khi nào BIO vẫn tốt hơn.",
    theory: [
      "Blocking I/O, mỗi kết nối một luồng; chi phí luồng (bộ nhớ ngăn xếp, chuyển ngữ cảnh).",
      "Thread pool, hàng đợi công việc; giữ thứ tự tin trong cùng một kết nối.",
      "I/O multiplexing: select/poll, epoll (Linux), IOCP (Windows); Java NIO: Channel, ByteBuffer, Selector, SelectionKey, OP_READ/OP_WRITE; mẫu Reactor.",
      "Bài toán C10K; backpressure và client chậm (slow consumer).",
    ],
    impl: [
      "`server/.../net/NetServer.java`, `BioServer.java`, `NioServer.java`, `ClientHandler.java`, `SessionRegistry.java`, `Transport.java`.",
      "`ServerMain.java`, `ServerSettings.java`: các cờ `io.mode`, `write.mode`, `send.queue.limit`, `nio.workers`, `nio.write.through`, `max.clients`.",
      "Đường ghi của NIO: ghi thẳng khi kết nối rảnh, phần còn lại qua OP_WRITE; tràn hàng đợi thì cắt kết nối.",
      "Bộ đo: `loadsim/.../SimClient.java`, `ServerProcess.java`, `Experiments.java`, `Stats.java`.",
    ],
    evidence: [
      "E3 `e3_slow_consumer.csv`, E4 `e4_bio_vs_nio.csv`, E9 `RESULTS-e9.md` và các biểu đồ `experiments/charts/e3_*.png`, `e4_*.png`, `e9_*.png`.",
      "Ảnh trang admin khi 1000 chi nhánh online: `docs/img/e9-admin-*.png`.",
      "TC-11 (20 client chạy 10 phút).",
    ],
    practice: [
      "Chụp JConsole (`tools/jdk-17.0.20.1+1/bin/jconsole.exe`), tab Threads, khi chạy loadsim 500 client ở `io.mode=bio` và ở `io.mode=nio` để minh họa số luồng.",
      "Vẽ sơ đồ vòng lặp Selector và đường đi của một tin qua worker (có thể vẽ bằng draw.io).",
    ],
    questions: [
      "Vì sao với broadcast thì BIO + hàng đợi nhanh gấp khoảng 3 lần NIO (E9), mà vẫn chọn NIO làm mặc định?",
      "Client không đọc socket thì server làm gì, và vì sao như vậy không làm treo các chi nhánh khác (E3)?",
      "Hai tin của cùng một chi nhánh có thể bị xử lý lệch thứ tự không?",
      "Vì sao E4 cho độ trễ BIO và NIO gần bằng nhau?",
    ],
  },
  {
    title: "N3 – Độ tin cậy, chịu lỗi và tranh chấp giữa các kết nối",
    goal: "Giải thích được vì sao tin không bị mất khi chi nhánh rớt mạng, và vì sao kho không bị xuất vượt khi nhiều chi nhánh cùng chấp nhận hàng.",
    theory: [
      "TCP ACK chỉ cho biết byte tới hệ điều hành bên kia, không cho biết ứng dụng đã xử lý; kết nối nửa mở (\"rút dây\").",
      "Keepalive của TCP và heartbeat ở tầng ứng dụng; timeout.",
      "Ngữ nghĩa giao tin at-most-once, at-least-once, exactly-once; idempotency, khử trùng lặp; store-and-forward.",
      "Race condition, lost update, giao dịch và mức cô lập; khóa dòng; tránh deadlock bằng thứ tự khóa.",
      "Kết nối lại: khoảng chờ cố định, exponential backoff, full jitter; hiện tượng thundering herd.",
    ],
    impl: [
      "`server/.../service/Outbox.java` và bảng `hang_doi_tin` (`db/schema.sql`); `delivery` = none / queue / queue_resync.",
      "`RequestService.java` (trừ kho bằng `UPDATE … WHERE so_luong >= ?`, `accept.strategy`), `TransferService.java` (khóa YC trước điều chuyển).",
      "`common/.../ReconnectPolicy.java`; phía client `ServerLink.java`, `BranchState.java` (loại tin trùng theo mã YC).",
    ],
    evidence: [
      "E1 `e1_accept_contention.csv`, E2 `e2_push_reliability.csv`, E5 `e5_reconnect_storm.csv` và biểu đồ `experiments/charts/e1_*.png`, `e2_*.png`, `e5_*.png`.",
      "TC-05, TC-06, TC-07, TC-12.",
    ],
    practice: [
      "Làm lại TC-06 và TC-07 trên giao diện, chụp màn hình trước và sau khi chi nhánh nối lại (tin OFFER được gửi bù, thời gian nối lại).",
      "Vẽ sơ đồ trạng thái yêu cầu cấp hàng (YC) và sơ đồ tuần tự gửi lại sau LOGIN_OK.",
    ],
    questions: [
      "Vì sao `queue` theo SRS vẫn mất tin khi \"rút dây\", còn `queue_resync` thì không (E2)?",
      "Nếu một tin được gửi hai lần thì điều gì ngăn kho bị cộng hai lần?",
      "Vì sao `synchronized` đúng nhưng không chọn (E1)?",
      "Jitter lệch pha khác exponential backoff chỗ nào, và vì sao vẫn đạt yêu cầu nối lại ≤ 5 giây (E5)?",
    ],
  },
  {
    title: "N4 – Kiến trúc, cổng HTTP/SSE và an ninh mạng; gộp báo cáo",
    goal: "Giải thích được toàn cảnh hệ thống và đường đi của một cảnh báo từ chi nhánh tới màn hình admin (TCP → server → SSE → trình duyệt), cùng cách server tự bảo vệ trước các kiểu tấn công qua mạng.",
    theory: [
      "Kiến trúc client–server, cổng (gateway) cục bộ; vì sao giao diện web không nói TCP trực tiếp.",
      "HTTP/1.1, REST, cookie phiên; so sánh polling, long polling, SSE, WebSocket và lý do chọn SSE.",
      "An ninh: dò mật khẩu, flood/DoS, rate limiting bằng cửa sổ trượt, chặn IP; CSRF, DNS rebinding; giả mạo server khi khám phá bằng broadcast.",
    ],
    impl: [
      "`client/.../BranchAgent.java`, `ClientMain.java`, `ClientSecurity.java`; `common/.../web/Http.java`, `Router.java`, `SseHub.java`, `OriginGuard.java`, `StaticFiles.java`.",
      "`server/.../AdminApi.java`, `AdminAuth.java`, `Events.java`; `server/.../security/*` (SecurityMonitor, RateCounter, BanList, SecurityRules, SessionStats).",
      "`ui/lib/api.ts` (giao diện chỉ gọi API cục bộ và SSE).",
    ],
    evidence: [
      "E6 `RESULTS-e6*.md`, E8 `RESULTS-e8.md` và biểu đồ `experiments/charts/e8_security.png`.",
      "Hình kiến trúc `docs/img/architecture.png`, ảnh giao diện `docs/img/ui-*.png`.",
      "TC-01..04.",
    ],
    practice: [
      "Chụp DevTools → Network → `/api/events` → tab EventStream khi chi nhánh gửi cảnh báo.",
      "Chụp trang Giám sát trong lúc chạy E8 (`scripts\\run-experiments.bat run=e8`).",
      "Gộp báo cáo: dùng một mẫu style chung, đánh số hình/bảng theo chương, cập nhật mục lục, chạy Compilatio.",
    ],
    questions: [
      "Vì sao chọn SSE mà không chọn WebSocket?",
      "Trang web độc hại mở trên máy chi nhánh có gọi được API cục bộ không? OriginGuard chặn thế nào?",
      "Kẻ cào dữ liệu đứng chung IP với chi nhánh thật thì vì sao chi nhánh thật không bị chặn nhầm (E8)?",
      "Vẽ lại kiến trúc và chỉ ra cổng, giao thức trên từng mũi tên.",
    ],
  },
];

for (const p of people) {
  add(H2(p.title));
  add(P(`**Mục tiêu:** ${p.goal}`));
  add(H3("Lý thuyết cần viết"), p.theory.map((t) => B(t)));
  add(H3("Phần hiện thực trong mã nguồn"), p.impl.map((t) => B(t)));
  add(H3("Số liệu và hình dùng làm bằng chứng"), p.evidence.map((t) => B(t)));
  add(H3("Việc thực hành cần làm thêm"), p.practice.map((t) => B(t)));
  add(H3("Câu hỏi bảo vệ cần chuẩn bị"), p.questions.map((t) => B(t)));
}

// ---------------- 4. Lịch ----------------

add(PB(), H1("4. Lịch làm việc"));
add(P("Còn 8 ngày tới hạn nộp. Mốc quan trọng nhất là ngày 28/10: hôm đó mỗi người phải gửi bản nháp đủ phần của mình để còn hai ngày đọc chéo và chạy Compilatio."));
add(table("Lịch từ 23/10 đến 31/10/2026", [
  ["Ngày", "Việc", "Ai"],
  ["Thứ Sáu 23/10", "Thống nhất khung và phân công; N4 gửi file mẫu (style, lề, font) và bản nền 30 trang", "Cả nhóm"],
  ["Thứ Bảy 24/10 – Chủ nhật 25/10", "Viết phần lý thuyết của mình (Ch.2); gửi tài liệu tham khảo cho N1", "Mỗi người"],
  ["Thứ Hai 26/10 – Thứ Ba 27/10", "Viết thiết kế và hiện thực (Ch.3–Ch.9); làm phần thực hành, chụp ảnh", "Mỗi người"],
  ["Thứ Tư 28/10", "Viết kết quả và thảo luận (Ch.10), dòng Novelty, hạn chế. **Nộp bản nháp cho N4 trước 22:00**", "Mỗi người"],
  ["Thứ Năm 29/10", "Đọc chéo theo cặp N1 ↔ N2, N3 ↔ N4; N4 gộp file, đánh số hình/bảng, mục lục", "Cả nhóm, N4"],
  ["Thứ Sáu 30/10", "Chạy Compilatio; ai có đoạn trùng thì sửa phần của mình; chốt bản cuối", "N4 + người có đoạn trùng"],
  ["Thứ Bảy 31/10", "Dự phòng. Nộp `NhomXX_PhanPhoiHangHoa_Report.docx` trước 23:59", "N4"],
], [2.6, 7.2, 2.2]));

// ---------------- 5. Quy ước ----------------

add(H1("5. Quy ước viết chung"));
add(H3("Trình bày"));
[
  "A4, lề trái 3 cm, phải 2 cm, trên và dưới 2 cm; Times New Roman 13; giãn dòng 1,3; căn đều hai bên.",
  "Đề mục dùng style Heading 1/2/3 có sẵn của Word, không tô đậm tay, để mục lục tự sinh.",
  "Hình và bảng đánh số theo chương (Hình 5.2, Bảng 10.3), có chú thích, và phải được nhắc tới trong văn bản trước khi xuất hiện.",
  "Mỗi người viết trong file riêng `PhanN_HoTen.docx` dùng đúng file mẫu của N4; không sửa style.",
].forEach((t) => add(B(t)));
add(H3("Nội dung"));
[
  "Mỗi mục đi theo mạch: lý thuyết → vấn đề trong hệ thống → thiết kế → mã nguồn → số liệu. Lý thuyết nào không dẫn tới một quyết định thiết kế hay một số đo trong hệ thống thì không cần viết.",
  "Không dán nguyên file mã; chỉ trích đoạn ngắn (≤ 15 dòng) và nêu tên lớp, tên hàm.",
  "**Số liệu chỉ lấy từ** `experiments/results/`, hình lấy từ `experiments/charts/` và `docs/img/`. Đề cấm tự tạo hoặc sửa số liệu; cần số mới thì chạy lại `scripts\\run-experiments.bat`.",
  "Thuật ngữ: lần đầu ghi tiếng Việt kèm tiếng Anh trong ngoặc, ví dụ \"kết nối nửa mở (half-open connection)\", sau đó dùng thống nhất một cách gọi.",
].forEach((t) => add(B(t)));
add(H3("Trích dẫn và Compilatio"));
[
  "Trích dẫn kiểu IEEE: [1], [2] theo thứ tự xuất hiện; N1 giữ danh sách chung.",
  "Phần lý thuyết dễ bị trùng nhất: tự viết bằng lời của mình, không chép rồi đổi vài chữ. Ý lấy từ nguồn nào thì ghi nguồn đó.",
  "Nguồn gợi ý: RFC 9293 (TCP), RFC 768 (UDP), RFC 9110 (HTTP), đặc tả Server-Sent Events của WHATWG HTML, RFC 6455 (WebSocket); Stevens – UNIX Network Programming; Kurose & Ross – Computer Networking: A Top-Down Approach; tài liệu Java NIO của Oracle; Kegel – The C10K problem; Kleppmann – Designing Data-Intensive Applications; Brooker – Exponential Backoff and Jitter (AWS Architecture Blog); OWASP (CSRF, brute force); tài liệu PostgreSQL về transaction isolation.",
  "Được dùng AI để tìm hiểu và sửa câu chữ, nhưng mỗi người chịu trách nhiệm và phải giải thích được mọi câu trong phần mình viết (Instruction.md mục 11).",
].forEach((t) => add(B(t)));

// ---------------- tài liệu ----------------

const doc = new Document({
  creator: "Nhóm XX",
  title: "Phân công viết báo cáo BTL Lập trình mạng",
  styles: {
    default: { document: { run: { font: FONT, size: BODY } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: FONT, color: "1B3A6B" }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 27, bold: true, font: FONT, color: "1B3A6B" }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, italics: true, font: FONT }, paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })] }) },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("Da ghi", OUT, `(${tabNo} bang)`);
});
