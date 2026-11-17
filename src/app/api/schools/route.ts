// قائمة المدارس مع كل الفلاتر — النتائج تُحدّث تلقائياً من الواجهة عند تغيير الفلاتر
import { NextRequest, NextResponse } from "next/server";
import { listSchools, parseSchoolFilters, schoolFilterOptions } from "@/lib/schools-query";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncRegionAssignments } from "@/lib/region-sync";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const sp = request.nextUrl.searchParams;
    const withOptions = sp.get("withOptions") === "1";
    const filters = parseSchoolFilters(sp);
    // مزامنة تلقائية: المدارس الجديدة (Excel/الاكتشاف/الإضافة اليدوية) داخل مناطق منسّبة تُنسّب فوراً
    await syncRegionAssignments(db).catch((error) => console.error("تعذرت مزامنة تنسيب المناطق", error));
    const result = await listSchools(filters);
    const options = withOptions ? await schoolFilterOptions(filters.researchOnly) : null;
    return NextResponse.json({ ...result, ...(options ? { options } : {}) });
  } catch (error) {
    console.error("خطأ في جلب قائمة المدارس:", error);
    return NextResponse.json({ error: "تعذر جلب قائمة المدارس." }, { status: 500 });
  }
}
