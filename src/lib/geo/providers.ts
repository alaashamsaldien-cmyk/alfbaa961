// ——— مزودات اكتشاف المؤسسات التعليمية ———
// ثلاثة مزودات بواجهة موحدة:
//  1) OSM (Nominatim الرسمي) — يعمل بدون مفتاح، بحد 50 نتيجة لكل طلب وفاصل ≥1 ثانية بين الطلبات
//  2) Overpass (OpenStreetMap) — الأشمل للجمع الدفعي؛ يعمل في بيئات تسمح بالوصول إلى خوادمه
//  3) Google Places API (New) — يتطلب GOOGLE_MAPS_API_KEY في متغيرات البيئة (لا يظهر المفتاح أبداً في الواجهة)
//
// التزامات ثابتة:
//  - نتائج البحث مؤسسات تعليمية فقط (فئات محددة مسبقاً) — لا مطاعم ولا أنشطة أخرى.
//  - لا تُجمع إلا الحقول الموجودة فعلاً من المصدر؛ المفقود يبقى «غير متوفرة».
//  - حد أقصى للطلبات والنتائج لكل عملية بحث (لا جمع ضخم أو غير محدود).

import {
  GOOGLE_EDU_TYPES,
  institutionTypeFromGoogle,
  institutionTypeFromOsm,
  sectorFromOsmTags,
  inferStageFromName,
  type InstitutionTypeKey,
} from "./normalize";

export type DiscoveryProvider = "OSM" | "GOOGLE_PLACES" | "OVERPASS";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface DiscoverySearchRequest {
  provider: DiscoveryProvider;
  mode: "TEXT" | "AREA";
  keyword?: string;
  governorate?: string;
  areaName?: string;
  bounds?: Bounds;
  center?: { lat: number; lng: number };
  radiusMeters?: number;
  types?: InstitutionTypeKey[];
  maxResults?: number;
}

export interface DiscoveredPlace {
  provider: DiscoveryProvider;
  /** معرف فريد داخل المزود — يُستخدم لمنع التكرار */
  providerRef: string;
  placeId?: string;
  osmType?: string;
  osmId?: number;
  name?: string;
  institutionType: InstitutionTypeKey;
  rawTypes: string[];
  sector?: "GOVERNMENT" | "PRIVATE";
  address?: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  regionText?: string;
  governorate?: string;
  stages?: string;
  mapsUrl: string;
  rawTags?: Record<string, string>;
}

export interface DiscoverySearchResult {
  places: DiscoveredPlace[];
  meta: {
    provider: DiscoveryProvider;
    requestsMade: number;
    truncated: boolean;
    warnings: string[];
  };
}

export class DiscoveryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ——— مفاتيح الأنواع: أزواج كلمات بحث Nominatim وفلاتر Overpass لكل نوع ———

const TYPE_KEYWORDS: Record<InstitutionTypeKey, string> = {
  SCHOOL: "school",
  KINDERGARTEN: "kindergarten",
  COLLEGE_INSTITUTE: "college",
  UNIVERSITY: "university",
  TRAINING_CENTER: "training",
  LANGUAGE_CENTER: "language school",
  OTHER_EDU: "educational institution",
};

const TYPE_OVERPASS_FILTERS: Record<InstitutionTypeKey, string[]> = {
  SCHOOL: ['["amenity"="school"]'],
  KINDERGARTEN: ['["amenity"="kindergarten"]'],
  COLLEGE_INSTITUTE: ['["amenity"="college"]'],
  UNIVERSITY: ['["amenity"="university"]'],
  TRAINING_CENTER: ['["amenity"="training"]'],
  LANGUAGE_CENTER: ['["amenity"="language_school"]'],
  OTHER_EDU: ['["amenity"="school"]', '["amenity"="college"]'],
};

function normalizeTypes(types?: InstitutionTypeKey[]): InstitutionTypeKey[] {
  if (!types || types.length === 0) return ["SCHOOL", "KINDERGARTEN", "COLLEGE_INSTITUTE", "UNIVERSITY"];
  return types;
}

// ——— مقيد الطلبات المشترك (Nominatim يفرض طلباً واحداً في الثانية) ———

