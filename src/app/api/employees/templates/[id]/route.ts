// حذف قالب صلاحيات مخصص — القوالب المدمجة في النظام لا تُحذف (تدار برمجياً)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const template = await db.permissionTemplate.findUnique({ where: { id } });
    if (!template) return NextResponse.json({ error: "القالب غير موجود." }, { status: 404 });

    await db.permissionTemplate.delete({ where: { id } });
    await logAudit({
      actorType: "ADMIN",
      actorId: guard.principal.userId,
      actorName: guard.principal.name,
      action: AUDIT_ACTIONS.DELETE_TEMPLATE,
      entityType: "TEMPLATE",
      entityId: id,
      details: { name: template.name },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في حذف القالب:", error);
    return NextResponse.json({ error: "تعذر حذف القالب." }, { status: 500 });
  }
}
