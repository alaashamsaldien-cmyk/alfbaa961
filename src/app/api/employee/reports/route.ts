// ——— بوابة الموظف: التقارير والإحصائيات — محسوبة فعلياً من نطاق عمله ———
// يتطلب reports.view. كل الأرقام حقيقية من قاعدة البيانات ضمن نطاق المحافظة/المنطقة.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmployee } from "@/lib/auth";
import { checkPermission, getPermissionMap } from "@/lib/permissions";
import { getBaghdadDaysAgoStart, getBaghdadStartOfDay, getBaghdadEndOfDay } from "@/lib/time";

function employeeSchoolScope(employee: { governorate: string | null; regionId: string | null }): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (employee.governorate) and.push({ governorate: employee.governorate });
  if (employee.regionId) and.push({ regionId: employee.regionId });
  return and.length ? { AND: and } : {};
}

export async function GET() {
  const guard = await requireEmployee();
  if ("response" in guard && guard.response) return guard.response;
  const principal = (guard as { principal: { userId: string; name: string } }).principal;
  try {
    const perms = await getPermissionMap(principal.userId);
    if (!checkPermission(perms, "reports", "view").ok) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية الاطلاع على التقارير.", code: "ACTION_DENIED" }, { status: 403 });
    }
    const employee = await db.user.findUnique({ where: { id: principal.userId }, select: { governorate: true, regionId: true } });
    if (!employee) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });

    const scope = employeeSchoolScope(employee);
    const seeAllVisits = checkPermission(perms, "visits", "manage").ok;
    const visitScope = seeAllVisits ? { school: scope } : { employeeId: principal.userId };

    const [schoolTotal, contracted, available, visited, byContactType, byResult, myVisits30, todayVisits, regionBreakdown] = await Promise.all([
      db.school.count({ where: scope as never }),
      db.school.count({ where: { AND: [scope, { contractStatus: "CONTRACTED" }] } as never }),
      db.school.count({ where: { AND: [scope, { availabilityStatus: "AVAILABLE" }] } as never }),
      db.school.count({ where: { AND: [scope, { lastVisitAt: { not: null } }] } as never }),
      db.schoolVisit.groupBy({ by: ["contactType"], _count: { contactType: true }, where: visitScope as never }),
      db.schoolVisit.groupBy({ by: ["result"], _count: { result: true }, where: visitScope as never }),
      db.schoolVisit.count({ where: { ...visitScope, createdAt: { gte: getBaghdadDaysAgoStart(29) } } as never }),
      db.schoolVisit.count({ where: { ...visitScope, createdAt: { gte: getBaghdadStartOfDay(), lte: getBaghdadEndOfDay() } } as never }),
      db.school.groupBy({
        by: ["regionText"],
        _count: { regionText: true },
        where: scope as never,
      }),
    ]);

    return NextResponse.json({
      scope: { governorate: employee.governorate, regionId: employee.regionId },
      schools: { total: schoolTotal, contracted, available, visited },
      visits: {
        today: todayVisits,
        last30Days: myVisits30,
        byContactType: byContactType.map((r) => ({ contactType: r.contactType, count: r._count.contactType })),
        byResult: byResult.map((r) => ({ result: r.result, count: r._count.result })),
      },
      regions: regionBreakdown
        .filter((r) => r.regionText)
        .map((r) => ({ regionName: r.regionText as string, schools: r._count.regionText })),
    });
  } catch (error) {
    console.error("خطأ في تقارير الموظف:", error);
    return NextResponse.json({ error: "تعذر جلب التقارير." }, { status: 500 });
  }
}
