// Tạo báo cáo .docx theo cấu trúc technical paper (Instruction.md mục 8). Số liệu lấy từ experiments/results.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType,
  ShadingType, ImageRun, TableOfContents, Footer, PageNumber, LevelFormat, BorderStyle, PageBreak,
} = require("docx");

const ROOT = process.argv[2];
const OUT = process.argv[3];
const IMG = (p) => path.join(ROOT, p);

const FONT = "Times New Roman";
const BODY = 26; // 13 pt
const CONTENT_W = 9071; // A4 trừ lề trái 3 cm, phải 2 cm

// ---------------- tiện ích ----------------

/** Chuỗi có **đậm**, `mã`, ~~nghiêng~~ → TextRun[] */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, size: BODY, ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, size: BODY, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", size: BODY - 4, ...base }));
    else out.push(new TextRun({ text: t.slice(2, -2), italics: true, font: FONT, size: BODY, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, size: BODY, ...base }));
  return out;
}

const P = (text, opts = {}) => new Paragraph({
  children: runs(text), alignment: opts.align ?? AlignmentType.JUSTIFIED,
  spacing: { after: 120, line: 312 }, indent: opts.noIndent ? undefined : { firstLine: 0 }, ...opts.extra,
});
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 360, after: 160 } });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 240, after: 120 } });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 180, after: 80 } });
const B = (text, level = 0) => new Paragraph({ children: runs(text), numbering: { reference: "bullets", level }, spacing: { after: 60, line: 300 }, alignment: AlignmentType.JUSTIFIED });
const N = (text, ref = "steps") => new Paragraph({ children: runs(text), numbering: { reference: ref, level: 0 }, spacing: { after: 60, line: 300 }, alignment: AlignmentType.JUSTIFIED });
const PB = () => new Paragraph({ children: [new PageBreak()] });

let figNo = 0;
let tabNo = 0;

function caption(text) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 },
    children: runs(text, { italics: true, size: BODY - 2 }) });
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function figure(file, text, maxW = 600) {
  const { w, h } = pngSize(IMG(file));
  const scale = Math.min(1, maxW / w);
  figNo++;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, keepNext: true,
      children: [new ImageRun({ type: "png", data: fs.readFileSync(IMG(file)), transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } })] }),
    caption(`Hình ${figNo}. ${text}`),
  ];
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "9AA4B1" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, { header = false, align } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders,
    shading: header ? { fill: "DCE6F5", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: align ?? AlignmentType.LEFT,
      children: runs(String(text), { size: BODY - 4, bold: header || undefined }) })],
  });
}

/** Bảng: rows[0] là tiêu đề; widths theo tỉ lệ; numCols = các cột căn phải. */
function table(title, rows, ratios, numCols = []) {
  const sum = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.floor((r / sum) * CONTENT_W));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  tabNo++;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }, keepNext: true,
      children: runs(`Bảng ${tabNo}. ${title}`, { italics: true, size: BODY - 2 }) }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
      rows: rows.map((r, i) => new TableRow({
        tableHeader: i === 0, cantSplit: true,
        children: r.map((c, j) => cell(c, widths[j], { header: i === 0, align: i > 0 && numCols.includes(j) ? AlignmentType.RIGHT : undefined })),
      })),
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

function code(lines) {
  return lines.map((l, i) => new Paragraph({
    shading: { fill: "F2F4F7", type: ShadingType.CLEAR, color: "auto" },
    spacing: { after: 0, line: 260 }, indent: { left: 200, right: 200 },
    children: [new TextRun({ text: l === "" ? " " : l, font: "Consolas", size: 18 })],
    keepNext: i < lines.length - 1,
  }));
}

const placeholder = (t) => new TextRun({ text: t, font: FONT, size: BODY + 2, highlight: "yellow" });

// ---------------- trang bìa ----------------

