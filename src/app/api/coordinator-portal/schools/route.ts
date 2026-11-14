// بوابة المنسقة — مدارسها المخصصة فقط + مناطقها + نشاطاتها + مراجعاتها
// وضعان حسب الصلاحية:
//  - جلسة منسقة حقيقية (COORDINATOR): المعرف من الجلسة إجبارياً — لا يمكن رؤية غير مدارسها
//  - معاينة إدارية (ADMIN): يمرر coordinatorId صراحة لمعاينة ما ستراه المنسقة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrincipal } from "@/lib/auth";
import { mapSchool } from "@/lib/schools-query";
import { getBaghdadStartOfDay } from "@/lib/time";

export async function GET(request: NextRequest) {
  try {
    const principal = await getPrincipal();
    const previewCoordinatorId = request.nextUrl.searchParams.get("coordinatorId");

    let coordinatorId: string | null = null;
    let preview = false;

    if (principal?.type === "COORDINATOR") {
      // جلسة حقيقية — المعرف من الجلسة دائماً، الوسيط يتجاهل حمايةً للبيانات
      coordinatorId = principal.coordinatorId;
    } else if (principal?.type === "ADMIN" && previewCoordinatorId) {
      coordinatorId = previewCoordinatorId;
      preview = true;
    } else if (principal?.type === "ADMIN") {
      return NextResponse.json(
        { error: "معاينة الإدارة تتطلب تحديد المنسقة: ?coordinatorId=" },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول.", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const coordinator = await db.coordinator.findFirst({ where: { id: coordinatorId, isActive: true } });
    if (!coordinator) {
      return NextResponse.json({ error: "المنسقة غير موجودة أو غير نشطة." }, { status: 404 });
    }

    const schools = await db.school.findMany({
      where: { coordinatorId },
      include: { region: true, coordinator: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
      take: 500,
    });

    const withCoords = schools.filter((s) => s.lat !== null && s.lng !== null);

    // مناطق المنسقة الفعلية (مشتقة من مدارسها المخصصة — لا بيانات مُدخلة يدوياً)
    const regionMap = new Map<string, { id: string; name: string; governorate: string; schoolCount: number }>();
    for (const s of schools) {
      if (s.region) {
        const cur = regionMap.get(s.region.id) ?? {
          id: s.region.id,
          name: s.region.name,
          governorate: s.region.governorate,
          schoolCount: 0,
        };
        cur.schoolCount += 1;
        regionMap.set(s.region.id, cur);
      }
    }
    const regions = [...regionMap.values()].sort((a, b) => b.schoolCount - a.schoolCount);

    // آخر نشاطاتها المسجلة (تظهر نفسها في لوحة الإدارة فوراً)
    const activities = await db.activity.findMany({
      where: { coordinatorId },
      orderBy: { occurredAt: "desc" },
      take: 15,
      include: { school: { select: { name: true } } },
    });

    // مراجعاتها ومتابعاتها المخصصة لها — المتأخرة أولاً
    const followUps = await db.followUp.findMany({
      where: { coordinatorId, status: "PENDING" },
      orderBy: { dueDate: "asc" },
      take: 30,
      include: { school: { select: { name: true } } },
    });
    const todayStart = getBaghdadStartOfDay();

    return NextResponse.json({
      preview,
      coordinator: { id: coordinator.id, name: coordinator.name, phone: coordinator.phone },
      schools: schools.map((s) => mapSchool(s as never)),
      regions,
      recentActivities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        occurredAt: a.occurredAt.toISOString(),
        schoolName: a.school.name,
        result: a.result,
        notes: a.notes,
      })),
      followUps: followUps.map((f) => ({
        id: f.id,
        title: f.title,
        type: f.type,
        schoolName: f.school.name,
        dueDate: f.dueDate.toISOString(),
        overdue: f.dueDate < todayStart,
      })),
      summary: {
        total: schools.length,
        withCoords: withCoords.length,
        contracted: schools.filter((s) => s.contractStatus === "CONTRACTED").length,
        visited: schools.filter((s) => s.lastVisitAt !== null).length,
        regionsCount: regions.length,
        pendingFollowUps: followUps.length,
        overdueFollowUps: followUps.filter((f) => f.dueDate < todayStart).length,
        activitiesLast7Days: activities.filter(
          (a) => a.occurredAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length,
      },
    });
  } catch (error) {
    console.error("خطأ في جلب مدارس المنسقة:", error);
    return NextResponse.json({ error: "تعذر جلب مدارس المنسقة." }, { status: 500 });
  }
}
