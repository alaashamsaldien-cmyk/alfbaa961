import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrincipal } from "@/lib/auth";
import { ensureBootstrap } from "@/lib/session";

/** قائمة أحدث الإشعارات + عدد غير المقروء — لأي جلسة مصادَقة (إدارة أو منسقة) */
export async function GET() {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "يجب تسجيل الدخول." }, { status: 401 });
    }
    await ensureBootstrap();
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          isRead: true,
          createdAt: true,
        },
      }),
      db.notification.count({ where: { isRead: false } }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("خطأ في جلب الإشعارات:", error);
    return NextResponse.json(
      { error: "تعذر جلب الإشعارات." },
      { status: 500 }
    );
  }
}

/** تحديد إشعار أو كل الإشعارات كمقروء — لأي جلسة مصادَقة */
export async function PATCH(request: NextRequest) {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "يجب تسجيل الدخول." }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "طلب غير صحيح." }, { status: 400 });
    }

    const { id, markAllRead } = body as { id?: string; markAllRead?: boolean };

    if (markAllRead) {
      await db.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
    } else if (typeof id === "string" && id.length > 0) {
      await db.notification.update({ where: { id }, data: { isRead: true } });
    } else {
      return NextResponse.json({ error: "لم يُحدد إشعار." }, { status: 400 });
    }

    const unreadCount = await db.notification.count({ where: { isRead: false } });
    return NextResponse.json({ ok: true, unreadCount });
  } catch (error) {
    console.error("خطأ في تحديث الإشعارات:", error);
    return NextResponse.json(
      { error: "تعذر تحديث الإشعارات." },
      { status: 500 }
    );
  }
}
