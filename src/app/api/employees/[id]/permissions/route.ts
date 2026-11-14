// ——— تخصيص الواجهة والصلاحيات: قراءة وحفظ صلاحيات موظف لكل الأقسام ———
// GET: خريطة الصلاحيات الحالية لكل أقسام النظام.
// PUT: حفظ كامل لخريطة الصلاحيات (إظهار/إخفاء أيقونة + الصلاحيات التفصيلية لكل قسم).
// الحماية: مدير النظام فقط — الموظف لا يستطيع تعديل صلاحياته أو صلاحيات موظف آخر.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { SECTION_KEYS, permsToDbRows, type SectionKey, type SectionPerms } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const employee = await db.user.findFirst({
      where: { id, role: { in: ["MANAGER", "STAFF"] } },
      select: { id: true, name: true, username: true, jobTitle: true, isActive: true, permissions: true },
    });
    if (!employee) return NextResponse.json({ error: "حساب الموظف غير موجود." }, { status: 404 });

    const map: Record<string, SectionPerms> = {};
    for (const key of SECTION_KEYS) {
      const row = employee.permissions.find((p) => p.section === key);
      map[key] = {
        visible: key === "home" ? true : Boolean(row?.visible),
        view: Boolean(row?.canView),
        create: Boolean(row?.canCreate),
        edit: Boolean(row?.canEdit),
        delete: Boolean(row?.canDelete),
        export: Boolean(row?.canExport),
        approve: Boolean(row?.canApprove),
        manage: Boolean(row?.canManage),
      };
    }
    return NextResponse.json({
      employee: { id: employee.id, name: employee.name, username: employee.username, jobTitle: employee.jobTitle },
      permissions: map,
    });
  } catch (error) {
    console.error("خطأ في جلب صلاحيات الموظف:", error);
    return NextResponse.json({ error: "تعذر جلب صلاحيات الموظف." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const employee = await db.user.findFirst({
      where: { id, role: { in: ["MANAGER", "STAFF"] } },
      select: { id: true, name: true, permissions: { select: { section: true, visible: true, canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true, canApprove: true, canManage: true } } },
    });
    if (!employee) return NextResponse.json({ error: "حساب الموظف غير موجود." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const incoming = body?.permissions;
    if (!incoming || typeof incoming !== "object") {
      return NextResponse.json({ error: "خريطة الصلاحيات مطلوبة." }, { status: 400 });
    }

    const rows = permsToDbRows(incoming as Partial<Record<SectionKey, Partial<SectionPerms>>>);
    // الرئيسية أساسية: مرئية دائماً ولا تُقبَل كقسم مخفي
    const homeRow = rows.find((r) => r.section === "home");
    if (homeRow) homeRow.visible = true;

    const before = Object.fromEntries(
      employee.permissions.map((p) => [p.section, { visible: p.visible, view: p.canView, create: p.canCreate, edit: p.canEdit, delete: p.canDelete, export: p.canExport, approve: p.canApprove, manage: p.canManage }])
    );

    await db.$transaction(
      rows.map((r) =>
        db.employeePermission.upsert({
          where: { userId_section: { userId: id, section: r.section } },
          create: { userId: id, section: r.section, visible: r.visible, canView: r.canView, canCreate: r.canCreate, canEdit: r.canEdit, canDelete: r.canDelete, canExport: r.canExport, canApprove: r.canApprove, canManage: r.canManage },
          update: { visible: r.visible, canView: r.canView, canCreate: r.canCreate, canEdit: r.canEdit, canDelete: r.canDelete, canExport: r.canExport, canApprove: r.canApprove, canManage: r.canManage },
        })
      )
    );

    await logAudit({
      actorType: "ADMIN",
      actorId: guard.principal.userId,
      actorName: guard.principal.name,
      action: AUDIT_ACTIONS.UPDATE_PERMISSIONS,
      entityType: "PERMISSIONS",
      entityId: id,
      details: { employeeName: employee.name, before, after: Object.fromEntries(rows.map((r) => [r.section, { visible: r.visible, view: r.canView, create: r.canCreate, edit: r.canEdit, delete: r.canDelete, export: r.canExport, approve: r.canApprove, manage: r.canManage }])) },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في حفظ صلاحيات الموظف:", error);
    return NextResponse.json({ error: "تعذر حفظ صلاحيات الموظف." }, { status: 500 });
  }
}
