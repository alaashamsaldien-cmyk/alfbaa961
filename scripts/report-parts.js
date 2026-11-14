// ============================================================
// تقرير مراجعة وظيفة «تسجيل زيارة المدرسة» — منصة ألف باء
// مستند Word عربي RTL — غلاف وصفة R1 (معدلة RTL) + فهرس + متن بالصور
// اللوحة اللونية: CM-2 (Blue Orange — تقني/مؤسسي)
// ============================================================
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableLayoutType, SectionType, TableOfContents, VerticalAlign,
} = require("docx");
const fs = require("fs");

// ——— اللوحة اللونية CM-2 ———
const P = {
  bg: "FEFEFE", primary: "1284BA", accent: "FF862F",
  cover: { titleColor: "1284BA", subtitleColor: "606060", metaColor: "707070", footerColor: "A0A0A0" },
  table: { headerBg: "1284BA", headerText: "FFFFFF", accentLine: "1284BA", innerLine: "D8E4EC", surface: "EDF4F9" },
  body: "000000", muted: "555555",
};

const AR = { ascii: "Arial", hAnsi: "Arial", cs: "Arial", eastAsia: "Arial" };

const allNoBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};

function safeText(v, ph) {
  if (v === undefined || v === null || v === "" || String(v) === "NaN" || String(v) === "undefined") return ph || "—";
  return String(v);
}

// ——— مساعدات نصية RTL ———
function rRun(text, opts = {}) {
  return new TextRun({ text: safeText(text), rightToLeft: true, font: AR, size: 24, ...opts });
}
function body(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120, ...(opts.spacing || {}) },
    children: [rRun(text, { size: 24, color: P.body, ...(opts.run || {}) })],
    ...(opts.para || {}),
  });
}
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    bidirectional: true,
    spacing: { before: 360, after: 180, line: 380, lineRule: "atLeast" },
    children: [rRun(text, { size: 32, bold: true, color: P.primary })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    bidirectional: true,
    spacing: { before: 260, after: 140, line: 340, lineRule: "atLeast" },
    children: [rRun(text, { size: 28, bold: true, color: P.primary })],
  });
}
function bullet(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    spacing: { line: 312, after: 80 },
    indent: { right: 340 },
    children: [
      rRun("•  ", { size: 24, color: P.accent, bold: true }),
      rRun(text, { size: 24, color: P.body, ...(opts.run || {}) }),
    ],
  });
}

// ——— جداول RTL ———
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };
function cellP(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align || AlignmentType.START,
    spacing: { line: 276, after: 0 },
    children: [rRun(text, { size: 21, color: opts.color || P.body, bold: opts.bold || false })],
  });
}
function makeTable(headers, rows, widths, opts = {}) {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((t, i) => new TableCell({
      children: [cellP(t, { bold: true, color: P.table.headerText, align: AlignmentType.CENTER })],
      shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
      margins: CELL_MARGINS,
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.CENTER,
    })),
  });
  const dataRows = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((t, i) => new TableCell({
      children: [cellP(t, { align: opts.centerCols && opts.centerCols.includes(i) ? AlignmentType.CENTER : AlignmentType.START, bold: opts.boldCols && opts.boldCols.includes(i) })],
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: P.table.surface } : undefined,
      margins: CELL_MARGINS,
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.CENTER,
    })),
  }));
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
    },
    rows: [headerRow, ...dataRows],
  });
}
function tableTitle(text) {
  return new Paragraph({
    bidirectional: true,
    keepNext: true,
    spacing: { before: 160, after: 100 },
    children: [rRun(text, { size: 21, bold: true, color: P.muted })],
  });
}
function spacer(h = 120) {
  return new Paragraph({ spacing: { before: 0, after: h }, children: [rRun(" ", { size: 8 })] });
}

