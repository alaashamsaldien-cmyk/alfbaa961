// ——— مدارس الخريطة: كل محافظة ← مناطقها ← أسماء مدارسها ———
// لا توجد خطوة «اعتماد الموقع»: فتح المحافظة يزامن مدارسها تلقائياً ويوزعها على المناطق،
// ثم يطبّق تنسيب المناطق للمنسقات على أي مدرسة جديدة.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { mapSchoolWhere } from "@/lib/map-school-scope";
import { datasetCounts, syncGovernorateMapSchools, type MapSyncResult } from "@/lib/map-sync";
import { IRAQ_GOVERNORATES } from "@/lib/geo/iraq";

const assignedWhere: Prisma.SchoolWhereInput = { OR: [{ coordinatorId: { not: null } }, { assignments: { some: {} } }] };

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const governorate = request.nextUrl.searchParams.get("governorate") || undefined;

    if (!governorate) {
      const [grouped, assigned] = await Promise.all([
        db.school.groupBy({ by: ["governorate"], where: mapSchoolWhere, _count: { _all: true } }),
        db.school.groupBy({ by: ["governorate"], where: { AND: [mapSchoolWhere, assignedWhere] }, _count: { _all: true } }),
      ]);
      const counts: Record<string, number> = datasetCounts();
      for (const row of grouped) {
        if (row.governorate) counts[row.governorate] = Math.max(counts[row.governorate] ?? 0, row._count._all);
      }
      return NextResponse.json({
        counts,
        assignedCounts: Object.fromEntries(assigned.flatMap((row) => row.governorate ? [[row.governorate, row._count._all]] : [])),
      });
    }

    let sync: MapSyncResult | null = null;
    try {
      sync = await syncGovernorateMapSchools(governorate);
    } catch (error) {
      console.error("تعذرت مزامنة مدارس الخريطة", error);
    }

    const [schools, regions] = await Promise.all([
      db.school.findMany({
        where: { governorate, AND: [mapSchoolWhere] },
        select: {
          id: true, name: true, regionId: true, regionText: true, lat: true, lng: true, lastVisitAt: true,
          contractStatus: true,
          coordinator: { select: { id: true, name: true } },
          assignments: { select: { coordinator: { select: { id: true, name: true } } } },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      db.region.findMany({
        where: { governorate, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true,
          coordinatorLinks: { select: { coordinator: { select: { id: true, name: true, isActive: true } } } },
        },
      }),
    ]);

    const perRegion = new Map<string, number>();
    for (const school of schools) if (school.regionId) perRegion.set(school.regionId, (perRegion.get(school.regionId) ?? 0) + 1);

    return NextResponse.json({
      sync,
      regions: regions
        .map((region) => ({
          id: region.id,
          name: region.name,
          schoolCount: perRegion.get(region.id) ?? 0,
          coordinators: region.coordinatorLinks.filter((l) => l.coordinator.isActive).map((l) => ({ id: l.coordinator.id, name: l.coordinator.name })),
        }))
        .filter((region) => region.schoolCount > 0 || region.coordinators.length > 0),
      schools: schools.map(({ assignments, coordinator, ...school }) => {
        const people = new Map<string, string>();
        if (coordinator) people.set(coordinator.id, coordinator.name);
        for (const a of assignments) people.set(a.coordinator.id, a.coordinator.name);
        return { ...school, assigneeNames: [...people.values()] };
      }),
    });
  } catch (error) {
    console.error("تعذر تحميل سجل مدارس الخريطة", error);
    return NextResponse.json({ error: "تعذر تحميل مدارس الخريطة." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));

    // كتابة/تصحيح اسم مدرسة مباشرة من القائمة
    if (body.action === "rename") {
      const schoolId = typeof body.schoolId === "string" ? body.schoolId : "";
      const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
      if (!schoolId || name.length < 2 || name.length > 200) {
        return NextResponse.json({ error: "اكتب اسم مدرسة صحيح (حرفان على الأقل)." }, { status: 400 });
      }
      const before = await db.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      if (!before) return NextResponse.json({ error: "المدرسة غير موجودة." }, { status: 404 });
      await db.school.update({ where: { id: schoolId }, data: { name } });
      await db.auditLog.create({ data: {
        actorType: "ADMIN", actorId: guard.principal.userId, actorName: guard.principal.name,
        action: "RENAME_SCHOOL", entityType: "SCHOOL", entityId: schoolId,
        details: JSON.stringify({ before: before.name, after: name }),
      } });
      return NextResponse.json({ id: schoolId, name });
    }

    // مزامنة كل المحافظات دفعة واحدة
    if (body.action === "syncAll") {
      const results: MapSyncResult[] = [];
      for (const { name } of IRAQ_GOVERNORATES) results.push(await syncGovernorateMapSchools(name));
      const total = results.reduce((acc, r) => ({
        created: acc.created + r.created, linked: acc.linked + r.linked,
        regionLinked: acc.regionLinked + r.regionLinked, assigned: acc.assigned + r.assigned,
      }), { created: 0, linked: 0, regionLinked: 0, assigned: 0 });
      return NextResponse.json({ results, total });
    }

    return NextResponse.json({ error: "عملية غير معروفة." }, { status: 400 });
  } catch (error) {
    console.error("تعذر تنفيذ عملية مدارس الخريطة", error);
    return NextResponse.json({ error: "تعذر تنفيذ العملية. حدّث القائمة وحاول مجددًا." }, { status: 500 });
  }
}
