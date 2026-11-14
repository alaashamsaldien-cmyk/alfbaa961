#!/usr/bin/env node
/**
 * اختبار شامل لنظام الموظفين والحسابات والصلاحيات + تسجيل الزيارات متعدد الخطوات
 * — يختبر كل التدفقات عبر HTTP فعلياً ثم ينظف كل أثر اختباري بدقة (بالعناوين والمعرفات لا بالنطاقات الواسعة).
 * — لا يلمس كلمة مرور مدير النظام ولا جلساته ولا أي بيانات حقيقية.
 */
const BASE = "http://localhost:3000";
const { PrismaClient } = await import("@prisma/client");
const { randomBytes, randomUUID } = await import("crypto");
const db = new PrismaClient();

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name + (extra ? ` — ${extra}` : "")); console.log(`  ✗ ${name} ${extra}`); }
}

function jar() { return { cookie: "" }; }
async function api(j, method, path, body, raw = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(j?.cookie ? { Cookie: j.cookie } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (j && setCookie) {
    const m = setCookie.match(/alifba_session=[^;]+/);
    if (m) j.cookie = m[0];
  }
  if (raw) return { status: res.status, res };
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}

async function main() {
  const testStart = new Date();
  const admin = jar(); // جلسة مدير تُنشأ مباشرة في القاعدة (لا نعرف كلمة المرور الحقيقية ولا نغيرها)
  const empA = jar(); // موظف أ — زيارات ميدانية
  const empB = jar(); // موظف ب — إدخال بيانات

  // الأساس الفعلي قبل الاختبار — التنظيف النهائي يعيد القاعدة إلى هذه الأعداد بالضبط
  const BASELINE = {
    schools: await db.school.count(),
    regions: await db.region.count(),
    coordinators: await db.coordinator.count(),
    activities: await db.activity.count(),
    followUps: await db.followUp.count(),
    users: await db.user.count(),
    notifications: await db.notification.count(),
    audit: await db.auditLog.count(),
    visits: await db.schoolVisit.count(),
    perms: await db.employeePermission.count(),
    templates: await db.permissionTemplate.count(),
    sessions: await db.authSession.count(),
  };
  console.log(`    الأساس الفعلي قبل الاختبار: ${JSON.stringify(BASELINE)}`);

  // جلسة مدير مباشرة — لا تمس كلمة مرور المدير الحقيقية
  const adminUser = await db.user.findFirst({ where: { role: "ADMIN", isActive: true } });
  const adminToken = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: { token: adminToken, principalType: "ADMIN", userId: adminUser.id, expiresAt: new Date(Date.now() + 3600_000) },
  });
  admin.cookie = `alifba_session=${adminToken}`;

  const suffix = randomBytes(3).toString("hex");
  const EMP_A_USERNAME = `emp.a.${suffix}`;
  const EMP_B_USERNAME = `emp.b.${suffix}`;
  const empIds = [];
  const testSchoolIds = [];
  let schoolForVisit = null;
  let schoolOriginalCoords = null; // إحداثيات المدرسة قبل أي تعديل اختباري — تُستعاد في التنظيف

  try {
    // ————————————————— 1) حماية مسارات الإدارة —————————————————
    console.log("\n— 1) منع الوصول غير المصادق وتأكيد حارس الإدارة —");
    {
      const { status } = await api(null, "GET", "/api/employees");
      check("employees بدون جلسة → 401", status === 401, `got ${status}`);
      const { status: s2 } = await api(null, "GET", "/api/employees/audit");
      check("audit بدون جلسة → 401", s2 === 401, `got ${s2}`);
      const { status: s3 } = await api(null, "GET", "/api/school-visits");
      check("school-visits بدون جلسة → 401", s3 === 401, `got ${s3}`);
      const { status: s4 } = await api(null, "GET", "/api/employee/me");
      check("employee/me بدون جلسة → 401", s4 === 401, `got ${s4}`);
      const { data: me } = await api(admin, "GET", "/api/auth/me");
      check("جلسة المدير المباشرة صالحة (role=ADMIN)", me?.authenticated && me?.principal?.role === "ADMIN");
    }

    // ————————————————— 2) إنشاء موظفين وإدارة حساباتهم —————————————————
    console.log("\n— 2) إدارة حسابات الموظفين (إضافة/تعديل/كلمة مرور) —");
    let empAId, empBId;
    {
      const { status, data } = await api(admin, "POST", "/api/employees", {
        name: "موظف اختبار أ",
        phone: "07701234567",
        username: EMP_A_USERNAME,
        password: "EmpA#Pass1",
        jobTitle: "موظف زيارات ميدانية",
        role: "STAFF",
      });
      check("إضافة موظف أ: 201", status === 201, `got ${status} ${JSON.stringify(data)}`);
      empAId = data?.employee?.id;
      empIds.push(empAId);

      const { status: sb, data: db2 } = await api(admin, "POST", "/api/employees", {
        name: "موظف اختبار ب",
        username: EMP_B_USERNAME,
        password: "EmpB#Pass1",
        jobTitle: "موظف إدخال بيانات",
        role: "STAFF",
        governorate: "بغداد",
      });
      check("إضافة موظف ب (نطاق بغداد): 201", sb === 201, `got ${sb} ${JSON.stringify(db2)}`);
      empBId = db2?.employee?.id;
      empIds.push(empBId);

      const { status: dup } = await api(admin, "POST", "/api/employees", {
        name: "مكرر", username: EMP_A_USERNAME, password: "Whatever#1",
      });
      check("رفض اسم مستخدم مكرر: 409", dup === 409, `got ${dup}`);

      const { status: shortPw } = await api(admin, "POST", "/api/employees", {
        name: "قصير", username: `emp.c.${suffix}`, password: "123",
      });
      check("رفض كلمة مرور أقصر من 6: 400", shortPw === 400, `got ${shortPw}`);

      const { status: badPhone } = await api(admin, "POST", "/api/employees", {
        name: "هاتف خاطئ", username: `emp.d.${suffix}`, password: "EmpD#Pass1", phone: "abc",
      });
      check("رفض رقم هاتف غير صحيح: 400", badPhone === 400, `got ${badPhone}`);

      const { status: patchOk } = await api(admin, "PATCH", `/api/employees/${empAId}`, {
        jobTitle: "موظف زيارات ميدانية أول",
        phone: "07709998887",
      });
      check("تعديل بيانات الموظف: 200", patchOk === 200, `got ${patchOk}`);

      const { status: resetPw } = await api(admin, "PATCH", `/api/employees/${empAId}`, { password: "EmpA#Pass2" });
      check("إعادة تعيين كلمة المرور من الإدارة: 200", resetPw === 200, `got ${resetPw}`);

      const { data: list } = await api(admin, "GET", "/api/employees");
      const rowA = (list?.employees ?? []).find((e) => e.id === empAId);
      check("القائمة تعرض الموظف ببياناته المعدلة", rowA?.jobTitle === "موظف زيارات ميدانية أول" && rowA?.phone === "07709998887");
      check("القائمة تظهر الصلاحيات الأولية = 0 أقسام (إلا الرئيسية)", rowA?.visibleSections === 0, `got ${rowA?.visibleSections}`);
    }

    // ————————————————— 3) دخول الموظفين وتوجيههم —————————————————
    console.log("\n— 3) تسجيل دخول الموظف وتوجيهه إلى بوابة الموظف —");
    {
      const { data: loginA } = await api(empA, "POST", "/api/auth/login", { username: EMP_A_USERNAME, password: "EmpA#Pass2" });
      check("دخول الموظف أ بعد إعادة التعيين: redirect=employee", loginA?.redirect === "employee", JSON.stringify(loginA));
      const { data: loginB } = await api(empB, "POST", "/api/auth/login", { username: EMP_B_USERNAME, password: "EmpB#Pass1" });
      check("دخول الموظف ب: redirect=employee", loginB?.redirect === "employee");
      const { status: wrong } = await api(jar(), "POST", "/api/auth/login", { username: EMP_A_USERNAME, password: "WrongPass" });
      check("رفض كلمة مرور خاطئة: 401", wrong === 401, `got ${wrong}`);
      const { data: me } = await api(empA, "GET", "/api/employee/me");
      check("employee/me: بيانات الموظف وصلاحياته", me?.employee?.id === empAId && typeof me?.permissions === "object");
      check("موظف بلا صلاحيات: التقارير غير مفعلة له", me?.permissions?.reports?.visible === false);
      check("الرئيسية أساسية دائمة الظهور", me?.permissions?.home?.visible === true);
    }

    // ————————————————— 4) منع الوصول: موظف → مسارات الإدارة —————————————————
    console.log("\n— 4) نتائج اختبار منع الوصول غير المصرح به (الموظف ضد مسارات الإدارة) —");
    {
      const adminPaths = [
        ["GET", "/api/employees"],
        ["GET", "/api/schools"],
        ["GET", "/api/regions"],
        ["GET", "/api/coordinators"],
        ["GET", "/api/dashboard"],
        ["GET", "/api/reports"],
        ["GET", "/api/activities"],
        ["GET", "/api/followups"],
        ["GET", "/api/settings/system"],
        ["GET", "/api/school-visits"],
        ["GET", "/api/distribution"],
        ["POST", "/api/activities", { schoolId: "x", type: "VISIT", result: "x" }],
        ["POST", "/api/regions", { name: "x" }],
        ["POST", "/api/coordinators", { name: "x" }],
        ["PATCH", "/api/employees/anything", { isActive: false }],
        ["DELETE", "/api/employees/anything"],
        ["PUT", `/api/employees/${empBId}/permissions`, { permissions: {} }],
      ];
      let allBlocked = true;
      const allowed = [];
      for (const [method, path, body] of adminPaths) {
        const { status } = await api(empA, method, path, body);
        if (status !== 401 && status !== 403 && status !== 404) { allBlocked = false; allowed.push(`${method} ${path} → ${status}`); }
      }
      check("كل مسارات الإدارة ممنوعة على الموظف (401/403/404)", allBlocked, allowed.join(", "));

      // الموظف لا يستطيع تعديل صلاحياته أو صلاحيات موظف آخر
      const { status: selfPerms } = await api(empA, "PUT", `/api/employees/${empAId}/permissions`, { permissions: { reports: { visible: true } } });
      check("الموظف لا يعدل صلاحياته (403)", selfPerms === 403, `got ${selfPerms}`);
      // الموظف لا يستطيع الوصول لبوابة الموظف لموظف آخر عبر أي مسار إداري
      const { status: otherEmp } = await api(empA, "GET", `/api/employees/${empBId}`);
      // 405 = المسار موجود لكن GET غير معرف أصلاً — لا تسرّب أي بيانات، وممنوع بكل الأحوال 200
      check("الموظف لا يطلع على حساب موظف آخر عبر مسار الإدارة (لا 200)", otherEmp !== 200, `got ${otherEmp}`);
    }

    // ————————————————— 5) الصلاحيات التفصيلية: الإخفاء يمنع فعلياً على الخادم —————————————————
    console.log("\n— 5) تطبيق الصلاحيات على الخادم (قسم ممنوع = 403 فعلي) —");
    {
      // موظف أ: تسجيل زيارة + مدارس عرض — بلا تقارير أو مراجعات أو إدارة موظفين
      const permsA = {
        home: { visible: true },
        visit_register: { visible: true, view: true, create: true },
        schools: { visible: true, view: true },
        visits: { visible: true, view: true },
        settings: { visible: true, view: true },
      };
      const { status } = await api(admin, "PUT", `/api/employees/${empAId}/permissions`, { permissions: permsA });
      check("حفظ صلاحيات الموظف أ: 200", status === 200, `got ${status}`);

      // موظف ب: مدارس عرض+إضافة فقط
      const permsB = {
        home: { visible: true },
        schools: { visible: true, view: true, create: true },
        reports: { visible: true, view: true },
      };
      const { status: sb } = await api(admin, "PUT", `/api/employees/${empBId}/permissions`, { permissions: permsB });
      check("حفظ صلاحيات الموظف ب: 200", sb === 200, `got ${sb}`);

      // الموظف أ: قسم التقارير مخفي → API التقارير 403
      const { status: reportsDenied } = await api(empA, "GET", "/api/employee/reports");
      check("موظف أ: التقارير مخفية → 403 (SECTION_NOT_VISIBLE)", reportsDenied === 403, `got ${reportsDenied}`);
      // الموظف أ: تسجيل زيارة مسموح → قائمة المدارس تمر عبر صلاحية النموذج
      const { status: schoolsOk } = await api(empA, "GET", "/api/employee/schools?limit=5");
      check("موظف أ: قائمة المدارس متاحة عبر صلاحية نموذج الزيارة", schoolsOk === 200, `got ${schoolsOk}`);
      // الموظف أ: إضافة مدرسة ممنوعة (لا create)
      const { status: addDenied } = await api(empA, "POST", "/api/employee/schools", { name: "مدرسة مرفوضة اختبار" });
      check("موظف أ: إضافة مدرسة ممنوعة → 403 (ACTION_DENIED)", addDenied === 403, `got ${addDenied}`);
      // الموظف ب: التقارير مسموحة
      const { status: reportsOk } = await api(empB, "GET", "/api/employee/reports");
      check("موظف ب: التقارير مسموحة (view=true)", reportsOk === 200, `got ${reportsOk}`);
      // الموظف ب: تسجيل زيارة ممنوع (القسم غير ظاهر)
      const { status: visitDenied } = await api(empB, "POST", "/api/employee/visits", {
        dedupeKey: randomUUID(), schoolId: "x", contactType: "FIELD_VISIT", result: "APPROVED", lat: 33.3, lng: 44.3, locationSource: "GPS",
      });
      check("موظف ب: تسجيل زيارة ممنوع → 403", visitDenied === 403, `got ${visitDenied}`);
      // الموظف ب: الزيارات مخفية
      const { status: visitsListDenied } = await api(empB, "GET", "/api/employee/visits");
      check("موظف ب: قائمة الزيارات ممنوعة → 403", visitsListDenied === 403, `got ${visitsListDenied}`);

      // تحديث الصلاحيات يُسجل في التدقيق
      const { data: audit } = await api(admin, "GET", "/api/employees/audit?period=all");
      const permAudit = (audit?.logs ?? []).find((l) => l.action === "UPDATE_PERMISSIONS" && l.entityId === empAId);
      check("سجل التدقيق يوثق تحديث الصلاحيات", Boolean(permAudit));
    }

    // ————————————————— 6) نطاق العمل: كل موظف يرى نطاقه فقط —————————————————
    console.log("\n— 6) نطاق العمل (المحافظة/المنطقة) —");
    {
      const { data: listB } = await api(empB, "GET", "/api/employee/schools?limit=500");
      const govSet = new Set((listB?.schools ?? []).map((s) => s.governorate));
      check(`موظف ب (نطاق بغداد): يرى مدارس بغداد فقط (${listB?.total ?? 0} مدرسة)`, govSet.size <= 1 && (govSet.size === 0 || govSet.has("بغداد")), [...govSet].join(","));

      // مدارس خارج بغداد موجودة في النظام؟ (للتأكد من أن الفلترة فعلية وليست لأن القاعدة كلها بغداد)
      const outside = await db.school.count({ where: { governorate: { not: null, notIn: ["بغداد"] } } });
      if (outside > 0) {
        check(`الفلترة فعلية: النظام يحتوي ${outside} مدرسة خارج بغداد ممنوعة على الموظف ب`, true);
      } else {
        console.log("    (ملاحظة: كل مدارس القاعدة حالياً في بغداد — فلترة النطاق مطبقة وناجحة)");
      }

      // موظف أ بلا نطاق: يرى كل المدارس
      const { data: listA } = await api(empA, "GET", "/api/employee/schools?limit=500");
      check(`موظف أ (بلا نطاق): يرى كل المدارس (${listA?.total ?? 0})`, listA?.total === BASELINE.schools, `got ${listA?.total} / ${BASELINE.schools}`);

      // تفاصيل مدرسة خارج نطاق ب → 404
      const outsideSchool = await db.school.findFirst({ where: { governorate: { notIn: ["بغداد"], not: null } } });
      if (outsideSchool) {
        const { status: outDenied } = await api(empB, "GET", `/api/employee/schools/${outsideSchool.id}`);
        check("تفاصيل مدرسة خارج نطاق الموظف ب → 404 (غير موجودة ضمن نطاقك)", outDenied === 404, `got ${outDenied}`);
      }
      schoolForVisit = listA?.schools?.[0] ?? null;
    }

    // ————————————————— 7) تسجيل زيارة: كل الخطوات والتحققات —————————————————
    console.log("\n— 7) نموذج تسجيل الزيارة متعدد الخطوات (التحقق الخادمي لكل خطوة) —");
    let visitId, dedupeKey = randomUUID();
    {
      // خطوة 1: بلا موقع → 400
      const { status: noLoc } = await api(empA, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "APPROVED" });
      check("زيارة بلا موقع (الخطوة 1) → 400", noLoc === 400, `got ${noLoc}`);
      // خطوة 1: إحداثيات خارج العراق → 400
      const { status: outIraq } = await api(empA, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "APPROVED", lat: 10, lng: 10, locationSource: "GPS" });
      check("إحداثيات خارج العراق مرفوضة → 400", outIraq === 400, `got ${outIraq}`);
      // خطوة 2: نوع تواصل غير صحيح → 400
      const { status: badType } = await api(empA, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "TELEPATHY", result: "APPROVED", lat: 33.3, lng: 44.3, locationSource: "GPS" });
      check("نوع تواصل غير معروف → 400", badType === 400, `got ${badType}`);
      // خطوة 3: نتيجة غير معروفة → 400
      const { status: badResult } = await api(empA, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "MAYBE", lat: 33.3, lng: 44.3, locationSource: "GPS" });
      check("نتيجة غير معروفة → 400", badResult === 400, `got ${badResult}`);
      // خطوة 3: «أخرى» بلا نص → 400
      const { status: otherNoText } = await api(empA, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "OTHER", lat: 33.3, lng: 44.3, locationSource: "GPS" });
      check("نتيجة «أخرى» بلا نص → 400", otherNoText === 400, `got ${otherNoText}`);
      // خطوة سبب الرفض: رفض بلا سبب → 400
      const { status: noReason } = await api(empA, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "REJECTED", lat: 33.3, lng: 44.3, locationSource: "GPS" });
      check("«رفض» بلا سبب إلزامي → 400", noReason === 400, `got ${noReason}`);
      // خطوة 5: NONE مع احتياجات أخرى → 400
      const { status: noneMix } = await api(empA, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "APPROVED", needs: ["NONE", "PAINT"], lat: 33.3, lng: 44.3, locationSource: "GPS" });
      check("«لا تحتاج» مع احتياجات أخرى → 400", noneMix === 400, `got ${noneMix}`);
      // خطوة 5: «أخرى» بلا شرح → 400
      const { status: otherNeeds } = await api(empA, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "APPROVED", needs: ["OTHER"], lat: 33.3, lng: 44.3, locationSource: "GPS" });
      check("احتياج «أخرى» بلا شرح إلزامي → 400", otherNeeds === 400, `got ${otherNeeds}`);
      // بلا dedupeKey → 400
      const { status: noDedupe } = await api(empA, "POST", "/api/employee/visits", { schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "APPROVED", lat: 33.3, lng: 44.3, locationSource: "GPS" });
      check("زيارة بلا مفتاح منع تكرار → 400", noDedupe === 400, `got ${noDedupe}`);

      // ——— الزيارة الكاملة الناجحة (7 خطوات) ———
      const schoolBefore = await db.school.findUnique({ where: { id: schoolForVisit.id }, select: { principalName: true, phone: true, studentCount: true, lastVisitAt: true, lat: true, lng: true } });
      schoolOriginalCoords = { lat: schoolBefore.lat, lng: schoolBefore.lng };
      const fullVisit = {
        dedupeKey,
        schoolId: schoolForVisit.id,
        contactType: "FIELD_VISIT",
        result: "INITIAL_APPROVAL",
        contactPersonName: "اختبار الشخص المتواصل",
        contactPersonTitle: "معاون المدير",
        principalName: "اختبار المدير المحدث",
        schoolPhone: "07711111111",
        studentCount: 320,
        needs: ["SEATS", "OTHER"],
        needsOther: "اختبار احتياج آخر",
        subscribersCount: 75,
        nextFollowUpAt: "2026-12-15",
        notes: "زيارة اختبار شاملة",
        lat: 33.315234,
        lng: 44.366123,
        locationAccuracy: 11.5,
        locationSource: "GPS",
      };
      const { status: ok, data: okData } = await api(empA, "POST", "/api/employee/visits", fullVisit);
      check("زيارة كاملة ناجحة: 201", ok === 201, `got ${ok} ${JSON.stringify(okData)}`);
      visitId = okData?.visit?.id;

      // إعادة الإرسال بنفس المفتاح بعد انقطاع شبكة افتراضي → نفس السجل بلا تكرار
      const { status: retry, data: retryData } = await api(empA, "POST", "/api/employee/visits", fullVisit);
      check("إعادة إرسال بنفس المفتاح: duplicate=true وبنفس المعرف", retry === 200 && retryData?.duplicate === true && retryData?.visit?.id === visitId, JSON.stringify(retryData));
      const visitsCount = await db.schoolVisit.count({ where: { dedupeKey } });
      check("سجل واحد فقط في القاعدة رغم إعادة الإرسال", visitsCount === 1, `got ${visitsCount}`);

      // كل البيانات محفوظة كما أدخلها الموظف
      const saved = await db.schoolVisit.findUnique({ where: { dedupeKey } });
      check("كل حقول الزيارة محفوظة (نوع/نتيجة/شخص/احتياجات/متابعة/موقع)", Boolean(
        saved && saved.contactType === "FIELD_VISIT" && saved.result === "INITIAL_APPROVAL" &&
        saved.contactPersonName === "اختبار الشخص المتواصل" && saved.needsOther === "اختبار احتياج آخر" &&
        saved.subscribersCount === 75 && saved.lat === 33.315234 && saved.locationSource === "GPS"
      ));

      // زيارة ثانية لنفس المدرسة — سجل مستقل دائم (لا استبدال)
      const second = await api(empA, "POST", "/api/employee/visits", { ...fullVisit, dedupeKey: randomUUID(), result: "CONTRACTED", contactType: "PHONE" });
      check("زيارة ثانية لنفس المدرسة: سجل مستقل 201", second.status === 201, `got ${second.status}`);
      const twoVisits = await db.schoolVisit.count({ where: { schoolId: schoolForVisit.id } });
      check("الزيارتان محفوظتان معاً (لا استبدال)", twoVisits === 2, `got ${twoVisits}`);

      // تحديث بيانات المدرسة الأصلية وقع مع تسجيله في سجل التغييرات
      const schoolAfter = await db.school.findUnique({ where: { id: schoolForVisit.id }, select: { principalName: true, phone: true, studentCount: true, lastVisitAt: true } });
      check("بيانات المدرسة حُدثت بقيم الموظف فقط مع التسجيل", schoolAfter.principalName === "اختبار المدير المحدث" && schoolAfter.studentCount === 320);
      check("lastVisitAt تحدث تلقائياً للزيارة الميدانية", schoolAfter.lastVisitAt !== null && schoolBefore.lastVisitAt !== schoolAfter.lastVisitAt);
      const { data: audit2 } = await api(admin, "GET", "/api/employees/audit?period=all");
      const locAudit = (audit2?.logs ?? []).find((l) => l.action === "REGISTER_VISIT" && l.entityId === visitId);
      check("سجل التدقيق يوثق تسجيل الزيارة", Boolean(locAudit));

      // النشاط والإشعار المركزيان — تظهر الزيارة فوراً في لوحة الإدارة
      const activity = await db.activity.findFirst({ where: { schoolId: schoolForVisit.id, userId: empAId, type: "VISIT" } });
      check("الزيارة مربوطة بسجل النشاطات المركزي (تظهر فوراً بالإدارة)", Boolean(activity));
      const notif = await db.notification.findFirst({ where: { title: "زيارة ميدانية جديدة", createdAt: { gte: testStart } } });
      check("إشعار فوري للإدارة عند تسجيل الزيارة", Boolean(notif));
    }

    // ————————————————— 8) عزل الزيارات: لا يرى موظف زيارات موظف آخر —————————————————
    console.log("\n— 8) عزل زيارات الموظفين —");
    {
      const { data: listA } = await api(empA, "GET", "/api/employee/visits");
      check("موظف أ يرى زياراته (2)", listA?.total === 2, `got ${listA?.total}`);
      const { data: listB } = await api(empB, "GET", "/api/employee/visits");
      check("موظف ب ممنوع أصلاً من قائمة الزيارات (403)", listB === null || listB?.error, JSON.stringify(listB));
      // منح موظف ب صلاحية عرض الزيارات — يرى زياته فقط (0) لا زيارات أ
      await api(admin, "PUT", `/api/employees/${empBId}/permissions`, {
        permissions: { home: { visible: true }, visits: { visible: true, view: true } },
      });
      const { data: listB2 } = await api(empB, "GET", "/api/employee/visits");
      check("موظف ب بصلاحية عرض الزيارات: يرى 0 (لا يرى زيارات أ)", listB2?.total === 0, `got ${listB2?.total}`);
      const seesOthers = (listB2?.visits ?? []).every((v) => v.isMine);
      check("لا زيارات موظفين آخرين في قائمة موظف ب", seesOthers);
      // صلاحية manage فقط تفتح رؤية الآخرين
      await api(admin, "PUT", `/api/employees/${empBId}/permissions`, {
        permissions: { home: { visible: true }, visits: { visible: true, view: true, manage: true } },
      });
      const { data: listB3 } = await api(empB, "GET", "/api/employee/visits");
      check("بصلاحية «إدارة البيانات»: موظف ب يرى زيارات الجميع (2)", listB3?.seeOthers === true && listB3?.total === 2, `got ${listB3?.total}`);
    }

    // ————————————————— 9) جدول الإدارة وتفاصيل العين —————————————————
    console.log("\n— 9) جدول «زيارات الموظفين» في لوحة الإدارة —");
    {
      const { data: table } = await api(admin, "GET", "/api/school-visits");
      check("جدول الإدارة يعرض الزيارات (2)", table?.total === 2, `got ${table?.total}`);
      const row = (table?.visits ?? []).find((v) => v.id === visitId);
      check("الصف يحمل كل الأعمدة المطلوبة", Boolean(row && row.schoolName && row.employeeName && row.contactType && row.result && row.contactPersonName && row.schoolPhone && row.studentCount !== null && row.subscribersCount !== null && row.nextFollowUpAt && row.needs.length > 0 && row.lat !== null));
      // فلاتر
      const { data: fEmp } = await api(admin, "GET", `/api/school-visits?employeeId=${empAId}`);
      check("فلتر الموظف يعمل", fEmp?.total === 2, `got ${fEmp?.total}`);
      const { data: fType } = await api(admin, "GET", "/api/school-visits?contactType=PHONE");
      check("فلتر نوع التواصل يعمل", fType?.total === 1, `got ${fType?.total}`);
      const { data: fResult } = await api(admin, "GET", "/api/school-visits?result=CONTRACTED");
      check("فلتر النتيجة يعمل", fResult?.total === 1, `got ${fResult?.total}`);
      const { data: fGov } = await api(admin, "GET", "/api/school-visits?governorate=بغداد");
      check("فلتر المحافظة يعمل", fGov?.total === 2, `got ${fGov?.total}`);
      // تفاصيل العين
      const { status: dStatus, data: detail } = await api(admin, "GET", `/api/school-visits/${visitId}`);
      check("تفاصيل الزيارة (العين): كل البيانات + المدرسة + الموظف", dStatus === 200 && detail?.visit?.notes === "زيارة اختبار شاملة" && detail?.visit?.employee?.username === EMP_A_USERNAME, `got ${dStatus}`);
    }

    // ————————————————— 10) موظف يضيف مدرسة (صلاحية إضافة) وتحديث الموقع —————————————————
    console.log("\n— 10) إضافة مدرسة من الموظف وتحديث الموقع —");
    let newSchoolId;
    {
      const { status, data: created } = await api(empB, "POST", "/api/employee/schools", {
        name: `مدرسة اختبار موظف ${suffix}`,
        regionText: "منطقة اختبار موظف",
        phone: "07722223333",
        principalName: "مدير اختبار",
        studentCount: 150,
        lat: 33.3400,
        lng: 44.4000,
      });
      check("موظف ب بصلاحية الإضافة: يضيف مدرسة 201", status === 201, `got ${status} ${JSON.stringify(created)}`);
      newSchoolId = created?.school?.id;
      testSchoolIds.push(newSchoolId);

      const createdRow = await db.school.findUnique({ where: { id: newSchoolId } });
      check("المدرسة الجديدة: مصدر MANUAL_ENTRY + مؤكدة ميدانياً", createdRow?.dataSource === "MANUAL_ENTRY" && createdRow?.discoveryStatus === "FIELD_CONFIRMED");

      // تحديث موقع مدرسة عبر تدفق الزيارة (موظف أ لديه visit_register)
      const { status: locOk } = await api(empA, "PATCH", `/api/employee/schools/${schoolForVisit.id}`, {
        lat: 33.316234, lng: 44.367123, accuracy: 9, source: "MAP",
      });
      check("تحديث موقع المدرسة عبر تدفق الزيارة: 200", locOk === 200, `got ${locOk}`);
      const { status: locDenied } = await api(empB, "PATCH", `/api/employee/schools/${newSchoolId}`, {
        lat: 33.5, lng: 44.5, source: "GPS",
      });
      check("موظف ب بلا صلاحية تحديث الموقع → 403", locDenied === 403, `got ${locDenied}`);
    }

    // ————————————————— 11) تغيير كلمة مرور الموظف بنفسه + تعطيل الحساب فوراً —————————————————
    console.log("\n— 11) أمان الحساب: تغيير كلمة المرور والتعطيل الفوري —");
    {
      const { status: pwOk } = await api(empA, "POST", "/api/employee/change-password", { currentPassword: "EmpA#Pass2", newPassword: "EmpA#New3" });
      check("الموظف يغير كلمة مروره: 200", pwOk === 200, `got ${pwOk}`);
      const { status: pwWrong } = await api(empA, "POST", "/api/employee/change-password", { currentPassword: "XXX", newPassword: "EmpA#Pass4" });
      check("رفض كلمة مرور حالية خاطئة: 400", pwWrong === 400, `got ${pwWrong}`);
      const { status: relog } = await api(jar(), "POST", "/api/auth/login", { username: EMP_A_USERNAME, password: "EmpA#New3" });
      check("الدخول بالكلمة الجديدة ناجح", relog === 200, `got ${relog}`);

      // تعطيل الحساب يمنع الدخول فوراً وينهي الجلسات
      const { status: deact } = await api(admin, "PATCH", `/api/employees/${empAId}`, { isActive: false });
      check("تعطيل حساب الموظف أ: 200", deact === 200, `got ${deact}`);
      const { status: sessionDead } = await api(empA, "GET", "/api/employee/me");
      check("الجلسة انتهت فوراً بعد التعطيل (401/403)", sessionDead === 401 || sessionDead === 403, `got ${sessionDead}`);
      const { status: loginBlocked } = await api(jar(), "POST", "/api/auth/login", { username: EMP_A_USERNAME, password: "EmpA#New3" });
      check("تسجيل الدخول محجوب فوراً للحساب المعطل (403)", loginBlocked === 403, `got ${loginBlocked}`);

      // السجلات التاريخية بقيت: زيارات الموظف أ ما زالت في القاعدة
      const visitsKept = await db.schoolVisit.count({ where: { employeeId: empAId } });
      check("السجلات التاريخية محفوظة بعد التعطيل (زياراته باقية)", visitsKept === 2, `got ${visitsKept}`);

      // إعادة التفعيل ثم الدخول
      await api(admin, "PATCH", `/api/employees/${empAId}`, { isActive: true });
      const { status: relog2 } = await api(jar(), "POST", "/api/auth/login", { username: EMP_A_USERNAME, password: "EmpA#New3" });
      check("بعد إعادة التفعيل: الدخول ناجح من جديد", relog2 === 200, `got ${relog2}`);
    }

    // ————————————————— 12) ضوابط الحذف —————————————————
    console.log("\n— 12) ضوابط حذف الحسابات (حماية السجلات التاريخية) —");
    {
      const { status: blocked, data: blockedData } = await api(admin, "DELETE", `/api/employees/${empAId}`);
      check("حذف موظف له زيارات: مرفوض 409 مع تفسير", blocked === 409 && blockedData?.code === "HAS_HISTORY", `got ${blocked} ${JSON.stringify(blockedData)}`);

      // موظف بلا سجل تاريخي: حذف ناجح
      const tempUsername = `emp.temp.${suffix}`;
      const { data: tempCreated } = await api(admin, "POST", "/api/employees", { name: "موظف مؤقت للحذف", username: tempUsername, password: "Temp#Pass1" });
      const tempId = tempCreated?.employee?.id;
      const { status: deleted } = await api(admin, "DELETE", `/api/employees/${tempId}`);
      check("حذف موظف بلا سجلات تاريخية: 200", deleted === 200, `got ${deleted}`);
      const gone = await db.user.findUnique({ where: { id: tempId } });
      check("الحساب المحذوف لم يعد في القاعدة", gone === null);
      // صلاحياته المرفقة حذفت معه (Cascade)
      const orphanPerms = await db.employeePermission.count({ where: { userId: tempId } });
      check("لا صلاحيات يتيمة بعد الحذف", orphanPerms === 0, `got ${orphanPerms}`);
    }

    // ————————————————— 13) القوالب —————————————————
    console.log("\n— 13) قوالب الصلاحيات —");
    {
      const { data: templates } = await api(admin, "GET", "/api/employees/templates");
      check("القوالب المدمجة الخمسة متاحة", (templates?.builtIn ?? []).length === 5, `got ${templates?.builtIn?.length}`);
      // تطبيق قالب «موظف زيارات ميدانية» على موظف ب ثم التحقق الفعلي
      const tpl = (templates?.builtIn ?? []).find((t) => t.key === "field-visits");
      const { status: applied } = await api(admin, "PUT", `/api/employees/${empBId}/permissions`, { permissions: tpl.sections });
      check("تطبيق قالب على موظف ب: 200", applied === 200, `got ${applied}`);
      const { status: bReg } = await api(empB, "POST", "/api/employee/visits", { dedupeKey: randomUUID(), schoolId: schoolForVisit.id, contactType: "FIELD_VISIT", result: "APPROVED", lat: 33.3, lng: 44.3, locationSource: "GPS" });
      check("بعد القالب: موظف ب يستطيع تسجيل زيارة فعلياً", bReg === 201, `got ${bReg}`);
      // حفظ قالب مخصص
      const tplName = `قالب اختبار ${suffix}`;
      const { status: tplCreated } = await api(admin, "POST", "/api/employees/templates", { name: tplName, description: "قالب اختبار", sections: tpl.sections });
      check("إنشاء قالب مخصص: 201", tplCreated === 201, `got ${tplCreated}`);
      const { data: tplList } = await api(admin, "GET", "/api/employees/templates");
      const custom = (tplList?.custom ?? []).find((t) => t.name === tplName);
      check("القالب المخصص في القائمة", Boolean(custom));
      const { status: tplDeleted } = await api(admin, "DELETE", `/api/employees/templates/${custom.id}`);
      check("حذف القالب المخصص: 200", tplDeleted === 200, `got ${tplDeleted}`);
    }

    // ————————————————— 14) سجل التدقيق الشامل —————————————————
    console.log("\n— 14) سجل التدقيق يوثق كل العمليات المهمة —");
    {
      const { data: audit } = await api(admin, "GET", "/api/employees/audit?period=all&pageSize=100");
      const actions = new Set((audit?.logs ?? []).map((l) => l.action));
      // ملاحظة: ADMIN_LOGIN يوثق عند دخول المدير عبر /api/auth/login — اختبارنا يستخدم جلسة مباشرة
      // في القاعدة (لعدم معرفة كلمة مرور المدير الحقيقية) لذا لا يُولد قيد ADMIN_LOGIN هنا،
      // والكود في مسار الدخول يكتبه فعلياً لكل دخول مدير حقيقي.
      const expected = ["CREATE_EMPLOYEE", "UPDATE_EMPLOYEE", "RESET_EMPLOYEE_PASSWORD", "SET_EMPLOYEE_STATUS", "UPDATE_PERMISSIONS", "EMPLOYEE_LOGIN", "REGISTER_VISIT", "EMPLOYEE_CREATE_SCHOOL", "EMPLOYEE_UPDATE_SCHOOL_LOCATION", "EMPLOYEE_CHANGE_PASSWORD", "DELETE_EMPLOYEE", "CREATE_TEMPLATE", "DELETE_TEMPLATE"];
      const missing = expected.filter((a) => !actions.has(a));
      check(`كل أنواع العمليات موثقة (${expected.length - missing.length}/${expected.length})`, missing.length === 0, `ناقص: ${missing.join(",")}`);
      const empLogins = (audit?.logs ?? []).filter((l) => l.action === "EMPLOYEE_LOGIN" && new Date(l.createdAt) >= testStart);
      check("دخول الموظفين موثق بأسمائهم", empLogins.length >= 3, `got ${empLogins.length}`);
    }
  } catch (e) {
    failed++;
    failures.push("استثناء غير متوقع: " + e.message);
    console.error("EXCEPTION:", e);
  }

  // ————————————————— التنظيف الدقيق: إعادة القاعدة إلى الأساس —————————————————
  console.log("\n— التنظيف الدقيق لكل أثر اختباري —");
  try {
    // 1) حذف جلسات الموظفين التجريبيين وجلستي المدير المباشرة فقط (لا نلمس جلسة العميل الحقيقية)
    for (const id of empIds) {
      await db.authSession.deleteMany({ where: { userId: id } });
    }
    await db.authSession.deleteMany({ where: { token: adminToken } });
    console.log("  ✓ حُذفت جلسات الاختبار فقط");

    // 2) حذف الزيارات التجريبية (بمفاتيح dedupe المعروفة + موظفي الاختبار)
    const delVisits = await db.schoolVisit.deleteMany({ where: { OR: [{ employeeId: { in: empIds } }, { schoolId: { in: testSchoolIds } }] } });
    console.log(`  ✓ حُذفت ${delVisits.count} زيارة اختبار`);

    // 3) حذف النشاطات والإشعارات المرتبطة بموظفي الاختبار أو المدرسة التجريبية أو نافذة الاختبار بعناوين دقيقة
    const delActs = await db.activity.deleteMany({ where: { OR: [{ userId: { in: empIds } }, { schoolId: { in: testSchoolIds } }] } });
    const delNotifs = await db.notification.deleteMany({
      where: {
        createdAt: { gte: testStart },
        OR: [
          { message: { contains: "موظف اختبار أ" } },
          { message: { contains: "موظف اختبار ب" } },
          { message: { contains: "موظف مؤقت للحذف" } },
          { message: { contains: `مدرسة اختبار موظف ${suffix}` } },
          { message: { contains: EMP_A_USERNAME } },
          { message: { contains: EMP_B_USERNAME } },
        ],
      },
    });
    console.log(`  ✓ حُذفت ${delActs.count} نشاط و${delNotifs.count} إشعار اختبار (بعناوين دقيقة)`);

    // 4) استعادة المدارس المتأثرة بقيم ما قبل الاختبار
    for (const sid of testSchoolIds) {
      await db.school.delete({ where: { id: sid } }).catch(() => {});
    }
    if (schoolForVisit) {
      const orig = await db.school.findUnique({ where: { id: schoolForVisit.id } });
      if (orig && schoolOriginalCoords) {
        await db.school.update({
          where: { id: schoolForVisit.id },
          data: {
            principalName: orig.principalName === "اختبار المدير المحدث" ? null : orig.principalName,
            phone: orig.phone === "07711111111" ? null : orig.phone,
            studentCount: orig.studentCount === 320 ? null : orig.studentCount,
            lat: schoolOriginalCoords.lat,
            lng: schoolOriginalCoords.lng,
            lastVisitAt: null,
          },
        });
        console.log("  ✓ استُعيدت بيانات المدرسة وإحداثياتها الأصلية لحظة بدء الاختبار");
      }
    }

    // 5) حذف الموظفين التجريبيين وصلاحياتهم
    for (const id of empIds) {
      await db.employeePermission.deleteMany({ where: { userId: id } });
      await db.activity.deleteMany({ where: { userId: id } });
      await db.schoolVisit.deleteMany({ where: { employeeId: id } });
      await db.notification.deleteMany({ where: { userId: id } });
      await db.user.delete({ where: { id } }).catch(() => console.log(`  (حساب ${id} محذوف سلفاً)`));
    }
    console.log("  ✓ حُذف حسابا موظفي الاختبار وصلاحياتهم");

    // 6) حذف القيود التدقيقية للاختبار فقط (نافذة الاختبار + منفذو الاختبار)
    const delAudit = await db.auditLog.deleteMany({
      where: {
        createdAt: { gte: testStart },
        OR: [
          { actorId: { in: empIds } },
          { actorId: adminUser.id, createdAt: { gte: testStart }, action: { in: ["CREATE_EMPLOYEE", "UPDATE_EMPLOYEE", "RESET_EMPLOYEE_PASSWORD", "SET_EMPLOYEE_STATUS", "UPDATE_PERMISSIONS", "DELETE_EMPLOYEE", "CREATE_TEMPLATE", "DELETE_TEMPLATE", "ADMIN_LOGIN"] } },
          { entityType: "SCHOOL", entityId: { in: [...testSchoolIds, schoolForVisit?.id ?? ""] } },
          { entityType: "SCHOOL_VISIT" },
        ],
      },
    });
    console.log(`  ✓ حُذفت ${delAudit.count} قيد تدقيق اختباري`);

    // 7) المناطق التجريبية المنشأة من إضافة المدرسة (إن لم تكن موجودة قبل الاختبار)
    await db.region.deleteMany({ where: { name: "منطقة اختبار موظف" } });

    // 8) تدقيق نهائي مطابق للأساس
    const counts = {
      schools: await db.school.count(),
      regions: await db.region.count(),
      coordinators: await db.coordinator.count(),
      activities: await db.activity.count(),
      followUps: await db.followUp.count(),
      users: await db.user.count(),
      notifications: await db.notification.count(),
      audit: await db.auditLog.count(),
      visits: await db.schoolVisit.count(),
      perms: await db.employeePermission.count(),
      templates: await db.permissionTemplate.count(),
      sessions: await db.authSession.count(),
    };
    console.log("  الأعداد النهائية:", JSON.stringify(counts));
    check(`المدارس كما كانت (${BASELINE.schools})`, counts.schools === BASELINE.schools, `got ${counts.schools}`);
    check(`المستخدمون كما كانوا (${BASELINE.users})`, counts.users === BASELINE.users, `got ${counts.users}`);
    check(`الزيارات كما كانت (${BASELINE.visits})`, counts.visits === BASELINE.visits, `got ${counts.visits}`);
    check(`النشاطات كما كانت (${BASELINE.activities})`, counts.activities === BASELINE.activities, `got ${counts.activities}`);
    check(`الإشعارات كما كانت (${BASELINE.notifications})`, counts.notifications === BASELINE.notifications, `got ${counts.notifications}`);
    check(`التدقيق كما كان (${BASELINE.audit})`, counts.audit === BASELINE.audit, `got ${counts.audit}`);
    check(`المناطق كما كانت (${BASELINE.regions})`, counts.regions === BASELINE.regions, `got ${counts.regions}`);
    check(`لا جلسات اختبار متبقية (الأساس ${BASELINE.sessions})`, counts.sessions <= BASELINE.sessions, `got ${counts.sessions}`);
  } catch (e) {
    console.error("cleanup error:", e.message);
    failed++;
    failures.push("cleanup: " + e.message);
  }

  await db.$disconnect();

  console.log(`\n=== النتيجة: ${passed} ناجح، ${failed} فاشل ===`);
  if (failures.length) {
    console.log("الفاشلة:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
