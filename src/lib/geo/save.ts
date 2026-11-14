// ——— طبقة حفظ المدارس المكتشفة مع منع التكرار وفحص المشابهة ———
// قواعد ثابتة:
//  - التطابق الدقيق: نفس Google Place ID أو نفس معرف OSM (نوع+رقم) → لا إضافة.
//  - لا تُدمج مدرستان لمجرد تشابه الاسمين — المتشابهات تُعرض للمراجعة فقط.
//  - المنطقة تُنشأ تلقائياً إذا لم تكن مسجلة (مطابقة بالاسم داخل المحافظة).
//  - كل حقل له قيمة يحصل على مُدخل توثيق مستقل (المصدر + التاريخ + الحالة + الموثوقية).

import { db } from "@/lib/db";
import { distanceMeters } from "./iraq";
import {
  buildDiscoveryFieldMeta,
  computeDataQuality,
  googleMapsUrl,
  nameSimilarity,
  type FieldMeta,
  type InstitutionTypeKey,
  INSTITUTION_TYPE_LABELS,
} from "./normalize";
import type { DiscoveredPlace } from "./providers";

export interface SaveCandidate {
  place: DiscoveredPlace;
  /** تجاهل فحص المشابهة (بعد قرار المستخدم في المراجعة) */
  forceNew?: boolean;
}

export type SaveItemStatus =
  | { state: "SAVED"; schoolId: string; name: string }
  | { state: "DUPLICATE"; name: string; existingSchoolId: string; reason: string }
  | { state: "SIMILAR_REVIEW"; name: string; candidates: { schoolId: string; name: string; similarity: number; distanceM: number | null }[] };

export interface SaveSummary {
  items: SaveItemStatus[];
  addedCount: number;
  duplicateCount: number;
  reviewCount: number;
  sessionId: string;
}

// ——— توليد بيانات التوثيق من نتيجة اكتشاف ———

function fieldMetaFromPlace(place: DiscoveredPlace): FieldMeta {
  const provider = place.provider === "GOOGLE_PLACES" ? "GOOGLE_PLACES" : place.provider === "OVERPASS" ? "OSM_OVERPASS" : "OSM";
  const sourceRef = place.placeId
    ? `place_id:${place.placeId}`
    : place.osmType && place.osmId
      ? `osm:${place.osmType}/${place.osmId}`
      : place.providerRef;

  const fields: Record<string, { value: unknown; reliability?: number; source?: string }> = {
    name: { value: place.name, reliability: 0.85 },
    institutionType: { value: place.institutionType, reliability: place.rawTypes.some((t) => t.includes("amenity=")) ? 0.75 : 0.6 },
    sector: { value: place.sector, reliability: 0.7 },
    address: { value: place.address, reliability: 0.65 },
    lat: { value: place.lat, reliability: 0.9 },
    lng: { value: place.lng, reliability: 0.9 },
    phone: { value: place.phone, reliability: 0.6 },
    website: { value: place.website, reliability: 0.6 },
    facebookUrl: { value: place.facebook, reliability: 0.6 },
    instagramUrl: { value: place.instagram, reliability: 0.6 },
    regionText: { value: place.regionText, reliability: 0.55 },
    stages: place.stages ? { value: place.stages, reliability: 0.4, source: "NAME_INFERENCE" } : { value: null },
  };

  return buildDiscoveryFieldMeta({
    provider: place.provider === "GOOGLE_PLACES" ? "GOOGLE_PLACES" : "OSM",
    sourceRef,
    fields,
  });
}

// ——— المطابقة مع جدول المناطق ———

async function resolveRegion(regionText: string | null | undefined, governorate: string | null | undefined) {
  const name = (regionText ?? "").trim();
  if (!name) return null;
  const gov = (governorate ?? "بغداد").trim() || "بغداد";
  const existing = await db.region.findFirst({
    where: { name, governorate: { in: [gov] } },
  });
  if (existing) return existing;
  return db.region.create({ data: { name, governorate: gov } });
}

// ——— فحص التطابق والمشابهة ———

