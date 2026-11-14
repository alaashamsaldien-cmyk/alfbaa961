// حفظ نتائج الاكتشاف — يدفع مدرسة واحدة أو عدة مدارس.
// يطبق منع التكرار الدقيق (Place ID / معرف المصدر) وفحص المشابهة للمراجعة.
import { NextRequest, NextResponse } from "next/server";
import { saveDiscoveredSchools, type SaveCandidate } from "@/lib/geo/save";
import { getCurrentUser } from "@/lib/session";
import { requireAdmin } from "@/lib/auth";
import type { DiscoveredPlace, DiscoveryProvider } from "@/lib/geo/providers";
import type { InstitutionTypeKey } from "@/lib/geo/normalize";

/** تحقق صارم من شكل العنصر الوارد من الواجهة قبل الحفظ */
function parsePlace(raw: unknown): DiscoveredPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const providerRef = typeof p.providerRef === "string" ? p.providerRef : null;
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || !providerRef) return null;
  const osmType = typeof p.osmType === "string" ? p.osmType : undefined;
  const osmId = Number.isFinite(Number(p.osmId)) ? Number(p.osmId) : undefined;
  if (!p.placeId && !(osmType && osmId)) return null; // لا حفظ بلا معرف مصدر قابل للتحقق
  const type = typeof p.institutionType === "string" ? p.institutionType : "OTHER_EDU";
  const rawTypes = Array.isArray(p.rawTypes) ? (p.rawTypes as string[]) : [];
  const sector = p.sector === "GOVERNMENT" || p.sector === "PRIVATE" ? p.sector : undefined;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const mapsUrl = str(p.mapsUrl) ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return {
    provider: (typeof p.provider === "string" ? p.provider : "OSM") as DiscoveryProvider,
    providerRef,
    placeId: typeof p.placeId === "string" ? p.placeId : undefined,
    ...(osmType ? { osmType } : {}),
    ...(osmId !== undefined ? { osmId } : {}),
    name,
    institutionType: type as InstitutionTypeKey,
    rawTypes,
    ...(sector ? { sector } : {}),
    ...(str(p.address) ? { address: str(p.address) } : {}),
    lat,
    lng,
    ...(str(p.phone) ? { phone: str(p.phone) } : {}),
    ...(str(p.website) ? { website: str(p.website) } : {}),
    ...(str(p.facebook) ? { facebook: str(p.facebook) } : {}),
    ...(str(p.instagram) ? { instagram: str(p.instagram) } : {}),
    ...(str(p.regionText) ? { regionText: str(p.regionText) } : {}),
    ...(str(p.governorate) ? { governorate: str(p.governorate) } : {}),
    ...(str(p.stages) ? { stages: str(p.stages) } : {}),
    mapsUrl,
  };
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const user = await getCurrentUser();

    const rawList: unknown[] = Array.isArray(body.places) ? body.places : body.place ? [body.place] : [];
    if (rawList.length === 0) {
      return NextResponse.json({ error: "لا توجد نتائج محددة للحفظ." }, { status: 400 });
    }
    if (rawList.length > 100) {
      return NextResponse.json({ error: "الحد الأقصى 100 مدرسة في عملية الحفظ الواحدة." }, { status: 400 });
    }

    const forceNewIds = new Set<string>(Array.isArray(body.forceNewProviderRefs) ? (body.forceNewProviderRefs as string[]) : []);
    const candidates: SaveCandidate[] = [];
    for (const raw of rawList) {
      const place = parsePlace(raw);
      if (!place) continue;
      candidates.push({ place, forceNew: forceNewIds.has(place.providerRef) });
    }
    if (candidates.length === 0) {
      return NextResponse.json({ error: "النتائج المحددة غير صالحة للحفظ (بلا اسم أو معرف مصدر)." }, { status: 400 });
    }

    const summary = await saveDiscoveredSchools(candidates, {
      sessionProvider: String(body.provider ?? candidates[0].place.provider),
      sessionMode: body.mode === "TEXT" ? "TEXT" : "AREA",
      keyword: body.keyword ?? undefined,
      governorate: body.governorate ?? undefined,
      areaName: body.areaName ?? undefined,
      radiusMeters: body.radiusMeters ? Number(body.radiusMeters) : undefined,
      bounds: body.bounds ?? null,
      types: Array.isArray(body.types) ? (body.types as InstitutionTypeKey[]) : undefined,
      resultCount: Number(body.resultCount ?? candidates.length),
      unnamedCount: Number(body.unnamedCount ?? 0),
      userId: user.id,
      createSession: body.createSession !== false,
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("خطأ في حفظ نتائج الاكتشاف:", error);
    return NextResponse.json({ error: "تعذر حفظ المدارس المحددة. حاول مرة أخرى." }, { status: 500 });
  }
}
