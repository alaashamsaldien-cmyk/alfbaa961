// توزيع المدارس والمناطق — تحليل التخصيص الفعلي من قاعدة البيانات
// لكل منسقة: مدارسها، متعاقداتها، مزاراتها، مناطق تغطيتها
// ولكل منطقة: إجمالي مدارسها ومخصصها وغير مخصصها + آخر زيارة
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const [coordinatorRows, schools, totalSchools] = await Promise.all([
      db.coordinator.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: {
          assignments: {select:{school:{select:{id:true,contractStatus:true,lastVisitAt:true,regionId:true,region:{select:{name:true,governorate:true}}}}}},
          activities: {where:{type:"VISIT"},select:{schoolId:true,occurredAt:true}},
          schools: {
            select: {
              id: true,
              contractStatus: true,
              lastVisitAt: true,
              regionId: true,
              region: { select: { name: true, governorate: true } },
            },
          },
          authSessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
        },
      }),
      db.school.findMany({
        where: { coordinatorId: null, assignments: { none: {} } },
        select: {
          regionId: true,
          region: { select: { name: true, governorate: true } },
        },
      }),
      db.school.count(),
    ]);

    const coordinators = coordinatorRows.map(c=>({...c,schools:[...new Map([...c.schools,...c.assignments.map(a=>a.school)].map(s=>[s.id,s])).values()]}));
    const coordinatorStats = coordinators.map((c) => {
      const visitedSchools = [...new Map(c.activities.map(a=>[a.schoolId,{lastVisitAt:a.occurredAt}])).values()];
      const lastVisit = visitedSchools.reduce<Date | null>(
        (acc, s) => (acc === null || (s.lastVisitAt && s.lastVisitAt > acc) ? s.lastVisitAt : acc),
        null
      );
      const regionCounts = new Map<string, number>();
      for (const s of c.schools) {
        const key = s.region?.name ?? "بلا منطقة";
        regionCounts.set(key, (regionCounts.get(key) ?? 0) + 1);
      }
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        hasAccount: Boolean(c.passwordHash),
        hasActiveSession: c.authSessions.length > 0,
        schoolCount: c.schools.length,
        contractedCount: c.schools.filter((s) => s.contractStatus === "CONTRACTED").length,
        visitedCount: visitedSchools.length,
        lastVisitAt: lastVisit?.toISOString() ?? null,
        regionsCovered: [...regionCounts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      };
    });

    // تغطية المناطق: كل منطقة فيها مدارس — مخصص منها وغير مخصص
    const regionMap = new Map<
      string,
      { regionId: string | null; governorate: string; total: number; assigned: number; unassigned: number }
    >();
    const counted = new Set<string>();
    for (const c of coordinators) {
      for (const s of c.schools) {
        if(counted.has(s.id))continue;
        counted.add(s.id);
        const key = s.region?.name ?? "بلا منطقة";
        const cur = regionMap.get(key) ?? {
          regionId: s.regionId,
          governorate: s.region?.governorate ?? "—",
          total: 0,
          assigned: 0,
          unassigned: 0,
        };
        cur.total += 1;
        cur.assigned += 1;
        regionMap.set(key, cur);
      }
    }
    for (const s of schools) {
      const key = s.region?.name ?? "بلا منطقة";
      const cur = regionMap.get(key) ?? {
        regionId: s.regionId,
        governorate: s.region?.governorate ?? "—",
        total: 0,
        assigned: 0,
        unassigned: 0,
      };
      cur.total += 1;
      cur.unassigned += 1;
      regionMap.set(key, cur);
    }

    const regionCoverage = [...regionMap.entries()]
      .map(([name, v]) => ({ regionName: name, ...v }))
      .sort((a, b) => b.total - a.total);

    const assignedTotal = totalSchools - schools.length;

    return NextResponse.json({
      totalSchools,
      assignedTotal,
      unassignedTotal: totalSchools - assignedTotal,
      coordinatorsCount: coordinatorStats.length,
      coveredRegions: regionCoverage.filter((r) => r.regionName !== "بلا منطقة").length,
      coordinators: coordinatorStats,
      regionCoverage,
      unassignedByRegion: regionCoverage
        .filter((r) => r.unassigned > 0)
        .sort((a, b) => b.unassigned - a.unassigned),
    });
  } catch (error) {
    console.error("خطأ في جلب تحليل التوزيع:", error);
    return NextResponse.json({ error: "تعذر جلب تحليل التوزيع." }, { status: 500 });
  }
}
