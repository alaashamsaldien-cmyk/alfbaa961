// تغيير كلمة المرور الذاتية — للمدير وللمنسقة على حد سواء (بمعرفة كلمة المرور الحالية)
// عند النجاح تُنهى كل جلسات هذا الحساب عدا الجلسة الحالية.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrincipal, hashPassword, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل." },
        { status: 400 }
      );
    }

    if (principal.type === "ADMIN") {
      const user = await db.user.findUnique({ where: { id: principal.userId } });
      if (!user) return NextResponse.json({ error: "الحساب غير موجود." }, { status: 404 });
      if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash))) {
        return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة." }, { status: 403 });
      }
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword) },
      });
      // إنهاء بقية الجلسات مع إبقاء الجلسة الحالية نشطة
      await db.authSession.deleteMany({
        where: { userId: user.id, id: { not: principal.sessionId } },
      });
      return NextResponse.json({ ok: true });
    }

    // منسقة ميدانية
    const c = await db.coordinator.findUnique({ where: { id: principal.coordinatorId } });
    if (!c) return NextResponse.json({ error: "الحساب غير موجود." }, { status: 404 });
    if (c.passwordHash && !(await verifyPassword(currentPassword, c.passwordHash))) {
      return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة." }, { status: 403 });
    }
    await db.coordinator.update({
      where: { id: c.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await db.authSession.deleteMany({
      where: { coordinatorId: c.id, id: { not: principal.sessionId } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في تغيير كلمة المرور:", error);
    return NextResponse.json({ error: "تعذر تغيير كلمة المرور." }, { status: 500 });
  }
}
