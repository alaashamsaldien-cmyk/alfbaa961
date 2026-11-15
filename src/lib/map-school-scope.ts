import type { Prisma } from "@prisma/client";

export const MAP_SCHOOL_SOURCES = ["CLIENT_KML", "OSM_OVERPASS", "OSM_NOMINATIM", "GOOGLE_PLACES"];
export const MAP_APPROVED = "MAP_APPROVED";

export function isMapSchoolSource(source: string | null): boolean {
  return source !== null && MAP_SCHOOL_SOURCES.includes(source);
}

export const approvedMapSchoolWhere: Prisma.SchoolWhereInput = {
  lat: { not: null },
  lng: { not: null },
  OR: [
    { discoveryStatus: MAP_APPROVED },
    {
      dataSource: { in: MAP_SCHOOL_SOURCES },
      discoveryStatus: { in: ["FIELD_CONFIRMED", "OFFICIALLY_DOCUMENTED"] },
    },
    // Keep Baghdad map assignments that were explicitly made before approval became a separate step.
    { dataSource: "CLIENT_KML", coordinatorId: { not: null } },
  ],
};

export const researchSchoolWhere: Prisma.SchoolWhereInput = {
  OR: [{ dataSource: null }, { dataSource: { notIn: MAP_SCHOOL_SOURCES } }],
};

export const mapSchoolWhere: Prisma.SchoolWhereInput = {
  OR: [{ dataSource: { in: MAP_SCHOOL_SOURCES } }, { discoveryStatus: MAP_APPROVED }],
};
