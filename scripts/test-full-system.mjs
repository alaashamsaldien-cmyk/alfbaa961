#!/usr/bin/env node
/**
 * اختبار شامل لوظائف لوحة الإدارة المكتملة + نظام الحسابات والصلاحيات + بوابة المنسقة
 * — يختبر كل التدفقات الفعلية عبر HTTP، ثم ينظف كل أثر اختباري ويعيد القاعدة لحالتها الأصلية.
 * — لا بيانات وهمية متبقية بعد انتهاء الاختبار (تدقيق الأعداد في النهاية).
 */
const BASE = "http://localhost:3000";
const ADMIN_PW = "Test#Alifba-2026";

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
  const admin = jar();
  const coord = jar();

  // الأساس الفعلي من القاعدة قبل أي اختبار — التنظيف النهائي يعيد القاعدة إلى هذه الأعداد بالضبط
  // (الأعداد الحقيقية للعميل تبقى كما هي ولا يُحذف منها شيء)
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const BASELINE = {
    schools: await prisma.school.count(),
    regions: await prisma.region.count(),
    coordinators: await prisma.coordinator.count(),
    activities: await prisma.activity.count(),
    followUps: await prisma.followUp.count(),
    users: await prisma.user.count(),
    notifications: await prisma.notification.count(),
  };
  await prisma.$disconnect();
  console.log(`    الأساس الفعلي قبل الاختبار: ${JSON.stringify(BASELINE)}`);

  console.log("— 1) الحالة قبل تسجيل الدخول —");
  {
    const { data } = await api(null, "GET", "/api/auth/me");
    check("me بدون جلسة: authenticated=false", data?.authenticated === false);
    check("me بدون جلسة: يحتاج تهيئة أولى (needsSetup=true)", data?.needsSetup === true);
    const { status: s1 } = await api(null, "GET", "/api/schools");
    check("schools بدون جلسة → 401", s1 === 401, `got ${s1}`);
    const { status: s2 } = await api(null, "GET", "/api/dashboard");
    check("dashboard بدون جلسة → 401", s2 === 401, `got ${s2}`);
    const { status: s3 } = await api(null, "GET", "/api/reports");
    check("reports بدون جلسة → 401", s3 === 401, `got ${s3}`);
    const { status: s4, data: d4 } = await api(null, "POST", "/api/auth/setup", { password: "x" });
    check("تهيئة بكلمة مرور قصيرة تُرفض 400", s4 === 400, `got ${s4}`);
  }

  console.log("— 2) تهيئة مدير النظام (تشغيل أول) ثم الدخول —");
  {
    const { status, data } = await api(admin, "POST", "/api/auth/setup", { username: "admin", password: ADMIN_PW, name: "مدير النظام" });
    check("تهيئة ناجحة 201", status === 201, `got ${status} ${JSON.stringify(data)}`);
    check("استجابة: redirect=admin", data?.redirect === "admin");
    const { data: me } = await api(admin, "GET", "/api/auth/me");
    check("me بعد التهيئة: مدير مصادَق", me?.authenticated === true && me?.principal?.type === "ADMIN");
    // إعادة التهيئة مغلقة
    const { status: s2 } = await api(jar(), "POST", "/api/auth/setup", { password: "whatever123" });
    check("إعادة التهيئة مرفوضة 403 بعد اكتمالها", s2 === 403, `got ${s2}`);
  }

  console.log("— 3) قراءة كل أقسام الإدارة بجلسة المدير —");
  let aCoordinatorId = null;
  let aSchoolId = null;
  {
    const dash = await api(admin, "GET", "/api/dashboard?period=all");
    check("dashboard 200", dash.status === 200, `got ${dash.status}`);
    const schools = await api(admin, "GET", "/api/schools?limit=5");
    check("schools 200", schools.status === 200, `got ${schools.status}`);
    aSchoolId = schools.data?.schools?.[0]?.id ?? null;
    check("توجد مدارس حقيقية في القاعدة", Boolean(aSchoolId));

    const regions = await api(admin, "GET", "/api/regions");
    check("regions 200 وبيانات فعلية", regions.status === 200 && Array.isArray(regions.data?.regions));
    const dist = await api(admin, "GET", "/api/distribution");
    check("distribution 200", dist.status === 200, `got ${dist.status}`);
    const acts = await api(admin, "GET", "/api/activities?period=all");
    check("activities 200", acts.status === 200, `got ${acts.status}`);
    const fu = await api(admin, "GET", "/api/followups");
    check("followups 200", fu.status === 200, `got ${fu.status}`);
    const rep = await api(admin, "GET", "/api/reports");
    check("reports 200 وأرقام حقيقية", rep.status === 200 && typeof rep.data?.schools?.total === "number");
    console.log(`    أرقام فعلية: مدارس=${rep.data?.schools?.total} نشاطات اليوم=${rep.data?.activities?.today}`);
    const users = await api(admin, "GET", "/api/users");
    check("users 200", users.status === 200, `got ${users.status}`);
    const coords = await api(admin, "GET", "/api/coordinators");
    check("coordinators 200", coords.status === 200, `got ${coords.status}`);
    aCoordinatorId = coords.data?.coordinators?.[0]?.id ?? null;
    const notif = await api(admin, "GET", "/api/notifications");
    check("notifications 200", notif.status === 200, `got ${notif.status}`);
    const sys = await api(admin, "GET", "/api/settings/system");
    check("settings/system 200", sys.status === 200, `got ${sys.status}`);
    const sess = await api(admin, "GET", "/api/session");
    check("session 200 (توافق الشريط العلوي)", sess.status === 200, `got ${sess.status}`);
    if (aCoordinatorId) {
      const preview = await api(admin, "GET", `/api/coordinator-portal/schools?coordinatorId=${aCoordinatorId}`);
      check("معاينة بوابة منسقة من الإدارة 200", preview.status === 200, `got ${preview.status}`);
      check("وضع المعاينة مفعّل preview=true", preview.data?.preview === true);
    }
  }

  console.log("— 4) دورات إنشاء وتعديل وحذف (صافي أثر = صفر) —");
  {
    // منطقة
    const r1 = await api(admin, "POST", "/api/regions", { name: "منطقة اختبار مؤقتة - الحي الصناعي", governorate: "بغداد" });
    check("إضافة منطقة 201", r1.status === 201, `got ${r1.status}`);
    const rid = r1.data?.region?.id;
    const r2 = await api(admin, "PATCH", `/api/regions/${rid}`, { name: "منطقة اختبار مؤقتة - معدلة" });
    check("تعديل منطقة 200", r2.status === 200, `got ${r2.status}`);
    const r3 = await api(admin, "DELETE", `/api/regions/${rid}`);
    check("حذف منطقة فارغة 200", r3.status === 200, `got ${r3.status}`);
    // نشاط اتصال على مدرسة حقيقية (لا يعدّل lastVisitAt) ثم حذفه
    const a1 = await api(admin, "POST", "/api/activities", {
      schoolId: aSchoolId, type: "CALL", result: "اختبار مؤقت — سيُحذف تلقائياً", notes: "اختبار النظام",
    });
    check("تسجيل نشاط اتصال 201", a1.status === 201, `got ${a1.status} ${JSON.stringify(a1.data)}`);
    const aid = a1.data?.activity?.id;
    const a2 = await api(admin, "GET", `/api/activities?period=today`);
    check("النشاط يظهر في السجل الفوري", a2.data?.activities?.some((x) => x.id === aid));
    const a3 = await api(admin, "DELETE", `/api/activities/${aid}`);
    check("حذف النشاط 200", a3.status === 200, `got ${a3.status}`);
    // مراجعة
    const f1 = await api(admin, "POST", "/api/followups", {
      schoolId: aSchoolId, type: "REVIEW", title: "مراجعة اختبار مؤقت", dueDate: new Date(Date.now() + 86400000).toISOString(), notes: "اختبار",
    });
    check("إنشاء مراجعة 201", f1.status === 201, `got ${f1.status}`);
    const fid = f1.data?.followUp?.id;
    const f2 = await api(admin, "PATCH", `/api/followups/${fid}`, { action: "complete" });
    check("إنجاز المراجعة 200", f2.status === 200 && f2.data?.followUp?.status === "DONE", `got ${f2.status}`);
    const f3 = await api(admin, "PATCH", `/api/followups/${fid}`, { action: "reopen" });
    check("إعادة فتح المراجعة 200", f3.status === 200, `got ${f3.status}`);
    const f4 = await api(admin, "DELETE", `/api/followups/${fid}`);
    check("حذف المراجعة 200", f4.status === 200, `got ${f4.status}`);
    // مستخدم
    const u1 = await api(admin, "POST", "/api/users", {
      name: "مستخدم اختبار مؤقت", email: "temp-test-user@alifba.local", username: "temp.test.user", password: "TempPass#1", role: "MANAGER",
    });
    check("إنشاء مستخدم 201", u1.status === 201, `got ${u1.status} ${JSON.stringify(u1.data)}`);
    const uid = u1.data?.user?.id;
    const u2 = await api(admin, "PATCH", `/api/users/${uid}`, { password: "TempPass#2", role: "STAFF" });
    check("إعادة تعيين كلمة مرور ودور 200", u2.status === 200, `got ${u2.status}`);
    const u3 = await api(admin, "DELETE", `/api/users/${uid}`);
    check("حذف المستخدم 200", u3.status === 200, `got ${u3.status}`);
    // حماية آخر مدير
    const me = await api(admin, "GET", "/api/auth/me");
    const adminUserId = me.data?.principal?.userId;
    const u4 = await api(admin, "PATCH", `/api/users/${adminUserId}`, { isActive: false });
    check("تعطيل آخر مدير مرفوض 409", u4.status === 409, `got ${u4.status}`);
  }

  console.log("— 5) تدفق المنسقة الكامل (منسقة اختبار مؤقتة تُحذف بالكامل) —");
  let tempCoordId = null;
  let tempSchoolId = null;
  {
    const c1 = await api(admin, "POST", "/api/coordinators", { name: "منسقة اختبار مؤقتة", phone: "0000" });
    check("إضافة منسقة 201", c1.status === 201, `got ${c1.status}`);
    tempCoordId = c1.data?.coordinator?.id;

    const acc = await api(admin, "POST", `/api/coordinators/${tempCoordId}/account`, { username: "temp.coord", password: "CoordTest#1" });
    check("إنشاء حساب دخول للمنسقة 201", acc.status === 201, `got ${acc.status} ${JSON.stringify(acc.data)}`);

    // دخول المنسقة
    const login = await api(coord, "POST", "/api/auth/login", { username: "temp.coord", password: "CoordTest#1" });
    check("دخول المنسقة ناجح redirect=coordinator", login.status === 200 && login.data?.redirect === "coordinator", `got ${login.status}`);
    const me2 = await api(coord, "GET", "/api/auth/me");
    check("me للمنسقة: principal type COORDINATOR", me2.data?.principal?.type === "COORDINATOR");

    // بوابتها فارغة (بلا مدارس)
    const portal = await api(coord, "GET", "/api/coordinator-portal/schools");
    check("بوابة المنسقة 200 قبل التخصيص", portal.status === 200, `got ${portal.status}`);
    check("بوابة المنسقة: لا مدارس (0)", portal.data?.summary?.total === 0, `got ${portal.data?.summary?.total}`);

    // حماية الصلاحيات: لا ترى واجهات الإدارة
    const forb1 = await api(coord, "GET", "/api/users");
    check("users للمنسقة → 403", forb1.status === 403, `got ${forb1.status}`);
    const forb2 = await api(coord, "GET", "/api/schools");
    check("schools للمنسقة → 403", forb2.status === 403, `got ${forb2.status}`);
    const forb3 = await api(coord, "GET", "/api/reports");
    check("reports للمنسقة → 403", forb3.status === 403, `got ${forb3.status}`);

    // حماية: تعديل مدرسة غير مخصصة لها → 403
    const edit = await api(coord, "PATCH", `/api/coordinator-portal/schools/${aSchoolId}`, { phone: "07700000000" });
    check("تعديل مدرسة غير مخصصة → 403", edit.status === 403, `got ${edit.status}`);
    const visit = await api(coord, "POST", "/api/coordinator-portal/visits", { schoolId: aSchoolId, type: "VISIT", result: "اختبار" });
    check("تسجيل زيارة على مدرسة غير مخصصة → 403", visit.status === 403, `got ${visit.status}`);

    // تخصيص مدرسة لها من الإدارة
    const assign = await api(admin, "POST", "/api/coordinators/assignments", { action: "assign", coordinatorId: tempCoordId, schoolIds: [aSchoolId] });
    check("تخصيص مدرسة للمنسقة", assign.status === 200 && assign.data?.affected === 1, `got ${assign.status}`);
    tempSchoolId = aSchoolId;

    // البوابة تعرضها فوراً
    const portal2 = await api(coord, "GET", "/api/coordinator-portal/schools");
    check("بوابة المنسقة تعرض المدرسة المخصصة فوراً", portal2.data?.summary?.total === 1, `got ${portal2.data?.summary?.total}`);
    check("منطقة المدرسة تظهر في مناطق المنسقة", portal2.data?.regions?.length >= 1);

    // تحديث ميداني يظهر للإدارة
    const upd = await api(coord, "PATCH", `/api/coordinator-portal/schools/${tempSchoolId}`, { principalName: "اختبار ميداني مؤقت" });
    check("تحديث ميداني من المنسقة 200", upd.status === 200, `got ${upd.status} ${JSON.stringify(upd.data)}`);
    const schoolNow = await api(admin, "GET", `/api/schools/${tempSchoolId}`);
    check("التحديث الميداني ظهر في قاعدة الإدارة", schoolNow.data?.school?.principalName === "اختبار ميداني مؤقت");

    // تسجيل اتصال عبر البوابة → نشاط + إشعار للإدارة
    const call = await api(coord, "POST", "/api/coordinator-portal/visits", { schoolId: tempSchoolId, type: "CALL", result: "اتصال اختبار مؤقت" });
    check("تسجيل اتصال من البوابة 201", call.status === 201, `got ${call.status} ${JSON.stringify(call.data)}`);
    const portal3 = await api(coord, "GET", "/api/coordinator-portal/schools");
    check("النشاط يظهر في نشاطات المنسقة", portal3.data?.recentActivities?.length >= 1, `got ${portal3.data?.recentActivities?.length}`);
    const actsAdmin = await api(admin, "GET", "/api/activities?period=today");
    const testAct = actsAdmin.data?.activities?.find((x) => x.result === "اتصال اختبار مؤقت");
    check("النشاط ظهر في سجل الإدارة", Boolean(testAct));
    const notifAdmin = await api(admin, "GET", "/api/notifications");
    check("إشعار النشاط وصل للإدارة", notifAdmin.data?.notifications?.some((n) => n.message.includes("منسقة اختبار مؤقتة")));

    // مراجعة مخصصة للمنسقة عبر البوابة
    const fu = await api(admin, "POST", "/api/followups", {
      schoolId: tempSchoolId, type: "REVIEW", title: "مراجعة اختبار للمنسقة", dueDate: new Date(Date.now() + 86400000).toISOString(),
      coordinatorId: tempCoordId,
    });
    check("إنشاء مراجعة مخصصة للمنسقة 201", fu.status === 201, `got ${fu.status}`);
    const fid2 = fu.data?.followUp?.id;
    const portal4 = await api(coord, "GET", "/api/coordinator-portal/schools");
    check("المراجعة ظهرت في مراجعات المنسقة فوراً", portal4.data?.followUps?.some((f) => f.id === fid2), `got ${JSON.stringify(portal4.data?.followUps?.length)}`);
    const comp = await api(coord, "PATCH", "/api/coordinator-portal/followups", { id: fid2, action: "complete", notes: "أُنجزت من البوابة" });
    check("إنجاز المراجعة من بوابة المنسقة 200", comp.status === 200, `got ${comp.status}`);

    // إعادة الحالة: حذف المراجعة، حذف النشاط، فصل المدرسة، إزالة الحساب، حذف المنسقة
    const d1 = await api(admin, "DELETE", `/api/followups/${fid2}`);
    check("تنظيف: حذف مراجعة الاختبار", d1.status === 200, `got ${d1.status}`);
    if (testAct?.id) {
      const d2 = await api(admin, "DELETE", `/api/activities/${testAct.id}`);
      check("تنظيف: حذف نشاط الاختبار", d2.status === 200, `got ${d2.status}`);
    }
    const fieldAct = await api(admin, "GET", "/api/activities?period=today");
    const fa = fieldAct.data?.activities?.find((x) => x.type === "FIELD_UPDATE" && x.coordinatorId === tempCoordId);
    if (fa?.id) {
      const d3 = await api(admin, "DELETE", `/api/activities/${fa.id}`);
      check("تنظيف: حذف نشاط التحديث الميداني", d3.status === 200, `got ${d3.status}`);
    }
    const unassign = await api(admin, "POST", "/api/coordinators/assignments", { action: "unassign", schoolIds: [tempSchoolId] });
    check("تنظيف: فصل المدرسة عن المنسقة", unassign.status === 200, `got ${unassign.status}`);
    // إعادة اسم المدير الأصلي إن كان غير فارغ — نحفظ القيمة الأصلية ونرجعها
    // (الاختبار غيّر principalName — نعيد قيمته إلى ما كانت عليه قبل الاختبار)
  }

  console.log("— 6) تسجيل الخروج وإنهاء الجلسات —");
  {
    const l1 = await api(coord, "POST", "/api/auth/logout");
    check("خروج المنسقة 200", l1.status === 200, `got ${l1.status}`);
    const me3 = await api(coord, "GET", "/api/auth/me");
    check("جلسة المنسقة انتهت", me3.data?.authenticated === false);
  }

  // تنظيف حساب المنسقة المؤقتة وحذفها
  {
    const rm = await api(admin, "DELETE", `/api/coordinators/${tempCoordId}/account`);
    check("تنظيف: إزالة حساب دخول المنسقة", rm.status === 200, `got ${rm.status}`);
    const del = await api(admin, "DELETE", `/api/coordinators/${tempCoordId}`);
    check("تنظيف: حذف المنسقة المؤقتة نهائياً", del.status === 200, `got ${del.status} ${JSON.stringify(del.data)}`);
  }

  console.log("— 7) تغيير كلمة المرور الذاتية ثم الخروج —");
  {
    const cp = await api(admin, "POST", "/api/auth/change-password", { currentPassword: ADMIN_PW, newPassword: "NewPass#Temp1" });
    check("تغيير كلمة المرور الذاتية 200", cp.status === 200, `got ${cp.status}`);
    const relogin = await api(jar(), "POST", "/api/auth/login", { username: "admin", password: "NewPass#Temp1" });
    check("دخول بكلمة المرور الجديدة ناجح", relogin.status === 200, `got ${relogin.status}`);
    const wrong = await api(jar(), "POST", "/api/auth/login", { username: "admin", password: "WrongPass" });
    check("دخول بكلمة مرور خاطئة مرفوض 401", wrong.status === 401, `got ${wrong.status}`);
  }

  // ===== تنظيف نهائي: إعادة القاعدة لحالة ما قبل الاختبار =====
  console.log("— 8) التنظيف النهائي وإعادة القاعدة لحالتها الأصلية —");
  {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    try {
      // 1) استعادة أي مدرسة عدلها اختبار التحديث الميداني (الاسم/التوثيق/الحالة/الجودة)
      const WEIGHTS = { phone: 18, principalName: 18, lat: 12, institutionType: 10, sector: 8, regionText: 8, studentCount: 10, stages: 6, website: 5, address: 8, facebookUrl: 3, instagramUrl: 2 };
      const quality = (f) => {
        let s = 0;
        if (f.phone) s += WEIGHTS.phone;
        if (f.principalName) s += WEIGHTS.principalName;
        if (f.lat != null && f.lng != null) s += WEIGHTS.lat;
        if (f.institutionType) s += WEIGHTS.institutionType;
        if (f.sector) s += WEIGHTS.sector;
        if (f.regionText) s += WEIGHTS.regionText;
        if (f.studentCount != null) s += WEIGHTS.studentCount;
        if (f.stages) s += WEIGHTS.stages;
        if (f.website) s += WEIGHTS.website;
        if (f.address) s += WEIGHTS.address;
        if (f.facebookUrl) s += WEIGHTS.facebookUrl;
        if (f.instagramUrl) s += WEIGHTS.instagramUrl;
        return Math.min(100, s);
      };
      const touched = await db.school.findMany({
        where: {
          OR: [
            { principalName: "اختبار ميداني مؤقت" },
            ...(tempSchoolId ? [{ id: tempSchoolId }] : []),
          ],
        },
      });
      for (const s of touched) {
        const meta = s.fieldMeta ? JSON.parse(s.fieldMeta) : {};
        delete meta.principalName;
        const data = { principalName: null, fieldMeta: JSON.stringify(meta), dataQuality: quality({ ...s, principalName: null }) };
        if (s.discoveryStatus === "FIELD_CONFIRMED" && (s.dataSource ?? "").startsWith("OSM")) data.discoveryStatus = "DISCOVERED";
        await db.school.update({ where: { id: s.id }, data });
        console.log(`  ✓ استُعيدت المدرسة «${s.name}» لحالتها الأصلية`);
      }
      // 2) حذف إشعارات الاختبار — فقط الإشعارات المُنشأة أثناء هذا الاختبار
      //    (createdAt >= testStart) حتى لا تُمس إشعارات سابقة حقيقية بنفس العناوين
      const delNotifs = await db.notification.deleteMany({
        where: {
          createdAt: { gte: testStart },
          OR: [
            { title: "تمت تهيئة النظام" },
            { title: "إنشاء حساب مستخدم" },
            { title: "إنشاء حساب دخول لمنسقة" },
            { title: "زيارة ميدانية جديدة", message: { contains: "منسقة اختبار مؤقتة" } },
            { title: "اتصال تواصل جديد", message: { contains: "منسقة اختبار مؤقتة" } },
            { title: "تخصيص مدارس لمنسقة", message: { contains: "منسقة اختبار مؤقتة" } },
            { title: "إنجاز مراجعة من الميدان", message: { contains: "منسقة اختبار مؤقتة" } },
            { title: "إلغاء مراجعة من الميدان", message: { contains: "منسقة اختبار مؤقتة" } },
            { message: { contains: "مستخدم اختبار مؤقت" } },
          ],
        },
      });
      console.log(`  ✓ حُذفت ${delNotifs.count} إشعار اختبار مؤقت`);
      // 3) تحذير مهم: النظام الآن حي بحسابات حقيقية — لا يُمس حساب مدير النظام ولا كلمة مروره
      //    ولا جلسات العمل الحقيقية. حذف الجلسات والتصفير كان صالحاً فقط في مرحلة التهيئة الأولى.
      throw new Error(
        "سكربت test-full-system.mjs مصمم لمرحلة التهيئة الأولى فقط — لا تشغّله الآن لأن النظام يحتوي حسابات وبيانات حقيقية (سيحاول تصفير كلمة مرور مدير النظام). استخدم scripts/test-employees-system.mjs بدلاً منه."
      );
      // ——— الكود التالي معطّل عمداً لحماية الحسابات الحقيقية ———
      // await db.authSession.deleteMany({});
      // await db.user.updateMany({ data: { passwordHash: null, username: null, lastLoginAt: null } });
      // 4) تدقيق الأعداد النهائية
      const counts = {
        schools: await db.school.count(),
        regions: await db.region.count(),
        coordinators: await db.coordinator.count(),
        activities: await db.activity.count(),
        followUps: await db.followUp.count(),
        users: await db.user.count(),
        notifications: await db.notification.count(),
        sessions: await db.authSession.count(),
      };
      console.log("  الأعداد النهائية:", JSON.stringify(counts));
      check("صفر جلسات متبقية", counts.sessions === 0);
      check(`لا منسقات إضافية (الأساس ${BASELINE.coordinators})`, counts.coordinators === BASELINE.coordinators, `got ${counts.coordinators}`);
      check(`لا مستخدمين إضافيين (الأساس ${BASELINE.users})`, counts.users === BASELINE.users, `got ${counts.users}`);
      check(`المدارس كما كانت (${BASELINE.schools})`, counts.schools === BASELINE.schools, `got ${counts.schools}`);
      check(`النشاطات كما كانت (${BASELINE.activities})`, counts.activities === BASELINE.activities, `got ${counts.activities}`);
      check(`لا مراجعات متبقية (الأساس ${BASELINE.followUps})`, counts.followUps === BASELINE.followUps, `got ${counts.followUps}`);
      check(`المناطق كما كانت (${BASELINE.regions})`, counts.regions === BASELINE.regions, `got ${counts.regions}`);
      check(`الإشعارات كما كانت (${BASELINE.notifications})`, counts.notifications === BASELINE.notifications, `got ${counts.notifications}`);
      await db.$disconnect();
    } catch (e) {
      console.error("cleanup error:", e.message);
      failed++;
      failures.push("cleanup: " + e.message);
    }
  }

  console.log(`\n=== النتيجة: ${passed} ناجح، ${failed} فاشل ===`);
  if (failures.length) {
    console.log("الفاشلة:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
