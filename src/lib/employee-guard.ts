// ——— حارس صلاحيات الموظف لمسارات API — يجمع المصادقة والصلاحية التفصيلية ———
// يطبق على الخادم: القسم يجب أن يكون مرئياً للموظف + الصلاحية التفصيلية ممنوحة.
// مثال: موظف يرى المدارس لكن ليس له «إضافة» → أي POST على المدارس يُرفض 403 فعلياً.

import { requireEmployee, type AdminPrincipal } from "@/lib/auth";
import {
  checkPermission,
  getPermissionMap,
  type ActionKey,
  type PermissionMap,
  type SectionKey,
} from "@/lib/permissions";

export type EmployeeGuard =
  | { principal: AdminPrincipal; perms: PermissionMap; response?: undefined }
  | { principal?: undefined; perms?: undefined; response: Response };

/**
 * حارس موحد: موظف مسجل دخول + قسم مسموح + صلاحية تفصيلية مسموحة.
 * يُستخدم في كل مسارات /api/employee — لا يمر أي طلب دون فحص فعلي.
 */
export async function requireEmployeePermission(
  section: SectionKey,
  action: ActionKey
): Promise<EmployeeGuard> {
  const guard = await requireEmployee();
  if ("response" in guard && guard.response) {
    return { response: guard.response };
  }
  const principal = (guard as { principal: AdminPrincipal }).principal;
  const perms = await getPermissionMap(principal.userId);
  const check = checkPermission(perms, section, action);
  if (!check.ok) {
    const message =
      check.reason === "NOT_VISIBLE"
        ? "غير مصرح — هذا القسم غير مفعّل لحسابك. تواصل مع مدير النظام."
        : `غير مصرح — لا تملك صلاحية تنفيذ هذه العملية على هذا القسم. تواصل مع مدير النظام.`;
    return {
      response: Response.json(
        { error: message, code: check.reason === "NOT_VISIBLE" ? "SECTION_NOT_VISIBLE" : "ACTION_DENIED" },
        { status: 403 }
      ),
    };
  }
  return { principal, perms };
}
