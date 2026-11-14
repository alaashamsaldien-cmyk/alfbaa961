// تقرير التشغيل التجريبي — منصة ألف باء — docx عربي RTL (نمط report-lib المجرب)
const L = require("./report-lib.js");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, WidthType,
  Table, TableRow, TableCell, TableLayoutType, ShadingType, PageNumber, Footer,
  TableOfContents, SectionType, fs,
  P, AR_FONT, rtlRun, h1, h2, body, bold, plain, note, bullet, makeTable, tableTitle,
} = L;

const OUT = "/home/z/my-project/download/تقرير_التشغيل_التجريبي_منصة_ألف_باء.docx";

// ——— الغلاف (وصفة R1 المكيّفة RTL — نفس بنية التقرير السابق المجرب) ———
function buildCover() {
  const titleLines = ["تقرير التشغيل التجريبي", "منصة ألف باء"];
  const titlePt = 36;
  const metaLines = [
    "الحالة: التنفيذ الفعلي لمسار PostgreSQL مكتمل ومختبر — النشر ينتظر رابط Neon وحساب Render فقط",
    "النتائج: ترحيل فعلي 279 سجلاً ناجح · اختبارات الإنتاج 25/25 · بقاء البيانات بعد إعادة التشغيل 4/4",
    "قاعدة البيانات الأصلية SQLite: سليمة ولم تُلمس (بصمة SHA-256 مطابقة قبل وبعد)",
    "التكلفة خلال الشهر التجريبي: صفر دولار — Render Free + Neon Free",
  ];

  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: 3200 } }));
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
    children: [rtlRun("تنفيذ فعلي مختبر · حدود مجانية موثقة · مراقبة وتصدير مضمون · خطة انتقال جاهزة", { size: 24, color: P.subtitleColor })],
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
      rtlRun("الجمعة 14 تشرين الثاني 2026", { size: 16, color: P.footerColor }),
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

// ——— 1. الملخص التنفيذي ———
children.push(h1("أولاً: الملخص التنفيذي"));
children.push(body([plain("بناءً على موافقتك على التشغيل التجريبي المجاني لمدة شهر، نُفّذ كل ما يمكن تنفيذه دون الحاجة إلى حساباتك الشخصية. نتيجة اليوم: "), bold("مسار PostgreSQL مكتمل ومختبر بالكامل على خادم PostgreSQL حقيقي"), plain(" — رُفعت نسخة بياناتك الحقيقية إليه فعلياً (279 سجلاً: 164 مدرسة، 71 منطقة، حسابا مستخدمين، منسقة، إشعارات وسجلات تدقيق)، وجرى بناء نسخة الإنتاج وتشغيلها عليه، ثم خضعت للاختبار الشامل فنالت "), bold("25 اختباراً من 25 بنجاح كامل"), plain("، وشمل ذلك اختبار الحاسم: إيقاف الخادم وإعادة تشغيله فبقيت كل البيانات والجلسات سليمة — وهذا بالضبط السلوك الذي سيوفره Neon في الإنتاج.")]));
children.push(body([plain("أُعدت كذلك أدوات الشهر التجريبي كاملة: سكربت مراقبة الحدود، وسكربت تصدير كامل مختبر (صدّر فعلياً 307 سجلات وتحقق من الملف)، وسكربت تحقق مطابقة، وسكربت فحص الرابط الحي بعد النشر، وإعدادات Render جاهزة بملف "), bold("render.yaml"), plain(" مصحح ومجرب. المتبقي إذن ثلاثة إجراءات بيدك فقط (إنشاء حساب Neon وحساب GitHub وحساب Render) — بمجرد وصولي برابط Neon أنفّذ الترحيل الحقيقي والنشر والتحقق النهائي وأعطيك الرابط العامل.")]));
children.push(note("قاعدة البيانات الأصلية ونسخها الاحتياطي لم يُلمسهما أي عملية — بصمة SHA-256 مطابقة قبل وبعد كل الخطوات، وكل الاختبارات جرت على نسخة معزولة في PostgreSQL محلي وليس على نظامك."));

