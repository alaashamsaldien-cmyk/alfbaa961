// ——— طبقة استعلام المدارس المشتركة — فلاتر شاملة تُستخدم في القائمة والتصدير ———
import { db } from "@/lib/db";
import { isInsideIraq } from "@/lib/geo/iraq";
import { SCHOOL_GOVERNORATES } from "@/lib/geo/school-governorates";
import { computeDataQuality } from "@/lib/geo/normalize";
import { researchSchoolWhere } from "@/lib/map-school-scope";

export interface SchoolFilters {
  researchOnly?: boolean;
  q?: string;
  governorate?: string;
  regionId?: string;
  institutionType?: string;
  sector?: string;
  visitStatus?: "VISITED" | "NOT_VISITED";
  contractStatus?: string;
  availabilityStatus?: string;
  hasPhone?: boolean;
  hasPrincipal?: boolean;
  hasLocation?: boolean;
  verificationStatus?: string;
  coordinatorId?: string;
  dataSource?: string;
  page?: number;
  pageSize?: number;
  sort?: "name" | "createdAt" | "dataQuality";
  onlyMap?: boolean;
  schoolCoverage?: boolean;
}

export function parseSchoolFilters(sp: URLSearchParams): SchoolFilters {
  const bool = (v: string | null) => (v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : undefined);
  const visitRaw = sp.get("visitStatus");
  const visitStatus: "VISITED" | "NOT_VISITED" | undefined =
    visitRaw === "VISITED" || visitRaw === "NOT_VISITED" ? visitRaw : undefined;
  const sortRaw = sp.get("sort");
  const sort: "name" | "createdAt" | "dataQuality" =
    sortRaw === "name" || sortRaw === "dataQuality" ? sortRaw : "createdAt";
  return {
    researchOnly: sp.get("catalog") === "research",
    q: sp.get("q")?.trim() || undefined,
    governorate: sp.get("governorate")?.trim() || undefined,
    regionId: sp.get("regionId")?.trim() || undefined,
    institutionType: sp.get("institutionType")?.trim() || undefined,
    sector: sp.get("sector")?.trim() || undefined,
    visitStatus,
    contractStatus: sp.get("contractStatus")?.trim() || undefined,
    availabilityStatus: sp.get("availabilityStatus")?.trim() || undefined,
    hasPhone: bool(sp.get("hasPhone")),
    hasPrincipal: bool(sp.get("hasPrincipal")),
    hasLocation: bool(sp.get("hasLocation")),
    verificationStatus: sp.get("verificationStatus")?.trim() || undefined,
    coordinatorId: sp.get("coordinatorId")?.trim() || undefined,
    dataSource: sp.get("dataSource")?.trim() || undefined,
    page: Math.max(1, Number(sp.get("page") ?? 1) || 1),
    pageSize: Math.min(200, Math.max(5, Number(sp.get("pageSize") ?? 25) || 25)),
    sort,
    onlyMap: sp.get("onlyMap") === "1",
    schoolCoverage: sp.get("schoolCoverage") === "1",
  };
}

export function schoolWhere(filters: SchoolFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];
  if (filters.researchOnly) and.push(researchSchoolWhere);

  if (filters.q) {
    and.push({
      OR: [
        { name: { contains: filters.q } },
        { address: { contains: filters.q } },
        { regionText: { contains: filters.q } },
        { region: { is: { name: { contains: filters.q } } } },
      ],
    });
  }
  if (filters.schoolCoverage) and.push({ governorate: { in: SCHOOL_GOVERNORATES.map(({ name }) => name) } });
  if (filters.governorate) and.push({ governorate: filters.governorate });
  if (filters.regionId) and.push({ regionId: filters.regionId });
  if (filters.institutionType) and.push({ institutionType: filters.institutionType });
  if (filters.sector) and.push({ sector: filters.sector });
  if (filters.visitStatus === "VISITED") and.push({ lastVisitAt: { not: null } });
  if (filters.visitStatus === "NOT_VISITED") and.push({ lastVisitAt: null });
  if (filters.contractStatus) and.push({ contractStatus: filters.contractStatus });
  if (filters.availabilityStatus) and.push({ availabilityStatus: filters.availabilityStatus });
  if (filters.hasPhone !== undefined) and.push({ phone: filters.hasPhone ? { not: null } : null });
  if (filters.hasPrincipal !== undefined) and.push({ principalName: filters.hasPrincipal ? { not: null } : null });
  if (filters.hasLocation !== undefined) and.push({ lat: filters.hasLocation ? { not: null } : null });
  if (filters.verificationStatus) and.push({ discoveryStatus: filters.verificationStatus });
  if (filters.coordinatorId) and.push({ coordinatorId: filters.coordinatorId });
  if (filters.dataSource) and.push({ dataSource: filters.dataSource });

  where.AND = and;
  return where;
}

