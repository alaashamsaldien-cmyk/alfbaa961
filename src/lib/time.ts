// أدوات التوقيت والتنسيق — كل حسابات "اليوم" تُبنى على توقيت بغداد (UTC+3 ثابت)
// لأن المستخدم يعمل بتوقيت بغداد وليس توقيت الخادم.

const TZ = "Asia/Baghdad";
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 دائماً (بغداد بلا توقيت صيفي)

/** يعيد تاريخ اليوم في بغداد بصيغة 2026-11-13 */
export function getBaghdadDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** بداية اليوم الحالي في بغداد (كائن Date بـ UTC) */
export function getBaghdadStartOfDay(date: Date = new Date()): Date {
  const key = getBaghdadDateKey(date);
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET_MS);
}

/** نهاية اليوم الحالي في بغداد */
export function getBaghdadEndOfDay(date: Date = new Date()): Date {
  const start = getBaghdadStartOfDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** نطاق يوم معين (من بدايته إلى نهايته) بالنسبة ليوم بغداد الذي يقع فيه التاريخ */
export function getBaghdadDayRange(ofDate: Date): { start: Date; end: Date } {
  const start = getBaghdadStartOfDay(ofDate);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

/** بداية اليوم + عدد أيام للخلف (للفلاتر الزمنية) */
export function getBaghdadDaysAgoStart(days: number, from: Date = new Date()): Date {
  const start = getBaghdadStartOfDay(from);
  return new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
}

// ——— التنسيق ———

const AR = "ar-u-nu-latn"; // العربية بأرقام لاتينية (0-9) لتوحيد العرض مع الإحصائيات

/** "الخميس، 13 نوفمبر 2026" */
export function formatFullDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(AR, {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "13 نوفمبر 2026" */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(AR, {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "10:30 ص" */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(AR, {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** "13 نوفمبر، 10:30 ص" */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${formatShortDate(d)}، ${formatTime(d)}`;
}

/** نسب أيام بين تاريخ الاستحقاق والآن (بتوقيت بغداد) — عدد الأيام الكاملة */
export function daysOverdue(dueDate: Date | string, now: Date = new Date()): number {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const dueStart = getBaghdadStartOfDay(due).getTime();
  const todayStart = getBaghdadStartOfDay(now).getTime();
  return Math.floor((todayStart - dueStart) / (24 * 60 * 60 * 1000));
}

/** أرقام بفواصل آلاف */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
