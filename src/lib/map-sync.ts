// ——— مزامنة مدارس الخريطة تلقائياً (بدون خطوة «اعتماد الموقع») ———
// 1) كل موقع مدرسة من بيانات الخريطة يُضاف مباشرة كمدرسة باسمها وإحداثياتها.
// 2) كل مدرسة تُوزَّع على منطقتها (القضاء) — تُنشأ المنطقة إن لم تكن موجودة.
// 3) المدارس التي تحمل اسم منطقة نصياً بلا ربط تُربط بجدول المناطق.
// 4) تُطبّق تنسيبات المناطق على المدارس الجديدة (مزامنة المنسقات).
// العملية آمنة للتكرار: المفتاح الفريد (osmType, osmId) يمنع التكرار حتى مع طلبات متزامنة.
import { db } from "@/lib/db";
import { mapSchoolDatasets } from "@/data/map-schools/catalog";
import { MAP_APPROVED, mapSchoolWhere } from "@/lib/map-school-scope";
import { syncRegionAssignments } from "@/lib/region-sync";

export const UNNAMED_SCHOOL = "مدرسة بلا اسم";

export interface MapSyncResult {
  governorate: string;
  created: number;
  linked: number;
  regionLinked: number;
  assigned: number;
}

async function ensureRegions(governorate: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length) {
    await db.region.createMany({ data: unique.map((name) => ({ name, governorate })), skipDuplicates: true });
  }
  const rows = await db.region.findMany({ where: { governorate, name: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** يربط مدارس الخريطة التي لها اسم منطقة نصي ولا ترتبط بجدول المناطق (مثل مدارس بغداد من KML) */
async function linkRegionText(governorate: string) {
  const loose = await db.school.groupBy({
    by: ["regionText"],
    where: { governorate, regionId: null, regionText: { not: null }, AND: [mapSchoolWhere] },
    _count: { _all: true },
  });
  const names = loose.flatMap((row) => (row.regionText?.trim() ? [row.regionText.trim()] : []));
  if (!names.length) return 0;
  const regions = await ensureRegions(governorate, names);
  let linked = 0;
  for (const row of loose) {
    const regionId = row.regionText ? regions.get(row.regionText.trim()) : undefined;
    if (!regionId) continue;
    const result = await db.school.updateMany({
      where: { governorate, regionId: null, regionText: row.regionText, AND: [mapSchoolWhere] },
      data: { regionId },
    });
    linked += result.count;
  }
  return linked;
}

export async function syncGovernorateMapSchools(governorate: string): Promise<MapSyncResult> {
  const dataset = Object.hasOwn(mapSchoolDatasets, governorate) ? mapSchoolDatasets[governorate] : undefined;
  let created = 0;
  let linked = 0;

  if (dataset) {
    const sites = Object.entries(dataset).flatMap(([district, entries]) =>
      entries.map((site) => {
        const [osmType, identity] = site.id.split("/");
        return { ...site, district, osmType, osmId: BigInt(identity) };
      }),
    );
    const existing = await db.school.findMany({
      where: { osmId: { in: sites.map((s) => s.osmId) } },
      select: { osmType: true, osmId: true },
    });
    const known = new Set(existing.map((s) => `${s.osmType}/${s.osmId}`));
    const missing = sites.filter((s) => !known.has(s.id));

    if (missing.length) {
      const regions = await ensureRegions(governorate, missing.map((s) => s.district));

      // ربط المدارس الموجودة مسبقاً بنفس الاسم (مثلاً من Excel) بدل إنشاء نسخة مكررة
      const named = missing.filter((s) => s.name);
      const sameName = named.length ? await db.school.findMany({
        where: { governorate, osmId: null, name: { in: [...new Set(named.map((s) => s.name!))] } },
        select: { id: true, name: true, lat: true, lng: true, regionId: true },
      }) : [];
      const byName = new Map<string, typeof sameName>();
      for (const school of sameName) byName.set(school.name, [...(byName.get(school.name) ?? []), school]);
      const nameUse = new Map<string, number>();
      for (const s of named) nameUse.set(s.name!, (nameUse.get(s.name!) ?? 0) + 1);

      const toCreate: typeof missing = [];
      for (const site of missing) {
        const matches = site.name ? byName.get(site.name) : undefined;
        // نربط فقط عند تطابق واحد مؤكد: سجل واحد بهذا الاسم وموقع واحد بهذا الاسم
        if (site.name && matches?.length === 1 && nameUse.get(site.name) === 1) {
          const school = matches[0];
          try {
            await db.school.update({
              where: { id: school.id },
              data: {
                osmType: site.osmType, osmId: site.osmId,
                lat: school.lat ?? site.lat, lng: school.lng ?? site.lng,
                regionId: school.regionId ?? regions.get(site.district) ?? null,
                regionText: site.district, discoveryStatus: MAP_APPROVED,
              },
            });
            linked += 1;
            continue;
          } catch {
            // ربط متزامن من طلب آخر — نترك الإنشاء يتجاهله عبر المفتاح الفريد
          }
        }
        toCreate.push(site);
      }

      if (toCreate.length) {
        const result = await db.school.createMany({
          skipDuplicates: true,
          data: toCreate.map((site) => ({
            name: site.name?.trim() || UNNAMED_SCHOOL,
            governorate,
            institutionType: "مدرسة",
            dataSource: "OSM_OVERPASS",
            discoveryStatus: MAP_APPROVED,
            osmType: site.osmType,
            osmId: site.osmId,
            lat: site.lat,
            lng: site.lng,
            regionText: site.district,
            regionId: regions.get(site.district) ?? null,
            discoveredAt: new Date(),
          })),
        });
        created = result.count;
      }
    }
  }

  const regionLinked = await linkRegionText(governorate);
  const regionIds = (await db.region.findMany({ where: { governorate }, select: { id: true } })).map((r) => r.id);
  const assigned = created || linked || regionLinked ? await syncRegionAssignments(db, { regionIds }) : 0;
  return { governorate, created, linked, regionLinked, assigned };
}

/** عدد مواقع الخريطة لكل محافظة في ملفات البيانات */
export function datasetCounts(): Record<string, number> {
  return Object.fromEntries(Object.entries(mapSchoolDatasets).map(([governorate, dataset]) =>
    [governorate, Object.values(dataset ?? {}).reduce((sum, list) => sum + list.length, 0)]));
}
