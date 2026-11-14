// ——— لوحة الإدارة: جدول «زيارات الموظفين» — سجلات الزيارات الكاملة من نموذج الموبايل ———
// الفلاتر: الموظف، المدرسة، المحافظة، المنطقة، نوع التواصل، النتيجة، الفترة،
// + نطاق تاريخ مخصص (dateFrom/dateTo بتوقيت بغداد) — نفس التحليل المشترك مع التصدير.
// كل سجل زيارة مستقل ودائم — الزيارات المتكررة لنفس المدرسة تظهر كلها.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseVisitFilters, visitWhereFromParsed } from "@/lib/visit-filters";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(sp.get("pageSize") ?? 25) || 25));

    const filters = parseVisitFilters(sp);
    const where = visitWhereFromParsed(filters);

    const [total, visits] = await Promise.all([
      db.schoolVisit.count({ where: where as never }),
      db.schoolVisit.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          school: {
            select: {
              id: true, name: true, governorate: true, regionText: true,
              region: { select: { id: true, name: true } },
            },
          },
          employee: { select: { id: true, name: true, jobTitle: true } },
        },
      }),
    ]);

    // خيارات الفلاتر الفعلية من القاعدة
    const [employees, governorates] = await Promise.all([
      db.user.findMany({
        where: { role: { in: ["MANAGER", "STAFF"] }, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, jobTitle: true },
      }),
      db.school.findMany({ where: { governorate: { not: null } }, distinct: ["governorate"], select: { governorate: true } }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      visits: visits.map((v) => ({
        id: v.id,
        createdAt: v.createdAt.toISOString(),
        contactType: v.contactType,
        result: v.result,
        resultOther: v.resultOther,
        rejectionReason: v.rejectionReason,
        contactPersonName: v.contactPersonName,
        contactPersonTitle: v.contactPersonTitle,
        principalName: v.principalName,
        schoolPhone: v.schoolPhone,
        studentCount: v.studentCount,
        needs: v.needs ? JSON.parse(v.needs) : [],
        needsOther: v.needsOther,
        subscribersCount: v.subscribersCount,
        nextFollowUpAt: v.nextFollowUpAt?.toISOString() ?? null,
        notes: v.notes,
        lat: v.lat,
        lng: v.lng,
        locationSource: v.locationSource,
        schoolFieldsUpdated: v.schoolFieldsUpdated,
        schoolId: v.school.id,
        schoolName: v.school.name,
        governorate: v.school.governorate,
        regionName: v.school.region?.name ?? v.school.regionText,
        employeeId: v.employee.id,
        employeeName: v.employee.name,
        employeeJobTitle: v.employee.jobTitle,
      })),
      filterOptions: {
        employees,
        governorates: governorates.map((g) => g.governorate as string).sort((a, b) => a.localeCompare(b, "ar")),
      },
    });
  } catch (error) {
    console.error("خطأ في جدول زيارات الموظفين:", error);
    return NextResponse.json({ error: "تعذر جلب جدول زيارات الموظفين." }, { status: 500 });
  }
}
