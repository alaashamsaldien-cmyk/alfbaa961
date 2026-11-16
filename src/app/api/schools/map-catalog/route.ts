import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvedMapSchoolWhere, MAP_APPROVED, MAP_SCHOOL_SOURCES, mapSchoolWhere } from "@/lib/map-school-scope";
import { mapSchoolDatasets } from "@/data/map-schools/catalog";

const sites = new Map(Object.entries(mapSchoolDatasets).flatMap(([governorate, dataset]) =>
  Object.entries(dataset ?? {}).flatMap(([district, schools]) =>
    schools.map((school) => [school.id, { ...school, district, governorate }] as const)),
));
const selection = {
  id: true, name: true, address: true, regionText: true, lat: true, lng: true,
  governorate: true, lastVisitAt: true, coordinator: { select: { name: true } },
  assignments: { select: { coordinator: { select: { name: true } } } },
  osmType: true, osmId: true,
} as const;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const governorate = request.nextUrl.searchParams.get("governorate") || undefined;
    const [grouped, pending, alreadyCataloged, saved] = await Promise.all([
      db.school.groupBy({ by: ["governorate"], where: approvedMapSchoolWhere, _count: { _all: true } }),
      db.school.groupBy({
        by: ["governorate"], where: { AND: [mapSchoolWhere, { NOT: approvedMapSchoolWhere }] }, _count: { _all: true },
      }),
      db.school.findMany({
        where: { governorate: { in: Object.keys(mapSchoolDatasets) }, osmId: { not: null }, AND: [mapSchoolWhere] },
        select: { governorate: true, osmType: true, osmId: true },
      }),
      governorate ? db.school.findMany({
        where: { governorate, AND: [mapSchoolWhere] },
        select: selection, orderBy: [{ name: "asc" }, { id: "asc" }],
      }) : [],
    ]);
    const approved = governorate ? new Set((await db.school.findMany({
      where: { governorate, AND: [approvedMapSchoolWhere] }, select: { id: true },
    })).map(({ id }) => id)) : new Set<string>();
    const pendingCounts = Object.fromEntries(pending.flatMap((row) => row.governorate ? [[row.governorate, row._count._all]] : []));
    const savedSourceIds = new Set(alreadyCataloged.flatMap(({ governorate, osmType, osmId }) => {
      const id = `${osmType}/${osmId}`;
      return sites.get(id)?.governorate === governorate ? [id] : [];
    }));
    for (const [id, { governorate }] of sites) {
      pendingCounts[governorate] ??= 0;
      if (!savedSourceIds.has(id)) pendingCounts[governorate] += 1;
    }
    return NextResponse.json({
      counts: Object.fromEntries(grouped.flatMap((row) => row.governorate ? [[row.governorate, row._count._all]] : [])),
      pendingCounts,
      candidates: governorate && Object.hasOwn(mapSchoolDatasets, governorate) ? mapSchoolDatasets[governorate] : null,
      schools: saved.map(({ osmType, osmId, assignments, ...school }) => ({
        assigneeNames: [...new Set([school.coordinator?.name, ...assignments.map(a=>a.coordinator.name)].filter(Boolean))],
        ...school,
        sourceId: osmType && osmId ? `${osmType}/${osmId}` : null,
        approved: approved.has(school.id),
      })),
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
    if (typeof body.savedId === "string") {
      const result = await db.school.updateMany({
        where: { id: body.savedId, lat: { not: null }, lng: { not: null }, dataSource: { in: MAP_SCHOOL_SOURCES } },
        data: { discoveryStatus: MAP_APPROVED },
      });
      return result.count ? NextResponse.json({ id: body.savedId }) :
        NextResponse.json({ error: "ثبّت موقع المدرسة قبل اعتمادها." }, { status: 400 });
    }

    const site = typeof body.sourceId === "string" ? sites.get(body.sourceId) : undefined;
    if (!site?.name) return NextResponse.json({ error: "اختر موقعًا باسم واضح قبل الاعتماد." }, { status: 400 });
    const name = site.name;
    const [osmType, identity] = site.id.split("/");
    const osmId = BigInt(identity);
    const { governorate } = site;
    const result = await db.$transaction(async (tx) => {
      const already = await tx.school.findUnique({ where: { osmType_osmId: { osmType, osmId } }, select: { id: true, governorate: true, lat: true, lng: true } });
      if (already) {
        if (already.governorate !== governorate) return { provinceConflict: true };
        await tx.school.update({ where: { id: already.id }, data: {
          discoveryStatus: MAP_APPROVED, lat: already.lat ?? site.lat, lng: already.lng ?? site.lng,
        } });
        return { id: already.id };
      }
      const candidates = await tx.school.findMany({
        where: {
          governorate,
          OR: [
            { name: { equals: name, mode: "insensitive" } },
            { lat: { gte: site.lat - 0.00015, lte: site.lat + 0.00015 }, lng: { gte: site.lng - 0.00015, lte: site.lng + 0.00015 } },
          ],
        },
        select: { id: true, name: true, regionText: true, address: true, osmId: true },
        take: 20,
      });
      const link = candidates.find(({ id }) => id === body.linkSchoolId);
      if (candidates.length && !link && body.createSeparate !== true) {
        return { candidates: candidates.map(({ osmId: linkedSource, ...candidate }) => ({ ...candidate, canLink: linkedSource === null })) };
      }
      if (body.linkSchoolId && !link) return { invalidLink: true };
      if (link && link.osmId !== null) return { invalidLink: true };
      const region = await tx.region.upsert({
        where: { name_governorate: { name: site.district, governorate } },
        create: { name: site.district, governorate }, update: {},
      });
      const location = {
        osmType, osmId, lat: site.lat, lng: site.lng, regionText: site.district, regionId: region.id,
        discoveryStatus: MAP_APPROVED,
      };
      const school = link ? await tx.school.update({ where: { id: link.id }, data: location, select: { id: true } }) :
        await tx.school.create({
          data: { ...location, name, governorate, institutionType: "مدرسة", dataSource: "OSM_OVERPASS" },
          select: { id: true },
        });
      return school;
    });
    if ("candidates" in result) return NextResponse.json(result, { status: 409 });
    if ("provinceConflict" in result) return NextResponse.json({ error: "هذا الموقع مسجّل ضمن محافظة أخرى. راجع موقعه والمحافظة قبل الاعتماد." }, { status: 409 });
    if ("invalidLink" in result) return NextResponse.json({ error: "السجل المختار مرتبط بموقع خريطة آخر." }, { status: 409 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("تعذر اعتماد مدرسة الخريطة", error);
    return NextResponse.json({ error: "تعذر اعتماد الموقع. حدّث القائمة وحاول مجددًا." }, { status: 500 });
  }
}
