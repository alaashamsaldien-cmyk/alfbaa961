// ——— تحقق للقراءة فقط: مقارنة قاعدة SQLite الأصلية مع قاعدة Postgres ———
// الاستخدام:
//   POSTGRES_URL="postgresql://..." node scripts/verify-postgres-deployment.mjs
//   POSTGRES_URL="postgresql://..." SQLITE_SOURCE="/مسار/نسخة.db" node scripts/verify-postgres-deployment.mjs
// لا تكتب في أي قاعدة — آمن للتشغيل في أي وقت (قبل وبعد النشر).
import { existsSync } from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// جذر المشروع يُشتق من موقع هذا الملف — يعمل على أي جهاز/خادم
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!POSTGRES_URL) { console.error("ضبط POSTGRES_URL أو DATABASE_URL أولاً"); process.exit(1); }

const SQLITE_CLIENT_PATH = path.join(ROOT, "node_modules/.prisma-sqlite-backup/client/index.js");
const SQLITE_SOURCE_ENV = process.env.SQLITE_SOURCE
  || (existsSync(path.join(ROOT, "db/custom.db")) ? "file:" + path.join(ROOT, "db/custom.db") : "");
const SQLITE_SOURCE = SQLITE_SOURCE_ENV.startsWith("file:") ? SQLITE_SOURCE_ENV : "file:" + SQLITE_SOURCE_ENV;

// عميل Postgres الثابت (مستقل عن العميل الافتراضي)
const PG_CLIENT = path.join(ROOT, "node_modules/.prisma-pg/client/index.js");
if (!existsSync(PG_CLIENT)) {
  console.error("عميل Postgres غير موجود — نفّذ أولاً: npx prisma generate --schema=prisma/schema.postgres.prisma");
  process.exit(1);
}
const { PrismaClient } = await import(PG_CLIENT);

const TABLES = [
  "region", "user", "coordinator", "school", "post", "notification",
  "employeePermission", "permissionTemplate", "authSession", "activity",
  "followUp", "discoverySession", "importLog", "schoolVisit", "auditLog",
];

const pg = new PrismaClient({ datasources: { db: { url: POSTGRES_URL } } });
const sqlite = SQLITE_SOURCE && existsSync(SQLITE_CLIENT_PATH)
  ? new (await import(SQLITE_CLIENT_PATH)).PrismaClient({ datasources: { db: { url: SQLITE_SOURCE } } })
  : null;

async function main() {
  console.log("=== تحقق قاعدة Postgres (قراءة فقط) ===");
  const sizeRows = await pg.$queryRawUnsafe("SELECT pg_database_size(current_database()) AS s");
  console.log(`حجم القاعدة: ${(Number(sizeRows[0].s) / 1048576).toFixed(2)} MB`);

  const pgCounts = {};
  for (const t of TABLES) pgCounts[t] = await pg[t].count();

  let compareOk = null;
  if (sqlite) {
    console.log(`\nمقارنة مع SQLite: ${SQLITE_SOURCE}`);
    let allMatch = true;
    for (const t of TABLES) {
      const sCount = await sqlite[t].count();
      const match = sCount === pgCounts[t];
      if (!match) allMatch = false;
      console.log(`  ${t}: SQLite=${sCount} | Postgres=${pgCounts[t]} ${match ? "✓" : "✗"}`);
    }
    compareOk = allMatch;
    console.log(allMatch ? "\n✓ الأعداد مطابقة تماماً — الترحيل سليم" : "\n✗ اختلاف في الأعداد — لا تشغّل النظام قبل معالجة الفرق");
  } else {
    console.log("\n(لا يوجد عميل SQLite محفوظ — عرض أعداد Postgres فقط)");
    for (const t of TABLES) console.log(`  ${t}: ${pgCounts[t]}`);
  }

  // فحوص وجود البيانات الجوهرية
  const admins = await pg.user.count({ where: { role: "ADMIN" } });
  console.log(`\nحسابات المدير على Postgres: ${admins}`);
  console.log(admins >= 1 ? "✓ يوجد حساب مدير — الدخول ممكن" : "✗ لا يوجد حساب مدير!");

  await pg.$disconnect();
  if (sqlite) await sqlite.$disconnect();
  if (compareOk === false) process.exit(1);
  console.log("\nانتهى التحقق.");
}

main().catch(e => { console.error("فشل التحقق:", e.message); process.exit(2); });
