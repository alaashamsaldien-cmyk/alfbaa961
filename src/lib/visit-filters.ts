// ——— فلاتر الزيارات المشتركة — مصدر واحد لتحليل الفلاتر بين القوائم والتصدير ———
// تُستخدم في: جدول لوحة الإدارة + تصدير الإدارة + قائمة/تصدير بوابة الموظف.
// التواريخ دائماً بتوقيت بغداد: تاريخ البداية/النهاية بصيغة YYYY-MM-DD يتحول
// إلى بداية ونهاية اليوم الفعليين في بغداد (بغداد UTC+3 بلا توقيت صيفي).

import { getBaghdadStartOfDay, getBaghdadEndOfDay, getBaghdadDaysAgoStart } from "@/lib/time";

export const VISIT_CONTACT_TYPES = ["FIELD_VISIT", "PHONE", "WHATSAPP", "SMS", "MEETING", "OTHER"] as const;
export const VISIT_RESULTS = ["INITIAL_APPROVAL", "APPROVED", "NEEDS_ANOTHER_VISIT", "CONTRACTED", "REJECTED", "SCHOOL_NOT_FOUND", "OTHER"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface VisitFilterParams {
  employeeId?: string | null;
  schoolId?: string | null;
  governorate?: string | null;
  regionId?: string | null;
  contactType?: string | null;
  result?: string | null;
  q?: string | null;
  period?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface ParsedVisitFilters {
  employeeId: string | null;
  schoolId: string | null;
  governorate: string | null;
  regionId: string | null;
  contactType: string | null;
  result: string | null;
  q: string | null;
  /** نطاق زمني مطلق (بداية/نهاية ISO) — أو null عند عدم تحديد فترة */
  createdAt: { gte: Date; lte: Date } | null;
  /** وصف نصي للفترة المطبقة — يظهر في تصدير Excel */
  periodLabel: string;
}

/**
 * بناء شرط التاريخ الواحد من (فترة جاهزة أو نطاق مخصص).
 * النطاق المخصص (dateFrom/dateTo) له الأولوية عند تحديده، وأياً منهما يكفي:
 * dateFrom فقط = من بداية ذلك اليوم حتى نهاية اليوم الحالي، وdateTo فقط = من الأقدم حتى نهاية ذلك اليوم.
 */
function buildDateCondition(period: string, dateFrom: string | null, dateTo: string | null): { createdAt: { gte: Date; lte: Date } | null; label: string } {
  if (dateFrom && DATE_RE.test(dateFrom) && dateTo && DATE_RE.test(dateTo)) {
    const gte = getBaghdadStartOfDay(new Date(`${dateFrom}T12:00:00Z`));
    const lte = getBaghdadEndOfDay(new Date(`${dateTo}T12:00:00Z`));
    if (gte <= lte) return { createdAt: { gte, lte }, label: `من ${dateFrom} إلى ${dateTo} (توقيت بغداد)` };
  }
  if (dateFrom && DATE_RE.test(dateFrom)) {
    const gte = getBaghdadStartOfDay(new Date(`${dateFrom}T12:00:00Z`));
    return { createdAt: { gte, lte: getBaghdadEndOfDay() }, label: `من ${dateFrom} حتى اليوم (توقيت بغداد)` };
  }
  if (dateTo && DATE_RE.test(dateTo)) {
    const lte = getBaghdadEndOfDay(new Date(`${dateTo}T12:00:00Z`));
    return { createdAt: { gte: new Date(0), lte }, label: `حتى ${dateTo} (توقيت بغداد)` };
  }
  if (period === "today") return { createdAt: { gte: getBaghdadStartOfDay(), lte: getBaghdadEndOfDay() }, label: "اليوم" };
  if (period === "week") return { createdAt: { gte: getBaghdadDaysAgoStart(6), lte: getBaghdadEndOfDay() }, label: "آخر 7 أيام" };
  if (period === "month") return { createdAt: { gte: getBaghdadDaysAgoStart(29), lte: getBaghdadEndOfDay() }, label: "آخر 30 يوماً" };
  return { createdAt: null, label: "كل الفترات" };
}

/** تحليل باراميترات الطلب إلى فلاتر Prisma جاهزة */
export function parseVisitFilters(sp: {
  get: (key: string) => string | null | undefined;
}): ParsedVisitFilters {
  return visitFiltersFromPlain({
    employeeId: sp.get("employeeId"),
    schoolId: sp.get("schoolId"),
    governorate: sp.get("governorate"),
    regionId: sp.get("regionId"),
    contactType: sp.get("contactType"),
    result: sp.get("result"),
    q: sp.get("q"),
    period: sp.get("period"),
    dateFrom: sp.get("dateFrom"),
    dateTo: sp.get("dateTo"),
  });
}

/** تحليل كائن بسيط (من URLSearchParams أو باراميترات التصدير) إلى فلاتر */
export function visitFiltersFromPlain(plain: {
  employeeId?: string | null;
  schoolId?: string | null;
  governorate?: string | null;
  regionId?: string | null;
  contactType?: string | null;
  result?: string | null;
  q?: string | null;
  period?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}): ParsedVisitFilters {
  const get = (k: string) => plain[k as keyof typeof plain] ?? null;
  const employeeId = get("employeeId");
  const schoolId = get("schoolId");
  const governorate = get("governorate");
  const regionId = get("regionId");
  const contactTypeRaw = get("contactType");
  const resultRaw = get("result");
  const q = get("q")?.trim() || null;
  const period = get("period") ?? "all";
  const dateFrom = get("dateFrom");
  const dateTo = get("dateTo");

  const { createdAt, label } = buildDateCondition(period, dateFrom, dateTo);

  return {
    employeeId: employeeId && employeeId !== "all" ? employeeId : null,
    schoolId: schoolId && schoolId !== "all" ? schoolId : null,
    governorate: governorate && governorate !== "all" ? governorate : null,
    regionId: regionId && regionId !== "all" ? regionId : null,
    contactType: contactTypeRaw && contactTypeRaw !== "all" && (VISIT_CONTACT_TYPES as readonly string[]).includes(contactTypeRaw) ? contactTypeRaw : null,
    result: resultRaw && resultRaw !== "all" && (VISIT_RESULTS as readonly string[]).includes(resultRaw) ? resultRaw : null,
    q,
    createdAt,
    periodLabel: label,
  };
}

/** بناء where المدرسة من فلاتر محفوظة (نطاق الموظف يُدمج من الخارج) */
export function visitWhereFromParsed(
  f: ParsedVisitFilters,
  schoolScope: Record<string, unknown> = {}
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const and: Record<string, unknown>[] = [];
  if (f.employeeId?.startsWith("coordinator:")) {
    where.coordinatorId = f.employeeId.slice("coordinator:".length);
  } else if (f.employeeId) {
    where.employeeId = f.employeeId;
  }
  if (f.schoolId) where.schoolId = f.schoolId;
  if (f.contactType) where.contactType = f.contactType;
  if (f.result) where.result = f.result;
  if (f.createdAt) where.createdAt = f.createdAt;
  if (f.governorate) and.push({ school: { governorate: f.governorate } });
  if (f.regionId) and.push({ school: { regionId: f.regionId } });
  if (f.q) and.push({ school: { name: { contains: f.q } } });
  if (Object.keys(schoolScope).length > 0) and.push({ school: schoolScope });
  if (and.length) where.AND = and;
  return where;
}
