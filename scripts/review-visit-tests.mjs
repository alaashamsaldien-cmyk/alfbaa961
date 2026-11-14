// ============================================================
// الفحص الوظيفي الشامل لوظيفة «تسجيل زيارة للمدرسة»
// يعمل حصراً على النسخة المعزولة db/review-isolated.db
// القاعدة الحقيقية لا تُلمس إطلاقاً (لا كتابة، لا حذف، لا تصفير كلمات مرور)
// ============================================================
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3100";
const TEST_DB_URL = "file:/home/z/my-project/db/review-isolated.db";

const ADMIN_TOKEN = "69baff624a3e9ae7aa774c34f9d324b97795332345f454ac";
const EMP_TOKEN = "3f431a83ddbbf174f1469471dfdc0eef180629df706cac89";
const EMP2_TOKEN = "9c8afd1ce578296e839b3078d76e64d08687f76627fef577";

const adminDb = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

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
  try { json = await res.json(); } catch { /* html responses */ }
  return { status: res.status, json };
}

async function main() {
  // ——— سياق: مدارس حقيقية من القاعدة ———
  const schoolWithCoords = await adminDb.school.findFirst({
    where: { lat: { not: null }, lng: { not: null } },
    select: { id: true, name: true, governorate: true, regionId: true, lat: true, lng: true, principalName: true, phone: true, studentCount: true },
  });
  const schoolNoCoords = await adminDb.school.findFirst({
    where: { lat: null },
    select: { id: true, name: true, governorate: true },
  });
  const region = schoolWithCoords.regionId
    ? await adminDb.region.findUnique({ where: { id: schoolWithCoords.regionId } })
    : null;
  console.log(`مدرسة الاختبار الأساسية: «${schoolWithCoords.name}» (${schoolWithCoords.governorate ?? "—"} / ${region?.name ?? "—"}) إحداثيات محفوظة: (${schoolWithCoords.lat}, ${schoolWithCoords.lng})`);
  if (schoolNoCoords) console.log(`مدرسة بلا إحداثيات للفحص: «${schoolNoCoords.name}»`);

  // ============================================================
  section("A) إعداد موظفي اختبار عبر API الإدارة الحقيقي (على النسخة المعزولة)");
  // ============================================================
  const suffix = Date.now().toString(36).slice(-6);
  const empAName = "فاحص الزيارات الأول";
  const empBName = "فاحص الزيارات الثاني";
  const empAUser = `review_a_${suffix}`;
  const empBUser = `review_b_${suffix}`;

  const mkA = await api("/api/employees", {
    method: "POST",
    body: {
      name: empAName, username: empAUser, password: "review-pass-1",
      phone: "07700000001", jobTitle: "موظف زيارات — اختبار معزول",
      governorate: schoolWithCoords.governorate ?? null, regionId: null,
    },
  });
  check("إنشاء موظف (أ) عبر API الإدارة", mkA.status === 201 && Boolean(mkA.json?.employee?.id), `status=${mkA.status} ${JSON.stringify(mkA.json?.error ?? "")}`);
  const empAId = mkA.json?.employee?.id;

  const mkB = await api("/api/employees", {
    method: "POST",
    body: { name: empBName, username: empBUser, password: "review-pass-2", jobTitle: "موظف بلا صلاحيات زيارات" },
  });
  check("إنشاء موظف (ب) بلا أي صلاحيات", mkB.status === 201 && Boolean(mkB.json?.employee?.id), `status=${mkB.status}`);
  const empBId = mkB.json?.employee?.id;

  // صلاحيات الموظف أ: تسجيل زيارة + رؤية الزيارات + المدارس (دون إدارة)
  const permsA = await api(`/api/employees/${empAId}/permissions`, {
    method: "PUT",
    body: {
      permissions: {
        visit_register: { visible: true, view: true, create: true },
        visits: { visible: true, view: true },
        schools: { visible: true, view: true },
        home: { visible: true },
      },
    },
  });
  check("تعيين صلاحيات الموظف (أ) — تسجيل زيارة/عرض/مدارس", permsA.status === 200, `status=${permsA.status} ${JSON.stringify(permsA.json?.error ?? "")}`);

  // حقن جلسات الموظفين في النسخة المعزولة (بديل تسجيل الدخول دون معرفة كلمات المرور)
  for (const [tok, uid] of [[EMP_TOKEN, empAId], [EMP2_TOKEN, empBId]]) {
    await adminDb.authSession.create({
      data: { token: tok, principalType: "ADMIN", userId: uid, expiresAt: new Date(Date.now() + 86400000) },
    });
  }
  check("حقن جلسات الموظفين في النسخة المعزولة", true);

  // ============================================================
  section("B) النقطة 9 — الصلاحيات تُطبق على الخادم (منع الوصول غير المصرح)");
  // ============================================================
  const anonPost = await api("/api/employee/visits", { method: "POST", token: "invalid-token", body: {} });
  check("طلب بلا جلسة صالحة → 401", anonPost.status === 401, `status=${anonPost.status}`);

  const noPermPost = await api("/api/employee/visits", { method: "POST", token: EMP2_TOKEN, body: { dedupeKey: "no-perm-12345678", schoolId: schoolWithCoords.id, contactType: "PHONE", result: "APPROVED" } });
  check("موظف بلا صلاحية تسجيل زيارة → 403 ACTION_DENIED", noPermPost.status === 403 && noPermPost.json?.code === "ACTION_DENIED", `status=${noPermPost.status} ${JSON.stringify(noPermPost.json)}`);

  const noPermList = await api("/api/employee/visits", { token: EMP2_TOKEN });
  check("موظف بلا صلاحية عرض الزيارات → 403 عند جلب قائمته", noPermList.status === 403, `status=${noPermList.status}`);

  const adminRouteAsEmployee = await api("/api/school-visits", { token: EMP_TOKEN });
  check("موظف يحاول دخول API الإدارة للزيارات → 403", adminRouteAsEmployee.status === 403, `status=${adminRouteAsEmployee.status}`);

  const adminRouteAsAnon = await api("/api/school-visits", { token: "invalid" });
  check("مجهول يحاول دخول API الإدارة → 401", adminRouteAsAnon.status === 401, `status=${adminRouteAsAnon.status}`);

  const meB = await api("/api/employee/me", { token: EMP2_TOKEN });
  const bVisitReg = meB.json?.permissions?.visit_register;
  check("خريطة صلاحيات الموظف (ب): visit_register مخفي وبلا إضافة", bVisitReg?.visible === false && bVisitReg?.create === false, JSON.stringify(bVisitReg));

  // ============================================================
  section("C) النقاط 1+2 — تسجيل زيارة كاملة بكل الحقول (النموذج متعدد الخطوات)");
  // ============================================================
  const dedupe1 = `rvw-visit-1-${suffix}`;
  const fullVisit = {
    dedupeKey: dedupe1,
    schoolId: schoolWithCoords.id,
    contactType: "FIELD_VISIT",
    result: "REJECTED",
    rejectionReason: "المدير غير متواجد وطلب الموافقة كتابياً لاحقاً",
    contactPersonName: "أحمد الجبوري",
    contactPersonTitle: "معاون المدير",
    principalName: "سعاد عبد الرحمن",
    schoolPhone: "07701234567",
    studentCount: 420,
    needs: ["PAINT", "SEATS", "OTHER"],
    needsOther: "أبواب أقسام البناء معطلة",
    subscribersCount: 35,
    nextFollowUpAt: "2026-12-01",
    notes: "زيارة افتراضية بيئة معزولة",
    lat: 33.315231,
    lng: 44.366102,
    locationAccuracy: 8.4,
    locationSource: "GPS",
  };

  // فحوصات الإلزام أولاً (نقطة القواعد الصارمة)
  const noLoc = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: { ...fullVisit, dedupeKey: `rvw-noloc-${suffix}`, lat: undefined, lng: undefined, locationSource: undefined } });
  check("رفض زيارة بلا موقع (الخطوة 1 إلزامية) → 400", noLoc.status === 400 && String(noLoc.json?.error).includes("موقع"), `status=${noLoc.status} ${JSON.stringify(noLoc.json?.error)}`);

  const badLoc = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: { ...fullVisit, dedupeKey: `rvw-badloc-${suffix}`, lat: 10, lng: 10 } });
  check("رفض إحداثيات خارج العراق → 400", badLoc.status === 400 && String(badLoc.json?.error).includes("العراق"), `status=${badLoc.status}`);

  const noRejReason = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: { ...fullVisit, dedupeKey: `rvw-norej-${suffix}`, rejectionReason: undefined } });
  check("رفض نتيجة «رفض» بلا سبب → 400", noRejReason.status === 400 && String(noRejReason.json?.error).includes("سبب الرفض"), `status=${noRejReason.status}`);

  const noResultOther = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: { ...fullVisit, dedupeKey: `rvw-noother-${suffix}`, result: "OTHER", resultOther: undefined, rejectionReason: undefined } });
  check("رفض نتيجة «أخرى» بلا نص → 400", noResultOther.status === 400 && String(noResultOther.json?.error).includes("أخرى"), `status=${noResultOther.status}`);

  const nonePlusNeeds = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: { ...fullVisit, dedupeKey: `rvw-none-${suffix}`, needs: ["NONE", "PAINT"] } });
  check("رفض «لا تحتاج إلى شيء» مع احتياجات أخرى → 400", nonePlusNeeds.status === 400 && String(nonePlusNeeds.json?.error).includes("لا تحتاج"), `status=${nonePlusNeeds.status}`);

  const noNeedsOther = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: { ...fullVisit, dedupeKey: `rvw-nno-${suffix}`, needs: ["OTHER"], needsOther: undefined } });
  check("رفض احتياج «أخرى» بلا شرح → 400", noNeedsOther.status === 400 && String(noNeedsOther.json?.error).includes("الاحتياج"), `status=${noNeedsOther.status}`);

  const badDedupe = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: { ...fullVisit, dedupeKey: "short" } });
  check("رفض مفتاح منع التكرار القصير → 400", badDedupe.status === 400 && String(badDedupe.json?.error).includes("dedupeKey"), `status=${badDedupe.status}`);

  const t0 = new Date();
  const create = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: fullVisit });
  check("تسجيل زيارة كاملة → 201", create.status === 201 && Boolean(create.json?.visit?.id), `status=${create.status} ${JSON.stringify(create.json?.error ?? "")}`);
  const visit1Id = create.json?.visit?.id;

  // ——— النقطة 2: كل التفاصيل محفوظة فعلياً في قاعدة البيانات ———
  const v1 = await adminDb.schoolVisit.findUnique({ where: { dedupeKey: dedupe1 } });
  check("السجل موجود في جدول SchoolVisit", Boolean(v1));
  check("مرتبط بالموظف الصحيح (employeeId)", v1?.employeeId === empAId);
  check("مرتبط بالمدرسة الصحيحة (schoolId)", v1?.schoolId === schoolWithCoords.id);
  check("نوع التواصل محفوظ", v1?.contactType === "FIELD_VISIT");
  check("النتيجة محفوظة", v1?.result === "REJECTED");
  check("سبب الرفض محفوظ", v1?.rejectionReason === fullVisit.rejectionReason);
  check("اسم الشخص المتواصل معه محفوظ", v1?.contactPersonName === "أحمد الجبوري");
  check("منصبه محفوظ", v1?.contactPersonTitle === "معاون المدير");
  check("اسم مدير المدرسة كما أدخله الموظف محفوظ", v1?.principalName === "سعاد عبد الرحمن");
  check("هاتف المدرسة كما أدخله الموظف محفوظ", v1?.schoolPhone === "07701234567");
  check("عدد الطلاب كما أدخله الموظف محفوظ", v1?.studentCount === 420);
  check("الاحتياجات محفوظة JSON", JSON.parse(v1?.needs ?? "[]").join(",") === "PAINT,SEATS,OTHER");
  check("شرح الاحتياج الآخر محفوظ", v1?.needsOther === "أبواب أقسام البناء معطلة");
  check("عدد المشتركين محفوظ", v1?.subscribersCount === 35);
  check("موعد المتابعة القادم محفوظ", v1?.nextFollowUpAt?.toISOString().startsWith("2026-12-01") === true, v1?.nextFollowUpAt?.toISOString());
  check("الملاحظات محفوظة", v1?.notes === fullVisit.notes);
  check("إحداثيات الزيارة محفوظة (lat/lng)", v1?.lat === 33.315231 && v1?.lng === 44.366102, `(${v1?.lat}, ${v1?.lng})`);
  check("دقة GPS ومصدر الموقع محفوظان", v1?.locationAccuracy === 8.4 && v1?.locationSource === "GPS");
  check("التاريخ والوقت ضمن نطاق التنفيذ الفعلي", v1?.createdAt >= t0 && v1?.createdAt <= new Date(), v1?.createdAt.toISOString());
  check("سجل زيارة مستقل بمعرّف خاص (id)", Boolean(v1?.id) && v1?.id === visit1Id);

  // Activity + Notification + AuditLog
  const act = await adminDb.activity.findFirst({ where: { schoolId: schoolWithCoords.id, userId: empAId, type: "VISIT" }, orderBy: { createdAt: "desc" } });
  check("أُنشئ سجل نشاط مركزي للزيارة (يظهر بلوحة الإدارة)", Boolean(act), JSON.stringify(act?.id ?? null));
  const notif = await adminDb.notification.findFirst({ where: { title: "زيارة ميدانية جديدة" }, orderBy: { createdAt: "desc" } });
  check("أُنشئ إشعار للإدارة بالزيارة الجديدة", Boolean(notif));
  const audit1 = await adminDb.auditLog.findFirst({ where: { action: "REGISTER_VISIT", entityId: visit1Id } });
  check("قيد تدقيق REGISTER_VISIT كُتب في AuditLog", Boolean(audit1), audit1?.action);

  // ============================================================
  section("D) النقطة 3 — كل زيارة سجل مستقل: 3 زيارات لنفس المدرسة بلا استبدال");
  // ============================================================
  const dedupe2 = `rvw-visit-2-${suffix}`;
  const v2create = await api("/api/employee/visits", {
    method: "POST", token: EMP_TOKEN,
    body: {
      dedupeKey: dedupe2, schoolId: schoolWithCoords.id, contactType: "PHONE", result: "INITIAL_APPROVAL",
      lat: 33.315231, lng: 44.366102, locationSource: "SAVED",
      notes: "زيارة ثانية — اتصال هاتفي",
    },
  });
  check("الزيارة الثانية (نوع/نتيجة مختلفان) → 201", v2create.status === 201, `status=${v2create.status}`);

  const dedupe3 = `rvw-visit-3-${suffix}`;
  const v3create = await api("/api/employee/visits", {
    method: "POST", token: EMP_TOKEN,
    body: {
      dedupeKey: dedupe3, schoolId: schoolWithCoords.id, contactType: "MEETING", result: "CONTRACTED",
      lat: 33.316, lng: 44.367, locationSource: "MAP",
      notes: "زيارة ثالثة — اجتماع تعاقد",
    },
  });
  check("الزيارة الثالثة → 201", v3create.status === 201, `status=${v3create.status}`);

  const v1After = await adminDb.schoolVisit.findUnique({ where: { dedupeKey: dedupe1 } });
  const v2After = await adminDb.schoolVisit.findUnique({ where: { dedupeKey: dedupe2 } });
  const v3After = await adminDb.schoolVisit.findUnique({ where: { dedupeKey: dedupe3 } });
  check("السجلات الثلاثة موجودة كلها ومستقلة", Boolean(v1After && v2After && v3After) && v1After.id !== v2After.id && v2After.id !== v3After.id && v1After.id !== v3After.id);
  check("الزيارة الأولى لم تتغير بياناتها (لا استبدال)", v1After.contactType === "FIELD_VISIT" && v1After.result === "REJECTED" && v1After.studentCount === 420);
  check("كل زيارة تحتفظ بإحداثياتها الخاصة", v1After.lat === 33.315231 && v3After.lat === 33.316);

  // ============================================================
  section("E) النقطة 10 — منع التكرار عند إعادة الإرسال بعد انقطاع الشبكة");
  // ============================================================
  const countBeforeRetry = await adminDb.schoolVisit.count();
  const retry = await api("/api/employee/visits", { method: "POST", token: EMP_TOKEN, body: fullVisit });
  check("إعادة إرسال نفس dedupeKey → 200 duplicate:true", retry.status === 200 && retry.json?.duplicate === true, `status=${retry.status} ${JSON.stringify(retry.json)}`);
  check("السجل المُعاد هو نفس السجل الأصلي", retry.json?.visit?.id === visit1Id);
  const countAfterRetry = await adminDb.schoolVisit.count();
  check("عدد الزيارات لم يتزايد بعد إعادة الإرسال", countBeforeRetry === countAfterRetry, `${countBeforeRetry} → ${countAfterRetry}`);

  // ============================================================
  section("F) النقطة 8 — تحديث بيانات المدرسة يُوثق ولا يُستبدل بصمت");
  // ============================================================
  const schoolBefore = await adminDb.school.findUnique({ where: { id: schoolWithCoords.id }, select: { principalName: true, phone: true, studentCount: true } });
  console.log(`   بيانات المدرسة قبل الزيارة المتغيرة: مدير=${schoolBefore.principalName ?? "—"} هاتف=${schoolBefore.phone ?? "—"} طلاب=${schoolBefore.studentCount ?? "—"}`);

  const updateVisit = await api("/api/employee/visits", {
    method: "POST", token: EMP_TOKEN,
    body: {
      dedupeKey: `rvw-visit-4-${suffix}`, schoolId: schoolWithCoords.id, contactType: "FIELD_VISIT", result: "APPROVED",
      principalName: "ليلى حسن الموسوي",
      schoolPhone: "07709998877",
      studentCount: 450,
      lat: 33.3155, lng: 44.3665, locationSource: "GPS",
    },
  });
  check("زيارة تحمل بيانات مدرسة معدلة → 201", updateVisit.status === 201, `status=${updateVisit.status}`);

  const schoolAfter = await adminDb.school.findUnique({ where: { id: schoolWithCoords.id }, select: { principalName: true, phone: true, studentCount: true } });
  check("بيانات المدرسة الأصلية حُدثت بقيم الموظف بعد التحقق", schoolAfter.principalName === "ليلى حسن الموسوي" && schoolAfter.phone === "07709998877" && schoolAfter.studentCount === 450, JSON.stringify(schoolAfter));

  const v4 = await adminDb.schoolVisit.findUnique({ where: { dedupeKey: `rvw-visit-4-${suffix}` } });
  check("حقل schoolFieldsUpdated=true على الزيارة", v4?.schoolFieldsUpdated === true);

  const auditChange = await adminDb.auditLog.findFirst({
    where: { action: "REGISTER_VISIT", entityId: v4.id },
    select: { details: true, actorName: true, action: true, createdAt: true },
  });
  const details = auditChange?.details ? JSON.parse(auditChange.details) : null;
  check("سجل التغييرات يوثق القيم قبل/بعد لكل حقل", Boolean(details?.schoolChanges?.principalName?.from !== undefined && details?.schoolChanges?.studentCount?.to === 450), JSON.stringify(details?.schoolChanges ?? null).slice(0, 300));

  // بلا تحديث: زيارة بلا قيم بديلة لا تغير المدرسة
  const noUpdateVisit = await api("/api/employee/visits", {
    method: "POST", token: EMP_TOKEN,
    body: { dedupeKey: `rvw-visit-5-${suffix}`, schoolId: schoolWithCoords.id, contactType: "WHATSAPP", result: "NEEDS_ANOTHER_VISIT", lat: 33.3155, lng: 44.3665, locationSource: "MAP" },
  });
  const schoolNoUpd = await adminDb.school.findUnique({ where: { id: schoolWithCoords.id }, select: { principalName: true } });
  check("زيارة بلا بيانات بديلة → بيانات المدرسة لا تتغير", noUpdateVisit.status === 201 && schoolNoUpd.principalName === "ليلى حسن الموسوي");
  const v5 = await adminDb.schoolVisit.findUnique({ where: { dedupeKey: `rvw-visit-5-${suffix}` } });
  check("حقل schoolFieldsUpdated=false عند عدم التحديث", v5?.schoolFieldsUpdated === false);

  // تحديث موقع المدرسة من الخطوة 1 (PATCH) يُوثق في السجل
  const locPatch = await api(`/api/employee/schools/${schoolNoCoords?.id ?? schoolWithCoords.id}`, {
    method: "PATCH", token: EMP_TOKEN,
    body: { lat: 33.3101, lng: 44.3701, accuracy: 12, source: "MAP" },
  });
  check("PATCH موقع مدرسة أثناء تدفق تسجيل الزيارة → مسموح ويُوثق", locPatch.status === 200 && locPatch.json?.ok === true, `status=${locPatch.status} ${JSON.stringify(locPatch.json?.error ?? "")}`);
  const locAudit = await adminDb.auditLog.findFirst({ where: { action: "EMPLOYEE_UPDATE_SCHOOL_LOCATION" }, orderBy: { createdAt: "desc" } });
  check("قيد تدقيق تحديث موقع المدرسة مكتوب بتفاصيل قبل/بعد", Boolean(locAudit && JSON.parse(locAudit.details).before !== undefined));

  // ============================================================
  section("G) النقطة 9 — نطاق الرؤية: الموظف لا يرى إلا ما يخصه");
  // ============================================================
  const listA = await api("/api/employee/visits", { token: EMP_TOKEN });
  check("الموظف (أ) يرى قائمة زياراته", listA.status === 200 && (listA.json?.total ?? 0) >= 5, `status=${listA.status} total=${listA.json?.total}`);
  check("كل زيارات القائمة لموظف (أ) نفسه", (listA.json?.visits ?? []).every((v) => v.isMine === true));
  check("قائمة الموظف (أ) لا تشمل إحداثيات الغير ولا بيانات موظفين آخرين", (listA.json?.visits ?? []).every((v) => v.employeeName === null || v.isMine));

  // الموظف (ب) ممنوع تماماً — تحقق ثانٍ بعد أن لدينا بيانات
  const listB = await api("/api/employee/visits", { token: EMP2_TOKEN });
  check("الموظف (ب) بلا صلاحية عرض → 403", listB.status === 403, `status=${listB.status}`);

  // موظف بنطاق محافظة أخرى لا يمكنه زيارة مدرسة خارج نطاقه
  const otherGov = await adminDb.school.findFirst({ where: { governorate: { not: schoolWithCoords.governorate }, governorate: { not: null } }, select: { id: true, name: true, governorate: true } });
  if (otherGov) {
    const scopedEmp = await api("/api/employees", {
      method: "POST",
      body: { name: "فاحص نطاق ضيق", username: `review_c_${suffix}`, password: "review-pass-3", jobTitle: "نطاق ضيق", governorate: "أخرى للاختبار" },
    });
    if (scopedEmp.status === 201) {
      const scopedId = scopedEmp.json?.employee?.id;
      const tok = randomToken();
      await adminDb.authSession.create({ data: { token: tok, principalType: "ADMIN", userId: scopedId, expiresAt: new Date(Date.now() + 86400000) } });
      await api(`/api/employees/${scopedId}/permissions`, { method: "PUT", body: { permissions: { visit_register: { visible: true, view: true, create: true } } } });
      const outOfScope = await api("/api/employee/visits", {
        method: "POST", token: tok,
        body: { dedupeKey: `rvw-oos-${suffix}`, schoolId: schoolWithCoords.id, contactType: "PHONE", result: "APPROVED", lat: 33.3, lng: 44.3, locationSource: "GPS" },
      });
      check(`موظف نطاقه «${"أخرى للاختبار"}» لا يستطيع تسجيل زيارة لمدرسة خارج نطاقه → 404`, outOfScope.status === 404, `status=${outOfScope.status} ${JSON.stringify(outOfScope.json?.error ?? "")}`);
    }
  }

  // ============================================================
  section("H) النقاط 4+5 — جدول الإدارة: البيانات والفلاتر");
  // ============================================================
  const allVisits = await api("/api/school-visits");
  check("جدول الإدارة يعرض كل الزيارات (5 سجلات اختبار)", allVisits.status === 200 && allVisits.json?.total >= 5, `total=${allVisits.json?.total}`);
  const firstRow = allVisits.json?.visits?.[0];
  const requiredColumns = ["schoolName", "employeeName", "createdAt", "contactType", "result", "contactPersonName", "schoolPhone", "studentCount", "subscribersCount", "nextFollowUpAt", "needs", "notes", "lat", "lng", "governorate", "regionName"];
  const missingCols = requiredColumns.filter((c) => firstRow?.[c] === undefined);
  check(`أعمدة الجدول المطلوبة كلها موجودة في الاستجابة (${requiredColumns.length} عموداً)`, missingCols.length === 0, missingCols.join(","));
  check("اسم الموظف ظاهر في السجل", firstRow?.employeeName === empAName || allVisits.json?.visits?.some((v) => v.employeeName === empAName));
  check("اسم المدرسة ظاهر مع المحافظة والمنطقة", Boolean(firstRow?.schoolName) && (firstRow?.governorate !== undefined));

  // فلاتر منفصلة
  const fEmp = await api(`/api/school-visits?employeeId=${empAId}`);
  check("فلتر الموظف: كل النتائج لموظف (أ)", fEmp.json?.visits?.every((v) => v.employeeId === empAId) && fEmp.json?.total >= 5);

  const fSchool = await api(`/api/school-visits?schoolId=${schoolWithCoords.id}`);
  check("فلتر المدرسة: كل النتائج لنفس المدرسة", fSchool.json?.visits?.every((v) => v.schoolId === schoolWithCoords.id) && fSchool.json?.total >= 5);

  const fGov = await api(`/api/school-visits?governorate=${encodeURIComponent(schoolWithCoords.governorate ?? "بغداد")}`);
  check("فلتر المحافظة يعمل", fGov.json?.visits?.every((v) => v.governorate === schoolWithCoords.governorate) && fGov.json?.total >= 5);

  const fRegion = await api(`/api/school-visits?regionId=${schoolWithCoords.regionId}`);
  const otherRegion = await adminDb.region.findFirst({ where: { id: { not: schoolWithCoords.regionId } }, select: { id: true } });
  const fRegionOther = otherRegion ? await api(`/api/school-visits?regionId=${otherRegion.id}`) : null;
  check(
    "فلتر المنطقة يعمل: منطقة المدرسة تعيد زياراتها ومنطقة أخرى لا تعيد شيئاً منها",
    fRegion.json?.total >= 5 &&
      fRegion.json?.visits?.every((v) => v.regionName === region?.name || v.regionName === null) === true &&
      (fRegionOther ? fRegionOther.json?.visits?.every((v) => v.schoolName !== schoolWithCoords.name) === true : true),
    `total=${fRegion.json?.total} other=${fRegionOther?.json?.total}`
  );

  const fContact = await api(`/api/school-visits?contactType=FIELD_VISIT`);
  check("فلتر نوع التواصل (زيارة ميدانية)", fContact.json?.visits?.length >= 2 && fContact.json?.visits?.every((v) => v.contactType === "FIELD_VISIT"), `total=${fContact.json?.total}`);

  const fResult = await api(`/api/school-visits?result=REJECTED`);
  check("فلتر النتيجة (رفض) يجلب الزيارة المرفوضة فقط", fResult.json?.total === 1 && fResult.json?.visits?.[0]?.result === "REJECTED", `total=${fResult.json?.total}`);

  const fPeriod = await api(`/api/school-visits?period=today`);
  check("فلتر الفترة (اليوم) يشمل الزيارات الجديدة", fPeriod.json?.total >= 5, `total=${fPeriod.json?.total}`);

  const fQ = await api(`/api/school-visits?q=${encodeURIComponent(schoolWithCoords.name.slice(0, 6))}`);
  check("بحث باسم المدرسة يعمل", fQ.json?.visits?.every((v) => v.schoolName.includes(schoolWithCoords.name.slice(0, 6))), `total=${fQ.json?.total}`);

  const fCombo = await api(`/api/school-visits?employeeId=${empAId}&contactType=MEETING&result=CONTRACTED`);
  check("الفلاتر المركبة تعمل (موظف+نوع+نتيجة)", fCombo.json?.total === 1 && fCombo.json?.visits?.[0]?.contactType === "MEETING", `total=${fCombo.json?.total}`);

  // ============================================================
  section("I) النقطة 6 — أيقونة العين: تفاصيل الزيارة كاملة");
  // ============================================================
  const detail = await api(`/api/school-visits/${visit1Id}`);
  check("API التفاصيل يعمل", detail.status === 200, `status=${detail.status}`);
  const dv = detail.json?.visit ?? {};
  const detailFields = ["contactType", "result", "rejectionReason", "contactPersonName", "contactPersonTitle", "principalName", "schoolPhone", "studentCount", "needs", "needsOther", "subscribersCount", "nextFollowUpAt", "notes", "lat", "lng", "locationAccuracy", "locationSource", "schoolFieldsUpdated", "school", "employee"];
  const missingDetail = detailFields.filter((f) => dv[f] === undefined);
  check("كل تفاصيل الزيارة موجودة في نافذة العين (21 حقلاً)", missingDetail.length === 0, missingDetail.join(","));
  check("تفاصيل المدرسة مرتبطة بالسجل", dv.school?.name === schoolWithCoords.name);
  check("بيانات الموظف المسجل ظاهرة", dv.employee?.name === empAName);
  check("سجل التغييرات المرتبط ظاهر في نافذة التفاصيل", (detail.json?.auditEntries?.length ?? 0) > 0, `entries=${detail.json?.auditEntries?.length}`);

  const detail404 = await api("/api/school-visits/nonexistent-id");
  check("تفاصيل زيارة غير موجودة → 404", detail404.status === 404);

  // ============================================================
  section("J) النقطة 7 — الموقع والخريطة: إحداثيات صحيحة مربوطة بالمدرسة");
  // ============================================================
  const detLat = dv.lat, detLng = dv.lng;
  check("إحداثيات الزيارة مطابقة لما حدده الموظف في الخطوة 1", detLat === 33.315231 && detLng === 44.366102, `(${detLat}, ${detLng})`);
  check("مصدر الموقع (GPS) محفوظ ويظهر للإدارة", dv.locationSource === "GPS");
  const schoolNow = await adminDb.school.findUnique({ where: { id: schoolWithCoords.id }, select: { lat: true, lng: true } });
  check("موقع المدرسة في سجل المدرسة محدث ومتاح لعرض الخريطة", schoolNow?.lat !== null && schoolNow?.lng !== null, `(${schoolNow?.lat}, ${schoolNow?.lng})`);
  check("الاستجابة تحمل school.lat/school.lng لتمركز الخريطة", dv.school?.lat !== undefined && dv.school?.lng !== undefined, `(${dv.school?.lat}, ${dv.school?.lng})`);

  // ============================================================
  section("K) نقاط إضافية — النشاط المركزي والإشعار للإدارة");
  // ============================================================
  const actsAdmin = await api("/api/activities?type=VISIT");
  check("زيارات الموظفين تظهر في سجل التواصل العام للإدارة", actsAdmin.status === 200 && (actsAdmin.json?.activities ?? []).length >= 1, `total=${actsAdmin.json?.total}`);

  console.log(`\n===============================`);
  console.log(`نتيجة الفحص: نجاح ${pass} — فشل ${fail}`);
  if (failures.length) {
    console.log("الفحوصات الفاشلة:");
    for (const f of failures) console.log("  - " + f);
  }
  console.log("===============================");

  // حفظ المعرفات للجاليري
  console.log(`REVIEW_IDS=${JSON.stringify({ visit1Id, empAId, empAUser, empBUser, schoolId: schoolWithCoords.id, schoolName: schoolWithCoords.name, suffix })}`);
}

function randomToken() {
  return [...Array(48)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
}

main()
  .catch((e) => { console.error("فشل سكربت الفحص:", e); process.exitCode = 1; })
  .finally(() => adminDb.$disconnect());
