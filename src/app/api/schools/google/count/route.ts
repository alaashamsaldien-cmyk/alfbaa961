import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { matchesSchoolGovernorate, SCHOOL_GOVERNORATES } from "@/lib/geo/school-governorates";

interface AreaPlace {
  id?: string;
  types?: string[];
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
}

async function googleRequest(url: string, key: string, body: object, fieldMask?: string) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const params = request.nextUrl.searchParams;
  const governorate = SCHOOL_GOVERNORATES.find((item) => item.name === params.get("governorate"));
  const mosul = params.get("area") === "mosul";
  if (!governorate || (mosul && governorate.name !== "نينوى")) {
    return NextResponse.json({ error: "اختر منطقة متاحة." }, { status: 400 });
  }
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: "إجمالي Google غير متاح حتى تفعيل مفتاح Google Places." }, { status: 503 });

  const area = mosul ? "الموصل" : governorate.name;
  const areaType = mosul ? "locality" : "administrative_area_level_1";
  try {
    const search = await googleRequest("https://places.googleapis.com/v1/places:searchText", key, {
      textQuery: mosul ? "مدينة الموصل، نينوى، العراق" : `محافظة ${area}، العراق`,
      regionCode: "IQ",
      languageCode: "ar",
    }, "places.id,places.types,places.addressComponents");
    if (!search.ok) throw new Error("تعذر تحديد حدود المنطقة من Google Places.");
    const result = await search.json() as { places?: AreaPlace[] };
    const region = result.places?.find((place) => {
      const components = place.addressComponents ?? [];
      return place.id && place.types?.includes(areaType)
        && components.some((part) => part.types?.includes("country") && part.shortText === "IQ")
        && components.some((part) => part.types?.includes("administrative_area_level_1")
          && matchesSchoolGovernorate(part.longText ?? "", governorate.name))
        && (!mosul || components.some((part) => part.types?.includes("locality")
          && ["الموصل", "موصل", "mosul"].includes(part.longText?.trim().toLowerCase() ?? "")));
    });
    if (!region?.id) throw new Error("لم ترجع Google حدودًا إدارية مطابقة للمنطقة.");

    const response = await googleRequest("https://areainsights.googleapis.com/v1:computeInsights", key, {
      insights: ["INSIGHT_COUNT"],
      filter: {
        locationFilter: { region: { place: `places/${region.id}` } },
        typeFilter: { includedTypes: ["school", "primary_school", "secondary_school"] },
      },
    });
    if (response.status === 403) throw new Error("تأكد من تفعيل Places Aggregate API والسماح بها لمفتاح الخادم.");
    if (!response.ok) throw new Error("لم تتمكّن Google من حساب المدارس لهذه المنطقة.");
    const data = await response.json() as { count?: string | number };
    const count = Number(data.count ?? NaN);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("لم ترجع Google عددًا صالحًا لهذه المنطقة.");

    return NextResponse.json({ area, count }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error && error.name === "Error" ? error.message : "تعذر جلب إجمالي Google.",
    }, { status: 502 });
  }
}
