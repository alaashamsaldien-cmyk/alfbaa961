// طبقة الجلسة الحالية — المرحلة الأولى
// ملاحظة: تسجيل الدخول الفعلي (NextAuth) لم يُطلب في هذه المرحلة.
// آلية العمل الآن: النظام يهيئ حساب "مدير النظام" تلقائياً عند أول تشغيل،
// ويعرضه كمستخدم مسجل دخول في الشريط العلوي. عند تنفيذ الإعدادات والصلاحيات
// لاحقاً، تُستبدل هذه الطبقة بجلسة حقيقية دون تغيير في الواجهة.

import { db } from "@/lib/db";

export const SYSTEM_ADMIN_EMAIL = "admin@alifba.system";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
}

export function roleLabel(role: string): string {
  switch (role) {
    case "ADMIN":
      return "مدير النظام";
    case "MANAGER":
      return "مدير إداري";
    case "STAFF":
      return "موظف إداري";
    default:
      return "مستخدم";
  }
}

const WELCOME_NOTIFICATION_ID = "welcome-alifba";

/**
 * تهيئة أول تشغيل: إنشاء حساب مدير النظام وإشعار الترحيب إذا لم يكنا موجودين.
 * تُستخدم upsert ذرية لتفادي سباق الطلبات المتوازية عند أول تحميل للصفحة.
 * هذه العملية آمنة للاستدعاء المتكرر ولا تنشئ أي بيانات وهمية.
 */
export async function ensureBootstrap(): Promise<void> {
  await db.user.upsert({
    where: { email: SYSTEM_ADMIN_EMAIL },
    create: {
      email: SYSTEM_ADMIN_EMAIL,
      name: "مدير النظام",
      role: "ADMIN",
      isActive: true,
    },
    update: {},
  });

  await db.notification.upsert({
    where: { id: WELCOME_NOTIFICATION_ID },
    create: {
      id: WELCOME_NOTIFICATION_ID,
      title: "مرحباً بك في لوحة إدارة المدارس – منصة ألف باء",
      message:
        "تم تجهيز النظام بنجاح وقاعدة البيانات جاهزة لاستقبال بيانات المدارس. ستتوفر أداة استيراد المدارس من Excel عند تنفيذ قسم المدارس.",
      type: "SUCCESS",
    },
    update: {},
  });
}

/** المستخدم الحالي المسجل دخول — في هذه المرحلة يعيد حساب مدير النظام */
export async function getCurrentUser(): Promise<CurrentUser> {
  await ensureBootstrap();
  const user = await db.user.findFirst({
    where: { email: SYSTEM_ADMIN_EMAIL, isActive: true },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    // حالة نادرة: حُذف الحساب بعد التهيئة — أعِد إنشاءه
    await ensureBootstrap();
    return getCurrentUser();
  }
  return {
    id: user.id,
    name: user.name ?? "مدير النظام",
    email: user.email,
    role: user.role,
    roleLabel: roleLabel(user.role),
  };
}
