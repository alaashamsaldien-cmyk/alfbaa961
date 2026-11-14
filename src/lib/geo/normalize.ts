// ——— طبقة تطبيع النص العربي والمقارنة وبناء بيانات التحقق ———
// مبدأ أساسي: لا تخمين ولا اختلاق معلومات. أي حقل غير متوفر من المصدر يبقى فارغاً
// ويُعلّم بـ «غير متوفرة». الاستنتاج الوحيد المسموح هو قراءة النوع/المرحلة من اسم
// المؤسسة نفسه (ثانوية/متوسطة/ابتدائية...) ويُعلّم بمصدر «استنتاج من الاسم»
// ودرجة موثوقية منخفضة ليشمله التحقق الميداني لاحقاً.

// ——— أنواع المؤسسات التعليمية المعتمدة في النظام ———

export type InstitutionTypeKey =
  | "SCHOOL"
  | "KINDERGARTEN"
  | "COLLEGE_INSTITUTE"
  | "UNIVERSITY"
  | "TRAINING_CENTER"
  | "LANGUAGE_CENTER"
  | "OTHER_EDU";

export const INSTITUTION_TYPE_LABELS: Record<InstitutionTypeKey, string> = {
  SCHOOL: "مدرسة",
  KINDERGARTEN: "روضة أطفال",
  COLLEGE_INSTITUTE: "كلية أو معهد",
  UNIVERSITY: "جامعة",
  TRAINING_CENTER: "مركز دورات وتدريب",
  LANGUAGE_CENTER: "مركز لغات",
  OTHER_EDU: "مؤسسة تعليمية أخرى",
};

/** القطاعات */
export const SECTOR_LABELS: Record<string, string> = {
  GOVERNMENT: "حكومية",
  PRIVATE: "أهلية",
};

/** حالات التوثيق — كما حددها المستخدم */
export type VerificationStatus =
  | "DISCOVERED"
  | "NEEDS_VERIFICATION"
  | "OFFICIALLY_DOCUMENTED"
  | "FIELD_CONFIRMED";

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  DISCOVERED: "مكتشفة",
  NEEDS_VERIFICATION: "تحتاج إلى تحقق",
  OFFICIALLY_DOCUMENTED: "موثقة من مصدر رسمي",
  FIELD_CONFIRMED: "مؤكدة ميدانياً بواسطة المنسقة",
};

export const VERIFICATION_STATUS_BADGE: Record<VerificationStatus, string> = {
  DISCOVERED: "bg-slate-100 text-slate-700 border-slate-200",
  NEEDS_VERIFICATION: "bg-amber-50 text-amber-700 border-amber-200",
  OFFICIALLY_DOCUMENTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FIELD_CONFIRMED: "bg-green-100 text-green-800 border-green-300",
};

export interface FieldMetaEntry {
  source: string; // رمز المصدر: GOOGLE_PLACES | OSM | EXCEL_IMPORT | MANUAL_ENTRY | COORDINATOR_FIELD | NAME_INFERENCE
  sourceLabel: string; // وصف عربي للمصدر
  sourceRef?: string; // مرجع دقيق (مثلاً معرف OSM أو رقم الصف في Excel)
  collectedAt: string; // تاريخ جمع المعلومة ISO
  verificationStatus: VerificationStatus;
  reliability: number; // 0..1 درجة موثوقية
  updatedBy?: string; // من حدّثها (المنسقة/الإدارة)
  updatedAt?: string;
}

export type FieldMeta = Record<string, FieldMetaEntry>;

// ——— تطبيع النص العربي ———

export function normalizeArabic(input: string | null | undefined): string {
  if (!input) return "";
  let s = input.trim().toLowerCase();
  // إزالة التشكيل والتطويل
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
  // توحيد الألف والهمزات
  s = s.replace(/[أإآٱ]/g, "ا");
  s = s.replace(/ؤ/g, "و");
  s = s.replace(/ئ/g, "ي");
  s = s.replace(/ة/g, "ه");
  s = s.replace(/ى/g, "ي");
  // إزالة علامات الترقيم والرموز
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  // توحيد المسافات
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** إزالة «ال» التعريف من بداية كل كلمة — لتقريب الأسماء المتشابهة */
function stripArticle(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.startsWith("ال") && w.length > 3 ? w.slice(2) : w))
    .join(" ");
}

/** مجموعة ثلاثيات الحروف لقياس التشابه (معامل Dice) */
function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  const t = s.replace(/\s/g, "");
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

