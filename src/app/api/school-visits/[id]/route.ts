// ——— لوحة الإدارة: تفاصيل زيارة موظف كاملة (نافذة العين 👁) ———
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const visit = await db.schoolVisit.findUnique({
      where: { id },
      include: {
        school: {
          select: {
            id: true, name: true, governorate: true, regionText: true,
            region: { select: { id: true, name: true } },
            address: true, phone: true, principalName: true, studentCount: true,
            lat: true, lng: true,
          },
        },
        employee: { select: { id: true, name: true, username: true, jobTitle: true, phone: true } },
        coordinator: { select: { id: true, name: true, username: true, phone: true } },
      },
    });
    if (!visit) return NextResponse.json({ error: "الزيارة غير موجودة." }, { status: 404 });

    // قيود التدقيق المرتبطة بهذه الزيارة (تسجيلها وتحديثات بيانات المدرسة المرافقة)
    const auditEntries = await db.auditLog.findMany({
      where: { entityType: { in: ["SCHOOL_VISIT", "SCHOOL"] }, entityId: { in: [visit.id, visit.schoolId] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, action: true, actorName: true, details: true, createdAt: true },
    });

    return NextResponse.json({
      visit: {
        id: visit.id,
        createdAt: visit.createdAt.toISOString(),
        contactType: visit.contactType,
        contactOther: visit.contactOther,
        result: visit.result,
        resultOther: visit.resultOther,
        rejectionReason: visit.rejectionReason,
        contactPersonName: visit.contactPersonName,
        contactPersonTitle: visit.contactPersonTitle,
        principalName: visit.principalName,
        schoolPhone: visit.schoolPhone,
        studentCount: visit.studentCount,
        needs: visit.needs ? JSON.parse(visit.needs) : [],
        needsOther: visit.needsOther,
        subscribersCount: visit.subscribersCount,
        nextFollowUpAt: visit.nextFollowUpAt?.toISOString() ?? null,
        notes: visit.notes,
        lat: visit.lat,
        lng: visit.lng,
        locationAccuracy: visit.locationAccuracy,
        locationSource: visit.locationSource,
        schoolFieldsUpdated: visit.schoolFieldsUpdated,
        school: {
          ...visit.school,
          regionName: visit.school.region?.name ?? visit.school.regionText,
        },
        employee: visit.coordinator ? { ...visit.coordinator, jobTitle: "منسّق ميداني" } : visit.employee,
      },
      auditEntries: auditEntries.map((a) => ({
        id: a.id,
        action: a.action,
        actorName: a.actorName,
        details: a.details ? JSON.parse(a.details) : null,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("خطأ في تفاصيل الزيارة:", error);
    return NextResponse.json({ error: "تعذر جلب تفاصيل الزيارة." }, { status: 500 });
  }
}
