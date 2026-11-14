// تسميات وألوان مشتركة بين مكونات لوحة التحكم — آمنة للاستخدام في العميل

export type ActivityTypeKey = "VISIT" | "CALL" | "INITIAL_APPROVAL" | "CONTRACT" | "FIELD_UPDATE" | "OTHER";

export const ACTIVITY_TYPE_META: Record<ActivityTypeKey, { label: string; badge: string }> = {
  VISIT: {
    label: "زيارة ميدانية",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
  },
  CALL: {
    label: "اتصال هاتفي",
    badge: "bg-sky-50 text-sky-700 border-sky-200",
  },
  INITIAL_APPROVAL: {
    label: "موافقة أولية",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CONTRACT: {
    label: "تعاقد جديد",
    badge: "bg-green-100 text-green-800 border-green-300",
  },
  FIELD_UPDATE: {
    label: "تحديث بيانات ميدانية",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  OTHER: {
    label: "نشاط آخر",
    badge: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

export function activityTypeMeta(type: string) {
  return ACTIVITY_TYPE_META[type as ActivityTypeKey] ?? ACTIVITY_TYPE_META.OTHER;
}

export const FOLLOW_UP_TYPE_LABELS: Record<string, string> = {
  REVIEW: "مراجعة",
  FOLLOW_UP: "متابعة",
};

export const NOTIFICATION_TYPE_META: Record<string, { dot: string; text: string }> = {
  INFO: { dot: "bg-sky-500", text: "text-sky-700" },
  SUCCESS: { dot: "bg-green-500", text: "text-green-700" },
  WARNING: { dot: "bg-amber-500", text: "text-amber-700" },
  ERROR: { dot: "bg-red-500", text: "text-red-700" },
};

// حالات المدارس — مستقلة تماماً عن بعضها (للاستخدام في الفلاتر لاحقاً)
export const AVAILABILITY_LABELS: Record<string, string> = {
  AVAILABLE: "متاحة",
  UNAVAILABLE: "غير متاحة",
};

export const CONTRACT_LABELS: Record<string, string> = {
  CONTRACTED: "متعاقدة",
  NOT_CONTRACTED: "غير متعاقدة",
};

export const ACTIVITY_PERIOD_OPTIONS = [
  { value: "today", label: "اليوم" },
  { value: "week", label: "آخر 7 أيام" },
  { value: "month", label: "آخر 30 يوماً" },
  { value: "all", label: "كل الفترات" },
] as const;
