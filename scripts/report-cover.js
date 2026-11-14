// مولّد التقرير النهائي — يستخدم report-lib.js
const L = require("./report-lib.js");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, WidthType,
  Table, TableRow, TableCell, TableLayoutType, ShadingType, PageNumber, Footer,
  TableOfContents, PageBreak, SectionType, fs,
  P, AR_FONT, rtlRun, h1, h2, body, bold, plain, note, bullet, makeTable, tableTitle, image,
} = L;

const SHOTS = "/home/z/my-project/download/صور-النشر";
const OUT = "/home/z/my-project/download/تقرير_تجهيز_منصة_ألف_باء_للنشر.docx";

// ——— الغلاف: وصفة R1 مكيّفة للعربية RTL ———
function buildCoverRTL() {
  const title = "تقرير تجهيز منصة ألف باء للنشر على الإنترنت";
  const titleLines = ["تقرير تجهيز منصة ألف باء", "للنشر على الإنترنت"];
  const titlePt = 36;
  const metaLines = [
    "التاريخ: السبت، 14 تشرين الثاني 2026",
    "الحالة: الفحص والتحليل والتجهيز الآمن مكتمل — النشر ينتظر موافقة المالك",
    "قاعدة البيانات الحقيقية: سليمة ولم تُلمس (بصمة SHA-256 مطابقة)",
    "الاستضافة الموصى بها: Render (مجاني) + Neon Postgres (مجاني)",
  ];

  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];

  children.push(new Paragraph({ spacing: { before: 3400 } }));

  // العنوان الرئيسي
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true,
      indent: { left: 1200, right: 1200 },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [rtlRun(titleLines[i], { size: titlePt * 2, bold: true, color: P.titleColor })],
    }));
  }

  // العنوان الفرعي
  children.push(new Paragraph({
    bidirectional: true,
    indent: { left: 1200, right: 1200 },
    spacing: { after: 700 },
    children: [rtlRun("فحص شامل · مقارنة استضافات · نسخة إنتاجية مختبرة · خطة نشر مجانية دائمة", { size: 24, color: P.subtitleColor })],
  }));

  // سطور المعلومات بحد جانبي بلون التمييز
  for (const line of metaLines) {
    children.push(new Paragraph({
      bidirectional: true,
      indent: { left: 1200, right: 1400 },
      spacing: { after: 80 },
      border: { right: accentRight },
      children: [rtlRun(line, { size: 22, color: P.metaColor })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: 2400 } }));

  // تذييل الغلاف بخط فاصل علوي
  children.push(new Paragraph({
    bidirectional: true,
    indent: { left: 1200, right: 1200 },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      rtlRun("منصة ألف باء — لوحة إدارة المدارس", { size: 16, color: P.footerColor }),
      new TextRun({ text: "        ", font: AR_FONT }),
      rtlRun("وثيقة داخلية — قبل النشر الفعلي", { size: 16, color: P.footerColor }),
    ],
  }));

  return [new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "auto" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
          left: { style: BorderStyle.NONE, size: 0, color: "auto" },
          right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        },
        children,
      })],
    })],
  })];
}

// ——— المحتويات ———
function buildToc() {
  return [
    new Paragraph({
      bidirectional: true, alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 300 },
      children: [rtlRun("المحتويات", { bold: true, size: 36, color: P.primary })],
    }),
    new TableOfContents("المحتويات", { hyperlink: true, headingStyleRange: "1-2" }),
    new Paragraph({
      bidirectional: true,
      spacing: { before: 200, after: 200 },
      children: [rtlRun("ملاحظة: إن ظهرت الأرقام فارغة، افتح الملف في وورد ثم انقر بزر الفأرة الأيمن على الفهرس واختر «تحديث الحقل».", { size: 19, color: "8A94A6", italics: true })],
    }),
  ];
}

module.exports = { buildCoverRTL, buildToc, OUT, SHOTS };
