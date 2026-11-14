// حذف نشاط — للإدارة لتصحيح أخطاء التسجيل (سجل حذفه لا يُسترد)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const activity = await db.activity.findUnique({ where: { id } });
    if (!activity) return NextResponse.json({ error: "النشاط غير موجود." }, { status: 404 });

    await db.activity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في حذف النشاط:", error);
    return NextResponse.json({ error: "تعذر حذف النشاط." }, { status: 500 });
  }
}
