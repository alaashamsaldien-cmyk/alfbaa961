// ——— اختبار عملي شامل لميزة اكتشاف المدارس ———
// يفحص: الإضافة الفردية والدفعية، منع التكرار، الإحداثيات، الفلاتر،
// المنسقات والصلاحيات، وبوابة المنسقة. بيانات حقيقية فقط من نتائج Nominatim.
const BASE = "http://localhost:3000";

async function jfetch(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { failed++; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

async function main() {
  // 1) بحث حقيقي في نطاق الكرادة
  const search = await jfetch("/api/schools/discovery/search", {
    method: "POST",
    body: JSON.stringify({
      provider: "OSM", mode: "AREA", governorate: "بغداد", areaName: "الكرادة",
      bounds: { west: 44.385, south: 33.285, east: 44.445, north: 33.335 },
    }),
  });
  check("بحث الاكتشاف يعمل", search.ok && Array.isArray(search.body.items), `${search.body.items?.length ?? 0} نتيجة`);
  const items = search.body.items;
  check("النتائج مؤسسات تعليمية فقط", items.every(i =>
    ["SCHOOL","KINDERGARTEN","COLLEGE_INSTITUTE","UNIVERSITY","TRAINING_CENTER","LANGUAGE_CENTER","OTHER_EDU"].includes(i.place.institutionType)
  ));

  // 2) إضافة مدرسة واحدة — نختار نتيجة غير موجودة في النظام (أي مكرر يُرفض تلقائياً)
  const one = items.find(i => !i.inSystem && i.similarCandidates.length === 0) ?? items.find(i => !i.inSystem);
  const saveOne = await jfetch("/api/schools/discovery/save", {
    method: "POST",
    body: JSON.stringify({ provider: "OSM", mode: "AREA", governorate: "بغداد", areaName: "الكرادة", resultCount: items.length, place: one.place }),
  });
  check("إضافة مدرسة واحدة", saveOne.ok && saveOne.body.addedCount === 1, `جلسة: ${saveOne.body.sessionId?.slice(0,8)}`);
  const savedId = saveOne.body.items?.find(s => s.state === "SAVED")?.schoolId;

  // 3) إعادة إضافة نفس المدرسة → مكرر
  const saveDup = await jfetch("/api/schools/discovery/save", {
    method: "POST",
    body: JSON.stringify({ provider: "OSM", mode: "AREA", governorate: "بغداد", resultCount: items.length, place: one.place }),
  });
  check("منع التكرار: إعادة الإضافة تُرفض", saveDup.ok && saveDup.body.duplicateCount === 1 && saveDup.body.addedCount === 0, saveDup.body.items?.[0]?.reason ?? "");

  // 4) إضافة عدة مدارس دفعة واحدة (5 مدارس جديدة غير المكررة)
  const batch = items.filter(i => !i.inSystem && i.place.providerRef !== one.place.providerRef && i.similarCandidates.length === 0).slice(0, 6);
  const saveBatch = await jfetch("/api/schools/discovery/save", {
    method: "POST",
    body: JSON.stringify({ provider: "OSM", mode: "AREA", governorate: "بغداد", areaName: "الكرادة", resultCount: items.length, places: batch.map(i => i.place) }),
  });
  const batchAdded = saveBatch.body.addedCount ?? 0;
  const batchDup = saveBatch.body.duplicateCount ?? 0;
  check("إضافة عدة مدارس دفعة واحدة", saveBatch.ok && batchAdded >= 1, `أُضيف ${batchAdded}، مكرر ${batchDup}، مراجعة ${saveBatch.body.reviewCount ?? 0}`);

  // 5) التحقق من الإحداثيات وبيانات التوثيق في القاعدة
  const list = await jfetch("/api/schools?pageSize=200");
  const schools = list.body.schools;
  check("المدارس في جدول الإدارة", list.ok && list.body.total >= batchAdded + 1, `${list.body.total} مدرسة`);
  const withCoords = schools.filter(s => s.hasCoords);
  check("كل مدرسة مضافة لها إحداثيات محفوظة", withCoords.length === schools.length, `${withCoords.length}/${schools.length}`);
  const sample = schools.find(s => s.id === savedId);
  check("بيانات التوثيق لكل حقل (المصدر+التاريخ+الحالة)", sample && sample.fieldMeta && sample.fieldMeta.name?.source === "OSM" && sample.fieldMeta.lat?.collectedAt, `حالة التوثيق: ${sample?.discoveryStatus}`);
  check("درجة الاكتمال محسوبة", sample?.dataQuality > 0, `درجة: ${sample?.dataQuality}%`);
  check("رابط Google Maps محفوظ", sample?.mapsUrl?.includes("google.com/maps"), sample?.mapsUrl?.slice(0, 60));

  // 6) إعادة البحث → النتائج المضافة تُعلّم «في النظام»
  const reSearch = await jfetch("/api/schools/discovery/search", {
    method: "POST",
    body: JSON.stringify({ provider: "OSM", mode: "AREA", governorate: "بغداد", areaName: "الكرادة", bounds: { west: 44.385, south: 33.285, east: 44.445, north: 33.335 } }),
  });
  const inSystemCount = reSearch.body.items?.filter(i => i.inSystem).length ?? 0;
  check("إعادة البحث تعرف السجلات المضافة (تجنب إعادة الاكتشاف)", inSystemCount >= batchAdded + 1, `${inSystemCount} مسجلة مسبقاً`);

  // 7) الفلاتر الشاملة
  const f1 = await jfetch("/api/schools?hasPhone=1");
  check("فلتر: وجود رقم هاتف", f1.ok && f1.body.total >= 1, `${f1.body.total} مدرسة بهاتف`);
  const f2 = await jfetch("/api/schools?hasLocation=1&governorate=بغداد");
  check("فلتر: وجود موقع + محافظة", f2.ok && f2.body.total >= 1, `${f2.body.total}`);
  const f3 = await jfetch("/api/schools?hasPrincipal=1");
  check("فلتر: وجود اسم مدير (يجب أن يكون 0 حالياً)", f3.ok && f3.body.total === 0, `${f3.body.total}`);
  const f4 = await jfetch("/api/schools?verificationStatus=DISCOVERED");
  check("فلتر: حالة توثيق «مكتشفة»", f4.ok && f4.body.total >= 1, `${f4.body.total}`);
  const f5 = await jfetch("/api/schools?dataSource=OSM_NOMINATIM");
  check("فلتر: مصدر السجل", f5.ok && f5.body.total >= 1, `${f5.body.total}`);

  // 8) المنسقات: إضافة → تخصيص → بوابة → تحديث ميداني → عكس على الإدارة
  const co = await jfetch("/api/coordinators", {
    method: "POST",
    body: JSON.stringify({ name: "زينب العبيدي", phone: "07700000000" }),
  });
  check("إضافة منسقة", co.ok || co.body.error?.includes("بنفس الاسم"), "");
  const coList = await jfetch("/api/coordinators");
  const coordinator = coList.body.coordinators[0];
  check("قائمة المنسقات", coordinator?.name === "زينب العبيدي", `${coList.body.coordinators.length} منسقة`);

  const assignIds = schools.slice(0, 3).map(s => s.id);
  const assign = await jfetch("/api/coordinators/assignments", {
    method: "POST",
    body: JSON.stringify({ action: "assign", coordinatorId: coordinator.id, schoolIds: assignIds }),
  });
  check("تخصيص 3 مدارس للمنسقة", assign.ok && assign.body.affected === 3, `المنسقة: ${assign.body.coordinatorName}`);

  // إعادة جلب عدد المدارس المخصصة بعد التخصيص
  const coFresh = (await jfetch("/api/coordinators")).body.coordinators.find(c => c.id === coordinator.id);
  const portal = await jfetch(`/api/coordinator-portal/schools?coordinatorId=${coordinator.id}`);
  check("المدارس المخصصة تظهر في حساب المنسقة", portal.ok && portal.body.schools.length === coFresh.schoolCount, `في البوابة: ${portal.body.schools.length} · في قائمة المنسقات: ${coFresh.schoolCount}`);

  // تحديث ميداني — سيُستعاد لاحقاً إلى الحالة الأصلية
  const target = portal.body.schools.find(s => s.phone === null && s.principalName === null) ?? portal.body.schools[0];
  const update = await jfetch(`/api/coordinator-portal/schools/${target.id}`, {
    method: "PATCH",
    body: JSON.stringify({ coordinatorId: coordinator.id, phone: "+9647701111222", principalName: "مدير مؤقت للاختبار" }),
  });
  check("المنسقة تحدث بيانات مدرسة مخصصة لها", update.ok, `حالة التوثيق بعد التحديث: ${update.body.school?.discoveryStatus}`);
  const updatedMeta = update.body.school?.fieldMeta?.phone;
  check("توثيق التحديث الميداني (مصدر + حالة مؤكدة)", updatedMeta?.source === "COORDINATOR_FIELD" && updatedMeta?.verificationStatus === "FIELD_CONFIRMED", "");
  const adminAfter = await jfetch(`/api/schools?hasPhone=1`);
  check("التحديث الميداني يظهر فوراً في لوحة الإدارة", adminAfter.body.total >= 1, `${adminAfter.body.total} مدرسة بهاتف`);

  // الصلاحيات: تعديل مدرسة غير مخصصة → مرفوض
  const notAssigned = schools.find(s => !assignIds.includes(s.id));
  const forbidden = await jfetch(`/api/coordinator-portal/schools/${notAssigned.id}`, {
    method: "PATCH",
    body: JSON.stringify({ coordinatorId: coordinator.id, phone: "hacked" }),
  });
  check("منع المنسقة من تعديل مدرسة غير مخصصة لها (403)", forbidden.status === 403, "");

  // تسجيل زيارة من المنسقة
  const visit = await jfetch("/api/coordinator-portal/visits", {
    method: "POST",
    body: JSON.stringify({ schoolId: target.id, coordinatorId: coordinator.id, result: "نتيجة اختبار زيارة", notes: "اختبار آلي" }),
  });
  check("تسجيل زيارة من المنسقة (تحديث lastVisitAt)", visit.ok, "");
  const visitSchool = (await jfetch(`/api/schools?hasLocation=1`)).body.schools.find(s => s.id === target.id);
  check("آخر زيارة انعكست على جدول الإدارة", visitSchool?.lastVisitAt !== null, "");

  // استعادة بيانات المدرسة لما كانت عليه قبل اختبار التحديث (حفاظاً على النظام من بيانات اختبار)
  const revert = await jfetch(`/api/coordinator-portal/schools/${target.id}`, {
    method: "PATCH",
    body: JSON.stringify({ coordinatorId: coordinator.id, phone: null, principalName: null }),
  });
  check("استعادة البيانات إلى حالتها قبل اختبار التحديث", revert.ok && revert.body.school.phone === null, "");

  // 9) إحصائيات اللوحة متسقة مع عدد المدارس الفعلي
  const dash = await jfetch("/api/dashboard?period=all");
  check("إجمالي المدارس في اللوحة = القاعدة الفعلية", dash.body.stats?.total === list.body.total, `${dash.body.stats?.total}`);

  console.log(`\n========== النتيجة: ${passed} نجاح، ${failed} فشل ==========`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("خطأ غير متوقع:", e); process.exit(1); });
