// ——— بوابة الموظف: تغيير كلمة المرور الخاصة به (قسم الإعدادات) ———
// يتطلب قسم الإعدادات مرئياً للموظف. التحقق من كلمة المرور الحالية إلزامي،
// وتغييرها ينهي كل جلساته الأخرى فوراً ويُسجل في سجل التدقيق.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmployee, verifyPassword, hashPassword, destroySessionsFor } from "@/lib/auth";
import { checkPermission, getPermissionMap } from "@/lib/permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const guard = await requireEmployee();
  if ("response" in guard && guard.response) return guard.response;
  const principal = (guard as { principal: { userId: string; sessionId: string; name: string } }).principal;
  try {
    const perms = await getPermissionMap(principal.userId);
    if (!checkPermission(perms, "settings", "view").ok) {
      return NextResponse.json({ error: "غير مصرح — قسم الإعدادات غير مفعّل لحسابك.", code: "ACTION_DENIED" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "كلمة المرور الحالية والجديدة مطلوبتان." }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: principal.userId }, select: { passwordHash: true, name: true } });
    if (!user) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة." }, { status: 400 });
    }

    await db.user.update({ where: { id: principal.userId }, data: { passwordHash: await hashPassword(newPassword) } });
    // إنهاء كل الجلسات الأخرى — تبقى الجلسة الحالية فقط
    await db.authSession.deleteMany({
      where: { userId: principal.userId, id: { not: principal.sessionId } },
    });

    await logAudit({
      actorType: "EMPLOYEE",
      actorId: principal.userId,
      actorName: user.name ?? principal.name,
      action: AUDIT_ACTIONS.EMPLOYEE_CHANGE_PASSWORD,
      entityType: "SESSION",
      entityId: principal.userId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في تغيير كلمة مرور الموظف:", error);
    return NextResponse.json({ error: "تعذر تغيير كلمة المرور." }, { status: 500 });
  }
}
