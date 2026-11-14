// الفحص البصري: التقاط صور واجهة الموظف (موبايل) ولوحة الإدارة (كمبيوتر)
// يعمل على الخادم المعزول 3100 فقط — كل البيانات اختبارية في نسخة معزولة
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const ADMIN_TOKEN = "69baff624a3e9ae7aa774c34f9d324b97795332345f454ac";
const OUT = "/home/z/my-project/download/صور-المراجعة-الزيارات";

import { mkdirSync } from "fs";
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, path, opts = {}) => page.screenshot({ path, animations: "disabled", timeout: 60000, ...opts });

async function employeeFlow(ctx) {
  const page = await ctx.newPage();

  // ——— تسجيل دخول الموظف من شاشة الدخول الحقيقية ———
  page.setDefaultTimeout(60000);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await wait(3000);
  await shot(page, `${OUT}/موبايل-01-شاشة-الدخول.png`);

  await page.fill('input[name="username"], input[type="text"]', "review_a_fvxswm").catch(() => {});
  // نبحث عن حقلي اسم المستخدم وكلمة المرور وفق تسميات الشاشة
  const userInputs = page.locator("input:not([type='password']):not([type='hidden'])");
  const passInputs = page.locator("input[type='password']");
  await userInputs.last().fill("review_a_fvxswm");
  await passInputs.first().fill("review-pass-1");
  await page.locator("button[type='submit'], button:has-text('دخول')").first().click();
  await wait(4000);

  // ——— لوحة الموظف الرئيسية ———
  await wait(1500);
  await shot(page, `${OUT}/موبايل-02-لوحة-الموظف-الرئيسية.png`);

  // ——— فتح نموذج تسجيل زيارة ———
  const visitIcon = page.locator("text=تسجيل زيارة").first();
  await visitIcon.click({ timeout: 15000 });
  await wait(3000);
  await shot(page, `${OUT}/موبايل-03-الخطوة1-قائمة-المدارس.png`);

  // اختيار المدرسة (أول مدرسة في القائمة تظهر؛ نبحث عن مدرسة ميسلون تحديداً)
  const schoolBtn = page.locator("button:has-text('مدرسة ميسلون الكرخ')").first();
  await schoolBtn.click({ timeout: 15000 });
  await wait(2000);
  await shot(page, `${OUT}/موبايل-04-الخطوة1-بيانات-المدرسة.png`);

  // تأكيد الموقع المحفوظ ثم التالي
  const confirmBtn = page.locator("button:has-text('تأكيد الموقع المحفوظ')").first();
  await confirmBtn.click({ timeout: 8000 }).catch(() => {});
  await wait(1500);
  await shot(page, `${OUT}/موبايل-05-الخطوة1-الموقع-مؤكد.png`);

  await page.locator("button:has-text('التالي')").first().click();
  await wait(1500);
  await shot(page, `${OUT}/موبايل-06-الخطوة2-نوع-التواصل.png`);

  // الخطوة 2: زيارة ميدانية
  await page.locator("label:has-text('زيارة ميدانية')").first().click();
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1500);
  await shot(page, `${OUT}/موبايل-07-الخطوة3-نتيجة-الزيارة.png`);

  // الخطوة 3: اختيار «رفض» — تظهر خطوة سبب الرفض الديناميكية
  await page.locator("label:has-text('رفض')").first().click();
  await wait(800);
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1500);
  await shot(page, `${OUT}/موبايل-08-خطوة-سبب-الرفض-الإلزامية.png`);

  await page.fill("textarea", "المدير طلب مراجعة العرض مرة أخرى بعد نهاية الفصل الدراسي");
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1500);
  await shot(page, `${OUT}/موبايل-09-الخطوة4-معلومات-التواصل.png`);

  await page.locator("input").nth(0).fill("أحمد الجبوري");
  await page.locator("input").nth(1).fill("معاون المدير");
  await page.locator("input").nth(2).fill("سعاد عبد الرحمن");
  await page.locator("input").nth(3).fill("07701234567");
  await page.locator("input").nth(4).fill("420");
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1500);
  await shot(page, `${OUT}/موبايل-10-الخطوة5-الاحتياجات.png`);

  await page.locator("label:has-text('طلاء')").first().click();
  await page.locator("label:has-text('مقاعد')").first().click();
  await page.locator("label:has-text('أخرى')").first().click();
  await wait(800);
  await page.fill("textarea", "أبواب أقسام البناء معطلة");
  await shot(page, `${OUT}/موبايل-11-الخطوة5-احتياج-أخرى-إلزامي.png`);
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1500);
  await shot(page, `${OUT}/موبايل-12-الخطوة6-المتابعة.png`);

  await page.locator("input").nth(0).fill("35");
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1500);
  await shot(page, `${OUT}/موبايل-13-الخطوة7-الملخص-قبل-الإرسال.png`, { fullPage: true });

  await page.locator("button:has-text('إرسال وتسجيل الزيارة')").first().click();
  await wait(4000);
  await shot(page, `${OUT}/موبايل-14-شاشة-النجاح.png`);

  // قائمة زيارات الموظف بعد التسجيل
  await page.locator("text=الزيارات والتواصل").first().click({ timeout: 8000 }).catch(() => {});
  await wait(2500);
  await shot(page, `${OUT}/موبايل-15-قائمة-زيارات-الموظف.png`);

  await ctx.close();
}

