// تحديث مراجعة/متابعة — إنجاز، إلغاء، إعادة جدولة، حذف (للإدارة)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    const action = body.action;
    if (action === "complete") {
      data.status = "DONE";
      data.completedAt = new Date();
    } else if (action === "cancel") {
      data.status = "CANCELLED";
      data.completedAt = new Date();
    } else if (action === "reopen") {
      data.status = "PENDING";
      data.completedAt = null;
    }

    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.notes === "string" && body.notes.trim()) data.notes = body.notes.trim();
    if (typeof body.dueDate === "string" && body.dueDate) {
      const d = new Date(body.dueDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "موعد الاستحقاق غير صحيح." }, { status: 400 });
      }
      data.dueDate = d;
    }
    if ("coordinatorId" in body) {
      const cid = typeof body.coordinatorId === "string" && body.coordinatorId ? body.coordinatorId : null;
      if (cid) {
        const c = await db.coordinator.findFirst({ where: { id: cid, isActive: true } });
        if (!c) return NextResponse.json({ error: "المنسقة المحددة غير نشطة." }, { status: 400 });
      }
      data.coordinatorId = cid;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث." }, { status: 400 });
    }

    const updated = await db.followUp.update({ where: { id }, data: data as never });
    return NextResponse.json({ followUp: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error("خطأ في تحديث المراجعة:", error);
    return NextResponse.json({ error: "تعذر تحديث المراجعة." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    await db.followUp.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في حذف المراجعة:", error);
    return NextResponse.json({ error: "تعذر حذف المراجعة." }, { status: 500 });
  }
}
