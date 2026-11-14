// حالة تسجيل الدخول الحالية — يعيد ما تحتاجه الواجهة لتحديد الواجهة المناسبة:
//  - needsSetup: لم تُعين كلمة مرور لمدير النظام بعد (تشغيل أول)
//  - authenticated + principal: جلسة صالحة
import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { SYSTEM_ADMIN_EMAIL } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const principal = await getPrincipal();
    if (principal) {
      return NextResponse.json({ authenticated: true, needsSetup: false, principal });
    }

    // هل يحتاج النظام تهيئة أولى؟ (مدير النظام بلا كلمة مرور بعد)
    const admin = await db.user.findFirst({
      where: { email: SYSTEM_ADMIN_EMAIL },
      select: { passwordHash: true, isActive: true },
    });
    const needsSetup = Boolean(admin && admin.isActive && !admin.passwordHash);
    return NextResponse.json({ authenticated: false, needsSetup });
  } catch (error) {
    console.error("خطأ في فحص الجلسة:", error);
    return NextResponse.json({ error: "تعذر فحص حالة تسجيل الدخول." }, { status: 500 });
  }
}
