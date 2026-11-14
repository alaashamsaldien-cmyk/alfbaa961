// ——— سجل التدقيق (Audit Log) — تسجيل كل العمليات المهمة بلا استثناء ———
// كل قيد يوثق: من نفذ العملية (نوعه ومعرفه واسمه)، ماذا فعل، على أي كيان، وتفاصيل قبل/بعد.
// الاسم يُخزن نصياً أيضاً ليبقى السجل صحيحاً حتى بعد حذف الحساب.

import { db } from "@/lib/db";

export type AuditActorType = "ADMIN" | "EMPLOYEE" | "COORDINATOR" | "SYSTEM";

export interface AuditEntry {
  actorType: AuditActorType;
  actorId?: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
}

/** كتابة قيد تدقيق — لا تُفشل العملية الأصلية أبداً إن فشل التسجيل (يُسجل في سجل الخادم) */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        details: entry.details === undefined ? null : JSON.stringify(entry.details),
      },
    });
  } catch (error) {
    console.error("خطأ في كتابة سجل التدقيق:", error);
  }
}

// أسماء الإجراءات الموحدة — تُستخدم في كل المسارات حتى لا تتضخم سلاسل نصية عشوائية
export const AUDIT_ACTIONS = {
  // حسابات الموظفين
  CREATE_EMPLOYEE: "CREATE_EMPLOYEE",
  UPDATE_EMPLOYEE: "UPDATE_EMPLOYEE",
  DELETE_EMPLOYEE: "DELETE_EMPLOYEE",
  RESET_EMPLOYEE_PASSWORD: "RESET_EMPLOYEE_PASSWORD",
  SET_EMPLOYEE_STATUS: "SET_EMPLOYEE_STATUS",
  ACTIVATE_EMPLOYEE_ACCOUNT: "ACTIVATE_EMPLOYEE_ACCOUNT",
  UPDATE_PERMISSIONS: "UPDATE_PERMISSIONS",
  APPLY_TEMPLATE: "APPLY_TEMPLATE",
  CREATE_TEMPLATE: "CREATE_TEMPLATE",
  DELETE_TEMPLATE: "DELETE_TEMPLATE",
  // المصادقة
  EMPLOYEE_LOGIN: "EMPLOYEE_LOGIN",
  ADMIN_LOGIN: "ADMIN_LOGIN",
  EMPLOYEE_LOGOUT: "EMPLOYEE_LOGOUT",
  EMPLOYEE_CHANGE_PASSWORD: "EMPLOYEE_CHANGE_PASSWORD",
  // الزيارات
  REGISTER_VISIT: "REGISTER_VISIT",
  // المدارس
  EMPLOYEE_CREATE_SCHOOL: "EMPLOYEE_CREATE_SCHOOL",
  EMPLOYEE_UPDATE_SCHOOL_LOCATION: "EMPLOYEE_UPDATE_SCHOOL_LOCATION",
  EMPLOYEE_UPDATE_SCHOOL_FIELDS: "EMPLOYEE_UPDATE_SCHOOL_FIELDS",
} as const;
