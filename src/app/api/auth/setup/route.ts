// تهيئة التشغيل الأول: تعيين بيانات دخول مدير النظام
// مسموح فقط عندما يكون حساب مدير النظام بلا كلمة مرور بعد، وبعد ذلك يُغلق نهائياً.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { SYSTEM_ADMIN_EMAIL } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";
    const username =
      typeof body.username === "string" && body.username.trim() ? body.username.trim() : "admin";
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "مدير النظام";

    if (password.length < 6) {
      return NextResponse.json(
        { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      return NextResponse.json(
        { error: "اسم المستخدم: حروف إنجليزية وأرقام فقط (3-32 خانة)." },
        { status: 400 }
      );
    }

    const admin = await db.user.findFirst({ where: { email: SYSTEM_ADMIN_EMAIL } });
    if (!admin) {
      return NextResponse.json({ error: "حساب مدير النظام غير موجود." }, { status: 404 });
    }
    if (admin.passwordHash) {
      return NextResponse.json(
        { error: "تمت تهيئة النظام مسبقاً — استخدم تسجيل الدخول العادي." },
        { status: 403 }
      );
    }

    // تفادي تعارض اسم المستخدم مع حساب آخر
    const conflict = await db.user.findUnique({ where: { username } });
    if (conflict && conflict.id !== admin.id) {
      return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    await db.user.update({
      where: { id: admin.id },
      data: { username, passwordHash, name, isActive: true },
    });

    await db.notification.create({
      data: {
        title: "تمت تهيئة النظام",
        message: "تم تعيين بيانات دخول مدير النظام. يمكن الآن إنشاء حسابات المنسقات عند الحاجة.",
        type: "SUCCESS",
      },
    });

    await createSession({ type: "ADMIN", userId: admin.id });
    await db.user.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    return NextResponse.json({ ok: true, redirect: "admin" }, { status: 201 });
  } catch (error) {
    console.error("خطأ في تهيئة النظام:", error);
    return NextResponse.json({ error: "تعذر تنفيذ التهيئة." }, { status: 500 });
  }
}
