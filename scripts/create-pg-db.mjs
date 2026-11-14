// أداة صغيرة: إنشاء/حذف قاعدة بيانات على خادم Postgres المحلي (بدون psql)
// الاستخدام: node scripts/create-pg-db.mjs <اسم-القاعدة> [اسم-الخادم-البديل]
import pg from "../.pgenv/node_modules/pg/lib/index.js";

const DB_NAME = process.argv[2] || "alifba_verify";
const client = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" });

await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
await client.query(`CREATE DATABASE "${DB_NAME}"`);
const res = await client.query(
  `SELECT datname FROM pg_database WHERE datname = $1`, [DB_NAME]
);
console.log(res.rows.length === 1 ? `✓ قاعدة ${DB_NAME} أُنشئت (فارغة تماماً)` : "✗ فشل الإنشاء");
await client.end();
