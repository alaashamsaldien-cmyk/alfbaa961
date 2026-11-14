// ——— قوالب الصلاحيات الجاهزة ———
// GET: القوالب المدمجة في النظام (5 قوالب جاهزة) + القوالب المخصصة المحفوظة في القاعدة.
// POST: حفظ قالب جديد من خريطة صلاحيات (ينشئه المدير من إعدادات موظف معدّلة).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  BUILT_IN_TEMPLATES,
  permsToDbRows,
  type SectionKey,
  type SectionPerms,
} from "@/lib/permissions";

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const custom = await db.permissionTemplate.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({
      builtIn: BUILT_IN_TEMPLATES.map((t) => ({
        key: t.key,
        name: t.name,
        description: t.description,
        sections: t.sections,
        isBuiltIn: true,
      })),
      custom: custom.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        sections: JSON.parse(t.sectionsJson) as Record<SectionKey, SectionPerms>,
        isBuiltIn: false,
      })),
    });
  } catch (error) {
    console.error("خطأ في جلب قوالب الصلاحيات:", error);
    return NextResponse.json({ error: "تعذر جلب قوالب الصلاحيات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const sections = body.sections;
    if (!name) return NextResponse.json({ error: "اسم القالب مطلوب." }, { status: 400 });
    if (!sections || typeof sections !== "object") {
      return NextResponse.json({ error: "خريطة صلاحيات القالب مطلوبة." }, { status: 400 });
    }

    const conflict = await db.permissionTemplate.findUnique({ where: { name } });
    if (conflict) return NextResponse.json({ error: "يوجد قالب بنفس الاسم." }, { status: 409 });

    const rows = permsToDbRows(sections as Partial<Record<SectionKey, Partial<SectionPerms>>>);
    const created = await db.permissionTemplate.create({
      data: {
        name,
        description,
        sectionsJson: JSON.stringify(Object.fromEntries(rows.map((r) => [r.section, { visible: r.visible, view: r.canView, create: r.canCreate, edit: r.canEdit, delete: r.canDelete, export: r.canExport, approve: r.canApprove, manage: r.canManage }]))),
      },
    });

    await logAudit({
      actorType: "ADMIN",
      actorId: guard.principal.userId,
      actorName: guard.principal.name,
      action: AUDIT_ACTIONS.CREATE_TEMPLATE,
      entityType: "TEMPLATE",
      entityId: created.id,
      details: { name },
    });

    return NextResponse.json({ template: { id: created.id } }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إنشاء قالب الصلاحيات:", error);
    return NextResponse.json({ error: "تعذر إنشاء القالب." }, { status: 500 });
  }
}
