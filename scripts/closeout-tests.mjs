// ============================================================
// اختبارات إغلاق الملاحظات الخمس — تعمل حصراً على النسخة المعزولة
// db/review-isolated.db عبر الخادم المعزول على المنفذ 3100
// القاعدة الحقيقية (db/custom.db) لا تُكتب إطلاقاً — قراءة فقط للتحقق النهائي
// ============================================================
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3100";
const TEST_DB_URL = "file:/home/z/my-project/db/review-isolated.db";
const REAL_DB_URL = "file:/home/z/my-project/db/custom.db";

const ADMIN_TOKEN = "69baff624a3e9ae7aa774c34f9d324b97795332345f454ac";
const EMPA_TOKEN = "aa1f431a83ddbbf174f1469471dfdc0eef180629df706cac89";
const EMPB_TOKEN = "bb9c8afd1ce578296e839b3078d76e64d08687f76627fef577";

const db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
const realDb = new PrismaClient({ datasources: { db: { url: REAL_DB_URL } } });

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : "")); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
}
function section(t) { console.log(`\n——— ${t} ———`); }

const jar = (token) => ({ Cookie: `alifba_session=${token}`, "Content-Type": "application/json" });
async function api(path, { method = "GET", token = ADMIN_TOKEN, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: jar(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* binary */ }
  return { status: res.status, json, res };
}

// توقيت بغداد UTC+3 — حساب مفاتيح التواريخ
function baghdadDateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function daysAgoKey(n) {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return baghdadDateKey(d);
}

async function main() {
  console.log("=== إغلاق الملاحظات — اختبارات شاملة على النسخة المعزولة (3100) ===");

  // ============================================================
  section("A) تجهيز موظفي الاختبار + جلساتهم (النسخة المعزولة فقط)");
  // ============================================================
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });

  // موظف A: صلاحية زيارات (اطلاع + تصدير) + تسجيل زيارة
  // موظف B: صلاحية زيارات (اطلاع فقط — بلا تصدير) + تسجيل زيارة
  const sectionsA = [
    { section: "visits", visible: true, canView: true, canExport: true },
    { section: "visit_register", visible: true, canView: true, canCreate: true },
  ];
  const sectionsB = [
    { section: "visits", visible: true, canView: true, canExport: false },
    { section: "visit_register", visible: true, canView: true, canCreate: true },
  ];
  async function createEmployee(name, username, sections) {
    const res = await api("/api/employees", { method: "POST", body: { name, username, password: "test-pass-1", role: "STAFF" } });
    if (!res.res.ok) throw new Error(`فشل إنشاء ${name}: ${JSON.stringify(res.json)}`);
    const emp = await db.user.findUnique({ where: { username } });
    // إنشاء الموظف يضيف صفوف صلاحيات افتراضية (كلها مخفية) — نستبدلها بالصلاحيات المطلوبة للاختبار
    await db.employeePermission.deleteMany({ where: { userId: emp.id } });
    await db.employeePermission.createMany({
      data: sections.map((s) => ({
        userId: emp.id, section: s.section,
        visible: s.visible ?? false, canView: s.canView ?? false, canCreate: s.canCreate ?? false,
        canExport: s.canExport ?? false, canEdit: false, canDelete: false, canApprove: false, canManage: false,
      })),
    });
    await db.authSession.create({
      data: { token: username.startsWith("empA") ? EMPA_TOKEN : EMPB_TOKEN, principalType: "ADMIN", userId: emp.id, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
    });
    return emp;
  }
  const suffix = Date.now().toString(36).slice(-6);
  const empA = await createEmployee(`مفحص التصدير الأول ${suffix}`, `empA_${suffix}`, sectionsA);
  const empB = await createEmployee(`مفحص التصدير الثاني ${suffix}`, `empB_${suffix}`, sectionsB);
  check("إنشاء موظفي الاختبار بجلساتهم على النسخة المعزولة", Boolean(empA && empB));

  // مدرسة الاختبار — من المدارس الحقيقية في النسخة المعزولة (قراءة فقط، لا تعديل)
  const school = await db.school.findFirst({ where: { lat: { not: null } }, select: { id: true, name: true, lat: true, lng: true } });

  // ============================================================
  section("1) طابور الزيارات غير المتصلة — عدة زيارات متتالية بلا تكرار ولا فقدان");
  // ============================================================
  const K1 = `queue-test-1-${suffix}-${Date.now()}`;
  const K2 = `queue-test-2-${suffix}-${Date.now()}`;
  const K3 = `queue-test-3-${suffix}-${Date.now()}`;

  // زيارة أولى (محاكاة وصولها بعد عودة الاتصال)
  const r1 = await api("/api/employee/visits", { method: "POST", token: EMPA_TOKEN, body: {
    dedupeKey: K1, schoolId: school.id, contactType: "FIELD_VISIT", result: "INITIAL_APPROVAL",
    lat: school.lat, lng: school.lng, locationSource: "SAVED", notes: "طابور غير متصل — زيارة 1",
  }});
  check("إرسال الزيارة الأولى من الطابور → 201", r1.status === 201);

  // إعادة إرسال الزيارة نفسها (نفس dedupeKey) — يجب أن تعيد السجل نفسه دون تكرار
  const r1b = await api("/api/employee/visits", { method: "POST", token: EMPA_TOKEN, body: {
    dedupeKey: K1, schoolId: school.id, contactType: "FIELD_VISIT", result: "INITIAL_APPROVAL",
    lat: school.lat, lng: school.lng, locationSource: "SAVED",
  }});
  check("إعادة إرسال الزيارة الأولى (نفس المفتاح) → 200 duplicate", r1b.status === 200 && r1b.json?.duplicate === true);
  check("السجل المعاد هو نفس السجل الأصلي (نفس المعرف)", r1b.json?.visit?.id === r1.json?.visit?.id);

  // زيارة ثانية وثالثة متتالية — كل زيارة سجل مستقل دائم
  const r2 = await api("/api/employee/visits", { method: "POST", token: EMPA_TOKEN, body: {
    dedupeKey: K2, schoolId: school.id, contactType: "PHONE", result: "REJECTED", rejectionReason: "رفض إداري مؤقت",
    lat: school.lat, lng: school.lng, locationSource: "GPS", locationAccuracy: 12, notes: "طابور غير متصل — زيارة 2",
  }});
  const r3 = await api("/api/employee/visits", { method: "POST", token: EMPA_TOKEN, body: {
    dedupeKey: K3, schoolId: school.id, contactType: "WHATSAPP", result: "NEEDS_ANOTHER_VISIT",
    lat: school.lat, lng: school.lng, locationSource: "MAP", notes: "طابور غير متصل — زيارة 3",
  }});
  check("الزيارة الثانية المتتالية → 201", r2.status === 201);
  check("الزيارة الثالثة المتتالية → 201", r3.status === 201);
  check("كل زيارة سجل مستقل (معرفات مختلفة)", new Set([r1.json?.visit?.id, r2.json?.visit?.id, r3.json?.visit?.id]).size === 3);

  // إعادة إرسال كل الطابور (محاكاة عودة الشبكة ومحاولة مزدوجة)
  const again2 = await api("/api/employee/visits", { method: "POST", token: EMPA_TOKEN, body: {
    dedupeKey: K2, schoolId: school.id, contactType: "PHONE", result: "REJECTED", rejectionReason: "رفض إداري مؤقت",
    lat: school.lat, lng: school.lng, locationSource: "GPS",
  }});
  const again3 = await api("/api/employee/visits", { method: "POST", token: EMPA_TOKEN, body: {
    dedupeKey: K3, schoolId: school.id, contactType: "WHATSAPP", result: "NEEDS_ANOTHER_VISIT",
    lat: school.lat, lng: school.lng, locationSource: "MAP",
  }});
  check("إعادة إرسال الزيارة الثانية → duplicate بلا تكرار", again2.status === 200 && again2.json?.duplicate === true);
  check("إعادة إرسال الزيارة الثالثة → duplicate بلا تكرار", again3.status === 200 && again3.json?.duplicate === true);

  const empAVisits = await db.schoolVisit.count({ where: { employeeId: empA.id } });
  check("عدد زيارات الموظف بعد كل الإعادات = 3 بالضبط (لا تكرار)", empAVisits === 3, `العدد الفعلي: ${empAVisits}`);

  const list = await api("/api/employee/visits?pageSize=50", { token: EMPA_TOKEN });
  const queuedIds = list.json?.visits?.filter((v) => [K1, K2, K3].some((k) => true) && v.notes?.includes("طابور غير متصل")).length ?? 0;
  check("قائمة الزيارات تعرض الزيارات الثلاث المستقلة", queuedIds === 3, `المعروض: ${queuedIds}`);
  const sample = list.json?.visits?.find((v) => v.notes === "طابور غير متصل — زيارة 1");
  check("سجل الزيارة يحمل الموظف والمدرسة والإحداثيات", Boolean(sample && sample.employeeName === empA.name && sample.schoolId === school.id && sample.lat !== null));

  // ============================================================
  section("2) تصدير جدول الزيارات إلى Excel مع احترام الصلاحيات");
  // ============================================================
  // 2-أ: تصدير الإدارة
  const expAll = await fetch(BASE + "/api/school-visits/export", { headers: jar(ADMIN_TOKEN) });
  check("تصدير الإدارة → 200", expAll.status === 200);
  check("نوع الملف xlsx صحيح", (expAll.headers.get("content-type") || "").includes("spreadsheetml"));
  const totalAll = (await api("/api/school-visits?pageSize=5")).json?.total ?? -1;
  check(`عدد صفوف التصدير يطابق إجمالي الجدول (${totalAll})`, Number(expAll.headers.get("x-export-rows")) === totalAll, `الرأس: ${expAll.headers.get("x-export-rows")}`);
  const abAll = Buffer.from(await expAll.arrayBuffer());

  // 2-ب: تصدير الإدارة بفلتر موظف — صفوف الموظف A فقط
  const expA = await fetch(BASE + `/api/school-visits/export?employeeId=${empA.id}`, { headers: jar(ADMIN_TOKEN) });
  check("تصدير الإدارة بفلتر موظف → 200", expA.status === 200);
  check("صفوف التصدير المفلتر = زيارات الموظف A فقط (3)", Number(expA.headers.get("x-export-rows")) === 3, `الرأس: ${expA.headers.get("x-export-rows")}`);

  // فحص محتوى الملف فعلياً — ورقة الزيارات ومعلومات التصدير
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.read(abAll);
  check("الملف يضم ورقة «الزيارات»", wb.SheetNames.includes("الزيارات"));
  check("الملف يضم ورقة «معلومات التصدير»", wb.SheetNames.includes("معلومات التصدير"));
  const sheet = wb.Sheets["الزيارات"];
  const rows = XLSX.utils.sheet_to_json(sheet);
  const metaSheet = XLSX.utils.sheet_to_json(wb.Sheets["معلومات التصدير"]);
  check(`الورقة الرئيسية تحمل ${totalAll} سجلاً فعلياً`, rows.length === totalAll, `الفعلي: ${rows.length}`);
  const firstRow = rows[0] ?? {};
  const requiredCols = ["التاريخ والوقت", "المدرسة", "الموظف", "نوع التواصل", "النتيجة", "خط العرض", "خط الطول"];
  check("الأعمدة الأساسية موجودة في الملف", requiredCols.every((c) => c in firstRow), `الأعمدة: ${Object.keys(firstRow).slice(0, 8).join(" / ")}`);
  const metaMap = Object.fromEntries(metaSheet.map((r) => [r["البند"], r["القيمة"]]));
  check("ورقة المعلومات توثق من صدّر الملف", (metaMap["صدر بواسطة"] ?? "").includes("مدير النظام"));

  // 2-ج: صلاحيات الموظفين — التصدير المشروط بصلاحية «تصدير البيانات»
  const empExp = await fetch(BASE + "/api/employee/visits/export", { headers: jar(EMPA_TOKEN) });
  check("موظف يملك صلاحية التصدير → 200", empExp.status === 200);
  const empExpRows = Number(empExp.headers.get("x-export-rows"));
  check("موظف التصدير يرى زياراته هو فقط (3)", empExpRows === 3, `الفعلي: ${empExpRows}`);
  const empNoExp = await fetch(BASE + "/api/employee/visits/export", { headers: jar(EMPB_TOKEN) });
  check("موظف بلا صلاحية التصدير → 403 مرفوض من الخادم", empNoExp.status === 403);
  const empNoExpJson = await empNoExp.json().catch(() => ({}));
  check("رسالة الرفض توضح سبب الصلاحية", (empNoExpJson?.error ?? "").includes("تصدير"));

  // موظف بلا صلاحية اطلاع نهائياً — حاول إنشاء موظف ثالث بلا صلاحيات
  const empC = await api("/api/employees", { method: "POST", body: { name: `مفحص بلا صلاحيات ${suffix}`, username: `empC_${suffix}`, password: "test-pass-1" } });
  const empCRow = empC.res.ok ? await db.user.findUnique({ where: { username: `empC_${suffix}` } }) : null;
  if (empCRow) {
    await db.authSession.create({ data: { token: "cc" + EMPA_TOKEN.slice(2), principalType: "ADMIN", userId: empCRow.id, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) } });
    const empCExp = await fetch(BASE + "/api/employee/visits/export", { headers: jar("cc" + EMPA_TOKEN.slice(2)) });
    check("موظف بلا صلاحية اطلاع نهائياً → 403 (حتى لو حاول التصدير)", empCExp.status === 403);
  } else {
    check("موظف بلا صلاحية اطلاع نهائياً → 403", false, "فشل إنشاء الموظف C");
  }

  // ============================================================
  section("3) فلتر التاريخ المخصص (بداية/نهاية) بتوقيت بغداد");
  // ============================================================
  // نضبط تواريخ إنشاء الزيارات الثلاث مباشرة في النسخة المعزولة (مسموح — بيانات اختبار)
  const tzOffset = 3 * 3600 * 1000;
  function baghdadDayStart(key) { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) - tzOffset); }
  const v1 = await db.schoolVisit.findUnique({ where: { dedupeKey: K1 } });
  const v2 = await db.schoolVisit.findUnique({ where: { dedupeKey: K2 } });
  const v3 = await db.schoolVisit.findUnique({ where: { dedupeKey: K3 } });
  const todayKey = baghdadDateKey();
  const d3Key = daysAgoKey(3);
  const d40Key = daysAgoKey(40);
  await db.schoolVisit.update({ where: { id: v1.id }, data: { createdAt: new Date(baghdadDayStart(todayKey).getTime() + 5 * 3600 * 1000) } }); // اليوم 10ص
  await db.schoolVisit.update({ where: { id: v2.id }, data: { createdAt: new Date(baghdadDayStart(d3Key).getTime() + 5 * 3600 * 1000) } }); // قبل 3 أيام
  await db.schoolVisit.update({ where: { id: v3.id }, data: { createdAt: new Date(baghdadDayStart(d40Key).getTime() + 5 * 3600 * 1000) } }); // قبل 40 يوماً

  // نطاق: اليوم فقط → زيارة 1 حصراً
  const fToday = await api(`/api/school-visits?employeeId=${empA.id}&dateFrom=${todayKey}&dateTo=${todayKey}`);
  check(`نطاق اليوم (${todayKey} → ${todayKey}) يعيد زيارة اليوم فقط`, fToday.json?.total === 1 && fToday.json?.visits?.[0]?.notes === "طابور غير متصل — زيارة 1", `العدد: ${fToday.json?.total}`);

  // نطاق: من قبل 5 أيام إلى اليوم → زيارتا اليوم وقبل 3 أيام، وليست قبل 40 يوماً
  const d5Key = daysAgoKey(5);
  const f5 = await api(`/api/school-visits?employeeId=${empA.id}&dateFrom=${d5Key}&dateTo=${todayKey}`);
  const f5Notes = (f5.json?.visits ?? []).map((v) => v.notes).sort();
  check(`نطاق ${d5Key} → ${todayKey} يعيد زيارتين (اليوم + قبل 3 أيام)`, f5.json?.total === 2, `العدد: ${f5.json?.total} — ${f5Notes.join(" | ")}`);

  // نطاق مفتوح من جهة: dateTo فقط (حتى قبل 10 أيام) — يشمل الزيارة القديمة (قبل 40 يوماً) حصراً،
  // لأن زيارة «قبل 3 أيام» أحدث من تاريخ النهاية
  const d10Key = daysAgoKey(10);
  const fTo = await api(`/api/school-visits?employeeId=${empA.id}&dateTo=${d10Key}`);
  const fToNotes = (fTo.json?.visits ?? []).map((v) => v.notes);
  check(`نطاق مفتوح حتى ${d10Key} يعيد الزيارة القديمة حصراً (1)`, fTo.json?.total === 1 && (fToNotes[0] ?? "").includes("زيارة 3"), `العدد: ${fTo.json?.total} — ${fToNotes.join(" | ")}`);

  // نطاق مفتوح من جهة: dateFrom فقط (من قبل 10 أيام) → زيارة اليوم وسطى، وليست القديمة
  const fFrom = await api(`/api/school-visits?employeeId=${empA.id}&dateFrom=${d10Key}`);
  check(`نطاق مفتوح من ${d10Key} يعيد الزيارتين الحديثتين (2)`, fFrom.json?.total === 2, `العدد: ${fFrom.json?.total}`);

  // الفلاتر الجاهزة ما زالت تعمل (توافق خلفي)
  const fPeriodToday = await api(`/api/school-visits?employeeId=${empA.id}&period=today`);
  check("فلتر الفترة الجاهزة «اليوم» ما زال يعمل مع التوافق", fPeriodToday.json?.total === 1);

  // التصدير يحترم النطاق المخصص
  const expRange = await fetch(BASE + `/api/school-visits/export?employeeId=${empA.id}&dateFrom=${d5Key}&dateTo=${todayKey}`, { headers: jar(ADMIN_TOKEN) });
  check("تصدير الإدارة بنطاق مخصص يعيد صفين حصراً", Number(expRange.headers.get("x-export-rows")) === 2, `الرأس: ${expRange.headers.get("x-export-rows")}`);
  const wbRange = XLSX.read(Buffer.from(await expRange.arrayBuffer()));
  const metaRange = Object.fromEntries(XLSX.utils.sheet_to_json(wbRange.Sheets["معلومات التصدير"]).map((r) => [r["البند"], r["القيمة"]]));
  check("ورقة المعلومات توثق النطاق المخصص المستخدم", (metaRange["الفترة الزمنية"] ?? "").includes(d5Key) && (metaRange["الفترة الزمنية"] ?? "").includes(todayKey), metaRange["الفترة الزمنية"]);

  // بوابة الموظف: نفس الفلتر المخصص على قائمتها
  const empF = await api(`/api/employee/visits?dateFrom=${d5Key}&dateTo=${todayKey}`, { token: EMPA_TOKEN });
  check("قائمة الموظف تدعم النطاق المخصص أيضاً (2)", empF.json?.total === 2, `العدد: ${empF.json?.total}`);
  const empExpRange = await fetch(BASE + `/api/employee/visits/export?dateFrom=${d5Key}&dateTo=${todayKey}`, { headers: jar(EMPA_TOKEN) });
  check("تصدير الموظف يحترم النطاق المخصص (2)", Number(empExpRange.headers.get("x-export-rows")) === 2, `الرأس: ${empExpRange.headers.get("x-export-rows")}`);

  // نطاق خاطئ (بداية بعد النهاية) → لا انهيار، ويعيد كل النتائج أو فارغ بأمان
  const fBad = await api(`/api/school-visits?employeeId=${empA.id}&dateFrom=${todayKey}&dateTo=${d40Key}`);
  check("نطاق مقلوب (بداية بعد النهاية) لا ينهار ويتجاهل بأمان", fBad.status === 200, `الحالة: ${fBad.status}`);

  // ============================================================
  section("4) وصول مباشر لموقع المدرسة على الخريطة — بيانات الخريطة جاهزة");
  // ============================================================
  const vid = v1.id;
  const detail = await api(`/api/school-visits/${vid}`);
  check("تفاصيل الزيارة تعيد الإحداثيات (lat/lng) للخريطة", detail.status === 200 && detail.json?.visit?.lat !== null && detail.json?.visit?.lng !== null);
  check("تفاصيل الزيارة تعيد اسم المدرسة والموظف (نافذة الخريطة)", Boolean(detail.json?.visit?.school?.name && detail.json?.visit?.employee?.name));
  check("تفاصيل الزيارة تعيد نوع التواصل والنتيجة (بطاقة الخريطة)", Boolean(detail.json?.visit?.contactType && detail.json?.visit?.result));
  // فحص الواجهة الفعلي يتم عبر Playwright (زر الخريطة المباشر في كل صف)

  // ============================================================
  section("5) مراجعة صلاحيات «ربيع» + تجهيز تفعيل حسابه (دون تفعيل تلقائي)");
  // ============================================================
  const rb = await db.user.findFirst({ where: { name: "ربيع" } });
  check("«ربيع» موجود في النسخة المعزولة بلا حساب دخول", Boolean(rb) && !rb.username && !rb.passwordHash);
  const rbPermsBefore = await db.employeePermission.count({ where: { userId: rb.id } });
  check("صلاحيات «ربيع» الحالية: لا صلاحيات ممنوحة (0 قسم)", rbPermsBefore === 0, `العدد: ${rbPermsBefore}`);

  // تفعيل حساب الدخول عبر API الإدارة (محاكاة ما سيفعله المدير يدوياً)
  const act = await api(`/api/employees/${rb.id}`, { method: "PATCH", body: { username: `rabea_${suffix}`, password: "rabea-pass-123" } });
  check("تفعيل الحساب من الإدارة (تعيين اسم مستخدم وكلمة مرور) → 200", act.status === 200, JSON.stringify(act.json ?? {}));

  // تسجيل دخول بالحساب الجديد — يثبت أن التفعيل حقيقي (الاستجابة: ok:true و redirect:employee)
  const login = await api("/api/auth/login", { method: "POST", body: { username: `rabea_${suffix}`, password: "rabea-pass-123" } });
  check("تسجيل دخول «ربيع» بعد التفعيل يعمل فعلياً", login.status === 200 && login.json?.ok === true && login.json?.redirect === "employee", JSON.stringify(login.json ?? {}).slice(0, 80));

  // الصلاحيات لم تتغير تلقائياً — التفعيل لا يمنح أي صلاحية
  const rbPermsAfter = await db.employeePermission.count({ where: { userId: rb.id } });
  check("صلاحيات «ربيع» بعد التفعيل لم تتغير (ما زالت 0)", rbPermsAfter === rbPermsBefore && rbPermsAfter === 0);

  // حمايات التفعيل
  const actAgain = await api(`/api/employees/${rb.id}`, { method: "PATCH", body: { username: `another_${suffix}`, password: "x-pass-1" } });
  check("محاولة تغيير اسم مستخدم قائم → 409 مرفوضة", actAgain.status === 409);
  const actConflict = await api("/api/employees", { method: "POST", body: { name: "متعارض", username: "admin", password: "test-pass-1" } });
  check("اسم مستخدم متعارض (admin) → 409 مرفوض", actConflict.status === 409);
  const actShort = await api(`/api/employees/${rb.id}`, { method: "PATCH", body: { password: "123" } });
  check("كلمة مرور قصيرة → 400 مرفوضة", actShort.status === 400);

  // سجل التدقيق يوثق التفعيل
  const audit = await db.auditLog.findFirst({ where: { action: "ACTIVATE_EMPLOYEE_ACCOUNT", entityId: rb.id }, orderBy: { createdAt: "desc" } });
  check("سجل التدقيق يوثق «تفعيل حساب موظف» باسم المنفذ", Boolean(audit && (audit.details ?? "").includes(`rabea_${suffix}`)), audit?.details?.slice(0, 80));

  // ============================================================
  section("خ) التحقق النهائي: القاعدة الحقيقية لم تُلمس إطلاقاً");
  // ============================================================
  const rbReal = await realDb.user.findFirst({ where: { name: "ربيع" } });
  check("«ربيع» في القاعدة الحقيقية: بلا اسم مستخدم وبلا كلمة مرور (كما هو)", Boolean(rbReal) && !rbReal.username && !rbReal.passwordHash);
  const rbRealPerms = await realDb.employeePermission.count({ where: { userId: rbReal.id } });
  check("صلاحيات «ربيع» الحقيقية كما هي (0)", rbRealPerms === 0);
  const realVisits = await realDb.schoolVisit.count();
  check("القاعدة الحقيقية بلا أي زيارة اختبار (0 زيارة)", realVisits === 0, `العدد: ${realVisits}`);
  const realEmployees = await realDb.user.count({ where: { role: { in: ["MANAGER", "STAFF"] } } });
  check("القاعدة الحقيقية: موظف واحد فقط (ربيع) بلا إضافات", realEmployees === 1, `العدد: ${realEmployees}`);

  // ============================================================
  console.log("\n========================================");
  console.log(`النتيجة: ${pass} ناجح / ${fail} فاشل`);
  if (failures.length) {
    console.log("الاختبارات الفاشلة:");
    failures.forEach((f) => console.log("  - " + f));
  }
  console.log("========================================");

  await db.$disconnect();
  await realDb.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("خطأ جسيم في سكربت الاختبار:", e);
  await db.$disconnect().catch(() => {});
  await realDb.$disconnect().catch(() => {});
  process.exit(1);
});
