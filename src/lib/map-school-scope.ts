import type { Prisma } from "@prisma/client";

export const MAP_SCHOOL_SOURCES = ["CLIENT_KML", "OSM_OVERPASS", "OSM_NOMINATIM", "GOOGLE_PLACES"];
export const MAP_APPROVED = "MAP_APPROVED";

export function isMapSchoolSource(source: string | null): boolean {
  return source !== null && MAP_SCHOOL_SOURCES.includes(source);
}

// أُلغيت خطوة «اعتماد الموقع»: كل مدرسة قابلة للتنسيب، وظهورها للمنسقة يحدده التنسيب نفسه فقط.
// يبقى الاسم للتوافق مع المسارات التي تستخدمه.
export const approvedMapSchoolWhere: Prisma.SchoolWhereInput = {};

export const researchSchoolWhere: Prisma.SchoolWhereInput = {
  OR: [{ dataSource: null }, { dataSource: { notIn: MAP_SCHOOL_SOURCES } }],
};

export const mapSchoolWhere: Prisma.SchoolWhereInput = {
  OR: [{ dataSource: { in: MAP_SCHOOL_SOURCES } }, { discoveryStatus: MAP_APPROVED }],
};
