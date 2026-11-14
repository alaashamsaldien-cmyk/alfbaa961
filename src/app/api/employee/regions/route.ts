// ——— بوابة الموظف: المناطق ضمن نطاق عمله وعدد مدارس كل منطقة (يتطلب regions.view) ———
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
    if (!checkPermission(perms, "regions", "view").ok) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية الاطلاع على المناطق.", code: "ACTION_DENIED" }, { status: 403 });
    }
    const employee = await db.user.findUnique({
      where: { id: principal.userId },
      select: { governorate: true, regionId: true, workRegion: { select: { name: true } } },
    });
    if (!employee) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });

    const regionWhere: Record<string, unknown> = { isActive: true };
    if (employee.governorate) regionWhere.governorate = employee.governorate;
    if (employee.regionId) regionWhere.id = employee.regionId;

    const regions = await db.region.findMany({
      where: regionWhere as never,
      orderBy: { name: "asc" },
      select: { id: true, name: true, governorate: true, _count: { select: { schools: true } } },
    });

    return NextResponse.json({
      scope: { governorate: employee.governorate, regionName: employee.workRegion?.name ?? null },
      regions: regions.map((r) => ({ id: r.id, name: r.name, governorate: r.governorate, schoolsCount: r._count.schools })),
    });
  } catch (error) {
    console.error("خطأ في مناطق الموظف:", error);
    return NextResponse.json({ error: "تعذر جلب المناطق." }, { status: 500 });
  }
}
