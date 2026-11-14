// ——— تصدير كامل لقاعدة Postgres (Neon) — يضمن قابلية النقل في أي لحظة ———
// الاستخدام: POSTGRES_URL="postgresql://..." node scripts/export-postgres-full.mjs
// يصدر: كل الجداول الـ15 إلى ملف JSON واحد + ملخص قابل للقراءة، ثم يتحقق من الملف.
// لا يعدّل قاعدة البيانات — قراءة فقط. الملف الناتج يصلح للإرجاع إلى أي قاعدة (بما فيها SQLite عبر سكربت مستقبلي أو VPS).
import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from "fs";
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

const TABLES = [
  "region", "user", "coordinator", "school", "post", "notification",
  "employeePermission", "permissionTemplate", "authSession", "activity",
  "followUp", "discoverySession", "importLog", "schoolVisit", "auditLog",
];

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const OUT_DIR = process.env.OUT_DIR || path.join(ROOT, `download/تصدير-قاعدة-البيانات-${stamp}`);
const pg = new PrismaClient({ datasources: { db: { url: POSTGRES_URL } } });

// إخفاء كلمة المرور من الرابط في الملفات المصدَّرة
function maskedUrl() {
  try {
    const u = new URL(POSTGRES_URL);
    if (u.password) u.password = "****";
    return u.toString();
  } catch { return "(رابط غير قابل للتحليل)"; }
}

async function main() {
  console.log("=== تصدير كامل لقاعدة البيانات ===");
  mkdirSync(OUT_DIR, { recursive: true });

  const dump = { exportedAt: new Date().toISOString(), source: maskedUrl(), tables: {} };
  let total = 0;
  for (const t of TABLES) {
    const rows = await pg[t].findMany();
    dump.tables[t] = rows;
    total += rows.length;
    console.log(`  ${t}: ${rows.length} سجل`);
  }
  dump.totalRecords = total;

  const jsonPath = `${OUT_DIR}/alifba-full-export.json`;
  // BigInt (osmId) لا يدعمه JSON مباشرة — يُحوّل إلى نص يحفظ القيمة كاملة
  writeFileSync(jsonPath, JSON.stringify(dump, (_k, v) => typeof v === "bigint" ? v.toString() : v, 1), "utf8");

  // ——— التحقق من الملف الناتج (قراءة عكسية ومطابقة الأعداد) ———
  const reRead = JSON.parse(readFileSync(jsonPath, "utf8"));
  let ok = true;
  for (const t of TABLES) {
    if ((reRead.tables[t] ?? []).length !== dump.tables[t].length) ok = false;
  }
  const sizeMB = +(statSync(jsonPath).size / 1048576).toFixed(2);

  const summary = [
    "تصدير كامل لقاعدة منصة ألف باء",
    `التاريخ: ${dump.exportedAt}`,
    `المصدر: ${maskedUrl()}`,
    `عدد السجلات الكلي: ${total}`,
    `حجم الملف: ${sizeMB} MB`,
    `التحقق من سلامة الملف: ${ok ? "ناجح — الأعداد مطابقة" : "فشل — لا تعتمد على هذا الملف"}`,
    "",
    "طريقة نسخة pg_dump الثنائية (أنسب للإرجاع إلى Postgres على VPS):",
    `  pg_dump "${maskedUrl()}" -Fc -f alifba-${stamp}.dump`,
    "الإرجاع لاحقاً على VPS:",
    "  pg_restore -h localhost -U postgres -d alifba --clean --if-exists alifba-<التاريخ>.dump",
    "",
    "هذا الملف JSON يصلح أيضاً: للأرشفة طويلة الأمد، أو الفحص اليدوي، أو التحويل لأي نظام آخر.",
  ].join("\n");
  writeFileSync(`${OUT_DIR}/الملخص.txt`, summary, "utf8");

  console.log(`\nالملف: ${jsonPath}`);
  console.log(`الحجم: ${sizeMB} MB | السجلات: ${total} | التحقق: ${ok ? "ناجح" : "فشل"}`);
  await pg.$disconnect();
  if (!ok) process.exit(1);
  console.log("اكتمل التصدير بنجاح.");
}

main().catch(e => { console.error("فشل التصدير:", e.message); process.exit(2); });
