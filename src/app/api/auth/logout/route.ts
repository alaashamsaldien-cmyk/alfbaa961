// تسجيل الخروج — حذف الجلسة من القاعدة وإزالة الكوكي
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في تسجيل الخروج:", error);
    return NextResponse.json({ error: "تعذر تسجيل الخروج." }, { status: 500 });
  }
}
