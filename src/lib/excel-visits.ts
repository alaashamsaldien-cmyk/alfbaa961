// ——— طبقة Excel لجدول زيارات الموظفين — تصدير رسمي بنفس أعمدة جدول لوحة الإدارة ———
// الملف يضم ورقة واحدة «الزيارات» + ورقة «معلومات التصدير» توثق الفلاتر وعدد الصفوف ووقت التصدير.
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { visitWhereFromParsed, type ParsedVisitFilters } from "@/lib/visit-filters";

const CONTACT_TYPE_LABELS: Record<string, string> = {
  FIELD_VISIT: "زيارة ميدانية",
  PHONE: "اتصال هاتفي",
  WHATSAPP: "واتساب",
  SMS: "رسالة SMS",
  MEETING: "اجتماع ومتابعة",
  OTHER: "أخرى",
};

const RESULT_LABELS: Record<string, string> = {
  INITIAL_APPROVAL: "موافقة أولية",
  APPROVED: "موافقة",
  NEEDS_ANOTHER_VISIT: "يحتاج زيارة أخرى",
  CONTRACTED: "تم التعاقد",
  REJECTED: "رفض",
  SCHOOL_NOT_FOUND: "المدرسة غير موجودة",
  OTHER: "أخرى",
};

const NEEDS_LABELS: Record<string, string> = {
  PAINT: "طلاء",
  SEATS: "مقاعد",
  SMART_SCREEN: "شاشة ذكية",
  AC: "تكييف",
  NONE: "لا تحتاج إلى شيء",
  OTHER: "أخرى",
};

const LOCATION_SOURCE_LABELS: Record<string, string> = {
  GPS: "موقع GPS من الهاتف",
  MAP: "تحديد على الخريطة",
  SAVED: "تأكيد الموقع المحفوظ",
};

export const VISIT_EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "createdAt", label: "التاريخ والوقت" },
  { key: "schoolName", label: "المدرسة" },
  { key: "governorate", label: "المحافظة" },
  { key: "regionName", label: "المنطقة" },
  { key: "employeeName", label: "الموظف" },
  { key: "employeeJobTitle", label: "المسمى الوظيفي" },
  { key: "contactType", label: "نوع التواصل" },
  { key: "result", label: "النتيجة" },
  { key: "resultOther", label: "نص النتيجة (أخرى)" },
  { key: "rejectionReason", label: "سبب الرفض" },
  { key: "contactPersonName", label: "الشخص المتواصل معه" },
  { key: "contactPersonTitle", label: "منصبه الوظيفي" },
  { key: "principalName", label: "مدير المدرسة (من الموظف)" },
  { key: "schoolPhone", label: "هاتف المدرسة (من الموظف)" },
  { key: "studentCount", label: "عدد الطلاب (من الموظف)" },
  { key: "subscribersCount", label: "المشتركون بالمنصة" },
  { key: "nextFollowUpAt", label: "المتابعة القادمة" },
  { key: "needs", label: "الاحتياجات" },
  { key: "notes", label: "الملاحظات" },
  { key: "lat", label: "خط العرض" },
  { key: "lng", label: "خط الطول" },
  { key: "locationSource", label: "مصدر الموقع" },
  { key: "schoolFieldsUpdated", label: "حُدثت بيانات المدرسة؟" },
];

