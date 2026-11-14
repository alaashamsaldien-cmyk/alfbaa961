// ——— بوابة الموظف: المراجعات والمتابعات المبرمجة على مدارس نطاق عمله ———
// GET يتطلب reviews.view — PATCH إنجاز/إلغاء متابعة يتطلب reviews.edit.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmployee } from "@/lib/auth";
import { checkPermission, getPermissionMap } from "@/lib/permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { getBaghdadEndOfDay } from "@/lib/time";

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
    if (!checkPermission(perms, "reviews", "view").ok) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية الاطلاع على المراجعات.", code: "ACTION_DENIED" }, { status: 403 });
    }
    const employee = await db.user.findUnique({ where: { id: principal.userId }, select: { governorate: true, regionId: true } });
    if (!employee) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });

    const followups = await db.followUp.findMany({
      where: { school: employeeSchoolScope(employee) },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 100,
      include: { school: { select: { name: true, governorate: true } } },
    });

    const now = new Date();
    return NextResponse.json({
      followups: followups.map((f) => ({
        id: f.id,
        title: f.title,
        type: f.type,
        status: f.status,
        dueDate: f.dueDate.toISOString(),
        overdue: f.status === "PENDING" && f.dueDate < now,
        completedAt: f.completedAt?.toISOString() ?? null,
        notes: f.notes,
        schoolId: f.schoolId,
        schoolName: f.school.name,
      })),
      dueToday: followups.filter((f) => f.status === "PENDING" && f.dueDate <= getBaghdadEndOfDay()).length,
      canComplete: checkPermission(perms, "reviews", "edit").ok,
    });
  } catch (error) {
    console.error("خطأ في مراجعات الموظف:", error);
    return NextResponse.json({ error: "تعذر جلب المراجعات." }, { status: 500 });
  }
}
