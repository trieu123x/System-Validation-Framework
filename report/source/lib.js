// Tiện ích dựng báo cáo .docx: đoạn văn, đề mục, gạch đầu dòng, bảng, hình, mã, đánh số theo chương.
// Hình/bảng đánh số "Hình 5.2", "Bảng A.1"; ref(id) trả số đã đánh ở lượt dựng trước (build-report.js dựng hai lượt).
const fs = require("fs");
const path = require("path");
const {
  Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ShadingType, ImageRun,
  BorderStyle, PageBreak,
} = require("docx");

const FONT = "Times New Roman";
const BODY = 26; // 13 pt
const CONTENT_W = 9071; // A4 trừ lề trái 3 cm, phải 2 cm
const LINE = 312; // giãn dòng 1,3

function makeLib(root, known = new Map()) {
  const body = [];
  const refs = new Map();
  let chapter = "";
  let figNo = 0;
  let tabNo = 0;
  let figTotal = 0;
  let tabTotal = 0;

  const add = (...xs) => xs.flat(Infinity).forEach((x) => body.push(x));

  /** Chuỗi có **đậm**, `mã`, ~~nghiêng~~, [[cần điền]] → TextRun[] */
  function runs(text, base = {}) {
    const out = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\[\[[^\]]+\]\])/g;
    let last = 0;
    let m;
    const size = base.size ?? BODY;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, size, ...base }));
      const t = m[0];
      // đậm / nghiêng có thể chứa `mã` bên trong: tách tiếp phần bên trong
      if (t.startsWith("**")) out.push(...runs(t.slice(2, -2), { ...base, bold: true }));
      else if (t.startsWith("`")) out.push(new TextRun({ ...base, text: t.slice(1, -1), font: "Consolas", size: size - 4 }));
      else if (t.startsWith("[[")) out.push(new TextRun({ text: t.slice(2, -2), font: FONT, size, highlight: "yellow", ...base }));
      else out.push(...runs(t.slice(2, -2), { ...base, italics: true }));
      last = m.index + t.length;
    }
    if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, size, ...base }));
    return out;
  }

  /** Khóa tài liệu tham khảo theo thứ tự trích dẫn lần đầu (kiểu IEEE). */
  const cites = [];

  /** Thay {fig:id} / {tab:id} bằng số hình, số bảng; {cite:a,b} bằng [1], [2]. */
  function fill(text) {
    return text
      .replace(/\{(fig|tab):([a-z0-9-]+)\}/g, (_, kind, id) => {
        const n = refs.get(id) ?? known.get(id);
        return (kind === "fig" ? "Hình " : "Bảng ") + (n ?? "?");
      })
      .replace(/\{cite:([a-z0-9,-]+)\}/g, (_, keys) => keys.split(",").map((k) => {
        if (!cites.includes(k)) cites.push(k);
        return `[${cites.indexOf(k) + 1}]`;
      }).join(", "));
  }

  const P = (text, opts = {}) => new Paragraph({
    children: runs(fill(text)), alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: LINE }, indent: opts.indent === false ? undefined : { firstLine: 0 },
  });

  /** Đề mục chương: số chương dùng làm tiền tố đánh số hình/bảng. */
  function H1(text, num, { newPage = true } = {}) {
    chapter = num ?? "";
    figNo = 0;
    tabNo = 0;
    return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: newPage,
      children: [new TextRun({ text, font: FONT })], spacing: { before: newPage ? 0 : 360, after: 200 } });
  }
  const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 240, after: 120 } });
  const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 180, after: 80 } });
  const B = (text, level = 0) => new Paragraph({ children: runs(fill(text)), numbering: { reference: "bullets", level },
    spacing: { after: 60, line: 300 }, alignment: AlignmentType.JUSTIFIED });
  let listNo = 0;
  /** Danh sách đánh số; mỗi lần gọi newList() bắt đầu lại từ 1. */
  const newList = () => `steps${++listNo % 40}`;
  const N = (text, ref) => new Paragraph({ children: runs(fill(text)), numbering: { reference: ref, level: 0 },
    spacing: { after: 60, line: 300 }, alignment: AlignmentType.JUSTIFIED });
  const PB = () => new Paragraph({ children: [new PageBreak()] });

  function label(kind) {
    const n = kind === "fig" ? ++figNo : ++tabNo;
    if (kind === "fig") figTotal++; else tabTotal++;
    return chapter ? `${chapter}.${n}` : String(n);
  }

  function pngSize(file) {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }

  /** Hình: maxW tính theo pixel hiển thị (600 ≈ hết bề rộng trang). */
  function figure(file, text, id, maxW = 600) {
    const abs = path.join(root, file);
    const { w, h } = pngSize(abs);
    const scale = Math.min(1, maxW / w);
    const no = label("fig");
    if (id) refs.set(id, no);
    return [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, keepNext: true,
        children: [new ImageRun({ type: "png", data: fs.readFileSync(abs), transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } })] }),
      new Paragraph({ style: "CaptionHinh", alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 },
        children: runs(`Hình ${no}. ${text}`, { italics: true, size: BODY - 2 }) }),
    ];
  }

  const border = { style: BorderStyle.SINGLE, size: 4, color: "9AA4B1" };
  const borders = { top: border, bottom: border, left: border, right: border };

  function cell(text, width, { header = false, align } = {}) {
    // khoảng trắng phân nhóm chữ số (1 410,7) không được ngắt dòng
    text = String(text).replace(/(\d) (?=\d{3}\b)/g, "$1 ");
    return new TableCell({
      width: { size: width, type: WidthType.DXA }, borders,
      shading: header ? { fill: "DCE6F5", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 50, bottom: 50, left: 90, right: 90 },
      children: String(text).split("\n").map((l) => new Paragraph({ alignment: align ?? AlignmentType.LEFT, spacing: { after: 20 },
        children: runs(fill(l), { size: BODY - 4, bold: header || undefined }) })),
    });
  }

  /** Bảng: rows[0] là tiêu đề; ratios = tỉ lệ cột; numCols = các cột căn phải. */
  function table(title, rows, ratios, numCols = [], id) {
    const sum = ratios.reduce((a, b) => a + b, 0);
    const widths = ratios.map((r) => Math.floor((r / sum) * CONTENT_W));
    widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
    const no = label("tab");
    if (id) refs.set(id, no);
    return [
      new Paragraph({ style: "CaptionBang", alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }, keepNext: true,
        children: runs(`Bảng ${no}. ${title}`, { italics: true, size: BODY - 2 }) }),
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

  /** Khối mã: font Consolas 8,5 pt (dòng ≤ 92 ký tự), nền xám, không ngắt giữa trang nếu ngắn. */
  function code(lines) {
    for (const l of lines) {
      if (l.length > 92) console.warn("Dong ma dai qua 92 ky tu: " + l);
    }
    return lines.map((l, i) => new Paragraph({
      shading: { fill: "F2F4F7", type: ShadingType.CLEAR, color: "auto" },
      spacing: { after: 0, line: 240 }, indent: { left: 120, right: 120 },
      children: [new TextRun({ text: l === "" ? " " : l, font: "Consolas", size: 17 })],
      keepNext: lines.length <= 25 && i < lines.length - 1,
    })).concat(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }

  const placeholder = (t, size = BODY + 2) => new TextRun({ text: t, font: FONT, size, highlight: "yellow" });

  return {
    add, body, refs, cites, runs, fill, P, H1, H2, H3, B, N, newList, PB, figure, table, code, placeholder,
    counts: () => ({ fig: figTotal, tab: tabTotal }), listCount: () => listNo,
  };
}

module.exports = { makeLib, FONT, BODY, CONTENT_W, LINE };
