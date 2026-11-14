// ——— كتالوج أقسام النظام وصلاحياتها — مصدر واحد للحقيقة بين الخادم وكل الواجهات ———
// ملف آمن للاستخدام في العميل (لا يستورد قاعدة البيانات).
// الخادم (permissions.ts) يعيد تصدير المفاتيح من هنا، وكل واجهة تستخدم نفس التسميات.

export const SECTION_KEYS = [
  "home",
  "schools",
  "regions",
  "discovery",
  "visits",
  "visit_register",
  "reviews",
  "reports",
  "employees",
  "distribution",
  "expenses",
  "settings",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const ACTION_KEYS = ["view", "create", "edit", "delete", "export", "approve", "manage"] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

export const ACTION_LABELS_AR: Record<ActionKey, string> = {
  view: "عرض البيانات",
  create: "إضافة بيانات جديدة",
  edit: "تعديل البيانات",
  delete: "حذف البيانات",
  export: "تصدير البيانات",
  approve: "اعتماد أو تأكيد العمليات",
  manage: "إدارة البيانات وتخصيصها للموظفين الآخرين",
};

export const SECTION_META_AR: Record<SectionKey, { label: string; description: string }> = {
  home: { label: "الرئيسية", description: "لوحة الموظف الرئيسية وإحصائيات عمله (قسم أساسي دائم الظهور)" },
  schools: { label: "المدارس", description: "قائمة المدارس ضمن نطاق عمل الموظف وتفاصيلها" },
  regions: { label: "المناطق", description: "مناطق العمل وعدد مدارس كل منطقة" },
  discovery: { label: "اكتشاف وإضافة المدارس", description: "إضافة مدارس جديدة يدوياً من الميدان" },
  visits: { label: "الزيارات والتواصل", description: "سجل الزيارات والتواصل المسجلة" },
  visit_register: { label: "تسجيل زيارة للمدرسة", description: "نموذج تسجيل زيارة متعدد الخطوات من الموبايل" },
  reviews: { label: "المراجعات اليومية", description: "المراجعات والمتابعات المبرمجة على المدارس" },
  reports: { label: "التقارير والإحصائيات", description: "إحصائيات العمل محسوبة من قاعدة البيانات" },
  employees: { label: "إدارة الموظفين", description: "دليل الموظفين الحقيقي للنظام (عرض فقط — الإدارة لمدير النظام)" },
  distribution: { label: "توزيع المدارس والمناطق", description: "توزيع المدارس على المناطق والمنسقات (عرض)" },
  expenses: { label: "المصاريف والرواتب", description: "قسم قيد الإعداد — سيُفعّل في مرحلة لاحقة عند طلبه" },
  settings: { label: "الإعدادات", description: "بيانات حسابي وتغيير كلمة المرور" },
};

/** الأقسام الأساسية — تظهر دائماً لكل موظف ولا تُخفى */
export const CORE_SECTIONS: readonly SectionKey[] = ["home"];

/** الأقسام قيد الإعداد — تظهر للموظف بحالة «قيد الإعداد» إن منحها المدير */
export const COMING_SOON_SECTIONS: readonly SectionKey[] = ["expenses"];

export interface SectionPerms {
  visible: boolean;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
  approve: boolean;
  manage: boolean;
}

export function emptyPerms(): SectionPerms {
  return { visible: false, view: false, create: false, edit: false, delete: false, export: false, approve: false, manage: false };
}

/** هل القسم فعّال للموظف؟ (مرئي + القسم ممنوح أصلاً) */
export function isSectionEnabled(perms: SectionPerms | undefined, section: SectionKey): boolean {
  if (!perms) return false;
  return perms.visible || CORE_SECTIONS.includes(section);
}
