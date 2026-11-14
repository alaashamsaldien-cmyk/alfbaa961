// ——— بوابة الموظف: دليل الموظفين (عرض فقط — يتطلب employees.view) ———
// قراءة محدودة الحقول: الاسم والمسمى والهاتف ونطاق العمل. الإدارة الكاملة لمدير النظام حصراً.
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
    if (!checkPermission(perms, "employees", "view").ok) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية الاطلاع على دليل الموظفين.", code: "ACTION_DENIED" }, { status: 403 });
    }
    const employees = await db.user.findMany({
      where: { role: { in: ["MANAGER", "STAFF"] }, isActive: true },
      orderBy: { name: "asc" },
      select: {
        name: true, jobTitle: true, phone: true, governorate: true,
        workRegion: { select: { name: true } },
        _count: { select: { schoolVisits: true } },
      },
    });
    return NextResponse.json({
      employees: employees.map((e) => ({
        name: e.name,
        jobTitle: e.jobTitle,
        phone: e.phone,
        governorate: e.governorate,
        regionName: e.workRegion?.name ?? null,
        visitsCount: e._count.schoolVisits,
      })),
    });
  } catch (error) {
    console.error("خطأ في دليل الموظفين:", error);
    return NextResponse.json({ error: "تعذر جلب دليل الموظفين." }, { status: 500 });
  }
}