// ——— الصور ———
const IMG_DIR = "/home/z/my-project/download/صور-المراجعة-الزيارات";
const CM_TO_PX = (cm) => Math.round((cm / 2.54) * 96);
function img(file, widthCm, srcW, srcH) {
  const wPx = CM_TO_PX(widthCm);
  const hPx = Math.round((srcH / srcW) * wPx);
  return new ImageRun({
    type: "png",
    data: fs.readFileSync(`${IMG_DIR}/${file}`),
    transformation: { width: wPx, height: hPx },
  });
}
function figureCaption(text) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 200 },
    children: [rRun(text, { size: 20, bold: true, color: P.muted })],
  });
}
function imageParagraph(imageRun) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 40 },
    children: [imageRun],
  });
}
// زوج صور موبايل جنباً إلى جنب داخل جدول بلا حدود
function mobilePair(fileA, capA, fileB, capB, figA, figB) {
  const SRC_W = 780, SRC_H = 1688;
  const cell = (file, cap) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    borders: noBorders,
    children: [imageParagraph(img(file, 7.9, SRC_W, SRC_H)), figureCaption(cap)],
  });
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allNoBorders,
    rows: [new TableRow({ cantSplit: true, children: [cell(fileA, `${figA}: ${capA}`), cell(fileB, `${figB}: ${capB}`)] })],
  });
}
function desktopImage(file, cap, fig, srcW, srcH) {
  return [
    imageParagraph(img(file, 15.6, srcW, srcH)),
    figureCaption(`${fig}: ${cap}`),
  ];
}

// ——— حساب تخطيط عنوان الغلاف (عربي: عرض الحرف ≈ pt × 12 twips) ———
function calcTitleLayoutAr(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 12;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  const split = (t, cpl) => {
    if (t.length <= cpl) return [t];
    const words = t.split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length <= cpl) cur = (cur + " " + w).trim();
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
      const last = lines.pop();
      lines[lines.length - 1] += " " + last;
    }
    return lines;
  };
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = split(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = split(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ——— الغلاف: وصفة R1 معدلة للعربية (RTL) — بنية الجدول الغلاف نفسها دون تغيير ———
function buildCoverR1RTL(config) {
  const C = config.palette;
  const padR = 1200, padL = 800;
  const availableWidth = 11906 - padR - padL - 300;
  const { titlePt, titleLines } = calcTitleLayoutAr(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 12 };
  const children = [];

  // 1. فراغ علوي ديناميكي
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing }, children: [] }));

  // 2. شارة إنجليزية بخط سفلي بلون التمييز
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { right: padR, left: padL }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: C.accent, font: { ascii: "Calibri", hAnsi: "Calibri" }, characterSpacing: 40 })],
    }));
  }

  // 3. العنوان الرئيسي — محاذاة يمين (bidi start)
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true,
      indent: { right: padR, left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [rRun(titleLines[i], { size: titleSize, bold: true, color: C.titleColor })],
    }));
  }

  // 4. العنوان الفرعي
  if (config.subtitle) {
    children.push(new Paragraph({
      bidirectional: true,
      indent: { right: padR, left: padL }, spacing: { after: 800 },
      children: [rRun(config.subtitle, { size: 24, color: C.subtitleColor })],
    }));
  }

  // 5. أسطر المعلومات مع شريط تمييز على اليمين
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      bidirectional: true,
      indent: { right: padR + 200, left: padL }, spacing: { after: 80 },
      border: { right: accentRight },
      children: [rRun(line, { size: 24, color: C.metaColor })],
    }));
  }

  // 6. فراغ سفلي ديناميكي
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing }, children: [] }));

  // 7. تذييل الغلاف مع خط علوي بلون التمييز
  children.push(new Paragraph({
    bidirectional: true,
    indent: { right: padR, left: padL },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      rRun(config.footerRight || "", { size: 16, color: C.footerColor }),
      new TextRun({ text: "                                        ", font: AR, size: 16 }),
      rRun(config.footerLeft || "", { size: 16, color: C.footerColor }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

module.exports = { P, AR, rRun, body, h1, h2, bullet, makeTable, tableTitle, spacer, mobilePair, desktopImage, buildCoverR1RTL, figureCaption, safeText };