/**
 * تشابه اسمان عربيان 0..1 — Dice على الثلاثيات بعد التطبيع.
 * يتخطى كلمات الموقع الشائعة (حي/منطقة/شارع...) التي لا تدل على الهوية.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = stripArticle(normalizeArabic(a));
  const nb = stripArticle(normalizeArabic(b));
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = trigrams(na);
  const gb = trigrams(nb);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

// ——— ربط أنواع المصادر بأنواع النظام ———

/** من وسم OSM (category/type) إلى مفتاح النظام */
export function institutionTypeFromOsm(category: string | null | undefined, type: string | null | undefined): InstitutionTypeKey {
  const t = `${category ?? ""}=${type ?? ""}`;
  if (type === "kindergarten") return "KINDERGARTEN";
  if (type === "university") return "UNIVERSITY";
  if (type === "college") return "COLLEGE_INSTITUTE";
  if (type === "language_school") return "LANGUAGE_CENTER";
  if (type === "training") return "TRAINING_CENTER";
  if (type === "school") return "SCHOOL";
  if (t.includes("school") || t.includes("college") || t.includes("university")) return "OTHER_EDU";
  return "OTHER_EDU";
}

/** أنواع Google Places (New) — Table A المتعلقة بالتعليم */
export const GOOGLE_EDU_TYPES = [
  "school",
  "primary_school",
  "secondary_school",
  "preschool",
  "kindergarten",
  "college",
  "university",
] as const;

export function institutionTypeFromGoogle(types: string[] | null | undefined): InstitutionTypeKey {
  const t = types ?? [];
  if (t.includes("kindergarten") || t.includes("preschool")) return "KINDERGARTEN";
  if (t.includes("university")) return "UNIVERSITY";
  if (t.includes("college")) return "COLLEGE_INSTITUTE";
  if (t.includes("school") || t.includes("primary_school") || t.includes("secondary_school")) return "SCHOOL";
  return "OTHER_EDU";
}

/** قراءة المرحلة الدراسية من اسم المؤسسة — استنتاج معلن ودرجة موثوقية منخفضة */
export function inferStageFromName(name: string): string | null {
  const n = normalizeArabic(name);
  const pairs: [RegExp, string][] = [
    [/روضه|رياض اطفال/, "رياض أطفال"],
    [/ابتدائيه/, "ابتدائية"],
    [/متوسطه/, "متوسطة"],
    [/ثانويه|متميزين/, "ثانوية"],
    [/معهد/, "معهد"],
    [/كليه/, "كلية"],
    [/جامعه/, "جامعة"],
    [/مركز تدريب|مركز مهني/, "مركز تدريب مهني"],
  ];
  for (const [re, stage] of pairs) if (re.test(n)) return stage;
  return null;
}

/**
 * قراءة القطاع من وسوم OSM الصريحة فقط.
 * لا استنتاج من الاسم أو الديانة أو أي شيء آخر — الحقل يبقى فارغاً إن لم يُصرّح المصدر.
 */
export function sectorFromOsmTags(tags: Record<string, string> | null | undefined): "GOVERNMENT" | "PRIVATE" | null {
  if (!tags) return null;
  const opType = (tags["operator:type"] ?? tags["ownership"] ?? "").toLowerCase();
  if (opType === "government" || opType === "public") return "GOVERNMENT";
  if (opType === "private" || opType === "private_non_profit" || opType === "private_for_profit") return "PRIVATE";
  // وسوم تشغيل صريحة فقط
  const operator = tags["operator"] ?? "";
  if (operator && /وزاره التربيه|وزاره التعليم|وزاره التعليم العالي|البلديه|الأمانه|بلديه/i.test(operator)) return "GOVERNMENT";
  return null;
}

// ——— بناء بيانات التحقق لكل حقل ———

export const SOURCE_LABELS: Record<string, string> = {
  GOOGLE_PLACES: "Google Places API",
  OSM: "OpenStreetMap (مصدر عام مفتوح)",
  OSM_OVERPASS: "OpenStreetMap عبر Overpass",
  EXCEL_IMPORT: "استيراد ملف Excel",
  MANUAL_ENTRY: "إدخال يدوي من الإدارة",
  COORDINATOR_FIELD: "تحديث ميداني من المنسقة",
  NAME_INFERENCE: "استنتاج من اسم المؤسسة (يحتاج تأكيداً)",
  OFFICIAL_SOURCE: "مصدر رسمي موثق",
};