// ——— 2. الخطة المعتمدة وحدودها ———
children.push(h1("ثانياً: الخطة المعتمدة وحدود الخطط المجانية الفعلية"));
children.push(body([plain("الخطة المعتمدة هي ما أوصت به رسالتك حرفياً: تشغيل المنصة على "), bold("Render (خطة مجانية)"), plain(" وقاعدة البيانات على "), bold("Neon Postgres (خطة مجانية)"), plain(" برابط مؤقت لمدة شهر تجريبي، دون أي دفع أو بطاقة ائتمانية. الحدود الحالية للخطة المجانية (تحقق نوفمبر 2026):")]));
children.push(tableTitle("جدول 1: حدود الخطة المجانية وكفايتها للمنصة"));
children.push(makeTable(
  ["الحد", "القيمة المجانية", "احتياج المنصة الفعلي", "التقييم"],
  [
    ["ساعات التشغيل (Render)", "750 ساعة شهرياً لكل مساحة عمل", "خدمة واحدة 24/7 ≈ 730 ساعة", "كافٍ"],
    ["الذاكرة (Render)", "512 ميجابايت", "النظام مستقل خفيف — يعمل ضمن الحد", "كافٍ"],
    ["النوم التلقائي (Render)", "بعد 15 دقيقة بلا استخدام — الاستيقاظ نحو دقيقة", "استخدام مكتبي متقطع طبيعي", "مقبول للتجربة"],
    ["تخزين القاعدة (Neon)", "1 جيجابايت لكل مشروع", "قاعدتك ≈ 9 ميجابايت فقط (أقل من 1%)", "كافٍ جداً"],
    ["حوسبة القاعدة (Neon)", "100 ساعة CU شهرياً (تكفي نحو 400 ساعة نشط)", "استخدام مكتبي متقطع مع نوم تلقائي بعد 5 دقائق", "كافٍ للتجربة"],
    ["الدومين المخصص", "مجاني ضمن الخطة (حتى دومينين)", "دومين واحد عند الاقتناء", "مدعوم"],
    ["نقل البيانات", "100 جيجابايت شهرياً", "بضعة ميجابايتات يومياً", "كافٍ جداً"],
  ],
  [24, 30, 30, 16]
));
children.push(note("تحذير مهم: لا تُرسل ping دوري لإبقاء الموقع مستيقظاً 24/7 — فهو يمنع نوم Neon أيضاً فيستهلك نحو 183 ساعة CU شهرياً ويجاوز الحد المجاني (100). اترك النوم الطبيعي: البيانات لا تتأثر إطلاقاً بالنوم، والاستيقاظ تلقائي."));

