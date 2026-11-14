// قائمة المدارس مع كل الفلاتر — النتائج تُحدّث تلقائياً من الواجهة عند تغيير الفلاتر
import { NextRequest, NextResponse } from "next/server";
import { listSchools, parseSchoolFilters, schoolFilterOptions } from "@/lib/schools-query";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const sp = request.nextUrl.searchParams;
    const withOptions = sp.get("withOptions") === "1";
    const result = await listSchools(parseSchoolFilters(sp));
    const options = withOptions ? await schoolFilterOptions() : null;
    return NextResponse.json({ ...result, ...(options ? { options } : {}) });
  } catch (error) {
    console.error("خطأ في جلب قائمة المدارس:", error);
    return NextResponse.json({ error: "تعذر جلب قائمة المدارس." }, { status: 500 });
  }
}
