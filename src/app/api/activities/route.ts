// سجل الزيارات والتواصل — قراءة حقيقية من جدول النشاطات + تسجيل نشاط من الإدارة
// كل نشاط مرتبط بمدرسة ومنسقة إن وجدت — سجل لا يُحذف عند تحديث بيانات المدرسة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getBaghdadStartOfDay, getBaghdadEndOfDay, getBaghdadDaysAgoStart } from "@/lib/time";

const ACTIVITY_TYPES = ["VISIT", "CALL", "INITIAL_APPROVAL", "CONTRACT", "FIELD_UPDATE", "OTHER"];

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const sp = request.nextUrl.searchParams;
    const type = sp.get("type");
    const coordinatorId = sp.get("coordinatorId");
    const schoolId = sp.get("schoolId");
    const period = sp.get("period") ?? "all";
    const q = sp.get("q")?.trim();
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(sp.get("pageSize") ?? 25) || 25));

    const where: Record<string, unknown> = {};
    if (type && type !== "all" && ACTIVITY_TYPES.includes(type)) where.type = type;
    if (coordinatorId && coordinatorId !== "all") where.coordinatorId = coordinatorId;
    if (schoolId && schoolId !== "all") where.schoolId = schoolId;
    if (q) {
      where.school = { name: { contains: q } };
    }
    if (period === "today") {
      where.occurredAt = { gte: getBaghdadStartOfDay(), lte: getBaghdadEndOfDay() };
    } else if (period === "week") {
      where.occurredAt = { gte: getBaghdadDaysAgoStart(6), lte: getBaghdadEndOfDay() };
    } else if (period === "month") {
      where.occurredAt = { gte: getBaghdadDaysAgoStart(29), lte: getBaghdadEndOfDay() };
    }

    const [total, activities] = await Promise.all([
      db.activity.count({ where: where as never }),
      db.activity.findMany({
        where: where as never,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          school: {
            select: {
              name: true,
              regionText: true,
              region: { select: { name: true } },
            },
          },
          coordinator: { select: { id: true, name: true } },
          user: { select: { name: true } },
        },
      }),
    ]);

    // ملخص إحصائي للفترة المختارة
    const typeCounts = await db.activity.groupBy({
      by: ["type"],
      _count: { type: true },
      where: where as never,
    });

    return NextResponse.json({
      total,
      page,
      pageSize,
      activities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        occurredAt: a.occurredAt.toISOString(),
        schoolId: a.schoolId,
        schoolName: a.school.name,
        regionName: a.school.region?.name ?? a.school.regionText,
        coordinatorId: a.coordinator?.id ?? null,
        coordinatorName: a.coordinator?.name ?? null,
        userName: a.user?.name ?? null,
        result: a.result,
        notes: a.notes,
      })),
      typeCounts: typeCounts.map((t) => ({ type: t.type, count: t._count.type })),
    });
  } catch (error) {
    console.error("خطأ في جلب سجل النشاطات:", error);
    return NextResponse.json({ error: "تعذر جلب سجل النشاطات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const schoolId = typeof body.schoolId === "string" ? body.schoolId : "";
    const type = ACTIVITY_TYPES.includes(body.type) ? body.type : null;
    if (!schoolId || !type) {
      return NextResponse.json({ error: "المدرسة ونوع النشاط مطلوبان." }, { status: 400 });
    }

    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) return NextResponse.json({ error: "المدرسة غير موجودة." }, { status: 404 });

    const coordinatorId = typeof body.coordinatorId === "string" && body.coordinatorId ? body.coordinatorId : null;
    if (coordinatorId) {
      const c = await db.coordinator.findFirst({ where: { id: coordinatorId, isActive: true } });
      if (!c) return NextResponse.json({ error: "المنسقة المحددة غير نشطة." }, { status: 400 });
    }

    // التاريخ الفعلي للنشاط — الإدارة تسجل نشاطات اليوم أو السابق (التصحيح الرجعي)
    let occurredAt = new Date();
    if (typeof body.occurredAt === "string" && body.occurredAt) {
      const parsed = new Date(body.occurredAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "تاريخ النشاط غير صحيح." }, { status: 400 });
      }
      occurredAt = parsed;
    }

    const result = typeof body.result === "string" && body.result.trim() ? body.result.trim() : null;
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    if (!result && !notes) {
      return NextResponse.json({ error: "اكتب نتيجة النشاط أو ملاحظة على الأقل." }, { status: 400 });
    }

    const activity = await db.activity.create({
      data: {
        type,
        schoolId,
        coordinatorId,
        userId: guard.principal.userId,
        result,
        notes,
        occurredAt,
      },
    });

    if (type === "VISIT" && school.coordinatorId) {
      await db.school.update({
        where: { id: schoolId },
        data: { lastVisitAt: occurredAt },
      });
    }

    return NextResponse.json(
      { activity: { id: activity.id, occurredAt: activity.occurredAt.toISOString() } },
      { status: 201 }
    );
  } catch (error) {
    console.error("خطأ في تسجيل النشاط:", error);
    return NextResponse.json({ error: "تعذر تسجيل النشاط." }, { status: 500 });
  }
}
