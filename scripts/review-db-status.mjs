// فحص حالة قاعدة البيانات الحقيقية — قراءة فقط تماماً عبر Prisma
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const [users, schools, regions, schoolVisits, activities, auditLogs, permissions, templates, notifications] =
    await Promise.all([
      db.user.count(),
      db.school.count(),
      db.region.count(),
      db.schoolVisit.count(),
      db.activity.count(),
      db.auditLog.count(),
      db.employeePermission.count(),
      db.permissionTemplate.count(),
      db.notification.count(),
    ]);
  console.log("== أعداد السجلات في القاعدة الحقيقية ==");
  console.log(JSON.stringify({ users, schools, regions, schoolVisits, activities, auditLogs, permissions, templates, notifications }, null, 2));

  console.log("\n== المستخدمون ==");
  const us = await db.user.findMany({ select: { role: true, name: true, username: true, isActive: true, lastLoginAt: true }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  for (const u of us) console.log(`[${u.role}] ${u.name} (${u.username ?? "—"}) active=${u.isActive} lastLogin=${u.lastLoginAt?.toISOString() ?? "—"}`);

  console.log("\n== صلاحيات الزيارات الممنوحة ==");
  const perms = await db.employeePermission.findMany({
    where: { section: { in: ["visits", "visit_register"] } },
    include: { user: { select: { name: true } } },
  });
  for (const p of perms) console.log(`${p.user.name} — ${p.section}: visible=${p.visible} view=${p.canView} create=${p.canCreate} manage=${p.canManage}`);

  console.log("\n== زيارات مسجلة (إن وجدت) ==");
  const visits = await db.schoolVisit.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { school: { select: { name: true } }, employee: { select: { name: true } } },
  });
  if (visits.length === 0) console.log("لا توجد زيارات مسجلة بعد في القاعدة الحقيقية.");
  for (const v of visits)
    console.log(`${v.createdAt.toISOString()} | ${v.school.name} | ${v.employee.name} | ${v.contactType} | ${v.result} | (${v.lat}, ${v.lng}) | dedupe=${v.dedupeKey.slice(0, 8)}…`);

  console.log("\n== قوالب الصلاحيات المخصصة ==");
  const ts = await db.permissionTemplate.findMany({ select: { name: true } });
  for (const t of ts) console.log(t.name);
}

main().finally(() => db.$disconnect());
