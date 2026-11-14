// تنظيف بيانات الاختبار المؤقتة — يعيد قاعدة البيانات إلى حالتها الفارغة الأصلية
// (لا يمس حساب مدير النظام ولا إشعار الترحيب ولا نماذج User/Post الأصلية)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const r1 = await db.activity.deleteMany({});
  const r2 = await db.followUp.deleteMany({});
  const r3 = await db.school.deleteMany({});
  const r4 = await db.coordinator.deleteMany({});
  const r5 = await db.region.deleteMany({});
  console.log(
    `حُذفت: أنشطة=${r1.count}، مراجعات=${r2.count}، مدارس=${r3.count}، منسقات=${r4.count}، مناطق=${r5.count}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
