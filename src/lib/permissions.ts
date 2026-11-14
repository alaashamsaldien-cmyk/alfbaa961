// ——— نظام صلاحيات الموظفين المركزي — مصدر الحقيقة الوحيد للخادم والواجهات ———
// فلسفة النظام:
//  - الصلاحيات تُطبق على مستوى الخادم (API) وليس فقط إخفاء الأيقونات.
//  - مدير النظام (role=ADMIN) يملك كل الصلاحيات ولا تخضع لما هنا.
//  - الموظف (role=STAFF أو MANAGER) لا يرى ولا ينفذ إلا ما منحه المدير إياه صراحة.
//  - قسم «الرئيسية» أساسي في بوابة الموظف (هي البوابة نفسها) ولا يُخفى.

import { db } from "@/lib/db";

export {
  SECTION_KEYS,
  ACTION_KEYS,
  ACTION_LABELS_AR,
  SECTION_META_AR,
  CORE_SECTIONS,
  COMING_SOON_SECTIONS,
  emptyPerms,
} from "@/lib/sections-catalog";

import type { SectionKey, ActionKey, SectionPerms } from "@/lib/sections-catalog";
import { SECTION_KEYS, CORE_SECTIONS as CORE_SECTIONS_INTERNAL, emptyPerms } from "@/lib/sections-catalog";

export type { SectionKey, ActionKey, SectionPerms };

export function normalizePerms(raw: unknown): SectionPerms {
  const p = (raw ?? {}) as Record<string, unknown>;
  const b = (k: string) => p[k] === true;
  return {
    visible: b("visible"),
    view: b("view"),
    create: b("create"),
    edit: b("edit"),
    delete: b("delete"),
    export: b("export"),
    approve: b("approve"),
    manage: b("manage"),
  };
}

export type PermissionMap = Record<SectionKey, SectionPerms>;

/** خريطة صلاحيات كاملة لكل الأقسام — الأقسام الأساسية (الرئيسية) مرئية دائماً */
export function fullMapFromRows(
  rows: { section: string; visible: boolean; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean; canApprove: boolean; canManage: boolean }[]
): PermissionMap {
  const map = {} as PermissionMap;
  for (const key of SECTION_KEYS) {
    map[key] = emptyPerms();
    if (CORE_SECTIONS_INTERNAL.includes(key)) map[key].visible = true;
  }
  for (const r of rows) {
    if (!(SECTION_KEYS as readonly string[]).includes(r.section)) continue;
    map[r.section as SectionKey] = {
      visible: r.visible || CORE_SECTIONS_INTERNAL.includes(r.section as SectionKey),
      view: r.canView,
      create: r.canCreate,
      edit: r.canEdit,
      delete: r.canDelete,
      export: r.canExport,
      approve: r.canApprove,
      manage: r.canManage,
    };
  }
  return map;
}

/** خريطة صلاحيات الموظف من قاعدة البيانات */
export async function getPermissionMap(userId: string): Promise<PermissionMap> {
  const rows = await db.employeePermission.findMany({ where: { userId } });
  return fullMapFromRows(rows);
}

export function permsToDbRows(map: Partial<Record<SectionKey, Partial<SectionPerms>>>): { section: string; visible: boolean; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean; canApprove: boolean; canManage: boolean }[] {
  const rows: { section: string; visible: boolean; canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean; canExport: boolean; canApprove: boolean; canManage: boolean }[] = [];
  for (const key of SECTION_KEYS) {
    const raw = map[key];
    if (!raw) continue;
    const n = normalizePerms(raw);
    rows.push({
      section: key,
      visible: n.visible,
      canView: n.view,
      canCreate: n.create,
      canEdit: n.edit,
      canDelete: n.delete,
      canExport: n.export,
      canApprove: n.approve,
      canManage: n.manage,
    });
  }
  return rows;
}

// ——— القوالب الجاهزة المدمجة في النظام — تعريف برمجي ثابت (لا بيانات وهمية في القاعدة) ———

function templateFrom(partial: Partial<Record<SectionKey, Partial<SectionPerms>>>): Record<SectionKey, SectionPerms> {
  const out = {} as Record<SectionKey, SectionPerms>;
  for (const key of SECTION_KEYS) {
    const base = emptyPerms();
    if (CORE_SECTIONS_INTERNAL.includes(key)) base.visible = true;
    const p = partial[key] ?? {};
    out[key] = { ...base, ...p, visible: p.visible ?? (CORE_SECTIONS_INTERNAL.includes(key) || Boolean(p.visible)) };
  }
  return out;
}

export const BUILT_IN_TEMPLATES: { key: string; name: string; description: string; sections: Record<SectionKey, SectionPerms> }[] = [
  {
    key: "data-entry",
    name: "موظف إدخال بيانات",
    description: "إدخال وتحديث بيانات المدارس والمناطق دون حذف أو اعتماد.",
    sections: templateFrom({
      schools: { visible: true, view: true, create: true, edit: true },
      regions: { visible: true, view: true },
      settings: { visible: true, view: true },
    }),
  },
  {
    key: "schools-followup",
    name: "موظف متابعة مدارس",
    description: "متابعة حالة المدارس وتحديث بياناتها وتصدير القوائم.",
    sections: templateFrom({
      schools: { visible: true, view: true, edit: true, export: true },
      regions: { visible: true, view: true },
      reports: { visible: true, view: true },
      settings: { visible: true, view: true },
    }),
  },
  {
    key: "field-visits",
    name: "موظف زيارات ميدانية",
    description: "تسجيل الزيارات والتواصل مع المدارس المخصصة له فقط.",
    sections: templateFrom({
      schools: { visible: true, view: true },
      visits: { visible: true, view: true },
      visit_register: { visible: true, view: true, create: true },
      settings: { visible: true, view: true },
    }),
  },
  {
    key: "area-supervisor",
    name: "مشرف مناطق",
    description: "إشراف ميداني واسع: متابعة زيارات موظفي نطاقه واعتماد البيانات.",
    sections: templateFrom({
      schools: { visible: true, view: true, create: true, edit: true, export: true, approve: true },
      regions: { visible: true, view: true },
      visits: { visible: true, view: true, manage: true },
      visit_register: { visible: true, view: true, create: true },
      reviews: { visible: true, view: true, edit: true },
      reports: { visible: true, view: true, export: true },
      distribution: { visible: true, view: true },
      settings: { visible: true, view: true },
    }),
  },
  {
    key: "reports-officer",
    name: "موظف تقارير",
    description: "الاطلاع على التقارير والإحصائيات وتصديرها دون تعديل بيانات.",
    sections: templateFrom({
      schools: { visible: true, view: true },
      regions: { visible: true, view: true },
      visits: { visible: true, view: true },
      reports: { visible: true, view: true, export: true },
      settings: { visible: true, view: true },
    }),
  },
];

// ——— التحقق من الصلاحيات ———

export interface PermissionCheckResult {
  ok: boolean;
  reason?: "NOT_VISIBLE" | "ACTION_DENIED";
}

/** فحص صلاحية محددة على خريطة صلاحيات — الأقسام الأساسية مرئية دائماً */
export function checkPermission(map: PermissionMap, section: SectionKey, action: ActionKey): PermissionCheckResult {
  const p = map[section];
  if (!p) return { ok: false, reason: "NOT_VISIBLE" };
  const visible = p.visible || CORE_SECTIONS_INTERNAL.includes(section);
  if (!visible) return { ok: false, reason: "NOT_VISIBLE" };
  if (!p[action]) return { ok: false, reason: "ACTION_DENIED" };
  return { ok: true };
}
