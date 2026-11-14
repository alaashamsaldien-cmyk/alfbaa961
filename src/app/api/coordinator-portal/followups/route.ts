// مراجعات ومتابعات المنسقة الميدانية — من الجلسة الحقيقية
// GET: قائمة مراجعاتها المعلقة والمتأخرة
// PATCH: إنجاز أو إلغاء مراجعة مخصصة لها فقط (حماية مزدوجة بالمعرف والجلسة)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrincipal } from "@/lib/auth";
import { getBaghdadStartOfDay } from "@/lib/time";

export async function GET() {
  try {
    const principal = await getPrincipal();
    if (principal?.type !== "COORDINATOR") {
      return NextResponse.json({ error: "هذه العملية لمنسقة ميدانية مسجلة دخول." }, { status: 403 });
    }

    const followUps = await db.followUp.findMany({
      where: { coordinatorId: principal.coordinatorId },
      orderBy: { dueDate: "asc" },
      take: 60,
      include: { school: { select: { name: true } } },
    });
    const todayStart = getBaghdadStartOfDay();

    return NextResponse.json({
      followUps: followUps.map((f) => ({
        id: f.id,
        title: f.title,
        type: f.type,
        schoolName: f.school.name,
        dueDate: f.dueDate.toISOString(),
        status: f.status,
        overdue: f.status === "PENDING" && f.dueDate < todayStart,
        completedAt: f.completedAt?.toISOString() ?? null,
        notes: f.notes,
      })),
    });
  } catch (error) {
    console.error("خطأ في جلب مراجعات المنسقة:", error);
    return NextResponse.json({ error: "تعذر جلب المراجعات." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await getPrincipal();
    if (principal?.type !== "COORDINATOR") {
      return NextResponse.json({ error: "هذه العملية لمنسقة ميدانية مسجلة دخول." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    const action = body.action === "cancel" ? "cancel" : "complete";
    if (!id) return NextResponse.json({ error: "معرف المراجعة مطلوب." }, { status: 400 });

    // يجب أن تكون المراجعة مخصصة لهذه المنسقة حصراً
    const followUp = await db.followUp.findUnique({
      where: { id },
      include: { school: { select: { name: true } } },
    });
    if (!followUp) return NextResponse.json({ error: "المراجعة غير موجودة." }, { status: 404 });
    if (followUp.coordinatorId !== principal.coordinatorId) {
      return NextResponse.json(
        { error: "هذه المراجعة غير مخصصة لك — التعديل مرفوض." },
        { status: 403 }
      );
    }

    const now = new Date();
    const updated = await db.followUp.update({
      where: { id },
      data: {
        status: action === "complete" ? "DONE" : "CANCELLED",
        completedAt: now,
        notes:
          typeof body.notes === "string" && body.notes.trim()
            ? body.notes.trim()
            : followUp.notes,
      },
    });

    await db.notification.create({
      data: {
        title: action === "complete" ? "إنجاز مراجعة من الميدان" : "إلغاء مراجعة من الميدان",
        message: `المنسقة «${principal.name}» ${
          action === "complete" ? "أنجزت" : "ألغت"
        } مراجعة على مدرسة «${followUp.school.name}» — تظهر في قسم المراجعات اليومية.`,
        type: action === "complete" ? "SUCCESS" : "WARNING",
      },
    });

    return NextResponse.json({ followUp: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error("خطأ في تحديث المراجعة:", error);
    return NextResponse.json({ error: "تعذر تحديث المراجعة." }, { status: 500 });
  }
}
