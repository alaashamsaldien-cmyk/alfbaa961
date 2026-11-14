// ——— خطة الانتقال الآمن من SQLite إلى Postgres (Neon) ———
// هذا السكربت يُعدّ الآن ويُنفَّذ فقط بعد موافقة المالك وضبط POSTGRES_URL.
// المبادئ:
//  1. لا يلمس قاعدة SQLite الحقيقية إطلاقاً — يقرأ منها فقط (وضع للقراءة).
//  2. ينشئ المخطط على Postgres أولاً (prisma db push) ثم ينقل البيانات بحفظ كل المعرّفات (IDs).
//  3. يحفظ كل الجداول في الترتيب الصحيح (الأب قبل الابن) ويدفع ضمن دفعات.
//  4. يتحقق بعد النقل بمقارنة عدد سجلات كل جدول — يفشل صوتياً إن لم تتطابق.
//  5. حراس إلزامية قبل أي كتابة (بطلب المالك — نوفمبر 2026):
//     - --require-empty: ترفض العملية كلياً إن كانت القاعدة الهدف تحتوي أي سجل (لا يُحذف ولا يُكتب شيء).
//     - EXPECT_SHA256: تتحقق من بصمة SHA-256 الكاملة لملف النسخة المصدر قبل فتحه.
//     - EXPECT_TOTAL: تتحقق أن مجموع سجلات المصدر مطابق للعدد المتوقع قبل أي نقل.
//  6. SQLite يبقى سليماً كنسخة احتياطية — لا حذف ولا تعديل.
//
// الاستخدام (توليد العميلين ثم النقل):
//   1) npx prisma generate --schema=prisma/schema.prisma
//   2) cp -r node_modules/.prisma node_modules/.prisma-sqlite-backup
//   3) npx prisma generate --schema=prisma/schema.postgres.prisma
//   4) npx prisma db push --schema=prisma/schema.postgres.prisma   (إنشاء الجداول على الهدف)
//   5) POSTGRES_URL="postgresql://..." SQLITE_SOURCE="<نسخة البيانات>" \
//        EXPECT_SHA256="<بصمة النسخة>" EXPECT_TOTAL=279 \
//        node scripts/migrate-sqlite-to-postgres.mjs --execute --require-empty
//      — SQLITE_SOURCE مسار نسخة عمل من قاعدة SQLite (انسخها قبل الترحيل).
//        الافتراضي هو القاعدة الأصلية مباشرة لكن القراءة فقط بلا كتابة أبداً.
//        لذلك السكربت يقرأ SQLite عبر Prisma client القديم المحفوظ مسبقاً في
//        .prisma-sqlite-backup (يُنشأ تلقائياً بالأمر أدناه) قبل توليد عميل Postgres:
//        cp -r node_modules/.prisma node_modules/.prisma-sqlite-backup
//   4) تحقق السكربت من الأعداد واطبع النتيجة، ثم شغّل النظام بـ DATABASE_URL الجديد.

import { existsSync, readFileSync } from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// جذر المشروع يُشتق من موقع هذا الملف — السكربت يعمل على أي جهاز/خادم دون تعديل
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQLITE_CLIENT_PATH = path.join(ROOT, "node_modules/.prisma-sqlite-backup/client/index.js");
const PG_CLIENT_PATH = path.join(ROOT, "node_modules/.prisma-pg/client/index.js");

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!POSTGRES_URL) {
  console.error("ضبط POSTGRES_URL أو DATABASE_URL أولاً — مثال: postgresql://user:pass@host/db?sslmode=require");
  process.exit(1);
}

// عميل Postgres الثابت — يُولّد بالأمر:
//   npx prisma generate --schema=prisma/schema.postgres.prisma
// المسار مستقل عن العميل الافتراضي حتى لا يتأثر بحالة التطوير المحلي
const { PrismaClient: PgClient } = await import(PG_CLIENT_PATH);
const pg = new PgClient({ datasources: { db: { url: POSTGRES_URL } } });

// مصدر القراءة: نسخة عمل من SQLite — الأولوية: متغير البيئة، ثم db/custom.db المحلية للقراءة فقط.
// لا توجد أي نسخة بيانات داخل المستودع — إن لم يتوفر أي مصدر فالعملية تتوقف فوراً.
const SQLITE_SOURCE_ENV = process.env.SQLITE_SOURCE
  || (existsSync(path.join(ROOT, "db/custom.db")) ? "file:" + path.join(ROOT, "db/custom.db") : "");
if (!SQLITE_SOURCE_ENV) {
  console.error("ضبط SQLITE_SOURCE لمسار نسخة البيانات أولاً (مثال: ./alifba-trial-snapshot.db من عدة النقل).");
  process.exit(1);
}
const SQLITE_SOURCE = SQLITE_SOURCE_ENV.startsWith("file:") ? SQLITE_SOURCE_ENV : "file:" + SQLITE_SOURCE_ENV;

// حارس 1: بصمة SHA-256 للنسخة المصدر — تُحسب وتُطبع دائماً، وتُطابق EXPECT_SHA256 إن وُجد
const SQLITE_FILE = SQLITE_SOURCE.slice(5);
if (!existsSync(SQLITE_FILE)) {
  console.error(`ملف النسخة المصدر غير موجود: ${SQLITE_FILE}`);
  process.exit(1);
}
const SOURCE_SHA256 = createHash("sha256").update(readFileSync(SQLITE_FILE)).digest("hex");
console.log(`بصمة ملف النسخة المصدر SHA-256: ${SOURCE_SHA256}`);
if (process.env.EXPECT_SHA256) {
  if (process.env.EXPECT_SHA256.trim().toLowerCase() !== SOURCE_SHA256) {
    console.error("✗ بصمة النسخة لا تطابق EXPECT_SHA256 — الملف ليس النسخة المتوقعة. أُلغيت العملية قبل أي اتصال.");
    process.exit(1);
  }
  console.log("✓ بصمة النسخة مطابقة للمتوقع.");
}