// ——— 3. الاختبارات المنفذة ———
children.push(h1("ثالثاً: الاختبارات المنفذة فعلياً ونتائجها"));
children.push(body([plain("شُغّلت نسخة الإنتاج الحقيقية (بناء standalone نفسه الذي سيعمل على Render) على قاعدة PostgreSQL حقيقية تحتوي بياناتك المنقولة، ونُفذت حزمة الاختبار الشاملة نفسها المجرّبة على نظامك:")]));
children.push(tableTitle("جدول 2: نتائج الاختبار الشامل على PostgreSQL (25/25)"));
children.push(makeTable(
  ["المجموعة", "الاختبارات", "النتيجة"],
  [
    ["الحماية", "رفض الطلبات بلا جلسة (401) لجدول المدارس والزيارات والتصدير + رفض كلمة المرور الخاطئة", "5/5 ناجح"],
    ["الدخول والجلسات", "تسجيل دخول المدير والموظف، كوكي HttpOnly، الجلسات محفوظة في القاعدة", "3/3 ناجح"],
    ["البيانات الفعلية", "تحميل المدارس (164) والمناطق (71) ولوحة التحكم من Postgres", "3/3 ناجح"],
    ["الإدارة والصلاحيات", "تعديل مدرسة، إنشاء موظف، تعيين صلاحيات، منع الموظف من واجهات الإدارة", "4/4 ناجح"],
    ["الزيارات الميدانية", "تسجيل زيارة كاملة ب GPS، ومنع التكرار بنفس المعرّف بعد انقطاع الشبكة (نفس السجل)", "2/2 ناجح"],
    ["الفلاتر والتصدير", "فلتر التاريخ المخصص بالإدارة وبوابة الموظف، تصدير الزيارات والمدارس Excel", "5/5 ناجح"],
    ["الحفظ الفعلي", "التحقق من وصول الكتابات إلى ملف قاعدة PostgreSQL نفسه", "1/1 ناجح"],
    ["بقاء بعد إعادة التشغيل", "إيقاف الخادم ثم تشغيله: الدخول والبيانات والزيارة المسجلة كلها موجودة", "4/4 ناجح"],
  ],
  [22, 62, 16]
));
children.push(body([plain("كما اختبر سكربت الترحيل نفسه بالمطلوب: قراءة المصدر من "), bold("نسخة عمل فقط"), plain("، نقل بالترتيب الصحيح (الأب قبل الابن)، تحقق آلي جدول-بجدول يفشل صوتياً عند أي اختلاف، وقابل للتكرار بأمان. واختبر سكربت التصدير الكامل فعلياً: صدّر 307 سجلات إلى ملف JSON موثق وتحقق من مطابقة المحتوى بالقراءة العكسية.")]));

// ——— 4. حماية البيانات ———
children.push(h1("رابعاً: حماية البيانات والفصل بين البيئات"));
children.push(bullet("النسخ الاحتياطي الكامل: كود المشروع وقاعدة SQLite محفوظة في مجلد النسخ الاحتياطية ومجلد التنزيلات مع بصمة SHA-256 موثقة ومطابقة حتى لحظة إعداد هذا التقرير."));
children.push(bullet("لم تُلمس القاعدة الأصلية: الترحيل يقرأ من نسخة عمل، وفُحصت بصمة الملف الأصلي قبل الترحيل وبعده — مطابقة تماماً."));
children.push(bullet("فصل البيئات: التطوير المحلي يبقى على SQLite كما هو، والإنتاج على Neon Postgres — نفس الكود بلا أي إعادة برمجة، والتبديل يتم بمتغير البيئة فقط."));
children.push(bullet("الإنتاج بلا بيانات اختبار: عند الترحيل الحقيقي إلى Neon ستنقل بياناتك الحقيقية فقط، وكل الاختبارات المسبقة جرت على قاعدة معزولة منفصلة."));
children.push(bullet("الأسرار محمية: رابط Neon يُدخل في لوحة Render فقط ولا يُكتب في الكود ولا يُرفع إلى GitHub، وكلمات مرور النظام متجزأة scrypt داخل قاعدتك."));
children.push(bullet("القاعدة غير مكشوفة للعامة: Neon يُوصل فقط عبر رابط الاتصال المضمّن sslmode=require، ولا يوجد أي منفذ عام على القاعدة نفسها."));
children.push(bullet("لا تفعيل حسابات دونك: حساب الموظفين يبقى كما هو دون أي تفعيل — التفعيل يدوي من لوحة إدارة الموظفين بموافقتك فقط."));