let lastRequestAt = 0;
async function respectRateLimit(minIntervalMs: number) {
  const now = Date.now();
  const wait = lastRequestAt + minIntervalMs - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/** تقسيم الإطار إلى مربعات شبكية إذا كان كبيراً — للبحث على دفعات */
function splitBounds(b: Bounds, maxSideDeg = 0.18): Bounds[] {
  const width = b.east - b.west;
  const height = b.north - b.south;
  if (width <= maxSideDeg && height <= maxSideDeg) return [b];
  const cols = Math.min(2, Math.ceil(width / maxSideDeg));
  const rows = Math.min(2, Math.ceil(height / maxSideDeg));
  const cells: Bounds[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      cells.push({
        west: b.west + (c * width) / cols,
        east: b.west + ((c + 1) * width) / cols,
        south: b.south + (r * height) / rows,
        north: b.south + ((r + 1) * height) / rows,
      });
    }
  }
  return cells;
}

/** إزالة النتائج المكررة بين مربعات الشبكة */
function dedupById(places: DiscoveredPlace[]): DiscoveredPlace[] {
  const seen = new Set<string>();
  const out: DiscoveredPlace[] = [];
  for (const p of places) {
    if (seen.has(p.providerRef)) continue;
    seen.add(p.providerRef);
    out.push(p);
  }
  return out;
}

// ——— مزود OpenStreetMap عبر Nominatim ———

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_UA = "AlifBaaSchoolPlatform/1.0 (school management system)";
const NOMINATIM_LIMIT_PER_REQ = 50;
const MAX_NOMINATIM_REQUESTS_PER_SEARCH = 8;

