// ——— تصدير زيارات الموظف إلى Excel — بوابة الموظف على الموبايل ———
// الصلاحية تُطبق على الخادم حصراً:
//  - يتطلب صلاحية «الزيارات والتواصل» + خيار «تصدير البيانات» الممنوح من المدير.
//  - نطاق البيانات: زيارات الموظف نفسه فقط، ما لم يكن منح صلاحية «إدارة البيانات»
//    عندها يصدر زيارات الجميع ضمن نطاق عمله الجغرافي — بنفس حدود قائمة الزيارات.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmployee } from "@/lib/auth";
import { checkPermission, getPermissionMap } from "@/lib/permissions";
import { parseVisitFilters } from "@/lib/visit-filters";
import { buildVisitsExportWorkbook } from "@/lib/excel-visits";

export async function GET(request: NextRequest) {
  const guard = await requireEmployee();
  if ("response" in guard && guard.response) return guard.response;
  const principal = (guard as { principal: { userId: string; name: string } }).principal;
  try {
    const perms = await getPermissionMap(principal.userId);
    if (!checkPermission(perms, "visits", "view").ok) {
      return NextResponse.json(
        { error: "غير مصرح — لا تملك صلاحية الاطلاع على الزيارات.", code: "ACTION_DENIED" },
        { status: 403 }
      );
    }
    if (!checkPermission(perms, "visits", "export").ok) {
      return NextResponse.json(
        { error: "غير مصرح — لا تملك صلاحية تصدير الزيارات. تواصل مع مدير النظام.", code: "EXPORT_DENIED" },
        { status: 403 }
      );
    }
    const seeOthers = checkPermission(perms, "visits", "manage").ok;

    const employee = await db.user.findUnique({
      where: { id: principal.userId },
      select: { name: true, governorate: true, regionId: true },
    });
    if (!employee) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });

    const filters = parseVisitFilters(request.nextUrl.searchParams);

    // نطاق البيانات مطابق تماماً لنطاق قائمة الزيارات — التصدير لا يوسع الصلاحيات أبداً
    if (!seeOthers) {
      const { buffer, rowCount } = await buildVisitsExportWorkbook(
        { ...filters, employeeId: principal.userId },
        {},
        { exportedBy: employee.name ?? principal.name, scopeLabel: "زياراتي المسجلة فقط" }
      );
      return xlsxResponse(buffer, rowCount);
    }
    // seeOthers: كل الزيارات ضمن نطاق عمله الجغرافي (المحافظة/المنطقة)
    const and: Record<string, unknown>[] = [];
    if (employee.governorate) and.push({ governorate: employee.governorate });
    if (employee.regionId) and.push({ regionId: employee.regionId });
    const schoolScope: Record<string, unknown> = and.length ? { AND: and } : {};
    const { buffer, rowCount } = await buildVisitsExportWorkbook(
      { ...filters, employeeId: null },
      schoolScope,
      { exportedBy: employee.name ?? principal.name, scopeLabel: "زيارات الموظفين ضمن نطاق عملك الجغرافي" }
    );
    return xlsxResponse(buffer, rowCount);
  } catch (error) {
    console.error("خطأ في تصدير زيارات الموظف:", error);
    return NextResponse.json({ error: "تعذر تصدير الزيارات." }, { status: 500 });
  }
}

function xlsxResponse(buffer: Buffer, rowCount: number): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`زياراتي_${rowCount}_سجل.xlsx`)}`,
      "Cache-Control": "no-store",
      "X-Export-Rows": String(rowCount),
    },
  });
}
