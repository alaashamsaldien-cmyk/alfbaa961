// تعديل/تعطيل/حذف منسقة — الحذف الكامل مسموح فقط لمنسقة بلا مدارس مخصصة وبلا نشاطات
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

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if ("phone" in body) data.phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
    if ("email" in body) data.email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
    if ("notes" in body) data.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    for (const key of ["canAddSchools", "canRegisterVisits", "canViewVisits", "canViewSchools"]) {
      if (typeof body[key] === "boolean") data[key] = body[key];
    }
    if ("isActive" in body) {
      data.isActive = Boolean(body.isActive);
      // عند التعطيل تُفصل المدارس المخصصة لها (إشعار يوضح ذلك)
      if (!data.isActive) {
        const assigned = await db.school.count({ where: { coordinatorId: id } });
        if (assigned > 0) {
          await db.school.updateMany({ where: { coordinatorId: id }, data: { coordinatorId: null } });
          await db.notification.create({
            data: {
              title: "تعديل في تخصيص المدارس",
              message: `تم تعطيل حساب منسقة وفصل ${assigned} مدرسة كانت مخصصة لها. يجب إعادة تخصيصها لمنسقات نشطات.`,
              type: "WARNING",
            },
          });
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث." }, { status: 400 });
    }

    const updated = await db.coordinator.update({ where: { id }, data: data as never });
    return NextResponse.json({ coordinator: { id: updated.id } });
  } catch (error) {
    console.error("خطأ في تعديل المنسقة:", error);
    return NextResponse.json({ error: "تعذر تعديل بيانات المنسقة." }, { status: 500 });
  }
}

/** حذف كامل — للتنظيف فقط: مرفوض إن كانت لها مدارس مخصصة أو سجلات نشاطات/متابعات */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const c = await db.coordinator.findUnique({
      where: { id },
      include: { _count: { select: { schools: true, activities: true, followUps: true, schoolVisits: true } } },
    });
    if (!c) return NextResponse.json({ error: "المنسقة غير موجودة." }, { status: 404 });
    if (c._count.schools > 0) {
      return NextResponse.json(
        { error: `لا يمكن الحذف — لها ${c._count.schools} مدرسة مخصصة. افصلها أولاً أو عطّل الحساب.` },
        { status: 409 }
      );
    }
    if (c._count.activities > 0 || c._count.followUps > 0 || c._count.schoolVisits > 0) {
      return NextResponse.json(
        { error: "لا يمكن الحذف — لها سجلات نشاطات أو مراجعات مرتبطة بها. عطّل الحساب بدلاً من الحذف للحفاظ على السجل." },
        { status: 409 }
      );
    }
    await db.authSession.deleteMany({ where: { coordinatorId: id } });
    await db.coordinator.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في حذف المنسقة:", error);
    return NextResponse.json({ error: "تعذر حذف المنسقة." }, { status: 500 });
  }
}
