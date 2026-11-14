// ——— سجل التدقيق: قائمة القيود مع فلاتر (الإجراء / الموظف / الفترة) — مدير النظام فقط ———
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getBaghdadDaysAgoStart } from "@/lib/time";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const sp = request.nextUrl.searchParams;
    const action = sp.get("action") ?? "all";
    const actorId = sp.get("actorId") ?? "all";
    const entityType = sp.get("entityType") ?? "all";
    const period = sp.get("period") ?? "month";
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);

    const where: Record<string, unknown> = {};
    if (action !== "all") where.action = action;
    if (actorId !== "all") where.actorId = actorId;
    if (entityType !== "all") where.entityType = entityType;
    if (period === "today") {
      where.createdAt = { gte: getBaghdadDaysAgoStart(0) };
    } else if (period === "week") {
      where.createdAt = { gte: getBaghdadDaysAgoStart(6) };
    } else if (period === "month") {
      where.createdAt = { gte: getBaghdadDaysAgoStart(29) };
    }

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where: where as never }),
      db.auditLog.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize: PAGE_SIZE,
      logs: logs.map((l) => ({
        id: l.id,
        actorType: l.actorType,
        actorId: l.actorId,
        actorName: l.actorName,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        details: l.details ? JSON.parse(l.details) : null,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("خطأ في جلب سجل التدقيق:", error);
    return NextResponse.json({ error: "تعذر جلب سجل التدقيق." }, { status: 500 });
  }
}
