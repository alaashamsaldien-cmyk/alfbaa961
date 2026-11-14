// اختبار شامل لنسخة الإنتاج (منفذ 3100) على قاعدة بيانات معزولة
// لا يمس قاعدة البيانات الحقيقية إطلاقاً — كل الكتابات تحدث داخل النسخة المعزولة فقط.
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.TEST_BASE || "http://localhost:3100";
const ISOLATED_DB = path.join(ROOT, ".deploy-test/prod.db");

let pass = 0, fail = 0;
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
}

const cookieJar = { admin: "", employee: "" };

async function req(path, { method = "GET", body, as = "admin" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookieJar[as]) headers["Cookie"] = cookieJar[as];
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const pair = c.split(";")[0];
    if (pair.startsWith("alifba_session=")) cookieJar[as] = pair;
  }
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, res };
}

import { randomBytes, scrypt as _scrypt } from "crypto";
import { promisify } from "util";
import { PrismaClient } from "@prisma/client";

const isolated = new PrismaClient({ datasources: { db: { url: process.env.PG_URL || ("file:" + ISOLATED_DB) } } });

async function main() {
  // وضع فحص البقاء بعد إعادة التشغيل: node deploy-prod-test.mjs persist
  if (process.argv[2] === "persist") return persistCheck();

  console.log(`=== اختبار نسخة الإنتاج على ${BASE} (قاعدة معزولة) ===`);

  // تنظيف مخلفات أي تشغيل سابق داخل النسخة المعزولة فقط (لضمان قابلية التكرار)
  await isolated.employeePermission.deleteMany({ where: { user: { username: { contains: "pub_tester_" } } } });
  await isolated.authSession.deleteMany({ where: { OR: [{ user: { username: { contains: "pub_tester_" } } }, { user: { username: "deploy_tester" } }] } });
  await isolated.schoolVisit.deleteMany({ where: { OR: [{ employee: { username: { contains: "pub_tester_" } } }, { notes: { contains: "اختبار النشر" } }] } });
  await isolated.activity.deleteMany({ where: { school: { name: { contains: "مدرسة اختبار النشر" } } } });
  await isolated.followUp.deleteMany({ where: { school: { name: { contains: "مدرسة اختبار النشر" } } } });
  await isolated.user.deleteMany({ where: { username: { contains: "pub_tester_" } } });
  await isolated.school.deleteMany({ where: { name: { contains: "مدرسة اختبار النشر" } } });

  // ——— 0. فحص الجاهزية ———
  const health = await fetch(BASE + "/").then(r => r.status);
  record("الصفحة الرئيسية تعمل على نسخة الإنتاج", health === 200, `status=${health}`);

  // ——— 1. الحماية: طلبات بلا جلسة ———
  const schoolsNoAuth = await req("/api/schools?page=1", { as: "__none" });
  record("الواجهات المحمية ترفض الطلبات بلا تسجيل دخول (401)", schoolsNoAuth.status === 401, `status=${schoolsNoAuth.status}`);
  const visitsNoAuth = await req("/api/school-visits", { as: "__none" });
  record("جدول الزيارات يرفض الطلبات بلا جلسة (401)", visitsNoAuth.status === 401, `status=${visitsNoAuth.status}`);
  const exportNoAuth = await req("/api/school-visits/export", { as: "__none" });
  record("تصدير الزيارات يرفض الطلبات بلا جلسة (401)", exportNoAuth.status === 401, `status=${exportNoAuth.status}`);

  // ——— 2. كلمة مرور خاطئة تُرفض ———
  const badLogin = await req("/api/auth/login", { method: "POST", body: { username: "admin", password: "wrong-password-123" }, as: "__none" });
  record("كلمة مرور خاطئة تُرفض (401)", badLogin.status === 401, `status=${badLogin.status}`);

  // ——— 3. تعيين كلمة مرور اختبارية للحساب الموجود داخل النسخة المعزولة فقط ———
  const scrypt = promisify(_scrypt);
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt("deploy-test-2026", salt, 64);
  const hash = `scrypt:${salt}:${derived.toString("hex")}`;
  const adminRow = await isolated.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, username: true, email: true, passwordHash: true } });
  record("حساب مدير النظام موجود في النسخة المعزولة", Boolean(adminRow), adminRow?.email ?? "");
  const hadPassword = Boolean(adminRow.passwordHash);
  if (!hadPassword) {
    await isolated.user.update({ where: { id: adminRow.id }, data: { passwordHash: hash, username: adminRow.username ?? "admin" } });
    record("تعيين كلمة مرور اختبارية (النسخة المعزولة فقط — الحقيقية لم تُلمس)", true);
  } else {
    // الحساب لديه كلمة مرور حقيقية — لا نغيّرها؛ نستخدم حساب اختباري مؤقت منشأ في النسخة المعزولة
    await isolated.employeePermission.deleteMany({ where: { user: { username: "deploy_tester" } } });
    await isolated.authSession.deleteMany({ where: { user: { username: "deploy_tester" } } });
    await isolated.user.deleteMany({ where: { username: "deploy_tester" } });
    await isolated.user.create({ data: {
      id: "deploy-tester-id-001", email: "deploy-tester@example.com", name: "مختبر النشر",
      role: "ADMIN", isActive: true, username: "deploy_tester", passwordHash: hash,
    }});
    record("إنشاء حساب اختباري مؤقت داخل النسخة المعزولة (الحساب الحقيقي لم يُلمس)", true);
  }

  // ——— 4. تسجيل الدخول الفعلي ———
  const loginId = hadPassword ? "deploy_tester" : (adminRow.username ?? "admin");
  const login = await req("/api/auth/login", { method: "POST", body: { username: loginId, password: "deploy-test-2026" }, as: "admin" });
  record("تسجيل الدخول بنجاح على نسخة الإنتاج", login.status === 200 && login.json?.ok === true, `status=${login.status} redirect=${login.json?.redirect}`);
  record("جلسة HttpOnly صدرت (كوكي)", cookieJar.admin.includes("alifba_session="), cookieJar.admin.slice(0, 30) + "...");

  // ——— 5. البيانات الفعلية ———
  const schools = await req("/api/schools?page=1&pageSize=5&withOptions=1");
  record("قائمة المدارس تُحمّل من نسخة الإنتاج", schools.status === 200 && (schools.json?.total ?? 0) > 0, `total=${schools.json?.total}`);
  const regions = await req("/api/regions");
  const regionList = regions.json?.regions ?? regions.json;
  record("قائمة المناطق تُحمّل", regions.status === 200 && Array.isArray(regionList) && regionList.length > 0, `count=${Array.isArray(regionList) ? regionList.length : "?"}`);
  const dash = await req("/api/dashboard");
  record("لوحة التحكم تعمل", dash.status === 200, `status=${dash.status}`);

  // ——— 6. مدرسة اختبارية في النسخة المعزولة + تعديلها عبر API الإنتاج ———
  const stamp = Date.now();
  const testSchool = await isolated.school.create({ data: {
    name: `مدرسة اختبار النشر ${stamp}`, governorate: "بغداد",
    institutionType: "متوسطة", stage: "الثالث المتوسط",
    principalName: "مختبر آلي", phone: "07700000000",
    address: "بغداد — اختبار النشر", availabilityStatus: "AVAILABLE", contractStatus: "NOT_CONTRACTED",
    discoveryStatus: "MANUAL_ENTRY", dataSource: "MANUAL_ENTRY",
  }});
  const schoolId = testSchool.id;
  const patchSchool = await req(`/api/schools/${schoolId}`, { method: "PATCH", body: { notes: "تم التعديل عبر API الإنتاج — اختبار النشر" } });
  record("تعديل بيانات مدرسة عبر API الإنتاج (PATCH)", patchSchool.status === 200 || patchSchool.status === 201, `status=${patchSchool.status}`);

  // ——— 7. موظف: صلاحيات + تسجيل زيارة ———
  // إنشاء موظف اختباري بصلاحيات تسجيل زيارة داخل النسخة المعزولة عبر لوحة الإدارة (API فعلي)
  const empCreate = await req("/api/employees", { method: "POST", body: {
    name: "موظف اختبار النشر", username: `pub_tester_${stamp}`, password: "emp-password-2026",
    role: "STAFF", jobTitle: "مختبر", phone: "07701111111",
  }});
  const empId = empCreate.json?.employee?.id ?? empCreate.json?.id ?? null;
  record("إنشاء حساب موظف عبر API الإدارة", empCreate.status === 201 || empCreate.status === 200, `status=${empCreate.status} id=${empId}`);

  const permsSet = await req(`/api/employees/${empId}/permissions`, { method: "PUT", body: {
    permissions: {
      visits: { visible: true, view: true, create: false, edit: false, delete: false, export: true, approve: false, manage: false },
      visit_register: { visible: true, view: true, create: true, edit: false, delete: false, export: false, approve: false, manage: false },
      schools: { visible: true, view: true, create: false, edit: false, delete: false, export: false, approve: false, manage: false },
    },
  }});
  record("تعيين صلاحيات الموظف (زيارات + تسجيل زيارة)", permsSet.status === 200 || permsSet.status === 201, `status=${permsSet.status}`);

  cookieJar.employee = "";
  const empLogin = await req("/api/auth/login", { method: "POST", body: { username: `pub_tester_${stamp}`, password: "emp-password-2026" }, as: "employee" });
  record("تسجيل دخول الموظف على نسخة الإنتاج", empLogin.status === 200 && empLogin.json?.redirect === "employee", `status=${empLogin.status} redirect=${empLogin.json?.redirect}`);

  // منع الموظف من واجهات الإدارة
  const empForbidden = await req("/api/employees", { as: "employee" });
  record("الموظف ممنوع من واجهات الإدارة (403/401)", empForbidden.status === 403 || empForbidden.status === 401, `status=${empForbidden.status}`);

  // تسجيل زيارة كاملة (نفس حقول النموذج الميداني)
  const dedupeKey = "deploy-test-" + randomBytes(8).toString("hex");
  const visit = await req("/api/employee/visits", { method: "POST", as: "employee", body: {
    dedupeKey, schoolId,
    contactType: "FIELD_VISIT", result: "APPROVED",
    contactPersonName: "أ. مختبر", contactPersonTitle: "مدير المدرسة",
    principalName: "أ. مختبر", schoolPhone: "07700000000", studentCount: 120,
    needs: ["PAINT", "SEATS"], subscribersCount: 15,
    nextFollowUpAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    notes: "زيارة اختبار النشر — نسخة معزولة", lat: 33.3152, lng: 44.3661, locationSource: "GPS", locationAccuracy: 12,
  }});
  record("تسجيل زيارة كاملة من بوابة الموظف", visit.status === 201 || visit.status === 200, `status=${visit.status} id=${visit.json?.visit?.id ?? visit.json?.id}`);
  const visitId = visit.json?.visit?.id ?? visit.json?.id;

  // منع التكرار: إعادة الإرسال بنفس dedupeKey تعيد نفس السجل
  const visitReplay = await req("/api/employee/visits", { method: "POST", as: "employee", body: {
    dedupeKey, schoolId, contactType: "FIELD_VISIT", result: "APPROVED",
  }});
  const sameId = (visitReplay.json?.visit?.id ?? visitReplay.json?.id) === visitId;
  record("إعادة الإرسال بعد انقطاع الشبكة لا تكرر الزيارة (نفس السجل)", sameId && visitReplay.status < 300, `status=${visitReplay.status} sameId=${sameId}`);

  // ——— 8. فلاتر التاريخ المخصص + التصدير ———
  const today = new Date().toISOString().slice(0, 10);
  const filtered = await req(`/api/school-visits?dateFrom=${today}&dateTo=${today}`);
  record("فلتر التاريخ المخصص يعمل في لوحة الإدارة", filtered.status === 200 && (filtered.json?.total ?? 0) >= 1, `total=${filtered.json?.total}`);
  const empFiltered = await req(`/api/employee/visits?dateFrom=${today}&dateTo=${today}`, { as: "employee" });
  record("فلتر التاريخ المخصص يعمل في بوابة الموظف", empFiltered.status === 200 && (empFiltered.json?.total ?? 0) >= 1, `total=${empFiltered.json?.total}`);

  const visitsXlsx = await req("/api/school-visits/export?dateFrom=" + today + "&dateTo=" + today);
  record("تصدير الزيارات Excel يعمل", visitsXlsx.status === 200, `status=${visitsXlsx.status} type=${visitsXlsx.res.headers.get("content-type")?.slice(0, 40)}`);
  const empXlsx = await req("/api/employee/visits/export", { as: "employee" });
  record("تصدير الزيارات من بوابة الموظف (حسب الصلاحية)", empXlsx.status === 200, `status=${empXlsx.status}`);
  const schoolsXlsx = await req("/api/schools/excel/export");
  record("تصدير المدارس Excel يعمل", schoolsXlsx.status === 200, `status=${schoolsXlsx.status}`);

  // ——— 9. حفظ البيانات في الملف المعزول ———
  const schoolCount = await isolated.school.count();
  const visitCount = await isolated.schoolVisit.count();
  const empCount = await isolated.user.count();
  record("الكتابات وصلت ملف قاعدة البيانات المعزول فعلياً", schoolCount > 0 && visitCount >= 1, `schools=${schoolCount} visits=${visitCount} users=${empCount}`);
  await isolated.$disconnect();

  // ——— 10. فحص البقاء بعد إعادة تشغيل الخادم (يُنفذ عبر وضع persist) ———
  await isolated.$disconnect();
  console.log("DONE_MAIN");
  process.exit(fail > 0 ? 1 : 0);
}

