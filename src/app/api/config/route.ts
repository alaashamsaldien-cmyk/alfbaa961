// إعدادات التشغيل المعلنة للواجهة — لا تُسرّب أي مفاتيح أبداً
import { NextResponse } from "next/server";
import { googlePlacesEnabled } from "@/lib/geo/providers";
import { IRAQ_GOVERNORATES, BAGHDAD_AREAS } from "@/lib/geo/iraq";
import { INSTITUTION_TYPE_LABELS } from "@/lib/geo/normalize";

export async function GET() {
  return NextResponse.json({
    googlePlacesEnabled: googlePlacesEnabled(),
    // خريطة القاعدة للعرض في المتصفح: بلاطات OpenStreetMap المجانية دون مفتاح
    basemapTiles: "OSM",
    governorates: IRAQ_GOVERNORATES.map((g) => ({ name: g.name, center: g.center })),
    baghdadAreas: BAGHDAD_AREAS,
    institutionTypes: Object.entries(INSTITUTION_TYPE_LABELS).map(([key, label]) => ({ key, label })),
    limits: {
      maxResultsPerSearch: 200,
      rateLimitNote: "الحد الأقصى للطلبات لكل عملية بحث يحدد احتراماً لسياسات الخدمات العامة.",
    },
  });
}
