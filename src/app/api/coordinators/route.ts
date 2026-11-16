// إدارة المنسقات الميدانيات — قائمة + إضافة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const coordinators = await db.coordinator.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { schools: true } },
        authSessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
      },
    });
    const counts = new Map(await Promise.all(coordinators.map(async c => [c.id, await db.school.count({where:{OR:[{coordinatorId:c.id},{assignments:{some:{coordinatorId:c.id}}}]}})] as const)));
    return NextResponse.json({
      coordinators: coordinators.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        notes: c.notes,
        isActive: c.isActive,
        schoolCount: counts.get(c.id) ?? 0,
        canAddSchools: c.canAddSchools,
        canRegisterVisits: c.canRegisterVisits,
        canViewVisits: c.canViewVisits,
        canViewSchools: c.canViewSchools,
        // حالة حساب الدخول للبوابة الميدانية
        hasAccount: Boolean(c.passwordHash),
        username: c.username,
        lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
        hasActiveSession: c.authSessions.length > 0,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("خطأ في جلب المنسقات:", error);
    return NextResponse.json({ error: "تعذر جلب قائمة المنسقات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
    if (!name) return NextResponse.json({ error: "اسم المنسقة مطلوب." }, { status: 400 });

    const existing = await db.coordinator.findFirst({ where: { name, isActive: true } });
    if (existing) {
      return NextResponse.json({ error: "توجد منسقة بنفس الاسم فعلاً." }, { status: 409 });
    }

    const created = await db.coordinator.create({
      data: {
        name,
        phone: typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null,
        email: typeof body.email === "string" && body.email.trim() ? body.email.trim() : null,
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
      },
    });
    return NextResponse.json({ coordinator: created }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إضافة المنسقة:", error);
    return NextResponse.json({ error: "تعذر إضافة المنسقة." }, { status: 500 });
  }
}