const cover = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [placeholder("[TÊN TRƯỜNG / KHOA]")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 200 },
    children: [new TextRun({ text: "BÁO CÁO BÀI TẬP LỚN", bold: true, font: FONT, size: 36 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 },
    children: [new TextRun({ text: "Môn: Lập trình mạng – Năm học 2026–2027", font: FONT, size: 28 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 },
    children: [new TextRun({ text: "HỆ THỐNG PHÂN PHỐI HÀNG HÓA VỚI CẢNH BÁO THIẾU HÀNG TỰ ĐỘNG QUA SOCKET TCP", bold: true, font: FONT, size: 34 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1400 },
    children: [new TextRun({ text: "Giao tin tin cậy, chống tranh chấp kho và mở rộng bằng Java NIO", italics: true, font: FONT, size: 28 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "Nhóm ", font: FONT, size: 28 }), placeholder("XX")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [placeholder("[Họ tên thành viên 1 – MSSV]")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [placeholder("[Họ tên thành viên 2 – MSSV]")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [placeholder("[Họ tên thành viên 3 – MSSV]")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Giảng viên hướng dẫn: ", font: FONT, size: 28 }), placeholder("[Họ tên giảng viên]")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200 }, children: [new TextRun({ text: "Tháng 10/2026", font: FONT, size: 28 })] }),
  PB(),
];

// ---------------- nội dung ----------------

const body = [];
const add = (...xs) => xs.flat().forEach((x) => body.push(x));

add(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "MỤC LỤC", bold: true, font: FONT, size: 30 })] }),
  new TableOfContents("Mục lục", { hyperlink: true, headingStyleRange: "1-2" }), PB());

// ===== Tóm tắt =====
add(H1("Tóm tắt (Abstract)"));
add(P("Một chuỗi bán lẻ gồm kho tổng và 10–20 chi nhánh cần phát hiện thiếu hàng và cấp bổ sung kịp thời, đúng số lượng, ngay cả khi mạng chập chờn và nhiều chi nhánh thao tác cùng lúc. Nhóm thiết kế một giao thức tầng ứng dụng dạng dòng văn bản chạy trên **một kết nối TCP bền vững** cho mỗi chi nhánh, dùng chung cho request và tin đẩy (push) từ server, kèm UDP broadcast để chi nhánh tự tìm server trong mạng LAN."));
add(P("Server viết bằng Java 17, dùng **Java NIO Selector** với worker pool và hàng đợi tuần tự theo từng kết nối. Server trừ kho bằng một câu `UPDATE` có điều kiện trong transaction, giao tin bằng hàng đợi offline kết hợp **gửi lại trạng thái từ CSDL** sau khi chi nhánh đăng nhập, và giới hạn hàng đợi gửi của từng kết nối để cô lập client chậm. Client nối lại theo chính sách **jitter lệch pha** nhưng vẫn giữ giới hạn 5 giây của đặc tả. Mỗi cải tiến có cờ cấu hình để bật lại cách làm baseline, và được đo bằng một bộ thực nghiệm tự động với tối đa 500 chi nhánh ảo nói đúng giao thức TCP."));
add(P("Kết quả đo thực tế: lượng hàng bán vượt kho giảm từ 200 đơn vị (cách đọc rồi ghi) xuống 0, và nhanh hơn cách khóa bằng `synchronized` khoảng 3,5 lần; tỉ lệ mất OFFER khi chi nhánh mất kết nối giảm từ 35,5 % (không giữ tin) và 20,1 % (hàng đợi theo đặc tả) xuống 0 %; một chi nhánh treo không còn chặn broadcast (6000/6000 tin so với 540/6000); số luồng server với 500 client giảm từ 1017 xuống 32 mà độ trễ không đổi; đỉnh tải khi 300 chi nhánh nối lại giảm từ 300 xuống 16,4 lần thử trong 100 ms."));
add(new Paragraph({ spacing: { before: 120, after: 240 }, children: [new TextRun({ text: "Từ khóa: ", bold: true, font: FONT, size: BODY }),
  new TextRun({ text: "Socket TCP; giao thức tầng ứng dụng; Java NIO; kiểm soát tranh chấp; giao tin tin cậy; kết nối lại có jitter.", italics: true, font: FONT, size: BODY })] }));

// ===== 1 =====
add(H1("1. Giới thiệu"));
add(H2("1.1. Bối cảnh"));
add(P("Trong mô hình bán lẻ nhiều chi nhánh, mỗi chi nhánh giữ một lượng hàng nhỏ và được kho tổng cấp bổ sung định kỳ. Khi việc báo thiếu hàng làm thủ công qua điện thoại hoặc email, công ty biết chậm, các chi nhánh dễ gửi trùng yêu cầu, và kho tổng có thể bị hứa xuất nhiều hơn số đang có khi nhiều chi nhánh cùng xin một mặt hàng."));
add(H2("1.2. Vấn đề và động lực"));
add(P("Bài toán nghe như một ứng dụng quản lý thông thường, nhưng phần khó nằm ở mạng và đồng thời. Bốn tình huống sau xảy ra thường xuyên trong LAN thật và là động lực chính của project:"));
add(B("**Tranh chấp kho:** nhiều chi nhánh xác nhận nhận hàng trong cùng một khoảnh khắc. Nếu server đọc tồn rồi mới ghi, hai yêu cầu có thể cùng thấy đủ hàng và kho bị xuất vượt."));
add(B("**Mất tin khi mất kết nối:** server gửi OFFER đúng lúc chi nhánh rút dây mạng. Ghi vào socket vẫn thành công vì dữ liệu chỉ nằm trong bộ đệm của hệ điều hành, nhưng chi nhánh không bao giờ nhận được."));
add(B("**Client chậm:** một chi nhánh bị treo không đọc socket. Nếu server ghi trực tiếp, luồng gửi broadcast bị chặn và mọi chi nhánh khác cũng không nhận được tin."));
add(B("**Kết nối lại hàng loạt:** server khởi động lại thì mọi chi nhánh mất kết nối cùng lúc. Nếu tất cả thử lại theo cùng nhịp 5 giây, server nhận một đợt kết nối dồn cục."));
add(H2("1.3. Phát biểu bài toán"));
add(P("Xây dựng một hệ thống Client/Server trong mạng LAN, gồm một server công ty và 10–20 chi nhánh (thiết kế chịu được tới 500), trong đó chi nhánh tự báo thiếu hàng, công ty đề xuất số lượng cấp, chi nhánh xác nhận và server trừ kho tổng. Hệ thống phải giữ ba tính chất: kho tổng không bao giờ bị xuất vượt; không mất yêu cầu hay tin đẩy khi mạng chập chờn; và một chi nhánh lỗi không làm ảnh hưởng chi nhánh khác."));
add(H2("1.4. Mục tiêu và phạm vi"));
add(B("Thiết kế giao thức tầng ứng dụng riêng trên TCP, không dùng HTTP hay RMI cho giao tiếp giữa chi nhánh và server."));
add(B("Đáp ứng 25 yêu cầu chức năng và 10 yêu cầu phi chức năng trong bản đặc tả (SRS), qua 12 ca kiểm thử."));
add(B("Với mỗi vấn đề ở mục 1.2, đề xuất một giải pháp và đo so sánh với baseline bằng số liệu thật."));
add(P("Ngoài phạm vi: thanh toán, vận chuyển thật, triển khai trên Internet, ứng dụng di động và mã hóa đường truyền."));
add(H2("1.5. Đóng góp chính"));
add(N("Trừ kho nguyên tử bằng `UPDATE … WHERE so_luong >= ?` kèm khóa dòng yêu cầu; so với cách đọc-rồi-ghi và cách khóa Java (thực nghiệm E1)."));
add(N("Giao tin theo trạng thái: hàng đợi offline cộng bước gửi lại mọi yêu cầu còn mở từ CSDL sau `LOGIN_OK`, xử lý được cả trường hợp server chưa biết chi nhánh đã mất kết nối (E2)."));
add(N("Hàng đợi gửi có giới hạn cho từng kết nối, cắt client đọc chậm thay vì để nó chặn người khác (E3)."));
add(N("Server NIO một Selector với hàng đợi tuần tự theo kết nối, giữ đúng thứ tự tin của từng chi nhánh mà số luồng không tăng theo số client (E4)."));
add(N("Chính sách nối lại jitter lệch pha, giảm đỉnh tải mà vẫn giữ giới hạn 5 giây (E5); cùng một bộ thực nghiệm tái lập được bằng một lệnh."));
add(H2("1.6. Cấu trúc báo cáo"));
add(P("Mục 2 trình bày kiến thức nền. Mục 3 định nghĩa bài toán. Mục 4 mô tả giải pháp, mục 5 và 6 trình bày kiến trúc và thiết kế giao tiếp mạng, mục 7 mô tả hiện thực. Mục 8 đến 10 trình bày thiết lập thực nghiệm, kết quả và thảo luận. Mục 11 tổng hợp đóng góp; mục 12 đến 14 nêu hạn chế, hướng phát triển và kết luận."));

// ===== 2 =====
add(H1("2. Kiến thức nền và công trình liên quan"));
add(H2("2.1. TCP và đóng khung thông điệp"));
add(P("TCP cung cấp một luồng byte tin cậy và có thứ tự giữa hai đầu [7], nhưng không giữ ranh giới thông điệp: một lần `write` có thể đến bên kia thành nhiều lần `read` và ngược lại [5]. Giao thức tầng ứng dụng vì vậy phải tự đóng khung, thường bằng ký tự phân cách hoặc tiền tố độ dài. Project dùng ký tự xuống dòng làm phân cách, giống các giao thức dạng dòng văn bản như SMTP, kèm quy tắc escape để nội dung chứa `|` hay xuống dòng không làm vỡ khung, và giới hạn độ dài dòng để chống dữ liệu rác làm tràn bộ nhớ."));
add(H2("2.2. Mô hình xử lý đồng thời"));
add(P("Cách đơn giản nhất là mỗi kết nối một luồng (thread-per-connection): mã tuần tự, dễ hiểu, nhưng số luồng tăng tuyến tính theo số client, mỗi luồng cần một vùng ngăn xếp riêng và chi phí chuyển ngữ cảnh. Bài toán phục vụ hàng chục nghìn kết nối (C10K) đã thúc đẩy mô hình hướng sự kiện dựa trên `select`/`epoll` [4]. Trong Java, mô hình này được cung cấp qua `java.nio.channels.Selector` [1]: một luồng theo dõi nhiều kênh không chặn và chỉ xử lý kênh nào sẵn sàng."));
add(H2("2.3. Tranh chấp dữ liệu và lost update"));
add(P("Ở mức cô lập READ COMMITTED (mặc định của PostgreSQL), hai transaction có thể cùng đọc một giá trị, cùng tính giá trị mới trong ứng dụng rồi ghi đè nhau, làm mất một lần cập nhật (lost update) [6]. Các cách phòng tránh gồm: cập nhật nguyên tử ngay trong CSDL, khóa tường minh bằng `SELECT … FOR UPDATE`, hoặc so sánh rồi đặt (compare-and-set). PostgreSQL bảo đảm rằng khi một câu `UPDATE` phải chờ khóa dòng, nó sẽ đánh giá lại điều kiện `WHERE` trên phiên bản mới nhất của dòng [2]; đây là cơ sở cho giải pháp ở mục 4.3."));
add(H2("2.4. Giao tin tin cậy"));
add(P("TCP xác nhận dữ liệu ở tầng giao vận, nhưng việc `write` thành công chỉ có nghĩa dữ liệu đã vào bộ đệm gửi của hệ điều hành, không có nghĩa ứng dụng bên kia đã nhận [5]. Khi đường truyền đứt mà không có gói FIN/RST (kết nối nửa mở), bên gửi có thể không biết trong một thời gian dài. Các hệ thống thông điệp giải quyết bằng lưu-và-chuyển-tiếp (store-and-forward), xác nhận ở tầng ứng dụng, và thiết kế thao tác idempotent để có thể giao ít nhất một lần (at-least-once) mà không gây sai lệch [6]."));
add(H2("2.5. Phát hiện mất kết nối và kết nối lại"));
add(P("TCP keep-alive có sẵn nhưng theo RFC 1122 khoảng chờ mặc định không dưới hai giờ [8], quá dài cho ứng dụng nghiệp vụ, nên hệ thống tự cài heartbeat PING/PONG ở tầng ứng dụng. Khi nhiều client cùng mất kết nối và cùng thử lại theo một nhịp cố định, chúng tạo ra các đợt tải dồn cục (thundering herd). Thêm thời gian chờ ngẫu nhiên (jitter) vào exponential backoff là cách phổ biến để rải đều các lần thử [3]."));
add(H2("2.6. Hạn chế của cách làm thông thường"));
add(P("Trong bản đặc tả ban đầu và trong nhiều đồ án cùng loại, các vấn đề trên thường được xử lý theo cách đơn giản: đọc tồn rồi trừ trong ứng dụng; chỉ xếp hàng tin khi server biết chắc client offline; ghi thẳng ra socket trên luồng nghiệp vụ; mỗi kết nối một luồng; và thử kết nối lại theo nhịp cố định. Mỗi cách đều đúng trong trường hợp thuận lợi nhưng hỏng trong một tình huống cụ thể ở mục 1.2. Project giữ lại từng cách làm này làm baseline để đo."));

// ===== 3 =====
add(H1("3. Định nghĩa bài toán"));
add(H2("3.1. Mô hình mạng"));
add(P("Một server và N chi nhánh nằm trong cùng mạng LAN. Mỗi chi nhánh giữ đúng một kết nối TCP tới server (cổng 5000) và có thể gửi UDP broadcast tới cổng 5001 để tìm server. Chỉ server truy cập CSDL PostgreSQL. Các lỗi được xét gồm: chi nhánh đóng kết nối, đường truyền đứt im lặng (kết nối nửa mở), server tắt đột ngột rồi bật lại, và chi nhánh treo không đọc dữ liệu."));
add(H2("3.2. Đầu vào và đầu ra"));
add(table("Đầu vào và đầu ra của hệ thống", [
  ["Thành phần", "Đầu vào", "Đầu ra"],
  ["Chi nhánh", "Bán hàng, đặt ngưỡng, trả lời đề xuất và điều chuyển, xác nhận nhận hàng", "Tồn kho cập nhật, cảnh báo LOW_STOCK tự động, lịch sử nhập"],
  ["Công ty", "Sản phẩm, phiếu nhập kho tổng, số lượng đề xuất, thông báo", "Danh sách cảnh báo theo mức thiếu, phiếu xuất, nhật ký, đối soát"],
  ["Server", "Tin nhắn TCP từ các chi nhánh, thao tác của admin", "Tin trả lời và tin đẩy, trạng thái nhất quán trong CSDL"],
], [2, 5, 5]));
add(H2("3.3. Ràng buộc"));
add(B("Mỗi tin một dòng UTF-8, tối đa 4096 byte; dòng sai định dạng bị từ chối mà kết nối vẫn tiếp tục."));
add(B("Kho tổng không âm; tổng xuất kho tổng bằng tổng chi nhánh đã nhận cộng số đang giao (NFR-03)."));
add(B("Mỗi cặp (chi nhánh, sản phẩm) có tối đa một yêu cầu chưa đóng; gửi ACCEPT lặp lại không được trừ kho lần hai."));
add(B("Mã chi nhánh luôn lấy từ phiên đăng nhập, không lấy từ tham số (NFR-07)."));
add(B("Mất kết nối không làm mất yêu cầu hay tin đẩy; chi nhánh nối lại trong vòng 5 giây sau khi server lên (NFR-04)."));
add(B("20 chi nhánh, mỗi chi nhánh 1 tin/giây: không mất tin, độ trễ trung bình dưới 200 ms (NFR-02)."));
add(H2("3.4. Giả định"));
add(P("Danh sách chi nhánh do admin tạo sẵn; đồng hồ các máy lệch không đáng kể và mọi mốc thời gian lấy theo server; \"đã giao\" là mô phỏng, server xuất kho xong coi như hàng đã lên đường."));
add(H2("3.5. Yêu cầu hệ thống"));
add(table("Tóm tắt yêu cầu theo SRS", [
  ["Nhóm", "Yêu cầu chính", "Mã"],
  ["Kết nối", "Phục vụ ≥ 20 kết nối đồng thời; đăng nhập; heartbeat 30 s + 10 s; tự nối lại; đăng xuất", "FR-01..06"],
  ["Kho", "Quản lý sản phẩm, nhập kho tổng, xem tồn; bán hàng; đặt ngưỡng", "FR-07..12"],
  ["Cảnh báo", "Tự gửi LOW_STOCK; chống trùng ở server; popup cho admin", "FR-13..15"],
  ["Cấp hàng", "Admin gửi hàng thẳng hoặc báo hết hàng; OFFER, ACCEPT/REJECT; trừ kho trong transaction, OUT_OF_STOCK, RECEIVED, hàng đợi tin", "FR-16..21"],
  ["Thông báo, lịch sử", "Broadcast; lịch sử yêu cầu; lịch sử nhập; nhật ký mọi tin tới mili-giây", "FR-22..25"],
  ["Phi chức năng", "Hiệu năng, nhất quán, tin cậy, bảo mật, khả dụng, bảo trì, triển khai", "NFR-01..10"],
], [2, 7, 2]));

// ===== 4 =====
add(H1("4. Giải pháp đề xuất"));
add(H2("4.1. Ý tưởng tổng quát"));
add(P("Hệ thống coi **CSDL là nguồn sự thật duy nhất** cho trạng thái nghiệp vụ, còn kết nối TCP chỉ là kênh truyền có thể đứt bất cứ lúc nào. Mọi quyết định quan trọng (trừ kho, chuyển trạng thái yêu cầu) diễn ra trong một transaction. Mọi tin đẩy quan trọng đều có thể dựng lại từ trạng thái trong CSDL. Nhờ vậy, mất kết nối hay gửi lặp chỉ làm chậm chứ không làm sai lệch dữ liệu."));
add(H2("4.2. Giao thức"));
add(P("Mỗi tin có dạng `LENH|thamSo1|thamSo2…` trên một dòng. Tham số dùng escape `\\\\` cho dấu gạch ngược, `\\p` cho `|`, `\\n` cho xuống dòng. Danh sách nhiều bản ghi (tồn kho, lịch sử) nằm trong một tham số, bản ghi ngăn bởi `;`, trường ngăn bởi `,`, và trường dùng thêm escape `\\c`, `\\s`. Có 28 lệnh, chia làm request của chi nhánh, trả lời và tin đẩy của server, heartbeat, điều chuyển và discovery (Phụ lục A). Lỗi trả về `ERROR|maLoi|moTa` với 5 mã E01–E05."));
add(H2("4.3. Trừ kho nguyên tử"));
add(P("Khi chi nhánh gửi `ACCEPT|maYC|soLuong`, server chạy các bước sau trong một transaction:"));
add(code([
  "BEGIN",
  "SELECT … FROM yeu_cau WHERE ma_yc = ? AND ma_cn = <mã trong phiên> FOR UPDATE",
  "  -- DA_GIAO/HOAN_TAT: trả lại DELIVERED cũ (idempotent); trạng thái khác DA_DE_XUAT/THIEU_HANG: E03",
  "UPDATE kho_tong SET so_luong = so_luong - ? WHERE ma_sp = ? AND so_luong >= ?",
  "  -- 0 dòng: đặt THIEU_HANG, COMMIT, trả OUT_OF_STOCK|maYC|tồn hiện có|maHang",
  "INSERT INTO phieu_xuat (ma_yc UNIQUE, …); UPDATE yeu_cau SET trang_thai = 'DA_GIAO'",
  "COMMIT; gửi DELIVERED|maYC|maHang|soLuong",
]));
add(P("Nút **Gửi hàng** trên trang admin (`POST /api/requests/{id}/ship`) dùng đúng câu `UPDATE` có điều kiện này, chỉ khác là không chờ chi nhánh ACCEPT: yêu cầu ở `CHO`, `DA_DE_XUAT` hoặc `THIEU_HANG` chuyển thẳng sang `DA_GIAO` (\"Đã gửi\") và server đẩy `DELIVERED`. Kho không đủ thì API trả lỗi 400 và admin bấm **Báo hết hàng**: yêu cầu sang `THIEU_HANG`, server đẩy `OUT_OF_STOCK` kèm số còn lại và bắt đầu tìm chi nhánh điều chuyển. Chi nhánh bấm **Đã nhận hàng** (`RECEIVED`) thì yêu cầu sang `HOAN_TAT` (\"Đã nhận\"); cả hai phía thấy thay đổi ngay qua tin đẩy TCP và SSE."));
add(P("Phép so sánh và phép trừ nằm trong cùng một câu lệnh. Các transaction tranh nhau một mặt hàng chỉ phải chờ nhau trong thời gian giữ khóa dòng `kho_tong` (vài mili-giây), không phải chờ cả transaction. Ràng buộc `UNIQUE (ma_yc)` của `phieu_xuat` là lớp bảo vệ thứ hai chống xuất hai lần."));
add(H2("4.4. Giao tin theo trạng thái"));
add(P("Hàm `Outbox.send` gửi ngay nếu chi nhánh đang online; nếu không, tin được ghi vào bảng `hang_doi_tin`. Điểm khác so với đặc tả là bước sau `LOGIN_OK`:"));
add(N("Gửi các tin không thuộc trạng thái (ví dụ BROADCAST) còn trong `hang_doi_tin`, đánh dấu đã gửi.", "steps2"));
add(N("Đọc từ CSDL mọi yêu cầu còn mở của chi nhánh và gửi lại tin tương ứng: `DA_DE_XUAT` → OFFER; `THIEU_HANG` → OFFER + OUT_OF_STOCK; `DA_GIAO` → DELIVERED; lời mời điều chuyển đang chờ → TRANSFER_REQ.", "steps2"));
add(P("Bước 2 xử lý được trường hợp server đã \"gửi thành công\" vào một socket chết, vì nó không dựa vào việc server biết tin nào đã tới. Đổi lại, chi nhánh có thể nhận trùng; client loại trùng theo mã yêu cầu và mọi lệnh trả lời (ACCEPT, RECEIVED) đều idempotent ở server."));
add(H2("4.5. Hàng đợi gửi có giới hạn và server NIO"));
add(P("Mọi luồng nghiệp vụ chỉ đặt tin vào hàng đợi gửi của kết nối rồi trả về ngay. Ở server NIO, luồng Selector ghi khi socket sẵn sàng (`OP_WRITE`); ở server BIO, mỗi kết nối có một luồng ghi riêng. Khi hàng đợi vượt giới hạn (mặc định 2000 tin), server coi đó là client chậm và đóng kết nối; client sẽ nối lại và nhận lại trạng thái nhờ cơ chế ở mục 4.4."));
add(P("Server NIO dùng một luồng Selector cho mọi thao tác accept, đọc và ghi. Dòng tin đọc được chuyển sang worker pool cố định (16 luồng), nhưng mỗi kết nối có một hàng đợi tuần tự riêng (`SerialExecutor`). Nhờ vậy tin của cùng một chi nhánh luôn được xử lý đúng thứ tự gửi, còn tin của các chi nhánh khác nhau chạy song song."));
add(H2("4.6. Chính sách kết nối lại jitter lệch pha"));
add(P("Gọi C là thời gian chờ tối đa (5 giây theo FR-05) và n là số lần thử đã thất bại. Thời gian chờ trước lần thử thứ n được chọn ngẫu nhiên đều:"));
add(code([
  "fixed   (baseline): d(n) = C",
  "backoff (so sánh) : d(n) ~ U[0, min(C, 0,5 s · 2^n)]",
  "                    -- exponential backoff + full jitter [3]",
  "jitter  (đề xuất) : d(0) ~ U[0, C];  d(n ≥ 1) ~ U[C/2, C]",
]));
add(P("Lần thử đầu tiên rải các client đều trong khoảng [0, C], làm lệch pha chúng với nhau. Các lần sau giữ chu kỳ gần C nên không thử dồn dập khi server còn tắt. Vì d(n) ≤ C ở mọi lần, chi nhánh luôn nối lại trong vòng C sau khi server lên."));
add(H2("4.7. Điều chuyển hàng giữa chi nhánh"));
add(P("Khi kho tổng không đủ (OUT_OF_STOCK), server tìm chi nhánh nguồn có tồn lớn hơn hai lần ngưỡng của chính nó, ưu tiên chi nhánh đang online và có lượng dư lớn nhất. Server gửi `TRANSFER_REQ` với số lượng bằng min(lượng cần, lượng dư). Nếu chi nhánh nguồn đồng ý, server trừ kho nguồn và chuyển yêu cầu sang `DA_GIAO` trong cùng một transaction. Hai transaction điều chuyển và cấp hàng luôn khóa theo cùng thứ tự (yêu cầu trước, điều chuyển sau) để tránh deadlock. Nếu chi nhánh nguồn từ chối, server thử chi nhánh kế tiếp."));
add(H2("4.8. Các quyết định thiết kế"));
add(table("Quyết định thiết kế và lý do", [
  ["Quyết định", "Phương án đã cân nhắc", "Lý do chọn"],
  ["Giao thức dòng văn bản tự thiết kế", "JSON, nhị phân, HTTP", "Dễ quan sát bằng netcat/Wireshark khi demo; đủ cho thông điệp ngắn; đúng yêu cầu môn học"],
  ["Một kết nối cho cả request và push", "Hai kết nối, hoặc client polling", "Đẩy tin tức thời; ít kết nối; một nơi phát hiện mất kết nối"],
  ["CSDL là nguồn sự thật, tin push dựng lại được", "Xác nhận (ACK) từng tin", "Không phải đổi giao thức; tự phục hồi sau mọi kiểu mất kết nối"],
  ["Trừ kho bằng UPDATE có điều kiện", "Khóa Java, SELECT FOR UPDATE kho", "Đúng cả khi chạy nhiều tiến trình server; giữ khóa ngắn nhất"],
  ["NIO + hàng đợi tuần tự theo kết nối", "Thread-per-connection", "Số luồng không đổi theo số client mà vẫn giữ thứ tự tin"],
  ["Giao diện Next.js do tiến trình Java phục vụ trên localhost", "Swing/JavaFX", "Giao diện dễ làm hơn; phần mạng vẫn hoàn toàn nằm trong Java"],
], [3, 3, 5]));

// ===== 5 =====
add(H1("5. Kiến trúc hệ thống"));
add(figure("docs/img/architecture.png", "Kiến trúc tổng thể: một server, nhiều client chi nhánh, PostgreSQL"));
add(B("**server.jar:** tầng mạng (`NioServer` hoặc `BioServer`), tầng phiên (`ClientHandler`, `SessionRegistry`), tầng nghiệp vụ (`AuthService`, `StockService`, `RequestService`, `TransferService`, `Outbox`), ghi nhật ký (`MessageLog`), trả lời UDP (`DiscoveryResponder`), và HTTP API cục bộ cho giao diện admin."));
add(B("**client.jar:** `ServerLink` giữ socket và luồng Listener; `BranchAgent` xử lý logic chi nhánh, heartbeat và kết nối lại; `Discovery` tìm server; HTTP API cục bộ cho giao diện chi nhánh."));
add(B("**PostgreSQL:** 11 bảng; chỉ server truy cập qua pool HikariCP 20 kết nối."));
add(B("**Giao diện:** Next.js build ra file tĩnh, do chính tiến trình Java phục vụ trên `127.0.0.1`, cập nhật realtime qua Server-Sent Events. Trình duyệt không bao giờ nói chuyện trực tiếp với server công ty."));
add(B("**loadsim.jar:** giả lập tải và bộ thực nghiệm; dùng chung lớp `Protocol` với client."));

// ===== 6 =====
add(H1("6. Thiết kế giao tiếp mạng"));
add(H2("6.1. Thiết lập và đóng kết nối"));
add(N("Client gửi `DISCOVER` bằng UDP broadcast tới cổng 5001; server trả `HERE|ip|5000`, chọn địa chỉ cùng mạng con với client. Nếu không ai trả lời, client dùng địa chỉ cấu hình sẵn.", "steps3"));
add(N("Client mở kết nối TCP (timeout 3 giây) và gửi `LOGIN|maCN|matKhau`. Server kiểm tra băm SHA-256 có salt; sai thì `LOGIN_FAIL` kèm lý do, mã đang online thì cũng `LOGIN_FAIL` và server lập tức PING phiên cũ để dọn nếu nó đã chết.", "steps3"));
add(N("Sau `LOGIN_OK`, server gửi tin đang chờ và trạng thái các yêu cầu còn mở (mục 4.4); client gửi `INVENTORY_GET`.", "steps3"));
add(N("Kết nối đóng khi client gửi `LOGOUT`, khi heartbeat hết hạn, khi server cắt client chậm, hoặc khi một trong hai bên tắt. Server dọn phiên trong cả bốn trường hợp; client tự nối lại nếu người dùng chưa đăng xuất.", "steps3"));
add(H2("6.2. Luồng thông điệp"));
add(P("Hình 2 là luồng đầy đủ của một lần cấp hàng có thiếu kho: bán hàng làm tồn xuống dưới ngưỡng, chi nhánh tự gửi `LOW_STOCK`, admin đề xuất, chi nhánh đồng ý nhưng kho tổng không đủ nên server điều phối điều chuyển từ chi nhánh B, cuối cùng chi nhánh A xác nhận nhận hàng."));
add(figure("docs/img/sequence.png", "Luồng thông điệp của một lần cấp hàng có điều chuyển"));
add(P("Tin của chi nhánh luôn được xử lý theo thứ tự gửi. Tin trả lời (SALE_OK, INVENTORY, DELIVERED…) và tin đẩy (OFFER, BROADCAST, TRANSFER_REQ) đi chung một kết nối; client phân biệt theo tên lệnh. Hình 3 là luồng tin thật ghi được trên giao diện giám sát trong lúc chạy hệ thống."));
add(figure("docs/img/ui-protocol-feed.png", "Luồng tin thật trên tab Giám sát giao thức (thời gian tới mili-giây)", 480));
add(H2("6.3. Heartbeat"));
add(P("Bộ hẹn giờ của server chạy mỗi giây. Kết nối im lặng 30 giây thì server gửi `PING`; không có `PONG` (hay bất kỳ tin nào) trong 10 giây tiếp theo thì server đóng kết nối. Client cũng làm tương tự để phát hiện server chết. Khi kiểm thử TC-08, server gửi PING ở giây thứ 31 và đóng kết nối ở giây thứ 41."));
add(H2("6.4. Xử lý lỗi"));
add(table("Các tình huống lỗi và cách xử lý", [
  ["Tình huống", "Cách xử lý"],
  ["Dòng rác, sai số tham số, escape sai, dòng > 4096 byte", "`ERROR|E01`; kết nối tiếp tục; dòng quá dài bị bỏ tới ký tự xuống dòng kế tiếp"],
  ["Lệnh nghiệp vụ trước khi đăng nhập", "`ERROR|E02`"],
  ["Lệnh sai trạng thái (ACCEPT yêu cầu đã đóng…)", "`ERROR|E03`, không đổi dữ liệu"],
  ["Mã yêu cầu của chi nhánh khác, mã hàng không có", "`ERROR|E04` (truy vấn luôn lọc theo mã CN trong phiên)"],
  ["Số lượng ≤ 0 hoặc bán vượt tồn", "`ERROR|E05`"],
  ["Gửi lặp ACCEPT, RECEIVED, TRANSFER_ACCEPT", "Trả lại kết quả cũ, không trừ hay cộng kho lần hai"],
  ["Chi nhánh mất kết nối, rút dây, treo", "Heartbeat đóng phiên; tin vào hàng đợi; gửi lại trạng thái khi đăng nhập; cắt client chậm"],
  ["Server tắt, khởi động lại", "Client báo trạng thái trên giao diện, nối lại theo chính sách jitter, tự đăng nhập lại"],
  ["Quá số kết nối tối đa", "`ERROR|E03|Server da du N ket noi` rồi đóng, thay vì để client treo"],
  ["Lỗi CSDL, deadlock", "Rollback transaction, trả `ERROR|E03`; thứ tự khóa cố định để tránh deadlock"],
], [4, 7]));

// ===== 7 =====
add(H1("7. Hiện thực"));
add(H2("7.1. Module"));
add(table("Các module và số dòng mã nguồn (gồm cả dòng trống và chú thích)", [
  ["Module", "Nội dung", "Số dòng"],
  ["common", "Protocol, Command, ErrorCode, LineReader/LineSplitter, ReconnectPolicy, tiện ích HTTP/SSE", "899"],
  ["server", "Tầng mạng BIO/NIO, phiên, nghiệp vụ, Outbox, nhật ký, API admin (có đăng nhập) và thực nghiệm", "3 166"],
  ["client", "ServerLink, BranchAgent, Discovery, API cục bộ", "1 035"],
  ["loadsim", "Giả lập tải, bộ thực nghiệm E1–E6", "1 782"],
  ["ui", "Next.js: trang đăng nhập, trang công ty và trang chi nhánh (TypeScript)", "1 880"],
], [2, 7, 2], [2]));
add(H2("7.2. Các lớp quan trọng"));
add(table("Các lớp quan trọng", [
  ["Lớp", "Vai trò"],
  ["`Protocol`", "Ghép/tách dòng tin, escape tham số và danh sách; dùng chung ba chương trình"],
  ["`LineReader`, `LineSplitter`", "Đọc dòng cho BIO và tách dòng cho NIO theo cùng quy tắc 4096 byte, kể cả khi ký tự UTF-8 bị cắt giữa hai gói"],
  ["`NioServer`", "Selector, đọc/ghi không chặn, `SerialExecutor` theo kết nối, hàng đợi gửi có giới hạn"],
  ["`BioServer`", "Luồng accept + luồng đọc mỗi kết nối; ghi trực tiếp (baseline) hoặc qua hàng đợi"],
  ["`ClientHandler`", "Phiên: kiểm tra đăng nhập, chiều lệnh, điều phối nghiệp vụ, heartbeat"],
  ["`RequestService`", "Vòng đời yêu cầu, transaction ACCEPT với ba chiến lược"],
  ["`Outbox`", "Gửi ngay, xếp hàng, gửi lại trạng thái sau đăng nhập; ba chế độ"],
  ["`BranchAgent`", "Logic chi nhánh: tự gửi LOW_STOCK, chống trùng cảnh báo, kết nối lại, đẩy trạng thái lên giao diện"],
  ["`Experiments`, `SimClient`, `ServerProcess`", "Khởi động server theo biến thể, giả lập chi nhánh, đo và xuất CSV"],
], [3, 8]));
add(H2("7.3. Cơ chế đồng thời"));
add(B("**Trạng thái phiên:** `ConcurrentHashMap` mã CN → phiên; đăng nhập dùng `putIfAbsent` để chặn hai phiên cùng mã một cách nguyên tử."));
add(B("**Thứ tự tin:** tin của một kết nối chạy tuần tự (luồng đọc ở BIO, `SerialExecutor` ở NIO)."));
add(B("**Dữ liệu dùng chung:** đồng bộ ở CSDL bằng transaction, khóa dòng và ràng buộc UNIQUE thay vì khóa Java, nên vẫn đúng khi có nhiều tiến trình."));
add(B("**Ghi nhật ký:** `MessageLog` đẩy bản ghi vào `BlockingQueue`, một luồng riêng ghi theo lô tới 500 dòng, để luồng nghiệp vụ không chờ CSDL."));
add(B("**Ghi socket:** chỉ luồng Selector (NIO) hoặc luồng ghi riêng (BIO) được ghi; bên gọi không bao giờ bị chặn."));
add(H2("7.4. Cơ sở dữ liệu"));
add(P("Lược đồ gồm 10 bảng theo đặc tả (chi_nhanh, san_pham, kho_tong, kho_chi_nhanh, yeu_cau, nhat_ky, phieu_xuat, phieu_nhap, ban_hang, hang_doi_tin), cộng bảng `dieu_chuyen` và cột `chi_nhanh.gia_lap` để đánh dấu chi nhánh ảo. Các ràng buộc quan trọng được đặt ngay trong CSDL: `CHECK (so_luong >= 0)` cho kho; chỉ mục UNIQUE riêng `uq_yeu_cau_dang_mo` cho \"mỗi cặp (CN, SP) tối đa một yêu cầu mở\"; `UNIQUE (ma_yc)` cho phiếu xuất (Phụ lục C)."));
add(H2("7.5. Giao diện"));
add(P("Giao diện theo lối các phần mềm quản lý bán hàng, phân phối phổ biến (KiotViet, Sapo, Odoo): thanh menu ngang trên cùng, bảng dữ liệu dày, bộ lọc ở cột trái, dải chỉ số đầu trang và cảnh báo xử lý ngay trong bảng. Hai phía dùng chung một trang đăng nhập có thẻ **Công ty** / **Chi nhánh**; trang công ty yêu cầu tài khoản quản trị (phiên lưu bằng cookie HttpOnly, mọi API admin trả 401 khi chưa đăng nhập). Ảnh chụp bên dưới lấy từ hệ thống đang chạy với dữ liệu demo."));
add(figure("docs/img/ui-login.png", "Trang đăng nhập chung: thẻ Công ty (server.jar) và Chi nhánh (client.jar)", 420));
add(figure("docs/img/ui-admin.png", "Trang công ty: dải chỉ số, cảnh báo thiếu hàng với nút Gửi hàng / Báo hết hàng / Đề xuất"));
add(figure("docs/img/ui-branch.png", "Trang chi nhánh: bán nhanh, mức tồn so với ngưỡng, nhãn \"đã báo công ty\" / \"công ty hết hàng\""));
add(figure("docs/img/ui-branch-offer.png", "Chi nhánh nhận hàng: bấm Đã nhận hàng, xác nhận đề xuất, hoặc xử lý khi công ty báo không đủ hàng"));

// ===== 8 =====
add(H1("8. Thiết lập thực nghiệm"));
add(H2("8.1. Môi trường"));
add(table("Môi trường thực nghiệm", [
  ["Thông số", "Giá trị"],
  ["Phần cứng", "Một máy tính, CPU 16 luồng logic, RAM 15 GB"],
  ["Hệ điều hành", "Windows 11 (amd64)"],
  ["Ngôn ngữ, runtime", "Java 17.0.20 (Eclipse Temurin); Node.js 24 chỉ dùng để build giao diện"],
  ["Thư viện", "PostgreSQL JDBC 42.7.4, HikariCP 5.1.0, Gson 2.11.0, JUnit 5.11.3; Next.js 15.5, React 19.1"],
  ["CSDL", "PostgreSQL 18 trên localhost, pool 20 kết nối"],
  ["Cấu hình mạng", "Client ảo, server và CSDL cùng máy, giao tiếp qua loopback 127.0.0.1; TCP 5000, UDP 5001"],
  ["Ngày chạy", "20/10/2026"],
], [3, 8]));
add(H2("8.2. Dữ liệu"));
add(P("5 sản phẩm mẫu; 3 chi nhánh thật CN01–CN03; 500 chi nhánh ảo SIM001–SIM500 (mật khẩu băm có salt riêng, tồn mỗi mặt hàng 1 000 000, đánh dấu `gia_lap` để không lẫn với dữ liệu thật). Mỗi thực nghiệm tự xóa dữ liệu giao dịch của chi nhánh ảo trước khi chạy."));
add(H2("8.3. Kiểm thử chức năng"));
add(P("65 unit test cho giao thức và chính sách kết nối lại. 12 ca kiểm thử của SRS chạy bằng script gửi lệnh TCP thật, trên cả hai chế độ server NIO và BIO, và đều đạt (Bảng 8)."));
add(table("Kết quả 12 ca kiểm thử theo SRS", [
  ["Ca", "Kịch bản", "Kết quả"],
  ["TC-01", "Đăng nhập đúng, sai, trùng mã", "LOGIN_OK; LOGIN_FAIL kèm lý do; LOGIN_FAIL vì trùng"],
  ["TC-02", "Bán xuống dưới ngưỡng rồi bán tiếp 3 lần", "Đúng 1 LOW_STOCK, 1 yêu cầu"],
  ["TC-03", "LOW_STOCK → OFFER → ACCEPT → DELIVERED → RECEIVED", "Kho tổng giảm, kho CN tăng đúng số chốt, HOAN_TAT"],
  ["TC-04", "Chi nhánh từ chối", "TU_CHOI, không kho nào đổi"],
  ["TC-05", "Kho tổng 10, hai CN cùng ACCEPT 8", "1 DELIVERED, 1 OUT_OF_STOCK|…|2, kho còn 2"],
  ["TC-06", "OFFER gửi khi CN offline", "CN nhận OFFER ngay sau LOGIN_OK"],
  ["TC-07", "Tắt server rồi bật lại", "Client tự nối lại sau 3,5 s"],
  ["TC-08", "Client không trả PONG", "PING ở giây 31, đóng ở giây 41"],
  ["TC-09", "Gửi dòng rác và lệnh trước khi đăng nhập", "E01, E02; server và client khác chạy bình thường"],
  ["TC-10", "Broadcast có | và xuống dòng", "Mọi CN hiển thị nguyên văn"],
  ["TC-11", "20 client, mỗi client 1 tin/giây", "Không mất tin, độ trễ TB dưới 2 ms (xem E4)"],
  ["TC-12", "Gửi một ACCEPT hai lần", "Kho trừ một lần, một phiếu xuất"],
], [1.2, 5, 5]));
add(H2("8.4. Kịch bản thực nghiệm"));
add(table("Năm thực nghiệm so sánh baseline và đề xuất", [
  ["", "Câu hỏi", "Biến thể", "Số đo chính"],
  ["E1", "Trừ kho đúng và nhanh khi tranh chấp?", "check_then_act, synchronized, conditional", "Bán vượt kho, vi phạm bất biến, thời gian xong cả loạt"],
  ["E2", "Tin đẩy có mất khi chi nhánh mất kết nối?", "none, queue (SRS), queue_resync", "Tỉ lệ OFFER bị mất"],
  ["E3", "Một client treo có chặn người khác?", "BIO ghi trực tiếp, BIO hàng đợi, NIO", "Số tin tới chi nhánh bình thường"],
  ["E4", "BIO và NIO khi tăng số client?", "50/200/500 client × BIO/NIO", "Số luồng, độ trễ p95, mất tin"],
  ["E5", "Nối lại hàng loạt có dồn cục?", "fixed, backoff, jitter", "Thời gian nối lại, đỉnh lần thử/100 ms"],
  ["E6", "Luồng cấp hàng hai phía ổn khi 50–100 CN cùng xin hàng?", "50 và 100 CN × 5 vòng; 100 CN × 20 vòng", "Mất/trùng tin, mất kết nối, bán vượt kho, độ trễ từng chặng"],
], [0.8, 4, 4, 4]));
add(P("Chi tiết kịch bản: **E1:** 50 chi nhánh ảo cùng ACCEPT 8 đơn vị trong khi kho tổng có 200 (đủ cho 25), lặp 5 lần. **E2:** 30 chi nhánh trong 60 giây; mỗi chi nhánh online 3–8 giây rồi mất mạng 2–5 giây, xen kẽ hai kiểu đóng socket và \"rút dây\" (socket vẫn mở nhưng mọi byte tới đều mất); server gửi khoảng 10 OFFER/giây. **E3:** 20 chi nhánh bình thường và 1 chi nhánh treo (bộ đệm nhận 4 KB, ngừng đọc); server broadcast 300 tin, mỗi tin 3 KB. **E4:** mỗi chi nhánh 1 SALE/giây trong 30 giây. **E5:** 300 chi nhánh online; server bị tắt đột ngột và bật lại sau 6–10 giây ngẫu nhiên, lặp 5 lần mỗi chính sách. **E6:** 50 hoặc 100 chi nhánh ảo bán xuống dưới ngưỡng rồi tự gửi LOW_STOCK (vòng đầu tất cả cùng lúc); một bot admin đã đăng nhập nghe SSE, bấm Gửi hàng qua API, kho tổng hết thì bấm Báo hết hàng (kho chỉ đủ 80 % số lần gửi); chi nhánh nhận DELIVERED thì gửi RECEIVED, nhận OUT_OF_STOCK thì REJECT; vòng kết thúc khi admin thấy trạng thái cuối qua SSE."));

// ===== 9 =====
add(H1("9. Kết quả"));
add(H2("9.1. E1 – Tranh chấp kho tổng"));
add(table("Kết quả E1 (trung bình 5 lần; kỳ vọng 25 DELIVERED, tổng xuất 200)", [
  ["Chiến lược", "DELIVERED", "Tổng xuất", "Bán vượt", "Vi phạm bất biến", "ACCEPT TB (ms)", "ACCEPT p95 (ms)", "Xong cả loạt (ms)"],
  ["check_then_act", "50", "400", "200", "5/5", "46,63", "96,82", "78,09"],
  ["synchronized", "25", "200", "0", "0/5", "57,46", "107,60", "109,46"],
  ["conditional (đề xuất)", "25", "200", "0", "0/5", "18,60", "29,60", "31,37"],
], [3, 1.5, 1.5, 1.4, 1.6, 1.6, 1.6, 1.6], [1, 2, 3, 4, 5, 6, 7]));
add(figure("experiments/charts/e1_accept.png", "E1: tổng xuất kho và thời gian xong cả loạt 50 ACCEPT"));
add(P("Với `check_then_act`, cả 50 chi nhánh đều được giao hàng từ kho chỉ có 200 ở tất cả 5 lần lặp. Tồn cuối còn lệch thêm, dao động 120–168 thay vì −200, nghĩa là ngay cả con số tồn kho cũng sai."));
add(H2("9.2. E2 – Giao tin khi mất kết nối"));
add(table("Kết quả E2 (30 chi nhánh, 60 giây)", [
  ["Chế độ", "OFFER gửi", "Nhận được", "Mất", "Tỉ lệ mất", "Nhận trùng", "Độ trễ nhận TB (ms)", "p95 (ms)"],
  ["none", "321", "207", "114", "35,5 %", "0", "0*", "0*"],
  ["queue (SRS)", "399", "319", "80", "20,1 %", "0", "299,39", "2 394"],
  ["queue_resync (đề xuất)", "541", "541", "0", "0,0 %", "0", "657,51", "3 224"],
], [3, 1.4, 1.4, 1.2, 1.4, 1.4, 2, 1.4], [1, 2, 3, 4, 5, 6, 7]));
add(P("~~* Tin giao ngay tới chi nhánh trước khi API gửi OFFER kịp trả về nên được tính 0 ms; ở chế độ none chỉ có loại tin này.~~"));
add(figure("experiments/charts/e2_delivery.png", "E2: tỉ lệ OFFER bị mất theo chế độ giao tin"));
add(P("Một lần chạy trước khi sửa cách đo độ trễ cho tỉ lệ mất 34,2 %, 15,8 % và 0 %, nhất quán với Bảng 11."));
add(H2("9.3. E3 – Client chậm"));
add(table("Kết quả E3 (300 broadcast × 3 KB, 20 chi nhánh bình thường + 1 chi nhánh treo)", [
  ["Server", "Broadcast hoàn tất", "Lần gọi lâu nhất (ms)", "Tin tới CN bình thường", "p50 (ms)", "p95 (ms)", "Max (ms)", "CN treo bị cắt"],
  ["BIO ghi trực tiếp", "26/300", "5 016", "540/6000", "3", "10", "26", "không"],
  ["BIO + hàng đợi", "300/300", "41", "6000/6000", "1", "3", "22", "có"],
  ["NIO + hàng đợi", "300/300", "48", "6000/6000", "1", "3", "18", "có"],
], [2.6, 1.6, 1.8, 1.8, 1, 1, 1, 1.4], [1, 2, 3, 4, 5, 6]));
add(figure("experiments/charts/e3_slow_consumer.png", "E3: số tin broadcast tới các chi nhánh bình thường"));
add(H2("9.4. E4 – BIO và NIO"));
add(table("Kết quả E4 (mỗi client 1 SALE/giây, 30 giây; không có tin nào bị mất)", [
  ["Server", "Client", "Tin gửi", "Thông lượng (tin/s)", "TB (ms)", "p95 (ms)", "p99 (ms)", "Max (ms)", "Luồng (đỉnh)", "Heap (MB)"],
  ["BIO", "50", "1 500", "48,4", "1,37", "1,82", "2,06", "9,57", "117", "33,8"],
  ["BIO", "200", "5 997", "193,5", "1,12", "1,62", "1,98", "5,52", "416", "88,9"],
  ["BIO", "500", "14 992", "483,6", "0,95", "1,26", "1,49", "36,34", "1 017", "145,5"],
  ["NIO", "50", "1 499", "48,4", "1,65", "2,21", "2,60", "6,94", "33", "34,6"],
  ["NIO", "200", "6 000", "193,6", "1,21", "1,73", "2,10", "4,60", "33", "123,1"],
  ["NIO", "500", "14 986", "483,5", "1,01", "1,34", "1,56", "27,06", "32", "149,0"],
], [1, 1, 1.3, 1.6, 1, 1, 1, 1, 1.3, 1.2], [1, 2, 3, 4, 5, 6, 7, 8, 9]));
add(figure("experiments/charts/e4_bio_nio.png", "E4: số luồng server và độ trễ p95 theo số client"));
add(H2("9.5. E5 – Kết nối lại hàng loạt"));
add(table("Kết quả E5 (300 chi nhánh, 5 lần mỗi chính sách, tổng 1500 lần nối lại)", [
  ["Chính sách", "Đã nối lại", "TB (ms)", "p95 (ms)", "Max (ms)", "Lần thử / client", "Đỉnh / 100 ms"],
  ["fixed 5 s (SRS)", "1500/1500", "3 224", "4 854", "4 874", "2,40", "300,0"],
  ["backoff + full jitter", "1500/1500", "1 669", "3 884", "4 891", "6,76", "92,0"],
  ["jitter lệch pha (đề xuất)", "1500/1500", "1 922", "3 995", "4 982", "3,31", "16,4"],
], [3.2, 1.6, 1.2, 1.2, 1.2, 1.6, 1.6], [1, 2, 3, 4, 5, 6]));
add(figure("experiments/charts/e5_reconnect.png", "E5: thời gian nối lại, đỉnh lần thử và số lần thử mỗi client"));
add(H2("9.6. E6 – Luồng cấp hàng trọn vẹn với 50–100 chi nhánh"));
add(table("Kết quả E6 – tính đúng và độ ổn định của tầng mạng", [
  ["Số CN × vòng", "Cảnh báo", "Gửi / báo hết", "Mất tin", "Trùng", "Lỗi", "Mất kết nối", "Kho tổng (xuất + còn = ban đầu)"],
  ["50 × 5", "250/250", "200 / 50", "0", "0", "0", "0", "2 000 + 0 = 2 000"],
  ["100 × 5", "500/500", "400 / 100", "0", "0", "0", "0", "4 000 + 0 = 4 000"],
  ["100 × 20", "2000/2000", "1600 / 400", "0", "0", "0", "0", "16 000 + 0 = 16 000"],
], [2, 1.6, 1.8, 1.2, 1, 1, 1.4, 3], [1, 3, 4, 5, 6]));
add(table("Kết quả E6 – độ trễ từng chặng (ms, trung bình / p95)", [
  ["Số CN × vòng", "SALE → SALE_OK", "LOW_STOCK → admin thấy", "Admin bấm → CN nhận", "CN nhận → admin thấy", "Trọn vòng", "Luồng server"],
  ["50 × 5", "17 / 39", "27 / 106", "16 / 39", "13 / 33", "147 / 256", "40"],
  ["100 × 5", "9 / 32", "16 / 51", "19 / 39", "10 / 24", "250 / 329", "41"],
  ["100 × 20", "9 / 30", "13 / 54", "11 / 23", "8 / 24", "175 / 280", "41"],
], [2, 2, 2.2, 2.2, 2.2, 1.8, 1.4], [1, 2, 3, 4, 5, 6]));
add(P("Ngoài bộ thực nghiệm, nhóm chạy thử hai phía qua trình duyệt thật (một trang công ty, hai trang chi nhánh CN01, CN02): popup cảnh báo hiện trên trang công ty khoảng 0,2–0,3 giây sau khi chi nhánh bấm Bán; sau khi admin bấm Gửi hàng hoặc chi nhánh bấm Đã nhận hàng, phía bên kia thấy trạng thái mới trong dưới 1 giây (gồm cả thời gian giao diện tải lại danh sách)."));

// ===== 10 =====
add(H1("10. Thảo luận"));
add(H2("10.1. Vì sao có các kết quả trên"));
add(P("**E1.** Ở READ COMMITTED, các transaction `check_then_act` đọc tồn gần như cùng lúc, cùng thấy đủ hàng, rồi lần lượt ghi đè giá trị mình đã tính. Câu `UPDATE` thứ hai chỉ chờ khóa dòng chứ không đọc lại tồn, nên mọi yêu cầu đều thành công và tồn cuối mang giá trị của transaction ghi sau cùng. Cách `synchronized` đúng vì khóa giữ suốt transaction, nhưng biến 50 yêu cầu thành một hàng đợi duy nhất: chậm hơn `conditional` 3,5 lần, và vẫn sai nếu chạy hai tiến trình server. `conditional` vừa đúng vừa nhanh nhất, vì phép kiểm tra nằm trong câu `UPDATE` mà PostgreSQL đánh giá lại sau khi chờ khóa [2], và khóa chỉ giữ trong lúc cập nhật một dòng."));
add(P("**E2.** Phần mất còn lại của `queue` (20,1 %) chủ yếu là tin gửi trong lúc \"rút dây\": server vẫn thấy chi nhánh online, ghi vào socket thành công, nên không có lý do gì để xếp hàng. `queue_resync` không cần biết tin nào đã tới: sau khi đăng nhập lại, chi nhánh nhận lại mọi yêu cầu còn mở từ CSDL. Độ trễ p95 khoảng 3,2 giây phản ánh đúng thời gian mất mạng (2–5 giây) cộng thời gian nối lại, vì tin chỉ có thể tới khi kết nối đã phục hồi."));
add(P("**E3.** Ở chế độ ghi trực tiếp, sau khoảng 26 broadcast thì bộ đệm gửi của server và bộ đệm nhận của chi nhánh treo đều đầy, lệnh `write` bị chặn vô hạn và luồng broadcast đứng lại. 540 = 27 × 20, tức tin thứ 27 đã kịp tới các chi nhánh đứng trước chi nhánh treo trong vòng lặp. Với hàng đợi gửi, chi nhánh treo chỉ làm đầy hàng đợi của chính nó rồi bị cắt sau 256 tin; các chi nhánh khác nhận đủ với p95 3 ms."));
add(P("**E4.** Ở mức tải này (tối đa khoảng 480 tin/giây), mỗi SALE là một transaction khoảng 1 ms, nên CSDL quyết định độ trễ và hai mô hình I/O cho kết quả gần như nhau. NIO chậm hơn BIO khoảng 0,1–0,4 ms vì mỗi tin phải chuyển từ luồng Selector sang worker. Khác biệt rõ ràng là tài nguyên: BIO cần 2 luồng cho mỗi kết nối (đọc và ghi) nên tăng từ 117 lên 1017 luồng, còn NIO giữ khoảng 32 luồng ở mọi mức tải."));
add(P("**E5.** Với `fixed`, cả 300 chi nhánh mất kết nối cùng lúc nên thử lại cùng lúc: 300 lần kết nối rơi vào một khung 100 ms. Thời gian nối lại phụ thuộc vào việc server lên ở pha nào của chu kỳ 5 giây, nên dao động từ 0,3 đến 4,8 giây giữa các lần lặp. `backoff` nối lại nhanh nhất về trung bình nhưng thử gấp 2,8 lần `fixed`, vì liên tục thử với khoảng chờ ngắn trong lúc server còn tắt. `jitter` giảm đỉnh tải 18 lần so với `fixed` và 5,6 lần so với `backoff`, nối lại nhanh hơn `fixed` 40 % về trung bình, và số lần thử chỉ nhỉnh hơn `fixed`."));
add(P("**E6.** Ở 50–100 chi nhánh, mỗi chặng mạng (TCP tới chi nhánh, SSE tới admin) có p95 dưới 55 ms và không có tin mất, trùng hay kết nối bị đóng; phần lớn thời gian của một vòng là các transaction CSDL nối tiếp nhau (bán, tạo yêu cầu, xuất kho, nhận hàng). Số luồng server đứng yên ở khoảng 40 nhờ NIO. 100 lệnh gửi hàng tranh nhau một mặt hàng vẫn không xuất vượt kho nhờ câu `UPDATE` có điều kiện, và phần thiếu được báo hết hàng đúng như thiết kế."));
add(H2("10.2. Ưu điểm, nhược điểm và phạm vi áp dụng"));
add(B("Các giải pháp hoạt động tốt nhất khi lỗi là thoáng qua (mất mạng vài giây, client treo, server khởi động lại) và khi CSDL sẵn sàng; chúng biến lỗi thành độ trễ thay vì sai dữ liệu."));
add(B("Gửi lại theo trạng thái chấp nhận nhận trùng và chỉ áp dụng cho tin gắn với trạng thái trong CSDL. Broadcast gửi vào một socket \"chết\" mà server chưa phát hiện vẫn có thể mất."));
add(B("NIO không làm nhanh hơn khi CSDL là nút cổ chai. Lợi ích của nó là chịu được nhiều kết nối nhàn rỗi với tài nguyên cố định, phù hợp khi số chi nhánh tăng."));
add(B("Cắt client chậm là đánh đổi: chi nhánh bị cắt phải nối lại, nhưng không làm hỏng hệ thống chung."));
add(H2("10.3. Ý nghĩa"));
add(P("Kết quả cho thấy trong một ứng dụng Client/Server, các lỗi nguy hiểm nhất không đến từ trường hợp thông thường mà từ đồng thời và mất kết nối. Mỗi lỗi chỉ lộ ra khi được tái hiện có chủ đích, như 50 ACCEPT cùng lúc hay một client treo. Vì vậy, việc giữ baseline bằng cờ cấu hình và có bộ thực nghiệm tự động là một phần của giải pháp chứ không chỉ để báo cáo."));

// ===== 11 =====
add(H1("11. Đóng góp và điểm mới (Novelty and Contributions)"));
add(P("So với bản đặc tả ban đầu và cách làm thông thường, project khác ở năm cơ chế, mỗi cơ chế có bằng chứng định lượng:"));
add(table("Đóng góp và bằng chứng", [
  ["Đóng góp", "Mô tả", "Bằng chứng"],
  ["1. Trừ kho nguyên tử", "Một câu UPDATE có điều kiện + khóa dòng yêu cầu, thay cho đọc-rồi-ghi hay khóa Java", "E1: bán vượt 200 → 0; nhanh hơn synchronized 3,5 lần; TC-05, TC-12"],
  ["2. Giao tin theo trạng thái", "Hàng đợi offline + gửi lại mọi yêu cầu còn mở từ CSDL sau LOGIN_OK; client loại trùng", "E2: mất 35,5 % → 20,1 % (SRS) → 0 %; TC-06"],
  ["3. Hàng đợi gửi có giới hạn", "Bên gọi không bị chặn; client chậm bị cắt và tự phục hồi nhờ đóng góp 2", "E3: 540/6000 → 6000/6000 tin"],
  ["4. Server NIO giữ thứ tự", "Một Selector + worker pool + hàng đợi tuần tự theo kết nối", "E4: 1017 → 32 luồng ở 500 client; độ trễ tương đương; 0 tin mất"],
  ["5. Nối lại jitter lệch pha", "Rải pha các client mà vẫn giữ giới hạn 5 giây", "E5: đỉnh 300 → 16,4 lần thử/100 ms; trung bình 3,2 s → 1,9 s"],
  ["6. Bộ thực nghiệm tái lập", "Mỗi cải tiến có cờ bật lại baseline; một lệnh chạy hết, xuất CSV và biểu đồ", "scripts/run-experiments.bat; experiments/results"],
], [2.6, 5, 4.4]));
add(P("Ngoài ra, hệ thống có hai tính năng mở rộng theo đặc tả: tự tìm server bằng UDP broadcast, và điều chuyển hàng giữa chi nhánh với server làm trung gian giao dịch ba bên."));

// ===== 12-14 =====
add(H1("12. Hạn chế"));
add(B("Thực nghiệm chạy client ảo, server và CSDL trên cùng một máy qua loopback. Không có độ trễ mạng thật và client tranh CPU với server, nên số tuyệt đối sẽ khác trong LAN nhiều máy; điều đáng tin là so sánh tương đối giữa các biến thể."));
add(B("\"Rút dây\" ở E2 được mô phỏng ở tầng ứng dụng (client bỏ byte nhận được); chưa đo bằng rút dây thật hay Wireshark trên nhiều máy."));
add(B("E4 chạy 30 giây mỗi mức tải, chưa có lần chạy 10 phút như TC-11 trong cùng bộ thực nghiệm."));
add(B("Mật khẩu vẫn đi dạng rõ trong lệnh LOGIN vì chưa có TLS. Trang công ty có đăng nhập (một tài khoản, cookie HttpOnly) nhưng chạy HTTP thường trên localhost; phiên giữ trong bộ nhớ nên server khởi động lại thì phải đăng nhập lại; API thực nghiệm không đòi đăng nhập khi bật `experiment.api`."));
add(B("Giao thức chưa có số thứ tự và xác nhận tổng quát cho mọi loại tin; broadcast gửi vào socket \"chết\" vẫn có thể mất."));
add(B("Chỉ có một tiến trình server; phiên, Selector và hàng đợi gửi chưa phân tán."));
add(B("Danh sách quá 4096 byte bị cắt bớt (lịch sử tối đa 200 phiếu), chưa có phân trang."));
add(H1("13. Hướng phát triển"));
add(B("Bổ sung TLS (`SSLSocket`/`SSLEngine` với NIO) và so sánh chi phí bắt tay, độ trễ."));
add(B("Thêm số thứ tự và ACK ở tầng ứng dụng cho mọi tin đẩy, kể cả broadcast, để có at-least-once tổng quát."));
add(B("Chạy nhiều server dùng chung CSDL, chuyển tin giữa các server bằng publish/subscribe; giải pháp trừ kho hiện tại vẫn đúng trong mô hình này."));
add(B("Bán hàng khi mất mạng (outbox phía client có số thứ tự), phân bổ công bằng khi khan hàng, và dự báo ngày hết hàng."));
add(B("Đo lại trên LAN nhiều máy, kết hợp Wireshark và rút dây thật."));
add(H1("14. Kết luận"));
add(P("Project xây dựng một hệ thống phân phối hàng hóa Client/Server trên Socket TCP với giao thức tầng ứng dụng tự thiết kế, đáp ứng 25 yêu cầu chức năng và đạt 12 ca kiểm thử của đặc tả. Bên cạnh đó, nhóm xác định bốn tình huống mà cách làm thông thường thất bại (tranh chấp kho, mất tin khi mất kết nối, client chậm, kết nối lại hàng loạt) cùng vấn đề mở rộng số kết nối, đề xuất giải pháp cho từng tình huống và đo bằng số liệu thật: không còn bán vượt kho, không còn mất OFFER, một client treo không còn ảnh hưởng người khác, số luồng server không tăng theo số client, và đỉnh tải khi nối lại giảm 18 lần. Toàn bộ thực nghiệm có thể chạy lại bằng một lệnh."));

// ===== Tài liệu tham khảo =====
add(H1("Tài liệu tham khảo"));
[
  "[1] Oracle, \"Java Platform, Standard Edition 17 API Specification: java.nio.channels.Selector, java.net.Socket, java.net.DatagramSocket.\" https://docs.oracle.com/en/java/javase/17/docs/api/",
  "[2] The PostgreSQL Global Development Group, \"PostgreSQL Documentation, Chapter 13: Concurrency Control – Transaction Isolation.\" https://www.postgresql.org/docs/current/transaction-iso.html",
  "[3] M. Brooker, \"Exponential Backoff And Jitter,\" AWS Architecture Blog, 2015. https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/",
  "[4] D. Kegel, \"The C10K problem.\" http://www.kegel.com/c10k.html",
  "[5] W. R. Stevens, B. Fenner, A. M. Rudoff, UNIX Network Programming, Volume 1: The Sockets Networking API, 3rd ed. Addison-Wesley, 2003.",
  "[6] M. Kleppmann, Designing Data-Intensive Applications. O'Reilly Media, 2017.",
  "[7] W. Eddy (Ed.), \"Transmission Control Protocol (TCP),\" RFC 9293, IETF, 2022.",
  "[8] R. Braden (Ed.), \"Requirements for Internet Hosts – Communication Layers,\" RFC 1122, IETF, 1989.",
  "[9] B. Goetz et al., Java Concurrency in Practice. Addison-Wesley, 2006.",
  "[10] ISO/IEC/IEEE 29148:2018, Systems and software engineering – Life cycle processes – Requirements engineering.",
].forEach((r) => add(new Paragraph({ children: runs(r), spacing: { after: 80 }, indent: { left: 567, hanging: 567 } })));

// ===== Phụ lục =====
add(PB(), H1("Phụ lục A. Bảng lệnh giao thức"));
add(table("Bảng lệnh (CN = chi nhánh, S = server)", [
  ["Lệnh", "Chiều", "Tham số", "Ý nghĩa"],
  ["LOGIN / LOGIN_OK / LOGIN_FAIL", "CN→S / S→CN", "maCN, matKhau / tên CN / lý do", "Đăng nhập"],
  ["INVENTORY_GET / INVENTORY", "CN→S / S→CN", "— / maHang, tenHang, soLuong, nguong; …", "Xem tồn kho"],
  ["SALE / SALE_OK", "CN→S / S→CN", "maHang, soLuong / maHang, soLuongCon", "Ghi nhận bán"],
  ["SET_THRESHOLD", "CN→S", "maHang, nguong", "Đặt ngưỡng (trả INVENTORY)"],
  ["LOW_STOCK", "CN→S", "maHang, soLuongCon, nguong", "Cảnh báo thiếu hàng"],
  ["OFFER", "S→CN", "maYC, maHang, soLuongDeXuat", "Đề xuất cấp"],
  ["ACCEPT / REJECT", "CN→S", "maYC, soLuong / maYC", "Đồng ý (có thể sửa số) / từ chối"],
  ["DELIVERED / OUT_OF_STOCK", "S→CN", "maYC, maHang, soLuong / maYC, soLuongCoThe, maHang", "Đã gửi hàng / kho tổng không đủ"],
  ["RECEIVED", "CN→S", "maYC", "Đã cộng kho, đóng yêu cầu"],
  ["HISTORY_GET / HISTORY", "CN→S / S→CN", "từ ngày, đến ngày / maYC, maHang, tenHang, soLuong, thoiGian, nguon; …", "Lịch sử nhập"],
  ["TRANSFER_REQ / TRANSFER_DONE", "S→CN", "maDC, maHang, soLuong, tenCnNhan / maDC, maHang, soLuongCon", "Điều chuyển"],
  ["TRANSFER_ACCEPT / TRANSFER_REJECT", "CN→S", "maDC", "Trả lời điều chuyển"],
  ["BROADCAST", "S→CN", "noiDung", "Thông báo chung"],
  ["ERROR", "S→CN", "maLoi (E01–E05), moTa", "Báo lỗi"],
  ["PING / PONG / LOGOUT", "hai chiều / CN→S", "—", "Heartbeat, đăng xuất"],
  ["DISCOVER / HERE (UDP 5001)", "CN→S / S→CN", "— / ip, cổng TCP", "Tự tìm server"],
], [3.4, 2.2, 4.2, 2.2]));
add(H1("Phụ lục B. Cấu hình chính"));
add(code([
  "# config/server.properties",
  "tcp.port=5000            discovery.port=5001          max.clients=100",
  "heartbeat.idle.seconds=30   heartbeat.pong.timeout.seconds=10",
  "io.mode=nio              nio.workers=16               write.mode=queued (chỉ BIO)",
  "accept.strategy=conditional   delivery=queue_resync    send.queue.limit=2000",
  "admin.user=admin          admin.salt=pp-admin-2026     admin.password.hash=  (rỗng = admin123)",
  "",
  "# config/client.properties",
  "server=auto              reconnect.strategy=jitter    reconnect.cap.ms=5000",
]));
add(H1("Phụ lục C. Lược đồ cơ sở dữ liệu"));
add(table("Các bảng chính", [
  ["Bảng", "Cột chính", "Ràng buộc đáng chú ý"],
  ["chi_nhanh", "ma_cn, ten, mat_khau_hash, salt, gia_lap", "Mật khẩu băm SHA-256 có salt"],
  ["san_pham, kho_tong", "ma_sp, ten, don_vi, gia; so_luong", "CHECK so_luong ≥ 0"],
  ["kho_chi_nhanh", "(ma_cn, ma_sp), so_luong, nguong_toi_thieu", "CHECK ≥ 0"],
  ["yeu_cau", "ma_yc, ma_cn, ma_sp, số đề xuất/chốt/giao, trang_thai", "CHECK 6 trạng thái; UNIQUE (ma_cn, ma_sp) khi chưa đóng"],
  ["phieu_xuat, phieu_nhap", "ma_px/ma_pn, ma_sp, so_luong, thoi_gian", "UNIQUE ma_yc trong phieu_xuat"],
  ["ban_hang, nhat_ky", "bán hàng; mọi tin IN/OUT tới mili-giây", "Ghi nhật ký theo lô"],
  ["hang_doi_tin", "ma_cn, noi_dung, da_gui", "Chỉ mục riêng cho tin chưa gửi"],
  ["dieu_chuyen", "ma_dc, ma_yc, tu_cn, den_cn, so_luong, trang_thai", "UNIQUE ma_yc khi đang chờ"],
], [2.4, 5, 4.4]));
add(H1("Phụ lục D. Đoạn mã trừ kho (RequestService)"));
add(code([
  "private boolean takeFromCentral(Connection c, String maSp, int soLuong)",
  "        throws SQLException {",
  "    if (settings.acceptStrategy == AcceptStrategy.CONDITIONAL) {",
  "        return Db.update(c, \"UPDATE kho_tong SET so_luong = so_luong - ? \"",
  "                + \"WHERE ma_sp = ? AND so_luong >= ?\",",
  "                soLuong, maSp, soLuong) == 1;",
  "    }",
  "    // baseline: đọc rồi ghi giá trị tính trong Java",
  "    // → lost update nếu không có khóa bao quanh cả transaction",
  "    Integer have = Db.one(c, \"SELECT so_luong FROM kho_tong WHERE ma_sp = ?\",",
  "            rs -> rs.getInt(1), maSp);",
  "    if (have == null || have < soLuong) return false;",
  "    Db.update(c, \"UPDATE kho_tong SET so_luong = ? WHERE ma_sp = ?\",",
  "            have - soLuong, maSp);",
  "    return true;",
  "}",
]));
add(H1("Phụ lục E. Chạy lại thực nghiệm"));
add(code([
  "scripts\\setup-db.bat                     :: tạo CSDL + 500 chi nhánh ảo",
  "scripts\\build.bat                        :: build giao diện và các jar",
  "scripts\\run-experiments.bat run=all      :: E1–E6, khoảng 20 phút",
  "scripts\\run-experiments.bat run=e6 e6.clients=50,100 e6.rounds=5",
  "powershell -File experiments\\make-charts.ps1   :: vẽ lại biểu đồ từ CSV",
]));
add(H1("Phụ lục F. Phân công công việc"));
add(new Paragraph({ spacing: { after: 120 }, children: [placeholder("[Nhóm điền tên thành viên và phần việc thực tế của từng người]")] }));
add(table("Phân công theo module", [
  ["Thành viên", "Phần việc kỹ thuật", "Minh chứng"],
  ["[Thành viên 1]", "common/Protocol, server/net (BIO, NIO, ClientHandler, heartbeat)", "Unit test giao thức, E3, E4"],
  ["[Thành viên 2]", "server/service (transaction, Outbox, điều chuyển), CSDL", "TC-03..06, TC-12, E1, E2"],
  ["[Thành viên 3]", "client, giao diện, loadsim và bộ thực nghiệm", "TC-07, TC-11, E5"],
], [2.4, 6, 3.6]));

// ---------------- tài liệu ----------------

const doc = new Document({
  creator: "Nhóm XX",
  title: "Hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động qua Socket TCP",
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
      ...["steps", "steps2", "steps3"].map((ref) => ({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } } } }] })),
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })] }) },
    children: [...cover, ...body],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log("Da ghi", OUT, `(${figNo} hinh, ${tabNo} bang)`);
});
