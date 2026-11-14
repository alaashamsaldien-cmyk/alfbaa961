// تعديل/تعطيل/حذف حساب مستخدم — بحماية: لا يمكن إلغاء آخر حساب ADMIN فعّال
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };
const USER_ROLES = ["ADMIN", "MANAGER", "STAFF"];

async function assertNotLastAdmin(userId: string, changes: { isActive?: boolean; role?: string }) {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "الحساب غير موجود." as const };
  const willBeInactive = changes.isActive === false;
  const willLoseAdmin = changes.role !== undefined && changes.role !== "ADMIN" && target.role === "ADMIN";
  if (target.role === "ADMIN" && target.isActive && (willBeInactive || willLoseAdmin)) {
    const activeAdmins = await db.user.count({ where: { role: "ADMIN", isActive: true, NOT: { id: userId } } });
    if (activeAdmins === 0) {
      return { error: "لا يمكن إلغاء آخر حساب مدير نظام فعّال — أنشئ مديراً آخر أولاً." as const };
    }
  }
  return { error: null };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.role === "string" && USER_ROLES.includes(body.role)) data.role = body.role;
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
      }
      data.passwordHash = await hashPassword(body.password);
    }
    if ("isActive" in body) {
      const check = await assertNotLastAdmin(id, { isActive: Boolean(body.isActive) });
      if (check.error) return NextResponse.json({ error: check.error }, { status: 409 });
      data.isActive = Boolean(body.isActive);
    }
    if (typeof body.role === "string" && USER_ROLES.includes(body.role)) {
      const check = await assertNotLastAdmin(id, { role: body.role });
      if (check.error) return NextResponse.json({ error: check.error }, { status: 409 });
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث." }, { status: 400 });
    }

    const updated = await db.user.update({ where: { id }, data: data as never });
    // تعطيل الحساب أو تغيير كلمة المرور ينهي جلساته فوراً (عدا الجلسة الحالية إذا عدل نفسه بلا تعطيل)
    if (data.isActive === false || data.passwordHash) {
      await db.authSession.deleteMany({
        where: {
          userId: id,
          ...(updated.id === guard.principal.userId && data.isActive !== false ? { id: { not: guard.principal.sessionId } } : {}),
        },
      });
    }
    return NextResponse.json({ user: { id: updated.id, role: updated.role, isActive: updated.isActive } });
  } catch (error) {
    console.error("خطأ في تعديل حساب المستخدم:", error);
    return NextResponse.json({ error: "تعذر تعديل الحساب." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    if (id === guard.principal.userId) {
      return NextResponse.json({ error: "لا يمكن حذف حسابك المسجل دخولك حالياً." }, { status: 409 });
    }
    const check = await assertNotLastAdmin(id, { isActive: false });
    if (check.error) return NextResponse.json({ error: check.error }, { status: 409 });

    await db.authSession.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في حذف حساب المستخدم:", error);
    return NextResponse.json({ error: "تعذر حذف الحساب." }, { status: 500 });
  }
}
