// إدارة حساب دخول منسقة ميدانية — من لوحة الإدارة فقط
// POST: إنشاء حساب (اسم مستخدم + كلمة مرور)
// PATCH: إعادة تعيين كلمة المرور أو تغيير اسم المستخدم
// DELETE: إزالة الحساب (تُنهي جلساتها فوراً ولا تسمح بالدخول)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

async function loadCoordinator(id: string) {
  return db.coordinator.findUnique({ where: { id } });
}

export async function POST(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const c = await loadCoordinator(id);
    if (!c) return NextResponse.json({ error: "المنسقة غير موجودة." }, { status: 404 });
    if (c.passwordHash) {
      return NextResponse.json({ error: "لها حساب دخول فعلاً — استخدم إعادة التعيين." }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "اسم المستخدم: حروف إنجليزية وأرقام فقط (3-32 خانة)." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
    }

    const conflict = await db.coordinator.findUnique({ where: { username } });
    if (conflict) {
      return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً لمنسقة أخرى." }, { status: 409 });
    }
    const userConflict = await db.user.findUnique({ where: { username } });
    if (userConflict) {
      return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً في حسابات الإدارة." }, { status: 409 });
    }

    await db.coordinator.update({
      where: { id },
      data: { username, passwordHash: await hashPassword(password) },
    });
    await db.notification.create({
      data: {
        title: "إنشاء حساب دخول لمنسقة",
        message: `أُنشئ حساب دخول للمنسقة «${c.name}». بعد إضافة مدارس مخصصة لها ستظهر فوراً في بوابتها عند تسجيل دخولها.`,
        type: "INFO",
      },
    });
    return NextResponse.json({ ok: true, username }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إنشاء حساب المنسقة:", error);
    return NextResponse.json({ error: "تعذر إنشاء الحساب." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const c = await loadCoordinator(id);
    if (!c) return NextResponse.json({ error: "المنسقة غير موجودة." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (typeof body.username === "string" && body.username.trim()) {
      const username = body.username.trim();
      if (!USERNAME_RE.test(username)) {
        return NextResponse.json({ error: "اسم المستخدم غير صالح." }, { status: 400 });
      }
      const conflict = await db.coordinator.findUnique({ where: { username } });
      if (conflict && conflict.id !== id) {
        return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً." }, { status: 409 });
      }
      data.username = username;
    }

    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
      }
      data.passwordHash = await hashPassword(body.password);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث." }, { status: 400 });
    }

    await db.coordinator.update({ where: { id }, data: data as never });
    // إنهاء جلسات المنسقة عند أي تعديل على بيانات الدخول (إعادة تعيين/تغيير اسم)
    await db.authSession.deleteMany({ where: { coordinatorId: id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في تعديل حساب المنسقة:", error);
    return NextResponse.json({ error: "تعذر تعديل الحساب." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const c = await loadCoordinator(id);
    if (!c) return NextResponse.json({ error: "المنسقة غير موجودة." }, { status: 404 });

    await db.coordinator.update({
      where: { id },
      data: { username: null, passwordHash: null, lastLoginAt: null },
    });
    await db.authSession.deleteMany({ where: { coordinatorId: id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في إزالة حساب المنسقة:", error);
    return NextResponse.json({ error: "تعذر إزالة الحساب." }, { status: 500 });
  }
}
