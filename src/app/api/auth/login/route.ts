// تسجيل الدخول الفعلي — يدعم ثلاثة حسابات:
//  - مدير النظام: بـ username أو email + كلمة المرور → لوحة الإدارة الكاملة
//  - موظف (STAFF/MANAGER): بـ username + كلمة المرور → بوابة الموظف على الموبايل (حسب صلاحياته)
//  - منسقة ميدانية: بـ username + كلمة المرور → بوابة الميدان فقط (مدارسها المخصصة)
// الحساب المعطل (isActive=false) يمنع الدخول فوراً.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier =
      typeof body.username === "string" && body.username.trim() ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!identifier || !password) {
      return NextResponse.json(
        { error: "اسم المستخدم وكلمة المرور مطلوبان." },
        { status: 400 }
      );
    }

    // محاولة الدخول بحساب مستخدم (مدير أو موظف) — بالاسم أو البريد
    const user = await db.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    if (user && (await verifyPassword(password, user.passwordHash))) {
      // الحساب المعطل يمنع الدخول فوراً
      if (!user.isActive) {
        return NextResponse.json(
          { error: "هذا الحساب معطل — تواصل مع مدير النظام.", code: "ACCOUNT_DISABLED" },
          { status: 403 }
        );
      }
      await createSession({ type: "ADMIN", userId: user.id });
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      const isEmployee = user.role !== "ADMIN";
      await logAudit({
        actorType: isEmployee ? "EMPLOYEE" : "ADMIN",
        actorId: user.id,
        actorName: user.name ?? user.username ?? "",
        action: isEmployee ? AUDIT_ACTIONS.EMPLOYEE_LOGIN : AUDIT_ACTIONS.ADMIN_LOGIN,
        entityType: "SESSION",
        entityId: user.id,
      });

      return NextResponse.json({
        ok: true,
        redirect: isEmployee ? "employee" : "admin",
        name: user.name,
      });
    }

    // محاولة الدخول كمنسقة ميدانية
    const coordinator = await db.coordinator.findFirst({
      where: { isActive: true, username: identifier },
    });
    if (coordinator && (await verifyPassword(password, coordinator.passwordHash))) {
      await createSession({ type: "COORDINATOR", coordinatorId: coordinator.id });
      await db.coordinator.update({
        where: { id: coordinator.id },
        data: { lastLoginAt: new Date() },
      });
      return NextResponse.json({ ok: true, redirect: "coordinator", name: coordinator.name });
    }

    return NextResponse.json(
      { error: "اسم المستخدم أو كلمة المرور غير صحيحة، أو الحساب معطل." },
      { status: 401 }
    );
  } catch (error) {
    console.error("خطأ في تسجيل الدخول:", error);
    return NextResponse.json({ error: "تعذر تسجيل الدخول." }, { status: 500 });
  }
}
