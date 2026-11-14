// تصدير المدارس إلى Excel — يدعم نفس فلاتر القائمة
import { NextRequest, NextResponse } from "next/server";
import { buildExportWorkbook } from "@/lib/excel-schools";
import { requireAdmin } from "@/lib/auth";
import { parseSchoolFilters, schoolWhere } from "@/lib/schools-query";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const filters = parseSchoolFilters(request.nextUrl.searchParams);
    const where = schoolWhere(filters);
    const buffer = await buildExportWorkbook(where);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("المدارس_تصدير_منصة_ألف_باء.xlsx")}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("خطأ في تصدير المدارس:", error);
    return NextResponse.json({ error: "تعذر تصدير المدارس." }, { status: 500 });
  }
}
