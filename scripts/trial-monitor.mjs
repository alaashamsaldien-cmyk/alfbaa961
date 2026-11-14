// ——— مراقبة حدود التشغيل التجريبي (Neon مجاني) ———
// الاستخدام: POSTGRES_URL="postgresql://..." node scripts/trial-monitor.mjs
// قراءة فقط — لا تكتب في قاعدة البيانات إطلاقاً.
// يقيس: حجم القاعدة، عدد سجلات كل جدول، الزيارات هذا الشهر، الجلسات النشطة،
// ويحذر عند الاقتراب من حد التخزين المجاني في Neon (1 GB — تحقق نوفمبر 2026).
import { existsSync } from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// جذر المشروع يُشتق من موقع هذا الملف — يعمل على أي جهاز/خادم
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!POSTGRES_URL) { console.error("ضبط POSTGRES_URL أو DATABASE_URL أولاً — رابط Neon يبدأ بـ postgresql://"); process.exit(1); }

// عميل Postgres الثابت — يُولّد بالأمر: npx prisma generate --schema=prisma/schema.postgres.prisma
const PG_CLIENT = path.join(ROOT, "node_modules/.prisma-pg/client/index.js");
if (!existsSync(PG_CLIENT)) {
  console.error("عميل Postgres غير موجود — نفّذ أولاً: npx prisma generate --schema=prisma/schema.postgres.prisma");
  process.exit(1);
}
const { PrismaClient } = await import(PG_CLIENT);

const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, "download/مراقبة-التجربة");
// حد التخزين المجاني في Neon — تحقق نوفمبر 2026 من neon.com/pricing: 1 GB لكل مشروع
// (الرقم القديم 0.5GB/512MB لم يعد معتمداً)، و100 ساعة حوسبة (CU-hours) شهرياً لكل مشروع
const LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const FREE_COMPUTE_CU_HOURS = 100;
const WARN_AT = 0.8; // تحذير عند 80% من الحد

const TABLES = [
  "region", "user", "coordinator", "school", "post", "notification",
  "employeePermission", "permissionTemplate", "authSession", "activity",
  "followUp", "discoverySession", "importLog", "schoolVisit", "auditLog",
];

const pg = new PrismaClient({ datasources: { db: { url: POSTGRES_URL } } });

async function main() {
  const report = { at: new Date().toISOString(), tables: {} };

  const sizeRows = await pg.$queryRawUnsafe("SELECT pg_database_size(current_database()) AS size, current_database() AS name");
  const dbSize = Number(sizeRows[0].size);
  report.database = { name: sizeRows[0].name, sizeBytes: dbSize, sizeMB: +(dbSize / 1048576).toFixed(2), freeLimitMB: 1024 };
  const pct = dbSize / LIMIT_BYTES;

  for (const t of TABLES) {
    report.tables[t] = await pg[t].count();
  }

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  report.visitsThisMonth = await pg.schoolVisit.count({ where: { createdAt: { gte: monthStart } } });
  report.activeSessions = await pg.authSession.count({ where: { expiresAt: { gt: new Date() } } });
  report.employeesWithLogin = await pg.user.count({ where: { passwordHash: { not: null } } });

  // حجم أكبر الجداول (لتفادي المفاجآت)
  const sizes = await pg.$queryRawUnsafe(
    `SELECT relname AS table, pg_total_relation_size(c.oid) AS bytes
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
     ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 5`
  );
  report.largestTables = sizes.map(r => ({ table: r.table, mb: +(Number(r.bytes) / 1048576).toFixed(3) }));

  // ——— الطباعة ———
  console.log("=== مراقبة التشغيل التجريبي — " + new Date().toLocaleString("ar") + " ===");
  console.log(`حجم قاعدة البيانات: ${report.database.sizeMB} MB من 1024 MB (1 GB) المجانية (${(pct * 100).toFixed(1)}%)`);
  console.log(`حصة الحوسبة المجانية: ${FREE_COMPUTE_CU_HOURS} CU-hour شهرياً لكل مشروع — بنوم تلقائي بعد 5 دقائق من آخر اتصال`);
  console.log(`الزيارات المسجلة هذا الشهر: ${report.visitsThisMonth}`);
  console.log(`الجلسات النشطة: ${report.activeSessions} | حسابات بقدرة دخول: ${report.employeesWithLogin}`);
  console.log("أكبر الجداول:");
  for (const t of report.largestTables) console.log(`  ${t.table}: ${t.mb} MB`);
  console.log("عدد السجلات:", JSON.stringify(report.tables, null, 0));

  if (pct >= WARN_AT) {
    console.warn(`⚠️ تحذير: القاعدة بلغت ${(pct * 100).toFixed(0)}% من الحد المجاني — صدّر البيانات وخطط للانتقال مبكراً (scripts/export-postgres-full.mjs)`);
    report.warning = true;
  } else {
    console.log("✓ الاستخدام داخل الحدود المجانية بأمان");
  }

  // ——— سجل تاريخي ———
  try {
    const { mkdirSync, appendFileSync } = await import("fs");
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(`${LOG_DIR}/monitor-log.jsonl`, JSON.stringify(report) + "\n");
    console.log(`سُجل في: ${LOG_DIR}/monitor-log.jsonl`);
  } catch (e) { console.warn("تعذر حفظ السجل:", e.message); }

  await pg.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error("فشل المراقبة:", e.message); process.exit(2); });
