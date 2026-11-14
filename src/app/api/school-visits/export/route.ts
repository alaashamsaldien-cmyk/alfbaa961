// ——— تصدير جدول الزيارات إلى Excel — لوحة الإدارة (مدير النظام) ———
// يدعم نفس فلاتر جدول الزيارات: الموظف، المحافظة، المنطقة، نوع التواصل، النتيجة،
// الفترات الجاهزة + نطاق تاريخ مخصص (dateFrom/dateTo بتوقيت بغداد) والبحث باسم المدرسة.
// صلاحية التصدير: مدير النظام فقط عبر هذا المسار — موظفو الإدارة لديهم مسارهم الخاص
// (/api/employee/visits/export) المشروط بصلاحية «تصدير البيانات» من المدير.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseVisitFilters } from "@/lib/visit-filters";
import { buildVisitsExportWorkbook } from "@/lib/excel-visits";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const filters = parseVisitFilters(request.nextUrl.searchParams);
    const { buffer, rowCount } = await buildVisitsExportWorkbook(filters, {}, {
      exportedBy: guard.principal.name,
      scopeLabel: "لوحة الإدارة — كل الزيارات المسموح بها",
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`زيارات_الموظفين_${rowCount}_سجل.xlsx`)}`,
        "Cache-Control": "no-store",
        "X-Export-Rows": String(rowCount),
      },
    });
  } catch (error) {
    console.error("خطأ في تصدير جدول الزيارات:", error);
    return NextResponse.json({ error: "تعذر تصدير جدول الزيارات." }, { status: 500 });
  }
}
