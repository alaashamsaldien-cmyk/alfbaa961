import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { DiscoveryError, searchEducationalInstitutions } from "@/lib/geo/providers";
import { SCHOOL_GOVERNORATES } from "@/lib/geo/school-governorates";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const params = request.nextUrl.searchParams;
  const governorate = SCHOOL_GOVERNORATES.find((entry) => entry.name === params.get("governorate"));
  if (!governorate) return NextResponse.json({ error: "اختر محافظة متاحة." }, { status: 400 });
  const keyword = params.get("q")?.trim().slice(0, 120);
  const type = params.get("type") === "institute" ? "COLLEGE_INSTITUTE" : "SCHOOL";
  const category = type === "SCHOOL" ? "مدارس" : "معاهد تعليمية";

  try {
    const { places, meta } = await searchEducationalInstitutions({
      provider: "GOOGLE_PLACES",
      mode: "TEXT",
      keyword: [keyword || category, governorate.name, "العراق"].join(" "),
      governorate: governorate.name,
      types: [type],
    });
    const saved = await db.school.findMany({
      where: { placeId: { in: places.flatMap((place) => place.placeId ? [place.placeId] : []) } },
      select: { id: true, placeId: true, sector: true, lastVisitAt: true, coordinator: { select: { name: true } } },
    });
    const byPlaceId = new Map(saved.map((school) => [school.placeId, school]));
    return NextResponse.json({
      places: places.map((place) => ({ ...place, school: byPlaceId.get(place.placeId ?? "") ?? null })),
      warnings: meta.warnings,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DiscoveryError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "NO_KEY" ? 503 : 502 });
    }
    console.error("تعذر البحث عن مدارس في Google", error);
    return NextResponse.json({ error: "تعذر تحميل نتائج Google Maps." }, { status: 500 });
  }
}