const SCHOOL_SELECT = {
  id: true,
  name: true,
  governorate: true,
  regionId: true,
  region: { select: { id: true, name: true, governorate: true } },
  regionText: true,
  institutionType: true,
  stage: true,
  principalName: true,
  phone: true,
  address: true,
  locationUrl: true,
  lat: true,
  lng: true,
  placeId: true,
  osmType: true,
  osmId: true,
  dataSource: true,
  sector: true,
  studentCount: true,
  stages: true,
  website: true,
  facebookUrl: true,
  instagramUrl: true,
  otherLinks: true,
  availabilityStatus: true,
  contractStatus: true,
  platformName: true,
  coordinatorId: true,
  coordinator: { select: { id: true, name: true } },
  lastVisitAt: true,
  notes: true,
  discoveryStatus: true,
  fieldMeta: true,
  dataQuality: true,
  discoveredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SchoolRow = {
  [K in keyof typeof SCHOOL_SELECT]: unknown;
} & {
  id: string;
  name: string;
  governorate: string | null;
  region: { id: string; name: string; governorate: string } | null;
  regionText: string | null;
  institutionType: string | null;
  principalName: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  sector: string | null;
  studentCount: number | null;
  stages: string | null;
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  otherLinks: string | null;
  availabilityStatus: string;
  contractStatus: string;
  coordinator: { id: string; name: string } | null;
  lastVisitAt: Date | null;
  notes: string | null;
  discoveryStatus: string;
  fieldMeta: string | null;
  dataQuality: number;
  discoveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  locationUrl: string | null;
  placeId: string | null;
  osmType: string | null;
  osmId: bigint | null;
  dataSource: string | null;
  platformName: string | null;
  coordinatorId: string | null;
  stage: string | null;
};

export function mapSchool(s: SchoolRow) {
  const hasCoords = s.lat !== null && s.lng !== null && Number.isFinite(s.lat) && Number.isFinite(s.lng);
  const mapsUrl =
    hasCoords
      ? s.placeId
        ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}&query_place_id=${encodeURIComponent(s.placeId)}`
        : `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
      : null;
  let fieldMeta: unknown = null;
  if (s.fieldMeta) {
    try {
      fieldMeta = JSON.parse(s.fieldMeta);
    } catch {
      fieldMeta = null;
    }
  }
  let otherLinks: string[] = [];
  if (s.otherLinks) {
    try {
      otherLinks = JSON.parse(s.otherLinks);
    } catch {
      otherLinks = [];
    }
  }
  const coordValid = hasCoords ? isInsideIraq(s.lat!, s.lng!) : null;
  return {
    ...s,
    // تحويل معرف OSM من BigInt إلى رقم عادي (معرفات OSM ضمن مدى الأرقام الآمنة في JS)
    osmId: s.osmId !== null && s.osmId !== undefined ? Number(s.osmId) : null,
    lastVisitAt: s.lastVisitAt ? s.lastVisitAt.toISOString() : null,
    discoveredAt: s.discoveredAt ? s.discoveredAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    regionName: s.region?.name ?? s.regionText ?? null,
    hasCoords,
    coordOutsideIraq: coordValid === false,
    mapsUrl,
    fieldMeta,
    otherLinks,
    qualityHint: computeDataQuality({
      phone: s.phone,
      principalName: s.principalName,
      lat: s.lat,
      lng: s.lng,
      institutionType: s.institutionType,
      sector: s.sector,
      regionText: s.regionText,
      studentCount: s.studentCount,
      stages: s.stages,
      website: s.website,
      address: s.address,
      facebookUrl: s.facebookUrl,
      instagramUrl: s.instagramUrl,
    }),
  };
}

export async function listSchools(filters: SchoolFilters) {
  const where = schoolWhere(filters);
  const mapWhere = { AND: [where, { lat: { not: null }, lng: { not: null } }] };
  const dataWhere = filters.onlyMap ? mapWhere : where;
  const [total, schools, mappedTotal] = await Promise.all([
    db.school.count({ where: where as never }),
    db.school.findMany({
      where: dataWhere as never,
      include: {
        region: true,
        coordinator: { select: { id: true, name: true } },
        schoolVisits: {
          where: { OR: [{ coordinatorId: { not: null } }, { contactType: "FIELD_VISIT" }] },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, coordinator: { select: { name: true } }, employee: { select: { name: true } } },
        },
        activities: {
          where: { type: "VISIT" },
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { occurredAt: true, coordinator: { select: { name: true } }, user: { select: { name: true } } },
        },
      },
      orderBy: filters.sort === "name" ? { name: "asc" } : filters.sort === "dataQuality" ? { dataQuality: "desc" } : { createdAt: "desc" },
      skip: filters.onlyMap ? 0 : (filters.page! - 1) * filters.pageSize!,
      take: filters.onlyMap ? 2000 : filters.pageSize,
    }),
    filters.onlyMap ? db.school.count({ where: mapWhere as never }) : undefined,
  ]);
  return { total, mappedTotal, schools: schools.map(({ schoolVisits, activities, ...school }) => {
    const visit = schoolVisits[0];
    const activity = activities[0];
    const visitIsLatest = visit && (!activity || visit.createdAt >= activity.occurredAt);
    return {
      ...mapSchool(school as SchoolRow),
      lastVisitorName: visitIsLatest
        ? visit.coordinator?.name ?? visit.employee?.name ?? null
        : activity?.coordinator?.name ?? activity?.user?.name ?? null,
    };
  }) };
}

/** خيارات الفلاتر الفعلية من قاعدة البيانات (لعرضها في الواجهة) */
export async function schoolFilterOptions(researchOnly = false) {
  const [governorates, institutionTypes, regions, coordinators] = await Promise.all([
    db.school.groupBy({ by: ["governorate"], where: {
      governorate: { not: null }, ...(researchOnly ? { AND: [researchSchoolWhere] } : {}),
    }, _count: { _all: true } }),
    db.school.findMany({ where: { institutionType: { not: null } }, distinct: ["institutionType"], select: { institutionType: true } }),
    db.region.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, governorate: true } }),
    db.coordinator.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    governorates: governorates.map((g) => g.governorate as string).sort((a, b) => a.localeCompare(b, "ar")),
    governorateCounts: Object.fromEntries(
      governorates.flatMap((row) => row.governorate ? [[row.governorate, row._count._all]] : []),
    ),
    institutionTypes: institutionTypes.map((t) => t.institutionType as string).sort((a, b) => a.localeCompare(b, "ar")),
    regions,
    coordinators,
  };
}
