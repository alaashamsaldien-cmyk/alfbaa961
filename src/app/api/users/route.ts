// حسابات مستخدمي الإدارة — قائمة + إضافة (إعدادات وصلاحيات)
// الأدوار: ADMIN مدير النظام | MANAGER مدير إداري | STAFF موظف إداري
// الوصول الفعلي في هذه المرحلة: ADMIN فقط — الأدوار الأخرى تُنشأ الآن لتهيئة المرحلة القادمة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const USER_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        authSessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
      },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        role: u.role,
        isActive: u.isActive,
        hasPassword: Boolean(u.passwordHash),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        hasActiveSession: u.authSessions.length > 0,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("خطأ في جلب حسابات المستخدمين:", error);
    return NextResponse.json({ error: "تعذر جلب حسابات المستخدمين." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "";
    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : "";
    const username = typeof body.username === "string" && body.username.trim() ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = USER_ROLES.includes(body.role) ? body.role : "STAFF";

    if (!name) return NextResponse.json({ error: "الاسم مطلوب." }, { status: 400 });
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "بريد إلكتروني صحيح مطلوب." }, { status: 400 });
    }
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "اسم المستخدم: حروف إنجليزية وأرقام فقط (3-32 خانة)." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
    }

    const emailConflict = await db.user.findUnique({ where: { email } });
    if (emailConflict) return NextResponse.json({ error: "البريد الإلكتروني مستخدم مسبقاً." }, { status: 409 });
    const usernameConflict = await db.user.findUnique({ where: { username } });
    if (usernameConflict) return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً." }, { status: 409 });
    const coordinatorConflict = await db.coordinator.findUnique({ where: { username } });
    if (coordinatorConflict) {
      return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً في حسابات المنسقات." }, { status: 409 });
    }

    const created = await db.user.create({
      data: { name, email, username, passwordHash: await hashPassword(password), role, isActive: true },
    });

    await db.notification.create({
      data: {
        title: "إنشاء حساب مستخدم",
        message: `أُنشئ حساب «${name}» بدور ${role === "ADMIN" ? "مدير النظام" : role === "MANAGER" ? "مدير إداري" : "موظف إداري"}.`,
        type: "INFO",
      },
    });

    return NextResponse.json({ user: { id: created.id } }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إنشاء حساب المستخدم:", error);
    return NextResponse.json({ error: "تعذر إنشاء الحساب." }, { status: 500 });
  }
}
