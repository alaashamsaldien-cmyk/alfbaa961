// ——— بوابة الموظف: ملف الموظف وصلاحياته وإحصائيات عمله الفعلية ———
// نقطة الإقلاع الأولى في واجهة الموظف على الموبايل: كل شيء هنا مشتق من الجلسة
// وخريطة صلاحياته ومن نطاق عمله (المحافظة/المنطقة) — بلا أي بيانات وهمية.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFieldAccount, getFieldPermissions, fieldVisitOwner, getFieldSchoolScope } from "@/lib/field-account";
import { approvedMapSchoolWhere } from "@/lib/map-school-scope";
import { getBaghdadStartOfDay, getBaghdadDaysAgoStart, getBaghdadEndOfDay } from "@/lib/time";

export async function GET() {
  const guard = await requireFieldAccount();
  if (!guard.principal) return guard.response!;
  try {
    const account = guard.principal;
    const { userId } = account;
    if (account.isCoordinator) {
      const now = new Date();
      const owner = { ...fieldVisitOwner(account), school: approvedMapSchoolWhere };
      const scope = await getFieldSchoolScope(account);
      const [permissions, schoolsCount, regions, visitsToday, visitsWeek, visitsTotal, pendingFollowups] = await Promise.all([
        getFieldPermissions(account),
        db.school.count({ where: scope }),
        db.school.findMany({
          where: scope,
          distinct: ["regionId", "regionText", "governorate"],
          select: { region: { select: { name: true } }, regionText: true, governorate: true },
        }),
        db.schoolVisit.count({ where: { ...owner, createdAt: { gte: getBaghdadStartOfDay(now), lte: getBaghdadEndOfDay(now) } } }),
        db.schoolVisit.count({ where: { ...owner, createdAt: { gte: getBaghdadDaysAgoStart(6) } } }),
        db.schoolVisit.count({ where: owner }),
        db.followUp.count({where:{status:"PENDING",dueDate:{lte:getBaghdadEndOfDay(now)},school:scope}}),
      ]);
      const regionNames = [...new Set(regions.map((s) => s.region?.name ?? s.regionText ?? s.governorate).filter(Boolean))];
      return NextResponse.json({
        employee: {
          id: userId,
          name: account.name,
          role: "COORDINATOR",
          roleLabel: "منسّق ميداني",
          regionName: regionNames.join("، ") || "بلا منطقة مخصصة",
        },
        permissions,
        stats: { schoolsCount, visitsToday, visitsWeek, visitsTotal, pendingFollowups },
        serverTime: now.toISOString(),
      });
    }
    const [employee, perms] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true, name: true, username: true, role: true, phone: true, jobTitle: true,
          governorate: true, regionId: true, isActive: true, lastLoginAt: true,
          workRegion: { select: { id: true, name: true, governorate: true } },
        },
      }),
      getFieldPermissions(account),
    ]);
    if (!employee || !employee.isActive) {
      return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });
    }

    // نطاق عمل الموظف: مدارس محافظته/منطقته — فارغ = النطاق الكامل
    const schoolScope: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];
    if (employee.governorate) and.push({ governorate: employee.governorate });
    if (employee.regionId) and.push({ regionId: employee.regionId });
    if (and.length) schoolScope.AND = and;

    const now = new Date();
    const [schoolsCount, visitsToday, visitsWeek, visitsTotal, pendingFollowups] = await Promise.all([
      db.school.count({ where: schoolScope as never }),
      db.schoolVisit.count({ where: { employeeId: userId, createdAt: { gte: getBaghdadStartOfDay(now), lte: getBaghdadEndOfDay(now) } } }),
      db.schoolVisit.count({ where: { employeeId: userId, createdAt: { gte: getBaghdadDaysAgoStart(6) } } }),
      db.schoolVisit.count({ where: { employeeId: userId } }),
      db.followUp.count({
        where: { status: "PENDING", dueDate: { lte: getBaghdadEndOfDay(now) }, school: schoolScope as never },
      }),
    ]);

    return NextResponse.json({
      employee: {
        id: employee.id,
        name: employee.name,
        username: employee.username,
        role: employee.role,
        roleLabel: employee.role === "MANAGER" ? "مدير إداري" : "موظف",
        phone: employee.phone,
        jobTitle: employee.jobTitle,
        governorate: employee.governorate,
        regionId: employee.regionId,
        regionName: employee.workRegion?.name ?? null,
        lastLoginAt: employee.lastLoginAt?.toISOString() ?? null,
      },
      permissions: perms,
      stats: {
        schoolsCount,
        visitsToday,
        visitsWeek,
        visitsTotal,
        pendingFollowups,
      },
      serverTime: now.toISOString(),
    });
  } catch (error) {
    console.error("خطأ في بوابة الموظف (me):", error);
    return NextResponse.json({ error: "تعذر جلب بيانات حسابك." }, { status: 500 });
  }
}