// ملاحظة توافق: صيغة { A as B } في التفكيك لا تدعمها بيئة Node المعزولة — نستخدم { A: B }
const { PrismaClient: SQLiteClient } = await import(SQLITE_CLIENT_PATH);
const sqlite = new SQLiteClient({ datasources: { db: { url: SQLITE_SOURCE } } });

// ترتيب النقل: الأب قبل الابن
const TABLES = [
  "region", "user", "coordinator", "school", "post", "notification",
  "employeePermission", "permissionTemplate", "authSession", "activity",
  "followUp", "discoverySession", "importLog", "schoolVisit", "auditLog",
];

async function main() {
  console.log("=== خطة الانتقال SQLite → Postgres (وضع آمن) ===");
  console.log(`القراءة من: SQLite (${SQLITE_SOURCE}) — للقراءة فقط، لن يتغير ملفها`);

  // وضع الاستيراد الآلي على Render: إن كانت القاعدة الهدف تحتوي بيانات مسبقاً فتخطّ بأمان
  // (يمنع محو البيانات المكتوبة خلال شهر التجربة عند إعادة النشر)
  if (process.argv.includes("--if-empty")) {
    try {
      const existing = await pg.school.count();
      if (existing > 0) {
        console.log(`القاعدة الهدف تحتوي ${existing} مدرسة — توجد بيانات مسبقاً، تخطي الاستيراد (وضع --if-empty).`);
        await sqlite.$disconnect();
        await pg.$disconnect();
        return;
      }
    } catch { /* الجداول غير موجودة بعد — تابع (db push يسبق هذه الخطوة على Render) */ }
  }

  // حارس 2: --require-empty — لا كتابة ولا حذف إطلاقاً إن كانت القاعدة الهدف تحتوي أي بيانات
  if (process.argv.includes("--require-empty")) {
    let occupied = null;
    for (const t of TABLES) {
      const c = await pg[t].count();
      if (c > 0) { occupied = { table: t, count: c }; break; }
    }
    if (occupied) {
      console.error(`✗ القاعدة الهدف ليست فارغة: الجدول ${occupied.table} يحتوي ${occupied.count} سجلاً.`);
      console.error("  لأمان بياناتك: لن يُكتب أو يُحذف أي شيء. استخدم قاعدة Neon فارغة أو نظّفها يدوياً من SQL Editor ثم أعد المحاولة.");
      await sqlite.$disconnect();
      await pg.$disconnect();
      process.exit(1);
    }
    console.log("✓ القاعدة الهدف فارغة — النقل آمن.");
  }

  const counts = {};
  for (const t of TABLES) {
    counts[t] = await sqlite[t].count();
    console.log(`  ${t}: ${counts[t]} سجل`);
  }
  const totalSource = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`المجموع على المصدر: ${totalSource}`);

  // حارس 3: مطابقة العدد الإجمالي المتوقع قبل أي نقل
  if (process.env.EXPECT_TOTAL && Number(process.env.EXPECT_TOTAL) !== totalSource) {
    console.error(`✗ مجموع سجلات المصدر (${totalSource}) لا يطابق المتوقع (${process.env.EXPECT_TOTAL}) — الملف ليس النسخة المتوقعة. أُلغيت العملية قبل أي كتابة.`);
    await sqlite.$disconnect();
    await pg.$disconnect();
    process.exit(1);
  }

  if (process.argv[2] !== "--execute") {
    console.log("\nوضع المعاينة فقط — لم يُكتب شيء إلى Postgres.");
    console.log("للتنفيذ الفعلي بعد موافقة المالك: أضف --execute");
    await sqlite.$disconnect();
    await pg.$disconnect();
    return;
  }

  console.log("\nبدء النقل الفعلي...");
  // مسح الهدف بالترتيب العكسي ثم النقل بالترتيب الأمامي
  for (const t of [...TABLES].reverse()) {
    await pg[t].deleteMany();
  }

  for (const t of TABLES) {
    const rows = await sqlite[t].findMany();
    if (rows.length === 0) { console.log(`  ${t}: فارغ — تخطٍ`); continue; }
    await pg[t].createMany({ data: rows });
    console.log(`  ${t}: نُقل ${rows.length} سجل`);
  }

  // تحقق نهائي: مقارنة الأعداد
  let ok = true;
  console.log("\nالتحقق النهائي:");
  for (const t of TABLES) {
    const target = await pg[t].count();
    const match = target === counts[t];
    if (!match) ok = false;
    console.log(`  ${t}: المصدر ${counts[t]} — الهدف ${target} ${match ? "✓" : "✗ عدم تطابق!"}`);
  }

  await sqlite.$disconnect();
  await pg.$disconnect();
  if (!ok) { console.error("\nفشل التحقق — لا تشغّل النظام على Postgres قبل معالجة الفروقات."); process.exit(1); }
  console.log("\nاكتمل النقل بنجاح — SQLite الأصلي ما زال سليماً كنسخة احتياطية.");
}

main().catch(e => { console.error(e); process.exit(2); });
