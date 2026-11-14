#!/usr/bin/env node
/** تنظيف نهائي دقيق: يعيد قاعدة البيانات لحالتها التي كانت عليها قبل الاختبار الشامل
 *  1) استعادة المدرسة المستخدمة في اختبار التحديث الميداني (الاسم/التوثيق/الحالة/درجة الجودة)
 *  2) حذف إشعارات الاختبار، الجلسات، وإعادة حساب مدير النظام لحالة ما قبل التهيئة
 *  3) تدقيق أعداد نهائية مطابقة للأصل
 */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

// نفس أوزان وأسلوب computeDataQuality من src/lib/geo/normalize.ts حرفياً
const WEIGHTS = { phone: 18, principalName: 18, lat: 12, institutionType: 10, sector: 8, regionText: 8, studentCount: 10, stages: 6, website: 5, address: 8, facebookUrl: 3, instagramUrl: 2 };
function computeDataQuality(f) {
  let s = 0;
  if (f.phone) s += WEIGHTS.phone;
  if (f.principalName) s += WEIGHTS.principalName;
  if (f.lat !== null && f.lat !== undefined && f.lng !== null && f.lng !== undefined) s += WEIGHTS.lat;
  if (f.institutionType) s += WEIGHTS.institutionType;
  if (f.sector) s += WEIGHTS.sector;
  if (f.regionText) s += WEIGHTS.regionText;
  if (f.studentCount !== null && f.studentCount !== undefined) s += WEIGHTS.studentCount;
  if (f.stages) s += WEIGHTS.stages;
  if (f.website) s += WEIGHTS.website;
  if (f.address) s += WEIGHTS.address;
  if (f.facebookUrl) s += WEIGHTS.facebookUrl;
  if (f.instagramUrl) s += WEIGHTS.instagramUrl;
  return Math.min(100, s);
}

(async () => {
  // 1) استعادة أي مدرسة تعدلها المنسقة الاختبارية (باسم الاختبار أو توثيق الاختبار)
  const candidates = await db.school.findMany({
    where: {
      OR: [
        { principalName: "اختبار ميداني مؤقت" },
        { notes: { contains: "اختبار ميداني" } },
      ],
    },
  });
  for (const s of candidates) {
    const meta = s.fieldMeta ? JSON.parse(s.fieldMeta) : {};
    delete meta.principalName; // إزالة توثيق الاختبار فقط
    const isOsm = (s.dataSource ?? "").startsWith("OSM");
    const data = { principalName: null, fieldMeta: JSON.stringify(meta) };
    // حالة الاكتشاف: كانت DISCOVERED لمدارس OSM قبل أن يحولها التعديل الميداني إلى FIELD_CONFIRMED
    if (s.discoveryStatus === "FIELD_CONFIRMED" && isOsm) data.discoveryStatus = "DISCOVERED";
    data.dataQuality = computeDataQuality({ ...s, principalName: null });
    await db.school.update({ where: { id: s.id }, data });
    console.log(`✓ استُعيدت المدرسة «${s.name}»: principalName=null, status=${data.discoveryStatus ?? s.discoveryStatus}, quality=${data.dataQuality}`);
  }

  // 2) حذف إشعارات الاختبار (عناوين/رسائل الاختبار فقط)
  const del = await db.notification.deleteMany({
    where: {
      OR: [
        { title: "تمت تهيئة النظام" },
        { title: "إنشاء حساب مستخدم" },
        { title: "إنشاء حساب دخول لمنسقة" },
        { title: "تخصيص مدارس لمنسقة", message: { contains: "منسقة اختبار مؤقتة" } },
        { title: "زيارة ميدانية جديدة", message: { contains: "منسقة اختبار مؤقتة" } },
        { title: "اتصال تواصل جديد", message: { contains: "منسقة اختبار مؤقتة" } },
        { title: "إنجاز مراجعة من الميدان", message: { contains: "منسقة اختبار مؤقتة" } },
        { title: "إلغاء مراجعة من الميدان", message: { contains: "منسقة اختبار مؤقتة" } },
        { message: { contains: "مستخدم اختبار مؤقت" } },
      ],
    },
  });
  console.log(`✓ حُذفت ${del.count} إشعار اختبار`);

  // 3) حذف كل جلسات الاختبار
  const delS = await db.authSession.deleteMany({});
  console.log(`✓ حُذفت ${delS.count} جلسة`);

  // 4) إعادة حساب مدير النظام لحالة ما قبل التهيئة
  await db.user.updateMany({ data: { passwordHash: null, username: null, lastLoginAt: null } });
  console.log("✓ حساب مدير النظام عاد لحالة التهيئة الأولى");

  // 5) تدقيق الأعداد النهائية
  const counts = {
    schools: await db.school.count(),
    regions: await db.region.count(),
    coordinators: await db.coordinator.count(),
    activities: await db.activity.count(),
    followUps: await db.followUp.count(),
    users: await db.user.count(),
    notifications: await db.notification.count(),
    sessions: await db.authSession.count(),
    coordinatorsWithAccount: await db.coordinator.count({ where: { passwordHash: { not: null } } }),
  };
  console.log("الأعداد النهائية:", JSON.stringify(counts));
  const expected = { schools: 38, regions: 21, coordinators: 1, activities: 16, followUps: 0, users: 1, sessions: 0, coordinatorsWithAccount: 0 };
  let ok = true;
  for (const [k, v] of Object.entries(expected)) {
    if (counts[k] !== v) { console.log(`✗ ${k}: متوقع ${v}، فعلي ${counts[k]}`); ok = false; }
  }
  console.log(ok ? "=== القاعدة مطابقة تماماً لحالتها قبل الاختبار ===" : "=== توجد فروق تحتاج مراجعة ===");
  await db.$disconnect();
  process.exit(ok ? 0 : 1);
})();
