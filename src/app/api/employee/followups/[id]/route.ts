// ——— بوابة الموظف: إنجاز أو إلغاء مراجعة ضمن نطاقه — يتطلب reviews.edit ———
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmployee } from "@/lib/auth";
import { checkPermission, getPermissionMap } from "@/lib/permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_STATUS = ["DONE", "CANCELLED", "PENDING"] as const;

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireEmployee();
  if ("response" in guard && guard.response) return guard.response;
  const principal = (guard as { principal: { userId: string; name: string } }).principal;
  try {
    const perms = await getPermissionMap(principal.userId);
    if (!checkPermission(perms, "reviews", "edit").ok) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية تعديل المراجعات.", code: "ACTION_DENIED" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status = ALLOWED_STATUS.includes(body.status) ? body.status : null;
    if (!status) return NextResponse.json({ error: "حالة المراجعة مطلوبة (منجزة/ملغاة/معلقة)." }, { status: 400 });

    const employee = await db.user.findUnique({ where: { id: principal.userId }, select: { governorate: true, regionId: true, name: true } });
    if (!employee) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });

    // المراجعة يجب أن تكون على مدرسة ضمن نطاق عمل الموظف
    const and: Record<string, unknown>[] = [{ id }];
    if (employee.governorate) and.push({ school: { governorate: employee.governorate } });
    if (employee.regionId) and.push({ school: { regionId: employee.regionId } });
    const followup = await db.followUp.findFirst({ where: { AND: and as never }, include: { school: { select: { name: true } } } });
    if (!followup) return NextResponse.json({ error: "المراجعة غير موجودة أو خارج نطاق عملك." }, { status: 404 });

    const updated = await db.followUp.update({
      where: { id },
      data: {
        status,
        completedAt: status === "DONE" ? new Date() : null,
      },
    });

    await logAudit({
      actorType: "EMPLOYEE",
      actorId: principal.userId,
      actorName: employee.name ?? "موظف",
      action: status === "DONE" ? "COMPLETE_FOLLOWUP" : status === "CANCELLED" ? "CANCEL_FOLLOWUP" : "REOPEN_FOLLOWUP",
      entityType: "FOLLOWUP",
      entityId: id,
      details: { schoolName: followup.school.name, title: followup.title, from: followup.status, to: status },
    });

    await db.notification.create({
      data: {
        title: status === "DONE" ? "إنجاز مراجعة من الميدان" : "تحديث مراجعة من الميدان",
        message: `الموظف «${employee.name}» ${status === "DONE" ? "أنجز" : status === "CANCELLED" ? "ألغى" : "أعاد فتح"} المراجعة على مدرسة «${followup.school.name}».`,
        type: status === "DONE" ? "SUCCESS" : "INFO",
      },
    });

    return NextResponse.json({ followup: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error("خطأ في تحديث المراجعة:", error);
    return NextResponse.json({ error: "تعذر تحديث المراجعة." }, { status: 500 });
  }
}
