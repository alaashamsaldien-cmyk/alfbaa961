// بيانات اختبار مؤقتة للتحقق من أن إحصائيات اللوحة مرتبطة فعلياً بقاعدة البيانات.
// تُحذف بالكامل بعد التحقق عبر scripts/cleanup-test-data.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const now = new Date();

async function main() {
  // تنظيف أي بيانات اختبار سابقة قبل الإدراج
  await db.activity.deleteMany({});
  await db.followUp.deleteMany({});
  await db.school.deleteMany({});
  await db.coordinator.deleteMany({});
  await db.region.deleteMany({});

  const north = await db.region.create({ data: { name: "المنطقة الشمالية" } });
  const middle = await db.region.create({ data: { name: "المنطقة الوسطى" } });

  const sara = await db.coordinator.create({ data: { name: "سارة محمد", phone: "07700000001" } });
  const ahmad = await db.coordinator.create({ data: { name: "أحمد خالد", phone: "07700000002" } });

  // أربع مدارس بتوليفات مختلفة من الحالات الثلاث المستقلة
  const noor = await db.school.create({
    data: {
      name: "مدرسة النور الابتدائية",
      governorate: "بغداد",
      regionId: north.id,
      institutionType: "حكومية",
      stage: "ابتدائي",
      principalName: "أ. هدى عبد الله",
      phone: "07701111111",
      address: "بغداد - الأعظمية",
      availabilityStatus: "AVAILABLE",
      contractStatus: "CONTRACTED",
      platformName: "منصة تجريبية أ",
      coordinatorId: sara.id,
    },
  });
  const amal = await db.school.create({
    data: {
      name: "مدرسة الأمل الثانوية",
      governorate: "بغداد",
      regionId: north.id,
      institutionType: "حكومية",
      stage: "ثانوي",
      availabilityStatus: "AVAILABLE",
      contractStatus: "NOT_CONTRACTED",
      lastVisitAt: now, // مدرسة تمت زيارتها
    },
  });
  const farouq = await db.school.create({
    data: {
      name: "مدرسة الفاروق المتوسطة",
      governorate: "الموصل",
      regionId: middle.id,
      availabilityStatus: "UNAVAILABLE", // غير متاحة + غير متعاقدة
      contractStatus: "NOT_CONTRACTED",
      coordinatorId: sara.id,
    },
  });
  const salam = await db.school.create({
    data: {
      name: "مدرسة السلام للبنات",
      governorate: "بغداد",
      regionId: middle.id,
      availabilityStatus: "AVAILABLE",
      contractStatus: "CONTRACTED",
      coordinatorId: ahmad.id,
    },
  });

  // أنشطة اليوم: زيارة، اتصال، موافقة أولية، تعاقد
  const admin = await db.user.findFirst();
  await db.activity.createMany({
    data: [
      { type: "VISIT", schoolId: amal.id, coordinatorId: sara.id, occurredAt: now, result: "استقبال جيد ورغبة بالتعاقد" },
      { type: "CALL", schoolId: noor.id, coordinatorId: sara.id, occurredAt: now, result: "تم تحديد موعد زيارة" },
      { type: "INITIAL_APPROVAL", schoolId: salam.id, coordinatorId: ahmad.id, occurredAt: now, result: "موافقة أولية على الانضمام" },
      { type: "CONTRACT", schoolId: noor.id, coordinatorId: sara.id, userId: admin?.id ?? null, occurredAt: now, result: "تم توقيع اتفاقية التعاقد" },
    ],
  });

  // مراجعة مستحقة اليوم، مراجعة متأخرة، متابعة قادمة
  // حدود اليوم تُحسب بتوقيت بغداد (UTC+3) كما يفعل التطبيق في src/lib/time.ts
  const nowBaghdadKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [yy, mm, dd] = nowBaghdadKey.split("-").map(Number);
  const baghdadDayStartUtc = new Date(Date.UTC(yy, mm - 1, dd) - 3 * 60 * 60 * 1000);
  const todayEndBaghdad = new Date(baghdadDayStartUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

  await db.followUp.createMany({
    data: [
      { type: "REVIEW", schoolId: noor.id, coordinatorId: sara.id, dueDate: new Date(todayEndBaghdad.getTime() - 2 * 60 * 60 * 1000), title: "مراجعة أوراق التعاقد" },
      { type: "REVIEW", schoolId: farouq.id, coordinatorId: sara.id, dueDate: new Date(baghdadDayStartUtc.getTime() - 2 * 24 * 60 * 60 * 1000 + 1), title: "مراجعة حالة التوفر" },
      { type: "FOLLOW_UP", schoolId: amal.id, coordinatorId: sara.id, dueDate: new Date(baghdadDayStartUtc.getTime() + 3 * 24 * 60 * 60 * 1000), title: "متابعة إرسال عرض السعر" },
    ],
  });

  console.log("تم إدخال بيانات الاختبار بنجاح");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
