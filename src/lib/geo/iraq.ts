// ——— بيانات جغرافية مرجعية للعراق ———
// تُستخدم كمراكز تحديد أولية للخريطة عند اختيار المحافظة أو المنطقة فقط.
// لا تُخزن هذه الإحداثيات كبيانات مدارس أبداً؛ إحداثيات كل مدرسة تأتي
// من مصدر البيانات الفعلي (Google Places أو OpenStreetMap) أو من الاستيراد.

export interface GovernorateInfo {
  name: string;
  /** مركز تقريبي لمدينة المحافظة لتحديد الخريطة عند الاختيار */
  center: { lat: number; lng: number };
}

/** محافظات العراق ومراكزها المرجعية */
export const IRAQ_GOVERNORATES: GovernorateInfo[] = [
  { name: "بغداد", center: { lat: 33.3152, lng: 44.3661 } },
  { name: "البصرة", center: { lat: 30.5085, lng: 47.7804 } },
  { name: "نينوى", center: { lat: 36.335, lng: 43.1189 } },
  { name: "أربيل", center: { lat: 36.1911, lng: 44.0092 } },
  { name: "السليمانية", center: { lat: 35.5611, lng: 45.4336 } },
  { name: "حلبجة", center: { lat: 35.1778, lng: 45.9861 } },
  { name: "دهوك", center: { lat: 36.8669, lng: 42.9501 } },
  { name: "كركوك", center: { lat: 35.4681, lng: 44.3922 } },
  { name: "النجف", center: { lat: 32.026, lng: 44.3465 } },
  { name: "كربلاء", center: { lat: 32.6149, lng: 44.0246 } },
  { name: "بابل", center: { lat: 32.4637, lng: 44.4205 } },
  { name: "الأنبار", center: { lat: 33.4197, lng: 43.1251 } },
  { name: "ديالى", center: { lat: 33.7787, lng: 45.0262 } },
  { name: "واسط", center: { lat: 32.5126, lng: 45.8182 } },
  { name: "ميسان", center: { lat: 31.8396, lng: 47.1443 } },
  { name: "ذي قار", center: { lat: 31.0539, lng: 46.2639 } },
  { name: "صلاح الدين", center: { lat: 34.7899, lng: 43.6897 } },
  { name: "القادسية", center: { lat: 31.9937, lng: 44.3934 } },
  { name: "المثنى", center: { lat: 30.5375, lng: 45.3869 } },
];

export interface AreaPreset {
  name: string;
  center: { lat: number; lng: number };
}

/**
 * مناطق بغداد المعروفة — مراكز تقريبية لتحديد الخريطة عند اختيار المنطقة.
 * يُضاف إليها المناطق المسجلة فعلياً في قاعدة البيانات تلقائياً في الواجهة.
 */
export const BAGHDAD_AREAS: AreaPreset[] = [
  { name: "الكرادة", center: { lat: 33.3083, lng: 44.4228 } },
  { name: "الجادرية", center: { lat: 33.2763, lng: 44.3857 } },
  { name: "زيونة", center: { lat: 33.341, lng: 44.4573 } },
  { name: "القاهرة", center: { lat: 33.3445, lng: 44.4133 } },
  { name: "الوزيرية", center: { lat: 33.3583, lng: 44.4217 } },
  { name: "باب الشيخ", center: { lat: 33.3462, lng: 44.4062 } },
  { name: "الصالحية", center: { lat: 33.3573, lng: 44.3922 } },
  { name: "الأعظمية", center: { lat: 33.3725, lng: 44.3982 } },
  { name: "الكاظمية", center: { lat: 33.3842, lng: 44.3393 } },
  { name: "العدلية", center: { lat: 33.3649, lng: 44.3592 } },
  { name: "الحرية", center: { lat: 33.3815, lng: 44.3033 } },
  { name: "الشعلة", center: { lat: 33.4072, lng: 44.3037 } },
  { name: "الشعب", center: { lat: 33.4072, lng: 44.3582 } },
  { name: "مدينة الصدر", center: { lat: 33.4255, lng: 44.4653 } },
  { name: "أور", center: { lat: 33.3982, lng: 44.4702 } },
  { name: "بلديات", center: { lat: 33.4144, lng: 44.4331 } },
  { name: "الأمين", center: { lat: 33.3712, lng: 44.4511 } },
  { name: "المشتل", center: { lat: 33.3535, lng: 44.4513 } },
  { name: "الكاملية", center: { lat: 33.3425, lng: 44.4823 } },
  { name: "الزعفرانية", center: { lat: 33.3032, lng: 44.4522 } },
  { name: "الحارثية", center: { lat: 33.3182, lng: 44.4475 } },
  { name: "الدورة", center: { lat: 33.2662, lng: 44.3863 } },
  { name: "بياع", center: { lat: 33.2642, lng: 44.3232 } },
  { name: "المنصور", center: { lat: 33.3162, lng: 44.3372 } },
  { name: "اليرموك", center: { lat: 33.3222, lng: 44.3162 } },
  { name: "الغزالية", center: { lat: 33.3395, lng: 44.2983 } },
  { name: "العامرية", center: { lat: 33.3635, lng: 44.2985 } },
  { name: "الجهاد", center: { lat: 33.3115, lng: 44.3255 } },
  { name: "البوكيرك", center: { lat: 33.2995, lng: 44.3295 } },
  { name: "الوشاش", center: { lat: 33.3185, lng: 44.3525 } },
  { name: "الرصافة", center: { lat: 33.3215, lng: 44.4145 } },
  { name: "الطارمية", center: { lat: 33.4705, lng: 44.3845 } },
  { name: "أبو غريب", center: { lat: 33.2205, lng: 44.0605 } },
  { name: "المحمودية", center: { lat: 33.2775, lng: 44.3615 } },
  { name: "التاجي", center: { lat: 33.4425, lng: 44.2995 } },
];

/** إجابات سريعة: هل الاسم محافظة عراقية معروفة؟ */
export function findGovernorate(name: string | null | undefined): GovernorateInfo | null {
  if (!name) return null;
  return IRAQ_GOVERNORATES.find((g) => name.includes(g.name) || g.name.includes(name)) ?? null;
}

/** حدود إطار محافظة بغداد تقريبياً (يُستخدم عند اختيار المحافظة دون تحديد منطقة) */
export const BAGHDAD_BOUNDS = { west: 44.05, south: 33.11, east: 44.62, north: 33.55 };

/** حدود إطار محافظة أخرى = مركزها ± نصف درجة تقريباً */
export function governorateBounds(g: GovernorateInfo) {
  return {
    west: g.center.lng - 0.6,
    south: g.center.lat - 0.5,
    east: g.center.lng + 0.6,
    north: g.center.lat + 0.5,
  };
}

/** حدود العراق كاملة (للفحص أن الإحداثيات ضمن العراق) */
export const IRAQ_BOUNDS = { west: 38.7, south: 29.0, east: 48.8, north: 37.5 };

export function isInsideIraq(lat: number, lng: number): boolean {
  return (
    lat >= IRAQ_BOUNDS.south &&
    lat <= IRAQ_BOUNDS.north &&
    lng >= IRAQ_BOUNDS.west &&
    lng <= IRAQ_BOUNDS.east
  );
}

/** مسافة بين نقطتين بالأمتار (معادلة هافرساين) — للتحقق من القرب عند كشف التكرار */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