/** بناء ملف Excel لجدول الزيارات — يستقبل فلاتر محفوظة ونطاق مدرسة جاهز (نطاق الموظف أو فارغ للإدارة) */
export async function buildVisitsExportWorkbook(
  filters: ParsedVisitFilters,
  schoolScope: Record<string, unknown> = {},
  meta: { exportedBy: string; scopeLabel: string }
): Promise<{ buffer: Buffer; rowCount: number }> {
  const where = visitWhereFromParsed(filters, schoolScope);
  const visits = await db.schoolVisit.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: {
      school: { select: { name: true, governorate: true, regionText: true, region: { select: { name: true } } } },
      employee: { select: { name: true, jobTitle: true } },
      coordinator: { select: { name: true } },
    },
  });

  const rows: Record<string, string | number | null>[] = visits.map((v) => ({
    "التاريخ والوقت": formatBaghdad(v.createdAt),
    "المدرسة": v.school.name,
    "المحافظة": v.school.governorate ?? null,
    "المنطقة": v.school.region?.name ?? v.school.regionText ?? null,
    "الموظف": v.coordinator?.name ?? v.employee?.name ?? null,
    "المسمى الوظيفي": v.coordinator ? "منسّق ميداني" : v.employee?.jobTitle ?? null,
    "نوع التواصل": v.contactOther ?? CONTACT_TYPE_LABELS[v.contactType] ?? v.contactType,
    "النتيجة": RESULT_LABELS[v.result] ?? v.result,
    "نص النتيجة (أخرى)": v.resultOther ?? null,
    "سبب الرفض": v.rejectionReason ?? null,
    "الشخص المتواصل معه": v.contactPersonName ?? null,
    "منصبه الوظيفي": v.contactPersonTitle ?? null,
    "مدير المدرسة (من الموظف)": v.principalName ?? null,
    "هاتف المدرسة (من الموظف)": v.schoolPhone ?? null,
    "عدد الطلاب (من الموظف)": v.studentCount ?? null,
    "المشتركون بالمنصة": v.subscribersCount ?? null,
    "المتابعة القادمة": v.nextFollowUpAt ? formatBaghdad(v.nextFollowUpAt) : null,
    "الاحتياجات": v.needs
      ? ((JSON.parse(v.needs) as string[]).map((n) => NEEDS_LABELS[n] ?? n).join("، ") + (v.needsOther ? ` — ${v.needsOther}` : "") || null)
      : null,
    "الملاحظات": v.notes ?? null,
    "خط العرض": v.lat ?? null,
    "خط الطول": v.lng ?? null,
    "مصدر الموقع": LOCATION_SOURCE_LABELS[v.locationSource ?? ""] ?? null,
    "حُدثت بيانات المدرسة؟": v.schoolFieldsUpdated ? "نعم (موثق في سجل التغييرات)" : "لا",
  }));

  // ورقة الزيارات
  const ws = XLSX.utils.json_to_sheet(rows, { header: VISIT_EXPORT_COLUMNS.map((c) => c.label) });
  ws["!cols"] = VISIT_EXPORT_COLUMNS.map((c) => ({ wch: Math.max(12, Math.min(30, c.label.length + 4)) }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: Math.max(rows.length, 1), c: VISIT_EXPORT_COLUMNS.length - 1 }) };

  // ورقة معلومات التصدير — توثيق من صدّر وماذا فُلتر
  const metaRows = [
    { "البند": "المنصة", "القيمة": "منصة ألف باء — جدول الزيارات والتواصل (زيارات الموظفين)" },
    { "البند": "صدر بواسطة", "القيمة": meta.exportedBy },
    { "البند": "نطاق التصدير", "القيمة": meta.scopeLabel },
    { "البند": "عدد السجلات", "القيمة": rows.length },
    { "البند": "الفترة الزمنية", "القيمة": filters.periodLabel },
    { "البند": "فلتر الموظف", "القيمة": filters.employeeId ? (await employeeName(filters.employeeId)) : "كل الموظفين" },
    { "البند": "المحافظة", "القيمة": filters.governorate ?? "كل المحافظات" },
    { "البند": "المنطقة", "القيمة": filters.regionId ? (await regionName(filters.regionId)) : "كل المناطق" },
    { "البند": "نوع التواصل", "القيمة": filters.contactType ? (CONTACT_TYPE_LABELS[filters.contactType] ?? filters.contactType) : "الكل" },
    { "البند": "النتيجة", "القيمة": filters.result ? (RESULT_LABELS[filters.result] ?? filters.result) : "الكل" },
    { "البند": "بحث باسم المدرسة", "القيمة": filters.q ?? "—" },
    { "البند": "وقت التصدير", "القيمة": formatBaghdad(new Date()) },
  ];
  const metaWs = XLSX.utils.json_to_sheet(metaRows);
  metaWs["!cols"] = [{ wch: 22 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الزيارات");
  XLSX.utils.book_append_sheet(wb, metaWs, "معلومات التصدير");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer: out, rowCount: rows.length };
}

async function employeeName(id: string): Promise<string> {
  if (id.startsWith("coordinator:")) {
    const coordinator = await db.coordinator.findUnique({ where: { id: id.slice("coordinator:".length) }, select: { name: true } });
    return coordinator?.name ?? id;
  }
  const u = await db.user.findUnique({ where: { id }, select: { name: true } });
  return u?.name ?? id;
}

async function regionName(id: string): Promise<string> {
  const r = await db.region.findUnique({ where: { id }, select: { name: true } });
  return r?.name ?? id;
}

/** تنسيق التاريخ والوقت بتوقيت بغداد — صيغة موحدة للملف */
function formatBaghdad(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
