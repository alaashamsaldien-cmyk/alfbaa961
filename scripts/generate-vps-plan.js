// خطة الانتقال إلى السيرفر النهائي (VPS) — منصة ألف باء — docx عربي RTL
const L = require("./report-lib.js");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, WidthType,
  Table, TableRow, TableCell, TableLayoutType, ShadingType, PageNumber, Footer,
  TableOfContents, SectionType, fs,
  P, AR_FONT, rtlRun, h1, h2, body, bold, plain, note, bullet, makeTable, tableTitle,
} = L;

const OUT = "/home/z/my-project/download/خطة_الانتقال_إلى_السيرفر_النهائي_VPS.docx";

function buildCover() {
  const titleLines = ["خطة الانتقال إلى السيرفر النهائي", "VPS بعد الشهر التجريبي"];
  const titlePt = 34;
  const metaLines = [
    "الهدف: نقل المنصة كاملة إلى سيرفر مستقل دون إعادة برمجة ولا فقدان بيانات، مع الحفاظ على الدومين",
    "المبدأ: البيانات تنتقل بأداة pg_dump القياسية، والكود نفسه يعمل كما هو — يتغير رابط قاعدة البيانات فقط",
    "التراجع آمن: إعادة توجيه الدومين إلى Render تستغرق دقائق إن لزم أثناء فترة التشغيل المزدوج",
    "مرفق: سكربتات التصدير والتحقق الجاهزة — export-postgres-full.mjs و verify-postgres-deployment.mjs",
  ];

  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: 3300 } }));
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true,
      indent: { left: 1200, right: 1200 },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [rtlRun(titleLines[i], { size: titlePt * 2, bold: true, color: P.titleColor })],
    }));
  }
  children.push(new Paragraph({
    bidirectional: true,
    indent: { left: 1200, right: 1200 },
    spacing: { after: 700 },
    children: [rtlRun("سبع مراحل مجرّبة · نقل بيانات قياسي · شهادة SSL تلقائية · تراجع آمن", { size: 24, color: P.subtitleColor })],
  }));
  for (const line of metaLines) {
    children.push(new Paragraph({
      bidirectional: true,
      indent: { left: 1200, right: 1400 },
      spacing: { after: 80 },
      border: { right: accentRight },
      children: [rtlRun(line, { size: 22, color: P.metaColor })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: 2300 } }));
  children.push(new Paragraph({
    bidirectional: true,
    indent: { left: 1200, right: 1200 },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      rtlRun("منصة ألف باء — لوحة إدارة المدارس", { size: 16, color: P.footerColor }),
      new TextRun({ text: "        ", font: AR_FONT }),
      rtlRun("وثيقة تخطيط — نوفمبر 2026", { size: 16, color: P.footerColor }),
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

const children = [];

// ——— 1. الهدف والمبادئ ———
children.push(h1("أولاً: الهدف والمبادئ الحاكمة"));
children.push(body([plain("بعد انتهاء الشهر التجريبي المجاني على Render وNeon، تُنقل المنصة إلى سيرفر مستقل VPS تشتريه أنت — فيصبح النظام والقاعدة "), bold("ملكيتك الكاملة على سيرفر لا أحد يوقفه أو يحد ساعاته"), plain(". الخطة مبنية على ثلاثة مبادئ ثابتة:")]));
children.push(bullet("بلا إعادة برمجة: الكود الحالي نفسه يعمل على الـVPS حرفياً — التغيير الوحيد رابط قاعدة البيانات في متغير البيئة."));
children.push(bullet("بلا فقدان بيانات: النقل بأداة pg_dump القياسية ثم تحقق آلي بمطابقة أعداد كل جدول قبل تشغيل النظام الجديد."));
children.push(bullet("بلا انقطاع: الدومين يُحوَّل بعد نجاح الفحص الكامل على الـVPS، مع فترة تشغيل مزدوج قصيرة وإمكانية تراجع فوري."));

// ——— 2. الأصول عند نهاية الشهر ———
children.push(h1("ثانياً: الأصول المتوفرة عند نهاية الشهر التجريبي"));
children.push(tableTitle("جدول 1: ما نملكه قبل بدء الانتقال"));
children.push(makeTable(
  ["الأصل", "مكانه", "دوره في الانتقال"],
  [
    ["كود المنصة", "مستودع GitHub الخاص", "يُستنسخ على الـVPS مباشرة"],
    ["بيانات الإنتاج", "قاعدة Neon Postgres", "تُصدر بـ pg_dump وتُرجَع على الـVPS"],
    ["نسخة JSON موثقة", "سكربت export-postgres-full.mjs", "أرشيف قراءة وتحقق مستقل"],
    ["النسخة الأصلية SQLite", "مجلد النسخ الاحتياطية ببصمة SHA-256", "أرشيف تاريخي دائم لا يُلمس"],
    ["إعدادات النشر", "render.yaml وأوامر البناء المجرّبة", "الأوامر نفسها تُستخدم على الـVPS"],
  ],
  [26, 36, 38]
));

// ——— 3. مواصفات السيرفر ———
children.push(h1("ثالثاً: مواصفات السيرفر المطلوبة والتكلفة التقديرية"));
children.push(tableTitle("جدول 2: المواصفات الموصى بها"));
children.push(makeTable(
  ["العنصر", "الموصى به", "ملاحظات"],
  [
    ["نظام التشغيل", "Ubuntu 24.04 LTS", "دعم طويل وسلامة تحديثات"],
    ["المعالج والذاكرة", "2 نواة و2–4 جيجابايت رام", "النظام الحالي خفيف جداً — هذه المواصفات تعطي هامش أمان مريح"],
    ["القرص", "20–40 جيجابايت SSD", "القاعدة أقل من 10 ميجابايت حالياً"],
    ["قاعدة البيانات", "PostgreSQL 16 أو أحدث على نفس السيرفر", "بلا خدمات خارجية — البيانات داخل سيرفرك"],
    ["بيئة التشغيل", "Node.js 24 + systemd أو pm2", "إعادة تشغيل تلقائي مع السيرفر"],
    ["الويب والشهادة", "nginx + شهادة Let's Encrypt مجانية (certbot)", "HTTPS تلقائي التجديد مثل Render"],
    ["التكلفة التقديرية", "نحو 5–12$ شهرياً حسب المزود", "أمثلة: مزودو VPS الاقتصاديون بهذه المواصفات"],
  ],
  [24, 40, 36]
));

// ——— 4. مراحل الانتقال السبع ———
children.push(h1("رابعاً: مراحل الانتقال السبع بالتفصيل"));
children.push(h2("المرحلة 1: تجهيز السيرفر (نحو 30 دقيقة)"));
children.push(bullet("إنشاء السيرفر من مزودك، تحديث النظام، إنشاء مستخدم إداري غير الجذر بكلمة مرور قوية."));
children.push(bullet("تفعيل الجدار الناري: السماح فقط للمنفذين 22 (إدارة) و80 و443 (الموقع) — قاعدة البيانات لا تُفتح للإنترنت إطلاقاً وتُنصت محلياً فقط."));
children.push(bullet("تثبيت Node.js 24 وPostgreSQL وnginx وcertbot بأوامر حزمة قياسية."));

children.push(h2("المرحلة 2: إنشاء قاعدة البيانات على الـVPS (10 دقائق)"));
children.push(bullet("إنشاء مستخدم قاعدة وكلمة مرور قوية وقاعدة اسمها alifba — الوصول محصور محلياً على السيرفر."));
children.push(bullet("إنشاء الجداول بنفس أمر النشر المجرّب: prisma db push من مخطط Postgres الموجود أصلاً في المستودع."));

children.push(h2("المرحلة 3: نقل البيانات من Neon (15 دقيقة + تحقق)"));
children.push(bullet("الإصدار من Neon: pg_dump برابط Neon ينتج ملفاً ثنائياً مضغوطاً واحداً."));
children.push(bullet("الإرجاع على الـVPS: pg_restore إلى قاعدة alifba."));
children.push(bullet("التحقق الآلي: تشغيل سكربت verify-postgres-deployment.mjs على الـVPS مقابل نسخة SQLite المرجعية — يجب تطابق كل الجداول قبل المتابعة. بديل عند الحاجة: ملف JSON من سكربت التصدير الكامل."));

children.push(h2("المرحلة 4: نشر الكود والتشغيل (20 دقيقة)"));
children.push(bullet("git clone للمستودع الخاص (بمفتاح نشر Deploy Key للقراءة فقط) ثم تثبيت الاعتماديات."));
children.push(bullet("أوامر البناء نفسها المجربة: توليد عميل Prisma لـPostgres، ثم بناء Next standalone، ثم نسخ الملفات الثابتة."));
children.push(bullet("متغير البيئة الوحيد المتغير: DATABASE_URL يشير إلى القاعدة المحلية على الـVPS."));
children.push(bullet("خدمة systemd باسم alifba تعيد تشغيل التطبيق تلقائياً مع كل إقلاع للسيرفر أو انهيار للعملية."));

children.push(h2("المرحلة 5: nginx وشهادة HTTPS (15 دقيقة)"));
children.push(bullet("nginx كواجهة عكسية تحوّل المنفذ 443 إلى التطبيق الداخلي، مع تفعيل ضغط gzip للملفات الثابتة."));
children.push(bullet("certbot يصدر شهادة Let's Encrypt للدومين ويجعل التجديد تلقائياً — بلا أي تغيير في الكود."));

children.push(h2("المرحلة 6: تحويل الدومين (دقائق + انتشار DNS)"));
children.push(bullet("قبل يوم من الانتقال: خفض TTL لسجل الدومين إلى 300 ثانية لتسريع الانتشار."));
children.push(bullet("بعد نجاح الفحص الكامل: تغيير سجل الدومين من CNAME إلى onrender.com إلى سجل A بعنوان الـVPS (أو CNAME لاسم مضيف الـVPS إن توفر)."));
children.push(bullet("الانتشار عادة خلال دقائق إلى ساعات — وخلاله يعمل الرابط القديم دون انقطاع."));

children.push(h2("المرحلة 7: فحص القبول والتشغيل المزدوج ثم الإيقاف (نحو يوم)"));
children.push(bullet("فحص قبول كامل على الدومين الجديد: الدخول، المدارس، تسجيل زيارة فعلية واحدة، تصدير Excel، إعادة تشغيل السيرفر والتأكد من البقاء."));
children.push(bullet("إبقاء Render يعمل يومين كفترة تشغيل مزدوج، ثم إيقاف الخدمة المجانية نهائياً — وبقاء نسخ Neon أسبوعين كأرشيف قبل إغلاقها."));

// ——— 5. التراجع ———
children.push(h1("خامساً: خطة التراجع الآمن"));
children.push(body([plain("إن ظهرت أي مشكلة غير متوقعة على الـVPS أثناء التشغيل المزدوج أو بعد التحويل مباشرة، فالتراجع إعادة تغيير سجل DNS إلى قيمته القديمة (CNAME إلى onrender.com) — يرجع النظام إلى Render خلال دقائق إلى ساعات حسب انتشار DNS، "), bold("وبلا أي فقدان بيانات"), plain(" لأن أي زيارة سُجلت على الـVPS خلال الفترة تُصدَّر وتُدمج قبل العودة. لذلك يُنصح بأخذ pg_dump جديد من الـVPS قبل أي إجراء تراجع.")]));
children.push(note("لن تُغلق أي خدمة قبل نجاح الفحص الكامل على الوجهة الجديدة — هذا شرط ثابت في كل المراحل."));

// ——— 6. ما يتغير وما لا يتغير ———
children.push(h1("سادساً: ما يتغير وما لا يتغير"));
children.push(tableTitle("جدول 3: نطاق التغيير الكامل"));
children.push(makeTable(
  ["يتغير", "لا يتغير إطلاقاً"],
  [
    ["رابط قاعدة البيانات في متغير البيئة (يصير محلياً على الـVPS)", "الكود — سطر واحد لا يتغير"],
    ["وجهة سجل DNS للدومين", "التصميم والواجهات والألوان والخرائط"],
    ["رابط الوصول العام (يبقى الدومين نفسه إن اقتنيته)", "الوظائف والصلاحيات ونظام الجلسات"],
    ["مكان استضافة القاعدة (من Neon إلى سيرفرك)", "بيانات المدارس والمناطق والموظفين والزيارات"],
  ],
  [50, 50]
));

// ——— 7. الجدول الزمني ———
children.push(h1("سابعاً: الجدول الزمني المقترح"));
children.push(tableTitle("جدول 4: توقيت الانتقال النموذجي"));
children.push(makeTable(
  ["اليوم", "العمل", "المدة"],
  [
    ["اليوم -1", "خفض TTL للدومين + أخذ pg_dump محدث من Neon + snapshot نهائي", "15 دقيقة"],
    ["اليوم 0 صباحاً", "المراحل 1–5: تجهيز الـVPS ونقل البيانات ونشر الكود وnginx", "نحو 90 دقيقة"],
    ["اليوم 0 ظهراً", "فحص القبول الكامل على رابط مؤقت للـVPS ثم تحويل DNS", "نحو 30 دقيقة"],
    ["اليوم 0–2", "تشغيل مزدوج: الرابط الجديد أساسياً، Render احتياطياً", "48 ساعة"],
    ["اليوم 2", "فحص نهائي + إيقاف Render + جدولة النسخ الاحتياطي اليومي على الـVPS", "15 دقيقة"],
  ],
  [18, 62, 20]
));

// ——— 8. النسخ الاحتياطي بعد الانتقال ———
children.push(h1("ثامناً: النسخ الاحتياطي بعد الانتقال إلى الـVPS"));
children.push(bullet("نسخة pg_dump يومية آلية عبر cron على الـVPS مع احتفاظ بآخر 7 نسخ داخل السيرفر."));
children.push(bullet("نسخة أسبوعية تُنقل خارج السيرفر (إلى حاسوبك أو تخزين سحابي) — القاعدة الحقيقية أقل من 10 ميجابايت فالعمل ثوانٍ."));
children.push(bullet("نسخة الكود محفوظة أصلاً في GitHub، والنسخة الأصلية SQLite المؤرشفة تبقى أرشيفاً دائماً."));
children.push(bullet("اختبار استرجاع مرة شهرياً: إرجاع نسخة على قاعدة مؤقتة والتحقق منها — التأمين لا يكتمل إلا باختبار الاسترجاع."));

// ——— التجميع ———
const doc = new Document({
  features: { updateFields: true },
  styles: {
    default: {
      document: {
        run: { font: AR_FONT, size: 22, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
    },
  },
  sections: [
    { properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } } }, children: buildCover() },
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, pageNumbers: { start: 1, formatType: "lowerRoman" } },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary, font: AR_FONT })],
          })],
        }),
      },
      children: buildToc(),
    },
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, pageNumbers: { start: 1, formatType: "decimal" } },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "منصة ألف باء — ", size: 18, color: P.secondary, font: AR_FONT, rightToLeft: true }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary, font: AR_FONT }),
            ],
          })],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("SAVED:", OUT, buf.length, "bytes");
});
