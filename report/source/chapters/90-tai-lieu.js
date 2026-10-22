// Tài liệu tham khảo (N1 gom): in theo thứ tự trích dẫn lần đầu trong các chương trước.
const { Paragraph } = require("docx");
const refs = require("../references");

module.exports = (L) => {
  const { add, H1, runs } = L;
  add(H1("Tài liệu tham khảo"));
  L.cites.forEach((key, i) => {
    const text = refs[key];
    if (!text) {
      throw new Error("Thieu tai lieu tham khao: " + key);
    }
    add(new Paragraph({ children: runs(`[${i + 1}] ${text}`), spacing: { after: 100, line: 280 }, indent: { left: 567, hanging: 567 } }));
  });
};
