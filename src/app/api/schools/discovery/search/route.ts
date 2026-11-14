// بحث الاكتشاف — يبحث فقط ولا يضيف شيئاً إلى قاعدة البيانات.
// يعيد النتائج مع حالة كل نتيجة بالنسبة للنظام (جديدة / موجودة مسبقاً / متشابهة).
import { NextRequest, NextResponse } from "next/server";
import { searchEducationalInstitutions, DiscoveryError, type DiscoveryProvider } from "@/lib/geo/providers";
import { requireAdmin } from "@/lib/auth";
import { checkExisting } from "@/lib/geo/save";
import type { InstitutionTypeKey } from "@/lib/geo/normalize";

const VALID_PROVIDERS: DiscoveryProvider[] = ["OSM", "GOOGLE_PLACES", "OVERPASS"];

function providerOf(v: string | null): DiscoveryProvider {
  return VALID_PROVIDERS.includes(v as DiscoveryProvider) ? (v as DiscoveryProvider) : "OSM";
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));

    const provider = providerOf(String(body.provider ?? "OSM"));
    const mode = body.mode === "TEXT" ? "TEXT" : "AREA";

    const bounds =
      body.bounds && typeof body.bounds === "object"
        ? {
            west: Number(body.bounds.west),
            south: Number(body.bounds.south),
            east: Number(body.bounds.east),
            north: Number(body.bounds.north),
          }
        : undefined;
    const center =
      body.center && typeof body.center === "object"
        ? { lat: Number(body.center.lat), lng: Number(body.center.lng) }
        : undefined;
    const radiusMeters = body.radiusMeters ? Number(body.radiusMeters) : undefined;

    if (mode === "AREA" && !bounds && !(center && radiusMeters)) {
      return NextResponse.json({ error: "حدد النطاق الجغرافي على الخريطة قبل البحث." }, { status: 400 });
    }

    const types = Array.isArray(body.types) ? (body.types as InstitutionTypeKey[]) : undefined;
    const keyword = typeof body.keyword === "string" && body.keyword.trim() ? body.keyword.trim() : undefined;
    const governorate = typeof body.governorate === "string" && body.governorate.trim() ? body.governorate.trim() : undefined;
    const areaName = typeof body.areaName === "string" && body.areaName.trim() ? body.areaName.trim() : undefined;

    const result = await searchEducationalInstitutions({
      provider,
      mode,
      keyword,
      governorate,
      areaName,
      bounds,
      center,
      radiusMeters,
      types,
      maxResults: 200,
    });

    // تحقق من حالة كل نتيجة بالنسبة للنظام (دون أي كتابة)
    const items = await Promise.all(
      result.places.map(async (place) => {
        const status = await checkExisting(place);
        return {
          place,
          inSystem: status.exact,
          existingSchoolId: status.schoolId,
          similarCandidates: status.candidates,
        };
      })
    );

    return NextResponse.json({
      items,
      meta: {
        ...result.meta,
        governorate,
        areaName,
        bounds,
        center,
        radiusMeters,
        keyword,
        types: types ?? null,
      },
    });
  } catch (error) {
    if (error instanceof DiscoveryError) {
      const status = error.code === "BAD_REQUEST" ? 400 : error.code === "NO_KEY" ? 400 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("خطأ في بحث الاكتشاف:", error);
    return NextResponse.json({ error: "تعذر تنفيذ البحث. حاول مرة أخرى." }, { status: 500 });
  }
}
