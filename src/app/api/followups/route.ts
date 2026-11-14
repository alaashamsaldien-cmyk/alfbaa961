// المراجعات اليومية والمتابعات المبرمجة — قراءة وإنشاء حقيقي
// GET: فلاتر (الحالة، النوع، الفترة) + قوائم اليوم/المتأخرة/القادمة
// POST: إنشاء مراجعة/متابعة لمدارس مخصصة لمنسقة أو بلا منسقة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getBaghdadStartOfDay, getBaghdadEndOfDay, getBaghdadDaysAgoStart } from "@/lib/time";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const sp = request.nextUrl.searchParams;
    const status = sp.get("status");
    const type = sp.get("type");
    const coordinatorId = sp.get("coordinatorId");
    const period = sp.get("period") ?? "all";

    const todayStart = getBaghdadStartOfDay();
    const todayEnd = getBaghdadEndOfDay();

    const where: Record<string, unknown> = {};
    if (status && status !== "all") where.status = status;
    if (type && type !== "all") where.type = type;
    if (coordinatorId === "none_only") where.coordinatorId = null;
    else if (coordinatorId && coordinatorId !== "all") where.coordinatorId = coordinatorId;
    if (period === "today") where.dueDate = { gte: todayStart, lte: todayEnd };
    else if (period === "week") where.dueDate = { gte: todayStart, lte: new Date(todayEnd.getTime() + 6 * 86400000) };
    else if (period === "overdue") {
      where.dueDate = { lt: todayStart };
      where.status = "PENDING";
    } else if (period === "upcoming") {
      where.dueDate = { gt: todayEnd };
      where.status = "PENDING";
    }

    const [total, followUps] = await Promise.all([
      db.followUp.count({ where: where as never }),
      db.followUp.findMany({
        where: where as never,
        orderBy: { dueDate: "asc" },
        take: 200,
        include: {
          school: { select: { name: true, regionText: true, region: { select: { name: true } } } },
          coordinator: { select: { id: true, name: true } },
        },
      }),
    ]);

    const [pendingToday, overdue, upcoming, doneThisWeek] = await Promise.all([
      db.followUp.count({ where: { status: "PENDING", dueDate: { gte: todayStart, lte: todayEnd } } }),
      db.followUp.count({ where: { status: "PENDING", dueDate: { lt: todayStart } } }),
      db.followUp.count({ where: { status: "PENDING", dueDate: { gt: todayEnd } } }),
      db.followUp.count({
        where: {
          status: "DONE",
          completedAt: { gte: getBaghdadDaysAgoStart(6), lte: todayEnd },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      summary: { pendingToday, overdue, upcoming, doneThisWeek },
      followUps: followUps.map((f) => ({
        id: f.id,
        title: f.title,
        type: f.type,
        status: f.status,
        schoolId: f.schoolId,
        schoolName: f.school.name,
        regionName: f.school.region?.name ?? f.school.regionText,
        coordinatorId: f.coordinator?.id ?? null,
        coordinatorName: f.coordinator?.name ?? null,
        dueDate: f.dueDate.toISOString(),
        completedAt: f.completedAt?.toISOString() ?? null,
        overdue: f.status === "PENDING" && f.dueDate < todayStart,
        notes: f.notes,
      })),
    });
  } catch (error) {
    console.error("خطأ في جلب المراجعات:", error);
    return NextResponse.json({ error: "تعذر جلب المراجعات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const schoolId = typeof body.schoolId === "string" ? body.schoolId : "";
    const type = body.type === "FOLLOW_UP" ? "FOLLOW_UP" : "REVIEW";
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
    const dueDateRaw = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : "";
    if (!schoolId || !dueDateRaw) {
      return NextResponse.json({ error: "المدرسة وموعد الاستحقاق مطلوبان." }, { status: 400 });
    }

    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) return NextResponse.json({ error: "المدرسة غير موجودة." }, { status: 404 });

    const dueDate = new Date(dueDateRaw);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: "موعد الاستحقاق غير صحيح." }, { status: 400 });
    }

    const coordinatorId = typeof body.coordinatorId === "string" && body.coordinatorId ? body.coordinatorId : null;
    if (coordinatorId) {
      const c = await db.coordinator.findFirst({ where: { id: coordinatorId, isActive: true } });
      if (!c) return NextResponse.json({ error: "المنسقة المحددة غير نشطة." }, { status: 400 });
    }

    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const created = await db.followUp.create({
      data: {
        title,
        type,
        schoolId,
        coordinatorId,
        userId: guard.principal.userId,
        dueDate,
        notes,
        status: "PENDING",
      },
    });

    return NextResponse.json({ followUp: { id: created.id } }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إنشاء المراجعة:", error);
    return NextResponse.json({ error: "تعذر إنشاء المراجعة." }, { status: 500 });
  }
}
