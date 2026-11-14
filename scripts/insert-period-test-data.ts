// بيانات اختبار إضافية للفلتر الزمني — أنشطة بأعمار مختلفة (اليوم / قبل 3 أيام / قبل 40 يوماً)
// تُضاف بعد insert-test-data.ts وتُحذف بالكامل عبر cleanup-test-data.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const schools = await db.school.findMany();
  const byName = new Map(schools.map((s) => [s.name, s.id]));
  const amal = byName.get("مدرسة الأمل الثانوية");
  const salam = byName.get("مدرسة السلام للبنات");
  const noor = byName.get("مدرسة النور الابتدائية");
  if (!amal || !salam || !noor) throw new Error("بيانات الاختبار الأساسية غير موجودة");

  await db.activity.createMany({
    data: [
      // قبل 3 أيام — يدخل في "آخر 7 أيام" و"آخر 30 يوماً" فقط
      { type: "VISIT", schoolId: salam, occurredAt: new Date(now - 3 * DAY), result: "زيارة قبل 3 أيام" },
      { type: "CALL", schoolId: noor, occurredAt: new Date(now - 3 * DAY), result: "اتصال قبل 3 أيام" },
      // قبل 40 يوماً — يدخل في "كل الفترات" فقط
      { type: "VISIT", schoolId: amal, occurredAt: new Date(now - 40 * DAY), result: "زيارة قديمة قبل 40 يوماً" },
    ],
  });
  console.log("تم إدخال أنشطة اختبار الفلتر الزمني (3 أنشطة: 2 قبل 3 أيام + 1 قبل 40 يوماً)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