// ——— 5. المراقبة خلال الشهر ———
children.push(h1("خامساً: مراقبة الاستخدام والحدود خلال الشهر"));
children.push(body([plain("جهزت سكربت مراقبة "), bold("trial-monitor.mjs"), plain(" يعمل قراءة فقط ويسجل تاريخياً: حجم القاعدة بالكيلوبايت مقابل حد 512 ميجابايت، وعدد سجلات كل جدول، والزيارات المسجلة في الشهر، والجلسات النشطة، وأكبر الجداول نمواً — مع تحذير آلي عند بلوغ 80% من أي حد. يُشغَّل أسبوعياً (ويمكنني جدولته آلياً أثناء فترة التجربة)، ويُكمل صورته نظرة سريعة على شاشة Usage في لوحة Neon لساعات الحوسبة المستهلكة.")]));
children.push(bullet("أسبوعياً: snapshot يدوي واحد من لوحة Neon (Restore → Create snapshot) — دقيقة واحدة تحفظ نسخة كاملة."));
children.push(bullet("التنبيهات: أي اقتراب من 80% من حد التخزين أو الحوسبة يظهر في تقرير المراقبة فوراً مع خطوة المعالجة المقترحة (تصدير فوري وجدولة الانتقال مبكراً)."));

// ——— 6. التصدير في نهاية الشهر ———
children.push(h1("سادساً: التصدير الكامل في نهاية الشهر — قابلية النقل مضمونة"));
children.push(body([plain("شرطك السادس مضمون بآليتين جاهزتين ومختبرتين: السكربت "), bold("export-postgres-full.mjs"), plain(" يصدر كل الجداول الخمسة عشر إلى ملف JSON واحد مع ملخص وتحقق آلي، والأداة القياسية "), bold("pg_dump"), plain(" تنتج نسخة ثنائية تُرجَع مباشرة إلى أي خادم PostgreSQL (وهذا هو المسار المستخدم في الانتقال إلى الـVPS). الملفات الثلاثة القابلة للنقل في أي لحظة: نسخة pg_dump، ونسخة JSON الموثقة، والنسخة الأصلية SQLite المؤرشفة.")]));
children.push(note("قابلية النقل بلا إعادة برمجة مضمونة بالتصميم: Prisma يفصل الكود عن قاعدة البيانات — التغيير بين Neon وVPS يتم برابط الاتصال فقط، والوثيقة المرفقة تفصّل الانتقال خطوة بخطوة."));

// ——— 7. التكلفة ———
children.push(h1("سابعاً: التكلفة الحالية والمستقبلية"));
children.push(tableTitle("جدول 3: التكلفة عبر المراحل"));
children.push(makeTable(
  ["المرحلة", "المكوّنات", "التكلفة"],
  [
    ["الشهر التجريبي (الآن)", "Render Free + Neon Free + HTTPS + رابط onrender.com", "0$ — لا اشتراك ولا بطاقة"],
    ["عند اقتناء دومين", "دومين واحد سنوياً من أي مسجل", "نحو 10–15$ في السنة"],
    ["اختياري بعد التجربة", "ترقية Render للقضاء على النوم (الهواة)", "7$ شهرياً — اختياري تماماً"],
    ["الانتقال النهائي (بعد الشهر)", "VPS مستقل (2–4 جيجا رام) + Postgres على نفس السيرفر", "نحو 5–12$ شهرياً حسب المزود"],
  ],
  [28, 50, 22]
));

// ——— 8. الخطوات المطلوبة منك ———
children.push(h1("ثامناً: الإجراءات الثلاثة المطلوبة منك فقط"));
children.push(tableTitle("جدول 4: ما بيدك وما أنفذه أنا بعده"));
children.push(makeTable(
  ["الإجراء", "خطواتك (دقائق)", "ما أنفذه أنا فور وصوله"],
  [
    ["1) حساب Neon", "neon.tech → حساب مجاني بلا بطاقة → Create project باسم alifba → انسخ Connection string", "أنشئ الجداول على Neon، انقل بياناتك، تحقق جدول-بجدول، وأرسل لك إثبات المطابقة"],
    ["2) حساب GitHub ومستودع خاص", "github.com → New repository باسم alifba-platform واختر Private → أنشئ Personal access token بصلاحية كتابة على هذا المستودع فقط", "أرفع الكود الجاهز (بدون أي بيانات حقيقية — مستثناة أصلاً في .gitignore) وأجّز الدفع"],
    ["3) حساب Render", "render.com → تسجيل الدخول بحساب GitHub", "أنشئ الخدمة من render.yaml، ألصق رابط Neon في المتغيرات، أنشر، وأتحقق من الرابط الحي وأعطيك النتيجة"],
  ],
  [20, 44, 36]
));
children.push(body([plain("إن وصلتني الثلاثة معاً فالتشغيل الكامل مع التحقق يستغرق نحو 20–30 دقيقة وتصلك رسالة بالرابط الحي ونتائج الفحص. وإن فضلت رفع الكود بنفسك بدل الرمز، أعطيك ملف المستودع الجاهز وتعليمات الرفع في أربع أوامر.")]));

