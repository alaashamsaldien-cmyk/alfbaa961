// تقرير تجهيز منصة ألف باء للنشر — docx بالعربية RTL وفق قواعد مهارة docx
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, TableLayoutType,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType, VerticalAlign,
  PageNumber, Header, Footer, TableOfContents, PageBreak, ImageRun, SectionType,
} = require("docx");
const fs = require("fs");

// ——— لوحة الألوان: Dawn Mist Tech (تقنية — باردة خفيفة نشطة) ———
const P = {
  primary: "#0A1628", body: "#1A2B40", secondary: "#6878A0",
  accent: "#5B8DB8", surface: "#F4F8FC",
  bg: "#0A1628", titleColor: "#FFFFFF", subtitleColor: "#B8CCE0",
  metaColor: "#D5E2EF", footerColor: "#8FA9C2",
};
const AR_FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };

// ——— مساعدات RTL ———
function rtlRun(text, opts = {}) {
  return new TextRun({ text, rightToLeft: true, font: AR_FONT, ...opts });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    bidirectional: true,
    spacing: { before: 360, after: 160, line: 312 },
    children: [rtlRun(text, { bold: true, size: 32, color: P.primary })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    bidirectional: true,
    spacing: { before: 240, after: 120, line: 312 },
    children: [rtlRun(text, { bold: true, size: 27, color: P.primary })],
  });
}

// فقرة جسم — RTL مضبوطة، مسافة 1.3، بلا مسافة بادئة (العربية لا تستخدم الإزالة الأولى)
function body(textOrRuns, opts = {}) {
  const runs = Array.isArray(textOrRuns) ? textOrRuns : [rtlRun(textOrRuns, { size: 22, color: P.body })];
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 100 },
    children: runs,
    ...opts,
  });
}

function bold(text) { return rtlRun(text, { size: 22, color: P.body, bold: true }); }
function plain(text) { return rtlRun(text, { size: 22, color: P.body }); }
function note(text) {
  return new Paragraph({
    bidirectional: true, alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 100 },
    border: { right: { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 8 } },
    indent: { right: 200 },
    children: [rtlRun(text, { size: 21, color: P.secondary, italics: true })],
  });
}

// بند قائمة RTL
function bullet(text, level = 0) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 60 },
    indent: { right: level === 0 ? 400 : 800 },
    children: [rtlRun((level === 0 ? "•  " : "–  ") + text, { size: 22, color: P.body })],
  });
}

// ——— جدول RTL بمظهر موحّد ———
const cellMargins = { top: 80, bottom: 80, left: 140, right: 140 };
const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "C9D6E4" };

function makeTable(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headers.map((t, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: P.primary },
      margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      borders: {
        top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
      },
      children: [new Paragraph({
        bidirectional: true, alignment: AlignmentType.CENTER, spacing: { line: 276 },
        children: [rtlRun(t, { bold: true, size: 21, color: "FFFFFF" })],
      })],
    })),
  });
  const dataRows = rows.map((cells, r) => new TableRow({
    cantSplit: true,
    children: cells.map((t, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: r % 2 === 0 ? "FFFFFF" : P.surface },
      margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
      children: [new Paragraph({
        bidirectional: true, alignment: AlignmentType.CENTER, spacing: { line: 276 },
        children: [rtlRun(String(t), { size: 20, color: P.body })],
      })],
    })),
  }));
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
  });
}

function tableTitle(text) {
  return new Paragraph({
    bidirectional: true, keepNext: true,
    spacing: { before: 160, after: 80, line: 312 },
    children: [rtlRun(text, { bold: true, size: 21, color: P.secondary })],
  });
}

// ——— قراءة أبعاد PNG من رأس الملف ———
function pngSize(path) {
  const buf = fs.readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function image(path, caption, maxW = 580) {
  const { width, height } = pngSize(path);
  const scale = Math.min(maxW / width, 1);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const els = [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 40 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(path), transformation: { width: w, height: h } })],
  })];
  if (caption) els.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.CENTER,
    spacing: { after: 160, line: 312 },
    children: [rtlRun(caption, { size: 19, color: P.secondary, italics: true })],
  }));
  return els;
}

module.exports = { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, TableLayoutType, WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType, VerticalAlign, PageNumber, Header, Footer, TableOfContents, PageBreak, ImageRun, SectionType, fs, P, AR_FONT, rtlRun, h1, h2, body, bold, plain, note, bullet, makeTable, tableTitle, image };
