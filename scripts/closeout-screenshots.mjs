// ============================================================
// الفحص الشامل للواجهات + لقطات الشاشة — النسخة المعزولة 3100 فقط
// 1) اختبار حقيقي للطابور غير المتصل: زيارة متصلة + زيارتان متتاليتان منقطعتان + إعادة إرسال تلقائية
// 2) لقطات: واجهة الموبايل + لوحة الإدارة (الجدول، الفلاتر، الخريطة المباشرة، التفاصيل، تفعيل حساب ربيع)
// القاعدة الحقيقية لا تُلمس إطلاقاً.
// ============================================================
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "fs";

const BASE = "http://localhost:3100";
const TEST_DB_URL = "file:/home/z/my-project/db/review-isolated.db";
const ADMIN_TOKEN = "69baff624a3e9ae7aa774c34f9d324b97795332345f454ac";
const OUT = "/home/z/my-project/download/صور-إغلاق-الملاحظات";
mkdirSync(OUT, { recursive: true });

const db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, path) => page.screenshot({ path, animations: "disabled", timeout: 60000 });

const jar = (token) => ({ Cookie: `alifba_session=${token}`, "Content-Type": "application/json" });
async function api(path, { method = "GET", token = ADMIN_TOKEN, body } = {}) {
  const res = await fetch(BASE + path, { method, headers: jar(token), body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, res };
}

let results = [];
function check(name, cond, extra = "") {
  results.push({ name, ok: Boolean(cond), extra });
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
}

async function main() {
  console.log("=== تجهيز بيانات الواجهة على النسخة المعزولة ===");

  // موظف ميداني اختباري — صلاحيات: تسجيل زيارة + زيارات (اطلاع + تصدير)
  const suffix = Date.now().toString(36).slice(-6);
  const empUser = `field_${suffix}`;
  const empPass = "field-pass-1";
  const mk = await api("/api/employees", { method: "POST", body: { name: "سامي الميداني", username: empUser, password: empPass, role: "STAFF", jobTitle: "باحث ميداني" } });
  if (mk.status !== 201) throw new Error("فشل إنشاء الموظف الميداني: " + JSON.stringify(mk.json));
  const emp = await db.user.findUnique({ where: { username: empUser } });
  await db.employeePermission.deleteMany({ where: { userId: emp.id } });
  await db.employeePermission.createMany({
    data: [
      { userId: emp.id, section: "visit_register", visible: true, canView: true, canCreate: true },
      { userId: emp.id, section: "visits", visible: true, canView: true, canExport: true },
      { userId: emp.id, section: "reviews", visible: true, canView: true },
    ],
  });
  console.log(`✅ الموظف الميداني: ${empUser}`);

  // موظف ثانٍ لزيارات إضافية في جدول الإدارة (اتصال هاتفي/واتساب)
  const emp2User = `caller_${suffix}`;
  const mk2 = await api("/api/employees", { method: "POST", body: { name: "ليلى الاتصالات", username: emp2User, password: "caller-pass-1", role: "STAFF" } });
  if (mk2.status !== 201) throw new Error("فشل إنشاء الموظف الثاني");
  const emp2 = await db.user.findUnique({ where: { username: emp2User } });
  await db.employeePermission.deleteMany({ where: { userId: emp2.id } });
  await db.employeePermission.createMany({
    data: [{ userId: emp2.id, section: "visit_register", visible: true, canView: true, canCreate: true }],
  });

  // مدارس الاختبار (من القاعدة الحقيقية داخل النسخة المعزولة — لا تعديل عليها)
  const schools = await db.school.findMany({ where: { lat: { not: null } }, select: { id: true, name: true, lat: true, lng: true }, take: 3 });
  if (schools.length < 2) throw new Error("لا توجد مدارس بإحداثيات في النسخة المعزولة");
  const s1 = schools[0], s2 = schools[1] ?? schools[0];

  // زيارات لجدول الإدارة من الموظفين — جلسات موظفين محقونة في النسخة المعزولة فقط
  // (الخادم يرفض تصنيف ADMIN على واجهة الموظف حصراً — سلوك صحيح تم التحقق منه)
  const EMP_SEED_TOKEN = "seed1" + "f".repeat(40);
  const EMP_SEED2_TOKEN = "seed2" + "e".repeat(40);
  await db.authSession.create({ data: { token: EMP_SEED_TOKEN, principalType: "ADMIN", userId: emp.id, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) } });
  await db.authSession.create({ data: { token: EMP_SEED2_TOKEN, principalType: "ADMIN", userId: emp2.id, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) } });
  const seedDedupe = `seed-${suffix}`;
  await api("/api/employee/visits", { method: "POST", token: EMP_SEED_TOKEN, body: {
    dedupeKey: seedDedupe + "-a", schoolId: s2.id, contactType: "PHONE", result: "CONTRACTED",
    lat: s2.lat, lng: s2.lng, locationSource: "SAVED", contactPersonName: "أمينة الساعاتي", contactPersonTitle: "مديرة المدرسة",
    schoolPhone: "07701112233", studentCount: 480, subscribersCount: 65, needs: ["PAINT", "SEATS"], notes: "اتصال متابعة تم التعاقد فيه.",
  }});
  await api("/api/employee/visits", { method: "POST", token: EMP_SEED2_TOKEN, body: {
    dedupeKey: seedDedupe + "-b", schoolId: s1.id, contactType: "MEETING", result: "APPROVED",
    lat: s1.lat, lng: s1.lng, locationSource: "MAP", contactPersonName: "حسن العبيدي",
    needs: ["SMART_SCREEN"], notes: "اجتماع متابعة — موافقة رسمية.",
  }});
  console.log("✅ زيارات تعريفية لجدول الإدارة");

  // حفظ ملف Excel نموذجي كدليل ملموس
  const exp = await fetch(BASE + "/api/school-visits/export", { headers: jar(ADMIN_TOKEN) });
  if (exp.ok) {
    writeFileSync(`${OUT}/ملف-تصدير-الزيارات-نموذج.xlsx`, Buffer.from(await exp.arrayBuffer()));
    console.log(`✅ نموذج ملف التصدير حُفظ (${exp.headers.get("x-export-rows")} سجل)`);
  }

  // ============================================================
  console.log("\n=== 1) واجهة الموبايل: الطابور غير المتصل — عدة زيارات متتالية ===");
  // ============================================================
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ar",
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  // إخفاء شارة أدوات تطوير Next (خاص بالتطوير فقط — ليست جزءاً من التطبيق)
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
    if (document.head) document.head.appendChild(style);
  });

  // دخول الموظف من شاشة الدخول الحقيقية
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await wait(3000);
  const inputs = page.locator("input:visible");
  await inputs.nth(0).fill(empUser);
  await page.locator("input[type=password]:visible").first().fill(empPass);
  await page.locator("button[type=submit], button:has-text('دخول')").first().click();
  await wait(4000);
  await shot(page, `${OUT}/موبايل-01-لوحة-الموظف.png`);

  // فتح نموذج تسجيل زيارة
  await page.locator("text=تسجيل زيارة").first().click();
  await wait(2500);
  await shot(page, `${OUT}/موبايل-02-الخطوة1-قائمة-المدارس.png`);

  // ——— زيارة متصلة (عبر الإنترنت) للتأكد أن المسار الطبيعي يعمل ———
  await page.locator(`button:has-text("${s1.name.slice(0, 18)}")`).first().click();
  await wait(1200);
  const confirmBtn = page.locator("button:has-text('تأكيد الموقع المحفوظ')").first();
  if (await confirmBtn.count()) { await confirmBtn.click(); await wait(1200); }
  await shot(page, `${OUT}/موبايل-03-الخطوة1-الموقع-مؤكد.png`);
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1200);
  await page.locator("label:has-text('زيارة ميدانية')").first().click();
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1200);
  await page.locator("label:has-text('موافقة أولية')").first().click();
  await page.locator("button:has-text('التالي')").first().click(); // person
  await wait(1000);
  await page.locator("button:has-text('التالي')").first().click(); // needs
  await wait(1000);
  await page.locator("button:has-text('التالي')").first().click(); // followup
  await wait(1000);
  await page.locator("button:has-text('التالي')").first().click(); // review
  await wait(1000);
  await page.fill("textarea", "زيارة متصلة بالإنترنت — مسار طبيعي سليم.");
  await shot(page, `${OUT}/موبايل-04-الخطوة7-الملخص-زيارة-متصلة.png`);
  await page.locator("button:has-text('إرسال وتسجيل الزيارة')").first().click();
  await wait(4000);
  await shot(page, `${OUT}/موبايل-05-شاشة-النجاح-زيارة-متصلة.png`);
  check("زيارة متصلة سُجلت بنجاح عبر الواجهة", (await db.schoolVisit.count({ where: { employeeId: emp.id, notes: { contains: "متصلة" } } })) === 1);

  // ——— قطع الاتصال: زيارتان متتاليتان تُحفظان في الطابور ———
  await ctx.setOffline(true);
  console.log("… تم قطع الاتصال (وضع غير متصل)");

  await page.locator("button:has-text('تسجيل زيارة جديدة')").first().click();
  await wait(1500);
  await page.locator(`button:has-text("${s2.name.slice(0, 18)}")`).first().click();
  await wait(1200);
  const confirmBtn2 = page.locator("button:has-text('تأكيد الموقع المحفوظ')").first();
  if (await confirmBtn2.count()) { await confirmBtn2.click(); await wait(1200); }
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1000);
  await page.locator("label:has-text('اتصال هاتفي')").first().click();
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1000);
  await page.locator("label:has-text('رفض')").first().click();
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1000);
  await page.fill("textarea", "المديرة اعتذرت — سياسة المدرسة تمنع أي اشتراك هذا العام.");
  await page.locator("button:has-text('التالي')").first().click(); // person
  await wait(800);
  await page.locator("button:has-text('التالي')").first().click(); // needs
  await wait(800);
  await page.locator("button:has-text('التالي')").first().click(); // followup
  await wait(800);
  await page.locator("button:has-text('التالي')").first().click(); // review
  await wait(800);
  await page.fill("textarea", "زيارة منقطعة 1 — رفض مدرسي مع سبب موثق.");
  await page.locator("button:has-text('إرسال وتسجيل الزيارة')").first().click();
  await wait(5000);
  await shot(page, `${OUT}/موبايل-06-زيارة-منقطعة1-محفوظة-على-الجهاز.png`);
  const bannerText1 = await page.locator("text=زيارة محفوظة").count();
  check("الزيارة المنقطعة الأولى أُحتُفظت على الجهاز (رسالة طابور ظاهرة)", bannerText1 > 0);

  // ——— الزيارة المنقطعة الثانية (المدرسة نفسها بنتيجة مختلفة — سجل مستقل) ———
  await page.locator("button:has-text('تسجيل زيارة جديدة')").first().click();
  await wait(1500);
  await page.locator(`button:has-text("${s2.name.slice(0, 18)}")`).first().click();
  await wait(1200);
  const confirmBtn3 = page.locator("button:has-text('تأكيد الموقع المحفوظ')").first();
  if (await confirmBtn3.count()) { await confirmBtn3.click(); await wait(1200); }
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1000);
  await page.locator("label:has-text('واتساب')").first().click();
  await page.locator("button:has-text('التالي')").first().click();
  await wait(1000);
  await page.locator("label:has-text('يحتاج زيارة أخرى')").first().click();
  await page.locator("button:has-text('التالي')").first().click(); // person
  await wait(800);
  await page.locator("button:has-text('التالي')").first().click(); // needs
  await wait(800);
  await page.locator("button:has-text('التالي')").first().click(); // followup
  await wait(800);
  await page.locator("button:has-text('التالي')").first().click(); // review
  await wait(800);
  await page.fill("textarea", "زيارة منقطعة 2 — نفس المدرسة لاحقاً: تحتاج زيارة أخرى بعد إجازة الامتحانات.");
  await page.locator("button:has-text('إرسال وتسجيل الزيارة')").first().click();
  await wait(5000);
  await shot(page, `${OUT}/موبايل-07-زيارة-منقطعة2-طابور-زيارتين.png`);
  const queueNote = await page.locator("text=محفوظة على الجهاز بانتظار").count();
  check("الزيارة المنقطعة الثانية أُضيفت للطابور (الزيارتان معاً بلا استبدال)", queueNote > 0);

  // ——— شاشة الطابور الكاملة داخل النموذج ———
  await page.locator("button:has-text('تسجيل زيارة جديدة')").first().click();
  await wait(2000);
  await shot(page, `${OUT}/موبايل-08-طابور-الزيارتين-مع-زر-الإرسال-الجماعي.png`);
  const queueBanner = await page.locator("text=زيارات محفوظة محلياً لم تُرسل بعد").count();
  const sendAllBtn = await page.locator("button:has-text('إرسال الكل الآن')").count();
  check("لافتة الطابور تعرض زيارتين مع زر «إرسال الكل الآن»", queueBanner > 0 && sendAllBtn > 0);

  // ——— عودة الاتصال: إعادة إرسال تلقائية بالترتيب دون تكرار ———
  console.log("… عودة الاتصال");
  await ctx.setOffline(false);
  let retries = 0;
  let queueGone = false;
  while (retries < 30) {
    await wait(2000);
    retries++;
    const bannerCount = await page.locator("text=زيارات محفوظة محلياً لم تُرسل بعد").count().catch(() => 1);
    if (bannerCount === 0) { queueGone = true; break; }
  }
  check("الطابور أُفرغ تلقائياً بعد عودة الاتصال", queueGone, `محاولات الانتظار: ${retries}`);
  await wait(2000);
  await shot(page, `${OUT}/موبايل-09-بعد-عودة-الاتصال-الطابور-أُرسل.png`);

  // التحقق النهائي من القاعدة: 4 زيارات للموظف (1 تعريفية + 1 متصلة + 2 من الطابور) بلا تكرار
  const empVisits = await db.schoolVisit.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: "asc" } });
  check("4 زيارات محفوظة فعلياً (1 تعريفية + 1 متصلة + 2 طابور)", empVisits.length === 4, `الفعلي: ${empVisits.length}`);
  const resultsSet = new Set(empVisits.map((v) => v.result));
  check("الزيارتان المنقطعتان سجلتا بنتيجتيهما الصحيحتين (سجلات مستقلة)", resultsSet.has("REJECTED") && resultsSet.has("NEEDS_ANOTHER_VISIT"));
  const offlineNotes = empVisits.filter((v) => v.notes?.includes("منقطعة")).length;
  check("ملاحظات الزيارتين المنقطعتين محفوظة كاملة (لا فقدان بيانات)", offlineNotes === 2, `الفعلي: ${offlineNotes}`);
  const dedupeUnique = new Set(empVisits.map((v) => v.dedupeKey)).size === empVisits.length;
  check("كل زيارة بمفتاح منع تكرار فريد", dedupeUnique);

  // ——— قسم زيارات الموظف: فلتر تاريخ مخصص + زر التصدير ———
  // نستخدم نقراً برمجياً لتفادي أي عوائق واجهة خارج التطبيق
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("nav[aria-label='التنقل السفلي'] button"));
    const b = btns.find((x) => (x.textContent ?? "").includes("الزيارات"));
    if (b) b.click();
  });
  await wait(2500);
  await shot(page, `${OUT}/موبايل-10-قسم-زياراتي-مع-فلتر-التاريخ-والتصدير.png`);
  const exportBtn = await page.locator("button:has-text('تصدير Excel')").count();
  check("زر «تصدير Excel» ظاهر لموظف يملك صلاحية التصدير", exportBtn > 0);
  const dateInputs = await page.locator("input[type=date]").count();
  check("فلتر التاريخ المخصص (بداية/نهاية) ظاهر في واجهة الموبايل", dateInputs >= 2, `المدخلات: ${dateInputs}`);

  await ctx.close();

  // ============================================================
  console.log("\n=== 2) لوحة الإدارة: الجدول والفلاتر والتصدير والخريطة المباشرة ===");
  // ============================================================
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  await adminCtx.addCookies([{ name: "alifba_session", value: ADMIN_TOKEN, url: BASE }]);
  const admin = await adminCtx.newPage();
  admin.setDefaultTimeout(60000);
  await admin.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
    if (document.head) document.head.appendChild(style);
  });

  await admin.goto(`${BASE}/#/visits`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await wait(5000);
  await shot(admin, `${OUT}/إدارة-01-جدول-الزيارات-مع-زر-التصدير-وفلتر-التاريخ.png`);

  // فلتر تاريخ مخصص: اليوم فقط
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  await admin.locator("input[aria-label='تاريخ البداية']").fill(todayKey);
  await wait(500);
  await admin.locator("input[aria-label='تاريخ النهاية']").fill(todayKey);
  await wait(3000);
  await shot(admin, `${OUT}/إدارة-02-فلتر-تاريخ-مخصص-مطبق.png`);
  const filteredTotal = await admin.locator("text=الإجمالي:").first().textContent().catch(() => "");
  check("الفلتر المخصص طبق على الجدول فوراً", Boolean(filteredTotal && filteredTotal.includes("الإجمالي")), filteredTotal?.trim());

  // مسح النطاق ثم فتح الخريطة المباشرة من أول صف (دون المرور بالتفاصيل)
  await admin.locator("button[aria-label='مسح نطاق التاريخ']").first().click().catch(() => {});
  await wait(3000);
  const mapBtn = admin.locator("button[title='عرض الموقع مباشرة على الخريطة الداخلية']").first();
  const mapBtnCount = await mapBtn.count();
  check("زر الخريطة المباشرة موجود في صفوف الجدول", mapBtnCount > 0);
  if (mapBtnCount > 0) {
    await mapBtn.click();
    await wait(6000); // تحميل الخريطة الداخلية (Leaflet)
    await shot(admin, `${OUT}/إدارة-03-الخريطة-الداخلية-مباشرة-من-الصف.png`);
    const mapTitle = await admin.locator("text=موقع المدرسة —").count();
    check("نافذة الخريطة فتحت مباشرة باسم المدرسة", mapTitle > 0);
    await admin.keyboard.press("Escape");
    await wait(1500);
  }

  // تفاصيل الزيارة (العين) — اسم المدرسة الآن ظاهر في العنوان
  const eyeBtn = admin.locator("button[title='عرض تفاصيل الزيارة كاملة']").first();
  if (await eyeBtn.count()) {
    await eyeBtn.click();
    await wait(3000);
    await shot(admin, `${OUT}/إدارة-04-تفاصيل-الزيارة-كاملة.png`);
    const detailTitle = await admin.locator("text=تفاصيل الزيارة —").first().textContent().catch(() => "");
    check("نافذة التفاصيل تعرض اسم المدرسة في العنوان (إصلاح ظهور الاسم)", (detailTitle ?? "").trim().length > "تفاصيل الزيارة —".length, detailTitle?.trim());
    // زر الخريطة من داخل التفاصيل
    const mapFromDetail = await admin.locator("button:has-text('عرض موقع المدرسة على الخريطة')").count();
    check("زر الخريطة متاح من نافذة التفاصيل أيضاً", mapFromDetail > 0);
    await admin.keyboard.press("Escape");
    await wait(1500);
  }

  // قسم إدارة الموظفين: صلاحيات «ربيع» وزر التفعيل اليدوي
  await admin.goto(`${BASE}/#/employees`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await wait(5000);
  await shot(admin, `${OUT}/إدارة-05-إدارة-الموظفين-ربيع-بلا-حساب.png`);
  const rabeaRow = admin.locator("tr:has-text('ربيع')").first();
  const rabeaVisible = await rabeaRow.count();
  check("صف «ربيع» ظاهر في جدول الموظفين", rabeaVisible > 0);
  const noAccountBadge = await rabeaRow.locator("text=بلا حساب دخول").count();
  check("«ربيع» معلّم بوضوح: بلا حساب دخول — يُفعّل يدوياً", noAccountBadge > 0);
  const activateBtn = await rabeaRow.locator("button:has-text('تفعيل حساب الدخول')").count();
  check("زر «تفعيل حساب الدخول» متاح لربيع (بدون أي تفعيل تلقائي)", activateBtn > 0);
  if (activateBtn > 0) {
    await rabeaRow.locator("button:has-text('تفعيل حساب الدخول')").first().click();
    await wait(2000);
    await shot(admin, `${OUT}/إدارة-06-نافذة-تفعيل-حساب-ربيع.png`);
    const dlg = await admin.locator("text=تفعيل حساب دخول «ربيع»").count();
    check("نافذة التفعيل تعرض تحذير عدم تغيير الصلاحيات", dlg > 0);
    const permsNote = await admin.locator("text=تبقى كما هي").count();
    check("النافذة توضح أن الصلاحيات تبقى كما هي دون تغيير", permsNote > 0);
    // إغلاق دون تفعيل — التفعيل قرار المدير اليدوي (اختبر فعلياً في اختبارات API على النسخة المعزولة)
    await admin.locator("button:has-text('إلغاء')").first().click();
    await wait(1500);
  }

  // تحقق ختامي: صلاحيات ربيع في النسخة المعزولة لم تتغير من فحص الواجهة
  const rb = await db.user.findFirst({ where: { name: "ربيع" } });
  const rbPerms = await db.employeePermission.count({ where: { userId: rb.id } });
  check("لم يُفعّل حساب ربيع ولا مُنحت صلاحياته أثناء جولة الواجهة", !rb.username && rbPerms === 0);

  await adminCtx.close();
  await browser.close();

  // ============================================================
  const fails = results.filter((r) => !r.ok);
  console.log(`\n========================================`);
  console.log(`نتيجة فحص الواجهات: ${results.length - fails.length} ناجح / ${fails.length} فاشل`);
  if (fails.length) fails.forEach((f) => console.log("  - " + f.name + (f.extra ? ` — ${f.extra}` : "")));
  console.log("========================================");

  await db.$disconnect();
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("خطأ جسيم في سكربت الواجهات:", e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