async function adminFlow(ctx) {
  // جلسة المدير مباشرة عبر الكوكي — دون أي مساس بكلمة مرور
  await ctx.addCookies([{ name: "alifba_session", value: ADMIN_TOKEN, url: BASE }]);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/#/visits`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await wait(6000);
  await shot(page, `${OUT}/إدارة-01-الزيارات-جدول-الموظفين.png`, { fullPage: true });

  // فلاتر ظاهرة — صورة لأعلى الجدول
  await shot(page, `${OUT}/إدارة-02-فلاتر-الجدول.png`);

  // فتح نافذة تفاصيل الزيارة (أيقونة العين) لأول صف
  const eyeBtn = page.locator("button[title='عرض تفاصيل الزيارة كاملة']").first();
  await eyeBtn.click({ timeout: 15000 });
  await wait(3000);
  await shot(page, `${OUT}/إدارة-03-نافذة-تفاصيل-الزيارة.png`, { fullPage: true });

  // زر عرض الموقع على الخريطة الداخلية
  await page.locator("button:has-text('عرض موقع المدرسة على الخريطة')").first().click({ timeout: 10000 });
  await wait(8000); // انتظار تحميل بلاطات الخريطة
  await shot(page, `${OUT}/إدارة-04-موقع-المدرسة-على-الخريطة-الداخلية.png`);

  await page.keyboard.press("Escape");
  await wait(800);
  await page.keyboard.press("Escape");
  await wait(800);

  // تبويب سجل التواصل العام
  await page.locator("button[role='tab']:has-text('سجل التواصل العام')").first().click({ timeout: 8000 }).catch(() => {});
  await wait(3000);
  await shot(page, `${OUT}/إدارة-05-سجل-التواصل-العام-يضم-الزيارات.png`);

  // لوحة التحكم الرئيسية — إشعار الزيارة الجديدة
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await wait(5000);
  await shot(page, `${OUT}/إدارة-06-لوحة-التحكم.png`);

  await ctx.close();
}

const browser = await chromium.launch({ headless: true });

// إزالة شارة أدوات تطوير Next.js التي تعترض النقرات في وضع dev
function devOverlayGuard(ctx) {
  ctx.addInitScript(() => {
    const remove = () => document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    const attach = () => {
      remove();
      new MutationObserver(remove).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.documentElement) attach();
    else document.addEventListener("DOMContentLoaded", attach, { once: true });
  });
}

try {
  console.log("— تدفق الموظف (موبايل 390×844) —");
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ar",
    });
    devOverlayGuard(ctx);
    await employeeFlow(ctx);
  }
  console.log("— تدفق الإدارة (كمبيوتر 1440×900) —");
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "ar",
    });
    devOverlayGuard(ctx);
    await adminFlow(ctx);
  }
  console.log("✅ اكتُقطت كل الصور في:", OUT);
} finally {
  await browser.close();
}
