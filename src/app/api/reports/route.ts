// التقارير والإحصائيات — كل الأرقام محسوبة فعلياً من قاعدة البيانات لحظة الطلب
// لا قيم ثابتة ولا تقديرات — قاعدة فارغة تعني أصفاراً
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getBaghdadStartOfDay, getBaghdadEndOfDay, getBaghdadDaysAgoStart } from "@/lib/time";

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const todayStart = getBaghdadStartOfDay();
    const todayEnd = getBaghdadEndOfDay();
    const weekStart = getBaghdadDaysAgoStart(6);

    const [
      totalSchools,
      byGovernorate,
      byType,
      bySector,
      contractCounts,
      availabilityCounts,
      discoveryCounts,
      byRegionTop,
      coordinators,
      activitiesByType,
      activitiesByWeek,
      activitiesToday,
      missingPhone,
      missingPrincipal,
      missingCoords,
      missingRegion,
      avgQuality,
      visitedCount,
      importLogs,
      discoverySessionsCount,
    ] = await Promise.all([
      db.school.count(),
      db.school.groupBy({ by: ["governorate"], _count: { id: true } }),
      db.school.groupBy({ by: ["institutionType"], _count: { id: true } }),
      db.school.groupBy({ by: ["sector"], _count: { id: true } }),
      db.school.groupBy({ by: ["contractStatus"], _count: { id: true } }),
      db.school.groupBy({ by: ["availabilityStatus"], _count: { id: true } }),
      db.school.groupBy({ by: ["discoveryStatus"], _count: { id: true } }),
      db.school.groupBy({ by: ["regionId"], _count: { id: true } }),
      db.coordinator.findMany({
        where: { isActive: true },
        include: {
          _count: { select: { schools: true } },
          activities: { select: { id: true, type: true, occurredAt: true } },
          schools: { select: { contractStatus: true, lastVisitAt: true } },
        },
      }),
      db.activity.groupBy({ by: ["type"], _count: { id: true } }),
      // نشاطات آخر 8 أسابيع لرسم الخط الزمني
      db.activity.findMany({
        where: { occurredAt: { gte: getBaghdadDaysAgoStart(55) } },
        select: { occurredAt: true, type: true },
      }),
      db.activity.count({ where: { occurredAt: { gte: todayStart, lte: todayEnd } } }),
      db.school.count({ where: { phone: null } }),
      db.school.count({ where: { principalName: null } }),
      db.school.count({ where: { OR: [{ lat: null }, { lng: null }] } }),
      db.school.count({ where: { AND: [{ regionId: null }, { regionText: null }] } }),
      db.school.aggregate({ _avg: { dataQuality: true } }),
      db.school.count({ where: { lastVisitAt: { not: null } } }),
      db.importLog.count(),
      db.discoverySession.count(),
    ]);

    // أسماء المناطق لأعلى 10 مناطق
    const regionIds = byRegionTop
      .filter((r) => r.regionId)
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, 10)
      .map((r) => r.regionId!);
    const regionsInfo = await db.region.findMany({
      where: { id: { in: regionIds } },
      select: { id: true, name: true },
    });
    const regionNameById = new Map(regionsInfo.map((r) => [r.id, r.name]));

    // تجميع النشاطات أسبوعياً (آخر 8 أسابيع) — بتوقيت بغداد
    const weekly: { label: string; visits: number; calls: number; total: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(weekStart.getTime() - w * 7 * 86400000);
      const end = new Date(start.getTime() + 7 * 86400000);
      const weekActivities = activitiesByWeek.filter((a) => a.occurredAt >= start && a.occurredAt < end);
      weekly.push({
        label: `${start.toLocaleDateString("ar-u-nu-latn", { timeZone: "Asia/Baghdad", day: "numeric", month: "short" })}`,
        visits: weekActivities.filter((a) => a.type === "VISIT").length,
        calls: weekActivities.filter((a) => a.type === "CALL").length,
        total: weekActivities.length,
      });
    }

    return NextResponse.json({
      schools: {
        total: totalSchools,
        visited: visitedCount,
        notVisited: totalSchools - visitedCount,
        avgDataQuality: Math.round(avgQuality._avg.dataQuality ?? 0),
        byGovernorate: byGovernorate.map((g) => ({ name: g.governorate ?? "غير محددة", count: g._count.id })),
        byType: byType.map((t) => ({ name: t.institutionType ?? "غير محدد", count: t._count.id })).sort((a, b) => b.count - a.count),
        bySector: {
          government: bySector.find((s) => s.sector === "GOVERNMENT")?._count.id ?? 0,
          private: bySector.find((s) => s.sector === "PRIVATE")?._count.id ?? 0,
          unknown: bySector.find((s) => s.sector === null)?._count.id ?? 0,
        },
        contract: {
          contracted: contractCounts.find((c) => c.contractStatus === "CONTRACTED")?._count.id ?? 0,
          notContracted: contractCounts.find((c) => c.contractStatus === "NOT_CONTRACTED")?._count.id ?? 0,
        },
        availability: {
          available: availabilityCounts.find((c) => c.availabilityStatus === "AVAILABLE")?._count.id ?? 0,
          unavailable: availabilityCounts.find((c) => c.availabilityStatus === "UNAVAILABLE")?._count.id ?? 0,
        },
        discovery: discoveryCounts.map((d) => ({ name: d.discoveryStatus, count: d._count.id })),
        topRegions: regionIds.map((id) => ({ name: regionNameById.get(id) ?? "منطقة", count: byRegionTop.find((r) => r.regionId === id)?._count.id ?? 0 })),
      },
      activities: {
        today: activitiesToday,
        byType: activitiesByType.map((t) => ({ type: t.type, count: t._count.id })),
        weekly,
      },
      coordinators: coordinators.map((c) => ({
        id: c.id,
        name: c.name,
        schoolCount: c._count.schools,
        contractedCount: c.schools.filter((s) => s.contractStatus === "CONTRACTED").length,
        visitedCount: c.schools.filter((s) => s.lastVisitAt !== null).length,
        activitiesTotal: c.activities.length,
        activitiesLast7Days: c.activities.filter((a) => a.occurredAt >= weekStart).length,
      })),
      dataGaps: {
        missingPhone,
        missingPrincipal,
        missingCoords,
        missingRegion,
      },
      system: {
        importLogs,
        discoverySessionsCount,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("خطأ في جلب التقارير:", error);
    return NextResponse.json({ error: "تعذر جلب التقارير والإحصائيات." }, { status: 500 });
  }
}