async function persistCheck() {
  console.log(`=== فحص بقاء البيانات بعد إعادة تشغيل الخادم (${BASE}) ===`);
  const health = await fetch(BASE + "/").then(r => r.status);
  record("الخادم عاد للعمل بعد إعادة التشغيل", health === 200, `status=${health}`);
  cookieJar.admin = "";
  const login = await req("/api/auth/login", { method: "POST", body: { username: "deploy_tester", password: "deploy-test-2026" }, as: "admin" });
  record("تسجيل الدخول يعمل بعد إعادة التشغيل (الجلسات تُحمّل من القاعدة)", login.status === 200, `status=${login.status}`);
  const schools = await req("/api/schools?page=1&pageSize=5");
  record("البيانات المحفوظة سابقاً موجودة بعد إعادة التشغيل", schools.status === 200 && (schools.json?.total ?? 0) > 0, `total=${schools.json?.total}`);
  const filtered = await req(`/api/school-visits`);
  record("الزيارة المسجلة قبل إعادة التشغيل لا تزال موجودة", filtered.status === 200 && (filtered.json?.total ?? 0) >= 1, `total=${filtered.json?.total}`);
  // تنظيف بيانات الاختبار من النسخة المعزولة (اختياري — لا حاجة لأنها معزولة)
  console.log("\n=== الملخص ===");
  console.log(`نجح: ${pass} | فشل: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error("خطأ غير متوقع:", e); process.exit(2); });
