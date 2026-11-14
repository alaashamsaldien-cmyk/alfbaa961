// تجهيز البيئة المعزولة للفحص الوظيفي — دون أي كتابة على قاعدة البيانات الحقيقية
// 1) لقطة نظيفة من القاعدة الحقيقية عبر VACUUM INTO (قراءة فقط من الأصل)
// 2) حقن جلسات اختبار (Admin + Employee) في النسخة المعزولة فقط
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { existsSync, rmSync } from "fs";

const REAL_DB = "file:/home/z/my-project/db/custom.db";
const TEST_DB_PATH = "/home/z/my-project/db/review-isolated.db";
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

// توكنات اختبار ثابتة — النسخة المعزولة فقط (لا تعمل على القاعدة الحقيقية إطلاقاً)
const ADMIN_TOKEN = "69baff624a3e9ae7aa774c34f9d324b97795332345f454ac";
const EMP_TOKEN = "3f431a83ddbbf174f1469471dfdc0eef180629df706cac89";
const EMP2_TOKEN = "9c8afd1ce578296e839b3078d76e64d08687f76627fef577";

async function main() {
  // ——— الخطوة 1: لقطة آمنة من القاعدة الحقيقية ———
  if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
  const real = new PrismaClient({ datasources: { db: { url: REAL_DB } } });
  await real.$queryRawUnsafe(
    `VACUUM INTO '${TEST_DB_PATH}'`
  );
  await real.$disconnect();
  console.log("✅ لقطة معزولة أُنشئت:", TEST_DB_PATH);

  // ——— الخطوة 2: جلسات اختبار في النسخة المعزولة ———
  const db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("لا يوجد مدير في القاعدة");

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.authSession.create({
    data: { token: ADMIN_TOKEN, principalType: "ADMIN", userId: admin.id, expiresAt },
  });
  console.log("✅ جلسة مدير محقونة في النسخة المعزولة (توكن اختبار) — دون أي مساس بكلمة المرور الحقيقية");

  // ملاحظة: جلسة الموظف تُحقن بعد إنشاء الموظفين عبر API الإدارة الحقيقي (اختبار إنشاء موظف نفسه)
  console.log("ADMIN_TOKEN=" + ADMIN_TOKEN);
  console.log("EMP_TOKEN=" + EMP_TOKEN);
  console.log("EMP2_TOKEN=" + EMP2_TOKEN);

  await db.$disconnect();
}

main().catch((e) => {
  console.error("فشل تجهيز البيئة المعزولة:", e);
  process.exit(1);
});
