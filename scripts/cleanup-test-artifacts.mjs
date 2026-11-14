// تنظيف آثار الاختبار المعلنة صراحةً من الجلسات السابقة — لا يمس البيانات الحقيقية
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  // 1) أنشطة الاختبار المعلنة («نتيجة اختبار زيارة» وتحديثات الميدان من جلسة الاختبار 18:53-18:59 يوم 13 تشرين الثاني)
  const delActs = await p.activity.deleteMany({
    where: {
      OR: [
        { result: { contains: "اختبار" } },
        { notes: { contains: "اختبار" } },
        { result: { startsWith: "تحديث ميداني للحقول" } },
      ],
    },
  });
  console.log("deleted test activities:", delActs.count);

  // 2) سجل الاستيراد المُعلن أنه اختباري («سجل حقيقي من OpenStreetMap لاختبار الاستيراد»)
  const delSchools = await p.school.deleteMany({
    where: { notes: { contains: "لاختبار الاستيراد" } },
  });
  console.log("deleted import-test records:", delSchools.count);

  const counts = {
    schools: await p.school.count(),
    activities: await p.activity.count(),
    coordinators: await p.coordinator.count(),
    notifications: await p.notification.count(),
    importLogs: await p.importLog.count(),
  };
  console.log("remaining counts:", JSON.stringify(counts));
}
main().finally(() => p.$disconnect());
