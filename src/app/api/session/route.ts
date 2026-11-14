import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getPrincipal } from "@/lib/auth";

/**
 * بيانات المستخدم المسجل دخول للشريط العلوي.
 * منذ تفعيل المصادقة الفعلية: تعيد الجلسة الحقيقية (مدير النظام) إن وُجدت،
 * وتبقى تعيد حساب مدير النظام المُهيأ كخيار سابق للتوافق عند عدم وجود جلسة.
 */
export async function GET() {
  try {
    const principal = await getPrincipal();
    if (principal && principal.type === "ADMIN") {
      return NextResponse.json({
        id: principal.userId,
        name: principal.name,
        email: principal.email,
        role: principal.role,
        roleLabel: principal.role === "ADMIN" ? "مدير النظام" : principal.role === "MANAGER" ? "مدير إداري" : "موظف إداري",
        authenticated: true,
      });
    }
    const user = await getCurrentUser();
    return NextResponse.json({ ...user, authenticated: Boolean(principal) });
  } catch (error) {
    console.error("خطأ في جلب بيانات المستخدم:", error);
    return NextResponse.json(
      { error: "تعذر جلب بيانات المستخدم." },
      { status: 500 }
    );
  }
}
