// ——— بوظف الموظف: توزيع مدارس نطاق عمله على المناطق (يتطلب distribution.view) ———
// قراءة فقط: عدد المدارس لكل منطقة والمتعاقدة منها والمنسقات المخصصات لها — من القاعدة مباشرة.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmployee } from "@/lib/auth";
import { checkPermission, getPermissionMap } from "@/lib/permissions";

export async function GET() {
  const guard = await requireEmployee();
  if ("response" in guard && guard.response) return guard.response;
  const principal = (guard as { principal: { userId: string; name: string } }).principal;
  try {
    const perms = await getPermissionMap(principal.userId);
    if (!checkPermission(perms, "distribution", "view").ok) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية الاطلاع على التوزيع.", code: "ACTION_DENIED" }, { status: 403 });
    }
    const employee = await db.user.findUnique({ where: { id: principal.userId }, select: { governorate: true, regionId: true } });
    if (!employee) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });

    const scope: Record<string, unknown> = {};
    const and: Record<string, unknown>[] = [];
    if (employee.governorate) and.push({ governorate: employee.governorate });
    if (employee.regionId) and.push({ regionId: employee.regionId });
    if (and.length) scope.AND = and;

    const regions = await db.region.findMany({
      where: { isActive: true, ...(employee.governorate ? { governorate: employee.governorate } : {}), ...(employee.regionId ? { id: employee.regionId } : {}) },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, governorate: true,
        schools: { select: { id: true, contractStatus: true, coordinatorId: true } },
      },
    });

    return NextResponse.json({
      scope: { governorate: employee.governorate, regionId: employee.regionId },
      regions: regions.map((r) => ({
        id: r.id,
        name: r.name,
        governorate: r.governorate,
        schoolsCount: r.schools.length,
        contractedCount: r.schools.filter((s) => s.contractStatus === "CONTRACTED").length,
        assignedCount: r.schools.filter((s) => s.coordinatorId).length,
      })),
    });
  } catch (error) {
    console.error("خطأ في توزيع الموظف:", error);
    return NextResponse.json({ error: "تعذر جلب بيانات التوزيع." }, { status: 500 });
  }
}