async function nominatimFetch(params: URLSearchParams, requestsMade: { n: number }): Promise<{ json: unknown }> {
  if (requestsMade.n >= MAX_NOMINATIM_REQUESTS_PER_SEARCH) {
    throw new DiscoveryError("RATE_LIMIT_LOCAL", "تم بلوغ الحد الأقصى لطلبات الاكتشاف في هذه العملية (احتراماً لسياسة استخدام الخدمة العامة).");
  }
  await respectRateLimit(1100);
  const url = `${NOMINATIM_BASE}/search?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_UA, "Accept-Language": "ar,en" },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch (e) {
    throw new DiscoveryError(
      "NETWORK",
      `تعذر الوصول إلى خدمة Nominatim العامة: ${e instanceof Error ? e.message : "خطأ شبكة"}`
    );
  }
  requestsMade.n++;
  if (res.status === 429 || res.status === 503) {
    // إعادة محاولة واحدة بعد انتظار — احتراماً لسياسة الاستخدام
    await new Promise((r) => setTimeout(r, 3000));
    await respectRateLimit(1100);
    try {
      res = await fetch(url, {
        headers: { "User-Agent": NOMINATIM_UA, "Accept-Language": "ar,en" },
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
    } catch (e) {
      throw new DiscoveryError("NETWORK", `تعذر الوصول إلى Nominatim بعد إعادة المحاولة: ${e instanceof Error ? e.message : ""}`);
    }
    if (res.status === 429 || res.status === 503) {
      throw new DiscoveryError("RATE_LIMIT_REMOTE", "خدمة Nominatim العامة مشغولة حالياً (تجاوز حد الطلبات). حاول بعد لحظات.");
    }
  }
  if (!res.ok) {
    throw new DiscoveryError("UPSTREAM", `استجابة غير متوقعة من Nominatim (HTTP ${res.status}).`);
  }
  return { json: await res.json() };
}

interface NominatimItem {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

function mapNominatimItem(it: NominatimItem): DiscoveredPlace | null {
  const lat = Number(it.lat);
  const lng = Number(it.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const name = (it.name ?? "").trim();
  if (!name) return null; // كائن بلا اسم لا يُسجل كمدرسة
  const tags = { ...(it.extratags ?? {}), ...(it.address ?? {}) };
  const type = institutionTypeFromOsm(it.category, it.type);
  const sector = sectorFromOsmTags(it.extratags ?? {});
  const stage = inferStageFromName(name);
  const addr = it.display_name ?? undefined;
  const regionText =
    it.address?.["neighbourhood"] ?? it.address?.["quarter"] ?? it.address?.["suburb"] ?? it.address?.["city_district"] ?? undefined;
  const govRaw = it.address?.["state"] ?? undefined;
  const gov = govRaw ? govRaw.replace(/^(محافظة|محافظه|مديرية)\s*/, "") : undefined;
  const phone = it.extratags?.["phone"] ?? it.extratags?.["contact:phone"] ?? undefined;
  const website = it.extratags?.["website"] ?? it.extratags?.["contact:website"] ?? undefined;
  const fb = it.extratags?.["contact:facebook"] ?? it.extratags?.["facebook"] ?? undefined;
  const ig = it.extratags?.["contact:instagram"] ?? it.extratags?.["instagram"] ?? undefined;
  return {
    provider: "OSM",
    providerRef: `osm:${it.osm_type}:${it.osm_id}`,
    osmType: it.osm_type,
    osmId: it.osm_id,
    name,
    institutionType: type,
    rawTypes: [`${it.category ?? ""}=${it.type ?? ""}`],
    ...(sector ? { sector } : {}),
    ...(addr ? { address: addr } : {}),
    lat,
    lng,
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    ...(fb ? { facebook: fb } : {}),
    ...(ig ? { instagram: ig } : {}),
    ...(regionText ? { regionText } : {}),
    ...(gov ? { governorate: gov } : {}),
    ...(stage ? { stages: stage } : {}),
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    rawTags: it.extratags,
  };
}

async function searchOsm(req: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
  const types = normalizeTypes(req.types);
  const bounds = req.bounds;
  if (!bounds) throw new DiscoveryError("BAD_REQUEST", "حدود النطاق الجغرافي مطلوبة للبحث في المصادر العامة.");

  const warnings: string[] = [];
  const requestsMade = { n: 0 };
  const collected: DiscoveredPlace[] = [];
  const cells = splitBounds(bounds);
  let truncated = false;

  outer: for (const cell of cells) {
    const vb = `${cell.west},${cell.north},${cell.east},${cell.south}`; // west,north,east,south
    for (const type of types) {
      const params = new URLSearchParams({
        q: TYPE_KEYWORDS[type],
        viewbox: vb,
        bounded: "1",
        format: "jsonv2",
        limit: String(NOMINATIM_LIMIT_PER_REQ),
        addressdetails: "1",
        extratags: "1",
      });
      if (req.mode === "TEXT" && req.keyword) {
        params.set("q", `${req.keyword} ${TYPE_KEYWORDS[type]}`);
      }
      const { json } = await nominatimFetch(params, requestsMade);
      const items = Array.isArray(json) ? (json as NominatimItem[]) : [];
      for (const it of items) {
        const mapped = mapNominatimItem(it);
        if (mapped) collected.push(mapped);
        if (req.maxResults && collected.length >= req.maxResults) {
          truncated = true;
          break outer;
        }
      }
    }
  }

  // حصر النتائج في المؤسسات التعليمية فقط — أي عنصر ليس من فئات التعليم يُستبعد
  const eduOnly = dedupById(collected).filter((p) =>
    ["SCHOOL", "KINDERGARTEN", "COLLEGE_INSTITUTE", "UNIVERSITY", "TRAINING_CENTER", "LANGUAGE_CENTER", "OTHER_EDU"].includes(
      p.institutionType
    )
  );

  if (cells.length > 1) {
    warnings.push(`تم البحث على ${cells.length} مربعات شبكية لتغطية النطاق.`);
  }
  if (requestsMade.n >= MAX_NOMINATIM_REQUESTS_PER_SEARCH) {
    warnings.push("بلوغ حد طلبات الخدمة العامة قد يقلص تغطية النطاق — وسّع البحث عبر عمليات أصغر حسب المنطقة.");
  }

  return {
    places: eduOnly,
    meta: { provider: "OSM", requestsMade: requestsMade.n, truncated, warnings },
  };
}

// ——— مزود Overpass (الأشمل للجمع الدفعي من OpenStreetMap) ———

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

function overpassQuery(filters: string[], b: Bounds): string {
  const bb = `(${b.south},${b.west},${b.north},${b.east})`;
  const parts = filters.map((f) => `node${f}${bb};way${f}${bb};relation${f}${bb};`).join("");
  return `[out:json][timeout:25];${parts} out center tags;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function searchOverpass(req: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
  const types = normalizeTypes(req.types);
  const bounds = req.bounds;
  if (!bounds) throw new DiscoveryError("BAD_REQUEST", "حدود النطاق الجغرافي مطلوبة.");

  const filters = [...new Set(types.flatMap((t) => TYPE_OVERPASS_FILTERS[t] ?? []))];
  const query = overpassQuery(filters, bounds);
  const warnings: string[] = [];
  let lastErr: unknown = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(30000),
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = new DiscoveryError("UPSTREAM", `Overpass استجاب بـ HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassElement[] };
      const places: DiscoveredPlace[] = [];
      for (const el of json.elements ?? []) {
        const latC = el.lat ?? el.center?.lat;
        const lngC = el.lon ?? el.center?.lon;
        if (!Number.isFinite(latC) || !Number.isFinite(lngC)) continue;
        const lat = latC as number;
        const lng = lngC as number;
        const tags = el.tags ?? {};
        const name = (tags["name"] ?? tags["name:ar"] ?? "").trim();
        if (!name) continue;
        const category = tags["amenity"] ?? "";
        const otype = tags["amenity"] ?? "";
        const type = institutionTypeFromOsm(category === otype ? "amenity" : category, otype);
        const sector = sectorFromOsmTags(tags);
        const stage = inferStageFromName(name);
        const phone = tags["phone"] ?? tags["contact:phone"] ?? undefined;
        const website = tags["website"] ?? tags["contact:website"] ?? undefined;
        const fb = tags["contact:facebook"] ?? tags["facebook"] ?? undefined;
        const ig = tags["contact:instagram"] ?? tags["instagram"] ?? undefined;
        places.push({
          provider: "OVERPASS",
          providerRef: `osm:${el.type}:${el.id}`,
          osmType: el.type,
          osmId: el.id,
          name,
          institutionType: type,
          rawTypes: Object.keys(tags)
            .filter((k) => k.startsWith("amenity") || k.startsWith("education"))
            .map((k) => `${k}=${tags[k]}`),
          ...(sector ? { sector } : {}),
          ...(tags["addr:street"] ? { address: `${tags["addr:street"]}${tags["addr:housenumber"] ? " " + tags["addr:housenumber"] : ""}` } : {}),
          lat,
          lng,
          ...(phone ? { phone } : {}),
          ...(website ? { website } : {}),
          ...(fb ? { facebook: fb } : {}),
          ...(ig ? { instagram: ig } : {}),
          ...(tags["addr:suburb"] ?? tags["addr:neighbourhood"] ? { regionText: tags["addr:suburb"] ?? tags["addr:neighbourhood"] } : {}),
          ...(tags["addr:state"] ? { governorate: tags["addr:state"] } : {}),
          ...(stage ? { stages: stage } : {}),
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
          rawTags: tags,
        });
        if (req.maxResults && places.length >= req.maxResults) break;
      }
      return { places: dedupById(places), meta: { provider: "OVERPASS", requestsMade: 1, truncated: false, warnings } };
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw new DiscoveryError(
    "NETWORK",
    `تعذر الوصول إلى خوادم Overpass من بيئة التشغيل الحالية (${lastErr instanceof Error ? lastErr.message : "خطأ شبكة"}). استخدم مزود OSM أو Google Places، أو فعّل الوصول من بيئة الإنتاج.`
  );
}

// ——— مزود Google Places API (New) ———

function googleApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || null;
}

export function googlePlacesEnabled(): boolean {
  return Boolean(googleApiKey());
}

const GOOGLE_FIELDS_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri";

function mapGooglePlace(p: {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
}): DiscoveredPlace | null {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !p.id) return null;
  const name = (p.displayName?.text ?? "").trim();
  if (!name) return null;
  const eduTypes = (p.types ?? []).filter((t) => (GOOGLE_EDU_TYPES as readonly string[]).includes(t));
  const type = institutionTypeFromGoogle(eduTypes.length ? eduTypes : p.types);
  const stage = inferStageFromName(name);
  const phone = p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? undefined;
  return {
    provider: "GOOGLE_PLACES",
    providerRef: `google:${p.id}`,
    placeId: p.id,
    name,
    institutionType: type,
    rawTypes: eduTypes,
    ...(p.formattedAddress ? { address: p.formattedAddress } : {}),
    lat: lat!,
    lng: lng!,
    ...(phone ? { phone } : {}),
    ...(p.websiteUri ? { website: p.websiteUri } : {}),
    ...(stage ? { stages: stage } : {}),
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(p.id)}`,
  };
}

async function googlePost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = googleApiKey();
  if (!key) throw new DiscoveryError("NO_KEY", "مفتاح Google Maps API غير مهيأ في متغيرات البيئة (GOOGLE_MAPS_API_KEY).");
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": GOOGLE_FIELDS_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  }).catch((e) => {
    throw new DiscoveryError("NETWORK", `تعذر الوصول إلى Google Places: ${e instanceof Error ? e.message : ""}`);
  });
  if (res.status === 403) throw new DiscoveryError("AUTH", "مفتاح Google API مرفوض أو غير مفعّل لـ Places API (New).");
  if (res.status === 429) throw new DiscoveryError("RATE_LIMIT_REMOTE", "تجاوز حد طلبات Google API. أوقف البحث مؤقتاً أو راجع حدود المفتاح.");
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new DiscoveryError("UPSTREAM", `استجابة غير متوقعة من Google Places (HTTP ${res.status}): ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function searchGoogle(req: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
  const types = normalizeTypes(req.types);
  const includedTypes = [...new Set(types.flatMap((t) => {
    switch (t) {
      case "SCHOOL": return ["school", "primary_school", "secondary_school"];
      case "KINDERGARTEN": return ["kindergarten", "preschool"];
      case "COLLEGE_INSTITUTE": return ["college"];
      case "UNIVERSITY": return ["university"];
      default: return [];
    }
  }))];
  if (includedTypes.length === 0) includedTypes.push("school");

  const warnings: string[] = [];
  const places: DiscoveredPlace[] = [];

  if (req.mode === "AREA" && req.center && req.radiusMeters) {
    const radius = Math.min(50000, Math.max(100, Math.round(req.radiusMeters)));
    const json = await googlePost({
      includedTypes,
      maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude: req.center.lat, longitude: req.center.lng }, radius } },
    });
    for (const p of (json["places"] as unknown[]) ?? []) {
      const mapped = mapGooglePlace(p as Parameters<typeof mapGooglePlace>[0]);
      if (mapped) places.push(mapped);
      if (req.maxResults && places.length >= req.maxResults) break;
    }
    if ((places.length ?? 0) >= 20) warnings.push("بحث Google للمنطقة القريبة يعيد 20 نتيجة كحد أقصى لكل طلب — قسّم النطاق لدوائر أصغر لمزيد من النتائج.");
  } else {
    // بحث نصي ضمن مستطيل المحافظة/المنطقة (locationBias وليس قيداً صارماً — نصف النتائج فقط يبقى ضمن الإطار، يُرشَّح لاحقاً)
    const b = req.bounds;
    if (!b) throw new DiscoveryError("BAD_REQUEST", "حدود النطاق مطلوبة للبحث النصي.");
    const text = req.keyword ? req.keyword : "مدرسة";
    const json = await googlePost({
      textQuery: text,
      includedTypes,
      maxResultCount: 20,
      locationBias: {
        rectangle: { low: { latitude: b.south, longitude: b.west }, high: { latitude: b.north, longitude: b.east } },
      },
    });
    for (const p of (json["places"] as unknown[]) ?? []) {
      const mapped = mapGooglePlace(p as Parameters<typeof mapGooglePlace>[0]);
      if (mapped && mapped.lat >= b.south && mapped.lat <= b.north && mapped.lng >= b.west && mapped.lng <= b.east) {
        places.push(mapped);
      }
      if (req.maxResults && places.length >= req.maxResults) break;
    }
    warnings.push("البحث النصي في Google يُرتّب النتائج حسب الصلة ولا يجلب كل مؤسسات النطاق — استخدم النطاق الجغرافي (دائرة) لمغطى أدق.");
  }

  return { places: dedupById(places), meta: { provider: "GOOGLE_PLACES", requestsMade: 1, truncated: false, warnings } };
}

// ——— الواجهة الموحدة ———

export async function searchEducationalInstitutions(req: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
  switch (req.provider) {
    case "OSM":
      return searchOsm(req);
    case "OVERPASS":
      return searchOverpass(req);
    case "GOOGLE_PLACES":
      return searchGoogle(req);
    default:
      throw new DiscoveryError("BAD_REQUEST", "مزود بحث غير معروف.");
  }
}

export { MAX_NOMINATIM_REQUESTS_PER_SEARCH, NOMINATIM_LIMIT_PER_REQ };