async function findExactDuplicate(place: DiscoveredPlace) {
  if (place.placeId) {
    const byPlace = await db.school.findUnique({ where: { placeId: place.placeId } });
    if (byPlace) return byPlace;
  }
  if (place.osmType && place.osmId) {
    const byOsm = await db.school.findFirst({
      where: { osmType: place.osmType, osmId: place.osmId },
    });
    if (byOsm) return byOsm;
  }
  return null;
}

interface ExistingSchoolLite {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

async function findSimilarCandidates(place: DiscoveredPlace, max = 5) {
  const candidates: { schoolId: string; name: string; similarity: number; distanceM: number | null }[] = [];
  // نطاق فحص عملي: مدارس بنفس المحافظة إن عرفناها، وإلا مدارس قريبة جغرافياً
  const pool = await db.school.findMany({
    where: place.governorate ? { governorate: { equals: place.governorate } } : {},
    select: { id: true, name: true, lat: true, lng: true },
    take: 2000,
    orderBy: { createdAt: "desc" },
  });

  for (const s of pool as ExistingSchoolLite[]) {
    const sim = nameSimilarity(place.name, s.name);
    let dist: number | null = null;
    if (s.lat !== null && s.lng !== null) {
      dist = distanceMeters(place.lat, place.lng, s.lat, s.lng);
    }
    // قواعد المشابهة: تشابه اسم قوي، أو تشابه متوسط مع قرب جغرافي واضح
    const similar = sim >= 0.82 || (sim >= 0.6 && dist !== null && dist <= 150);
    if (similar) {
      candidates.push({ schoolId: s.id, name: s.name, similarity: Math.round(sim * 100) / 100, distanceM: dist !== null ? Math.round(dist) : null });
    }
    if (candidates.length >= max) break;
  }
  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates;
}

// ——— حفظ دفعة أو مدرسة واحدة ———

export async function saveDiscoveredSchools(
  candidates: SaveCandidate[],
  opts: {
    sessionProvider: string;
    sessionMode: "TEXT" | "AREA";
    keyword?: string;
    governorate?: string;
    areaName?: string;
    radiusMeters?: number;
    bounds?: unknown;
    types?: InstitutionTypeKey[];
    resultCount: number;
    unnamedCount: number;
    userId?: string;
    createSession: boolean;
  }
): Promise<SaveSummary> {
  // جلسة اكتشاف — تحفظ نتائج العملية لتجنب إعادة اكتشاف السجلات نفسها
  const session = opts.createSession
    ? await db.discoverySession.create({
        data: {
          provider: opts.sessionProvider,
          mode: opts.sessionMode,
          keyword: opts.keyword ?? null,
          governorate: opts.governorate ?? null,
          areaName: opts.areaName ?? null,
          radiusMeters: opts.radiusMeters ?? null,
          bounds: opts.bounds ? JSON.stringify(opts.bounds) : null,
          types: opts.types ? JSON.stringify(opts.types) : null,
          resultCount: opts.resultCount,
          unnamedCount: opts.unnamedCount,
          executedById: opts.userId ?? null,
        },
      })
    : null;

  const items: SaveItemStatus[] = [];
  let added = 0;
  let duplicated = 0;
  let review = 0;
  const savedIds: string[] = [];

  for (const c of candidates) {
    const place = c.place;

    // 1) التطابق الدقيق
    const exact = await findExactDuplicate(place);
    if (exact) {
      duplicated++;
      items.push({
        state: "DUPLICATE",
        name: place.name ?? "",
        existingSchoolId: exact.id,
        reason: exact.placeId === place.placeId ? "مطابقة كاملة بمعرّف Google Place ID" : "مطابقة كاملة بمعرّف مصدر البيانات",
      });
      continue;
    }

    // 2) فحص المشابهة — للمراجعة فقط، لا دمج تلقائي
    if (!c.forceNew) {
      const similar = await findSimilarCandidates(place);
      if (similar.length > 0) {
        review++;
        items.push({ state: "SIMILAR_REVIEW", name: place.name ?? "", candidates: similar });
        continue;
      }
    }

    // 3) الإضافة الفعلية
    const region = await resolveRegion(place.regionText, place.governorate ?? opts.governorate);
    const meta = fieldMetaFromPlace(place);
    const sector = place.sector ?? null;
    const typeLabel = INSTITUTION_TYPE_LABELS[place.institutionType];
    const otherLinks: string[] = [];
    if (place.instagram) otherLinks.push(place.instagram);

    const created = await db.school.create({
      data: {
        name: place.name!,
        governorate: place.governorate ?? opts.governorate ?? "بغداد",
        regionId: region?.id ?? null,
        regionText: place.regionText ?? null,
        institutionType: typeLabel,
        stage: place.stages ?? null,
        address: place.address ?? null,
        phone: place.phone ?? null,
        website: place.website ?? null,
        facebookUrl: place.facebook ?? null,
        instagramUrl: place.instagram ?? null,
        otherLinks: otherLinks.length ? JSON.stringify(otherLinks) : null,
        sector,
        lat: place.lat,
        lng: place.lng,
        placeId: place.placeId ?? null,
        osmType: place.osmType ?? null,
        osmId: place.osmId ?? null,
        locationUrl: place.mapsUrl,
        dataSource: place.provider === "GOOGLE_PLACES" ? "GOOGLE_PLACES" : place.provider === "OVERPASS" ? "OSM_OVERPASS" : "OSM_NOMINATIM",
        discoveryStatus: "DISCOVERED",
        fieldMeta: JSON.stringify(meta),
        dataQuality: computeDataQuality({
          phone: place.phone,
          principalName: null,
          lat: place.lat,
          lng: place.lng,
          institutionType: typeLabel,
          sector,
          regionText: place.regionText,
          studentCount: null,
          stages: place.stages,
          website: place.website,
          address: place.address,
          facebookUrl: place.facebook,
          instagramUrl: place.instagram,
        }),
        discoveredAt: new Date(),
        discoverySessionId: session?.id ?? null,
      },
    });
    savedIds.push(created.id);
    added++;
    items.push({ state: "SAVED", schoolId: created.id, name: place.name! });
  }

  if (session) {
    await db.discoverySession.update({
      where: { id: session.id },
      data: { newCount: added, duplicateCount: duplicated, details: JSON.stringify(items) },
    });
  }

  // إشعار حقيقي بحدث الحفظ
  if (added > 0) {
    await db.notification.create({
      data: {
        title: "إضافة مدارس من نتائج الاكتشاف",
        message: `تمت إضافة ${added} ${added === 1 ? "مدرسة جديدة" : "مدارس جديدة"} إلى النظام من جلسة اكتشاف (${opts.governorate ?? ""}${opts.areaName ? " – " + opts.areaName : ""}).${duplicated ? ` وتم تجاهل ${duplicated} سجل مكرر.` : ""}`,
        type: "SUCCESS",
      },
    });
  }

  return { items, addedCount: added, duplicateCount: duplicated, reviewCount: review, sessionId: session?.id ?? "" };
}

/** إعادة بناء بيانات التوثيق بعد تحديث ميداني — تسجيل مصدر المنسقة لكل حقل */
export function coordinatorFieldEntries(fields: string[], updatedBy: string): FieldMeta {
  const entries: FieldMeta = {};
  for (const f of fields) {
    entries[f] = {
      source: "COORDINATOR_FIELD",
      sourceLabel: "تحديث ميداني من المنسقة",
      collectedAt: new Date().toISOString(),
      verificationStatus: "FIELD_CONFIRMED",
      reliability: 0.95,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };
  }
  return entries;
}

/** فحص سريع للسجلات الموجودة مسبقاً (يُستخدم في معاينة الحفظ) */
export async function checkExisting(place: DiscoveredPlace) {
  const exact = await findExactDuplicate(place);
  if (exact) return { exact: true, schoolId: exact.id, candidates: [] };
  const candidates = await findSimilarCandidates(place);
  return { exact: false, schoolId: null as string | null, candidates };
}

/** رابط خريطة جوجل لتخزينه مع المدرسة */
export { googleMapsUrl };
