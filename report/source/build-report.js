// Tạo báo cáo .docx theo cấu trúc technical paper (Instruction.md mục 8). Số liệu lấy từ experiments/results.
// Nội dung từng chương nằm trong chapters/*.js (đặt tên theo thứ tự), tiện ích dựng trong lib.js.
// Chạy: node build-report.js ../.. ../NhomXX_PhanPhoiHangHoa_Report.docx
// Sau khi chạy, mục lục và danh mục hình/bảng còn trống: mở bằng Word và cập nhật trường (F9),
// hoặc chạy report/source/update-toc.ps1.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, TableOfContents, StyleLevel, Footer, PageNumber, LevelFormat,
  PageBreak,
} = require("docx");
const { makeLib, FONT, BODY } = require("./lib");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, "..", ".."));
const OUT = process.argv[3] || path.join(__dirname, "..", "NhomXX_PhanPhoiHangHoa_Report.docx");

const chapterDir = path.join(__dirname, "chapters");
const chapters = fs.readdirSync(chapterDir).filter((f) => f.endsWith(".js")).sort()
  .map((f) => require(path.join(chapterDir, f)));

/** Dựng toàn bộ nội dung; known = số hình/bảng của lượt trước để tham chiếu tới hình nằm phía sau. */
function build(known) {
  const L = makeLib(ROOT, known);
  chapters.forEach((ch) => ch(L));
  return L;
}

const first = build(new Map());
const L = build(first.refs);

// ---------------- trang bìa ----------------

const center = (children, spacing = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing, children });
const T = (text, opts = {}) => new TextRun({ text, font: FONT, size: opts.size ?? 28, bold: opts.bold, italics: opts.italics });

const cover = [
  center([L.placeholder("[TÊN TRƯỜNG]")], { before: 400 }),
  center([L.placeholder("[TÊN KHOA]")], { after: 200 }),
  center([T("BÁO CÁO BÀI TẬP LỚN", { size: 36, bold: true })], { before: 1300, after: 160 }),
  center([T("Môn: Lập trình mạng – Năm học 2026–2027")], { after: 800 }),
  center([T("HỆ THỐNG PHÂN PHỐI HÀNG HÓA VỚI CẢNH BÁO THIẾU HÀNG TỰ ĐỘNG QUA SOCKET TCP", { size: 34, bold: true })], { after: 300 }),
  center([T("Giao thức tầng ứng dụng, giao tin tin cậy, chống tranh chấp kho và mở rộng bằng Java NIO", { italics: true })], { after: 1100 }),
  center([T("Nhóm "), L.placeholder("XX")], { after: 160 }),
  ...[1, 2, 3, 4].map((i) => center([L.placeholder(`[Họ tên thành viên ${i} – MSSV]`)], { after: 80 })),
  center([T("Giảng viên hướng dẫn: "), L.placeholder("[Họ tên giảng viên]")], { before: 320 }),
  center([T("Tháng 10/2026")], { before: 1000 }),
];

const heading = (text) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
  children: [new TextRun({ text, bold: true, font: FONT, size: 30 })] });

const front = [
  new Paragraph({ children: [new PageBreak()] }),
  heading("MỤC LỤC"),
  new TableOfContents("Mục lục", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ children: [new PageBreak()] }),
  heading("DANH MỤC HÌNH"),
  new TableOfContents("Danh mục hình", { hyperlink: true, stylesWithLevels: [new StyleLevel("CaptionHinh", 1)] }),
  new Paragraph({ children: [new PageBreak()] }),
  heading("DANH MỤC BẢNG"),
  new TableOfContents("Danh mục bảng", { hyperlink: true, stylesWithLevels: [new StyleLevel("CaptionBang", 1)] }),
];

// ---------------- tài liệu ----------------

const caption = (id) => ({ id, name: id, basedOn: "Normal", next: "Normal", quickFormat: true,
  run: { italics: true, size: BODY - 2, font: FONT }, paragraph: { alignment: AlignmentType.CENTER } });

const doc = new Document({
  creator: "Nhóm XX",
  title: "Hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động qua Socket TCP",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: BODY } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: "1B3A6B" }, paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: FONT, color: "1B3A6B" }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, italics: true, font: FONT }, paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2, keepNext: true } },
      caption("CaptionHinh"),
      caption("CaptionBang"),
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] },
      ...Array.from({ length: 40 }, (_, i) => ({ reference: `steps${i}`, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } } } }] })),
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })] }) },
    children: [...cover, ...front, ...L.body],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  const c = L.counts();
  console.log("Da ghi", OUT, `(${c.fig} hinh, ${c.tab} bang, ${L.cites.length} tai lieu tham khao)`);
});