export interface FieldBuildOptions {
  source: string;
  sourceRef?: string;
  reliability: number;
  verificationStatus?: VerificationStatus;
}

/** تاريخ التجميع الموحد (الآن) */
export function nowIso(): string {
  return new Date().toISOString();
}

/** إنشاء مُدخل توثيق لحقل واحد */
export function buildFieldEntry(opts: FieldBuildOptions): FieldMetaEntry {
  return {
    source: opts.source,
    sourceLabel: SOURCE_LABELS[opts.source] ?? opts.source,
    ...(opts.sourceRef ? { sourceRef: opts.sourceRef } : {}),
    collectedAt: nowIso(),
    verificationStatus: opts.verificationStatus ?? "DISCOVERED",
    reliability: opts.reliability,
  };
}

/**
 * بناء fieldMeta من نتائج الاكتشاف.
 * يُبنى فقط للحقول التي لها قيمة فعلية من المصدر — الحقول الفارغة تُترك بلا مُدخل
 * وتُعرض في الواجهة بوصفها «غير متوفرة».
 */
export function buildDiscoveryFieldMeta(opts: {
  provider: "GOOGLE_PLACES" | "OSM";
  sourceRef?: string;
  fields: Record<string, { value: unknown; reliability?: number; source?: string }>;
}): FieldMeta {
  const meta: FieldMeta = {};
  for (const [key, f] of Object.entries(opts.fields)) {
    if (f.value === null || f.value === undefined || f.value === "") continue;
    meta[key] = buildFieldEntry({
      source: f.source ?? opts.provider,
      sourceRef: opts.sourceRef,
      reliability: f.reliability ?? (opts.provider === "GOOGLE_PLACES" ? 0.8 : 0.6),
    });
  }
  return meta;
}

/** دمج بيانات توثيق جديدة مع القديمة (تحديث ميداني مثلاً يحتفظ بسجل الحقل الأصلي) */
export function mergeFieldMeta(old: FieldMeta | null, updates: Record<string, FieldMetaEntry>): FieldMeta {
  return { ...(old ?? {}), ...updates };
}

// ——— درجة اكتمال البيانات ———

const QUALITY_WEIGHTS: Record<string, number> = {
  phone: 18,
  principalName: 18,
  lat: 12,
  lng: 0, // lat وlng يُحسبان معاً
  institutionType: 10,
  sector: 8,
  regionText: 8,
  studentCount: 10,
  stages: 6,
  website: 5,
  address: 8,
  facebookUrl: 3,
  instagramUrl: 2,
};

/** أوزان مجموعها 100 — درجة الاكتمال = مجموع أوزان الحقول المتوفرة فعلاً */
export function computeDataQuality(fields: {
  phone?: string | null;
  principalName?: string | null;
  lat?: number | null;
  lng?: number | null;
  institutionType?: string | null;
  sector?: string | null;
  regionText?: string | null;
  studentCount?: number | null;
  stages?: string | null;
  website?: string | null;
  address?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
}): number {
  let score = 0;
  if (fields.phone) score += QUALITY_WEIGHTS.phone;
  if (fields.principalName) score += QUALITY_WEIGHTS.principalName;
  if (fields.lat !== null && fields.lat !== undefined && fields.lng !== null && fields.lng !== undefined)
    score += QUALITY_WEIGHTS.lat;
  if (fields.institutionType) score += QUALITY_WEIGHTS.institutionType;
  if (fields.sector) score += QUALITY_WEIGHTS.sector;
  if (fields.regionText) score += QUALITY_WEIGHTS.regionText;
  if (fields.studentCount !== null && fields.studentCount !== undefined) score += QUALITY_WEIGHTS.studentCount;
  if (fields.stages) score += QUALITY_WEIGHTS.stages;
  if (fields.website) score += QUALITY_WEIGHTS.website;
  if (fields.address) score += QUALITY_WEIGHTS.address;
  if (fields.facebookUrl) score += QUALITY_WEIGHTS.facebookUrl;
  if (fields.instagramUrl) score += QUALITY_WEIGHTS.instagramUrl;
  return Math.min(100, score);
}

/** رابط Google Maps الرسمي للإحداثيات (نمط URL المسموح بموجب شروط الخدمة) */
export function googleMapsUrl(lat: number, lng: number, placeId?: string | null): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return placeId ? `${base}&query_place_id=${encodeURIComponent(placeId)}` : base;
}