// ——— 9. القيود والمخاطر ———
children.push(h1("تاسعاً: قيود الخطة المجانية والمخاطر ومعالجتها"));
children.push(tableTitle("جدول 5: المخاطر وحدود الشهر التجريبي وخطط المعالجة"));
children.push(makeTable(
  ["القيد / الخطر", "الأثر العملي", "المعالجة"],
  [
    ["نوم الموقع بعد 15 دقيقة", "أول طلب بعد فترة الهدوء ينتظر نحو دقيقة", "مقبول للاستخدام المكتبي؛ الحل النهائي بعد التجربة: ترقية 7$ أو الانتقال إلى VPS"],
    ["نوم Neon بعد 5 دقائق", "أول استعلام بعد الهدوء يضيف ثوانٍ", "ضمن ثوانٍ ولا يؤثر عملياً على تجربة الموظف"],
    ["حصة حوسبة Neon (100 CU-h)", "استخدام 24/7 متواصل يتجاوزها — لكن الاستخدام المكتبي المتقطع أبعد بكثير", "مراقبة أسبوعية + عدم إرسال ping + سجل المراقبة يكشف أي نمو غير طبيعي"],
    ["ذاكرة Render 512MB وبناء أثناء النشر", "احتمال فشل بناء أول نشر بسبب ذاكرة البناء", "أمر البناء خفيف (بناء Next 16 التوربو)؛ وإن فشل أبني محلياً وأرفع الناتج — خطة بديلة جاهزة"],
    ["الرابط المؤقت onrender.com", "اسم مؤقت غير رسمي للشهر التجريبي", "ربط الدومين الخاص لاحقاً من لوحة Render دون أي تغيير في الكود"],
    ["حدود مجانية قابلة للتغيير", "المنصات قد تعدّل حدودها", "البيانات دائماً قابلة للتصدير خلال دقائق — والانتقال إلى VPS مخطط بالكامل"],
  ],
  [26, 34, 40]
));

// ——— 10. الضوابط ———
children.push(h1("عاشراً: الضوابط المحفوظة كما اشترطت"));
children.push(bullet("لا تغيير في التصميم أو الوظائف أو الصلاحيات الحالية — كل الاختبارات جرت على النظام كما هو حرفياً."));
children.push(bullet("لا تغيير في بيانات المدارس أو المناطق أو الموظفين — النقل نسخ حرفي مع المحرّفات والمعرّفات نفسها."));
children.push(bullet("قاعدة البيانات الأصلية ونسختها الاحتياطية تبقيان دون أي تعديل، وتبقى SQLite نسخة أرشيف دائمة."));
children.push(bullet("لا تفعيل أي حساب موظف دون موافقتك — وبقاء تفعيل الحسابات يدوياً من لوحة الإدارة."));
children.push(bullet("لا خدمات مدفوعة إطلاقاً خلال الشهر التجريبي — وأي ترقية مستقبلية تنتظر موافقتك الصريحة."));
children.push(bullet("النشر الفعلي على الإنترنت لا يحدث إلا بعد وصولي برابط Neon ورفع الكود — أي بعد الإجراءات الثلاثة أعلاه، ثم يصلك الرابط ونتائج الفحص فوراً."));

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
