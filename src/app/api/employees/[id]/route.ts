// ——— تعديل / تعطيل / تفعيل / حذف حساب موظف ———
// ضوابط الحذف: الموظف الذي له سجلات تاريخية (زيارات أو نشاطات أو متابعات) لا يُحذف إطلاقاً
// حفاظاً على السجلات التاريخية — يُعطل بدلاً من الحذف. التعطيل يمنع الدخول فوراً وينهي جلساته.
// تفعيل حساب الدخول: للموظف الذي أُنشئ بلا حساب دخول (بلا اسم مستخدم وكلمة مرور) —
// العملية يدوية بالكامل من المدير: تُعين بيانات الدخول صراحة دون أي تفعيل تلقائي
// ودون أي تغيير على صلاحيات الموظف القائمة.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin, destroySessionsFor } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

type Params = { params: Promise<{ id: string }> };

async function getEmployeeOr404(id: string) {
  const employee = await db.user.findFirst({
    where: { id, role: { in: ["MANAGER", "STAFF"] } },
    include: { _count: { select: { schoolVisits: true, activities: true, followUps: true, importLogs: true, discoverySessions: true } } },
  });
  if (!employee) return null;
  return employee;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const employee = await getEmployeeOr404(id);
    if (!employee) return NextResponse.json({ error: "حساب الموظف غير موجود." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (typeof body.name === "string" && body.name.trim() && body.name.trim() !== employee.name) {
      data.name = body.name.trim();
      changes.name = { from: employee.name, to: body.name.trim() };
    }
    if (typeof body.phone === "string" && body.phone.trim() !== (employee.phone ?? "")) {
      const phone = body.phone.trim();
      if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
        return NextResponse.json({ error: "رقم الهاتف غير صحيح." }, { status: 400 });
      }
      data.phone = phone || null;
      changes.phone = { from: employee.phone, to: phone || null };
    }
    if (typeof body.jobTitle === "string" && body.jobTitle.trim() !== (employee.jobTitle ?? "")) {
      data.jobTitle = body.jobTitle.trim() || null;
      changes.jobTitle = { from: employee.jobTitle, to: body.jobTitle.trim() || null };
    }
    if (typeof body.role === "string" && ["MANAGER", "STAFF"].includes(body.role) && body.role !== employee.role) {
      data.role = body.role;
      changes.role = { from: employee.role, to: body.role };
    }
    // نطاق العمل: المحافظة والمنطقة
    if ("governorate" in body) {
      const gov = typeof body.governorate === "string" && body.governorate.trim() ? body.governorate.trim() : null;
      if (gov !== employee.governorate) {
        data.governorate = gov;
        changes.governorate = { from: employee.governorate, to: gov };
      }
    }
    if ("regionId" in body) {
      const rid = typeof body.regionId === "string" && body.regionId.trim() ? body.regionId.trim() : null;
      if (rid !== employee.regionId) {
        if (rid) {
          const region = await db.region.findUnique({ where: { id: rid } });
          if (!region) return NextResponse.json({ error: "المنطقة المحددة غير موجودة." }, { status: 400 });
          if (!data.governorate && !employee.governorate) {
            data.governorate = region.governorate;
            changes.governorate = { from: employee.governorate, to: region.governorate };
          }
        }
        data.regionId = rid;
        changes.regionId = { from: employee.regionId, to: rid };
      }
    }
    // تفعيل حساب الدخول: تعيين اسم المستخدم — فقط للموظف الذي لا يملك اسماً بعد
    // (لا يُسمح بتغيير اسم مستخدم قائم، ولا يُفعّل الحساب تلقائياً هنا)
    if (typeof body.username === "string" && body.username.trim()) {
      const username = body.username.trim();
      if (employee.username) {
        return NextResponse.json(
          { error: `هذا الموظف لديه حساب دخول بالفعل (${employee.username}) — لا يمكن تغيير اسم المستخدم.` },
          { status: 409 }
        );
      }
      if (!USERNAME_RE.test(username)) {
        return NextResponse.json({ error: "اسم المستخدم: حروف إنجليزية وأرقام فقط (3-32 خانة)." }, { status: 400 });
      }
      const usernameConflict = await db.user.findFirst({ where: { username } });
      if (usernameConflict) return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً." }, { status: 409 });
      const coordinatorConflict = await db.coordinator.findUnique({ where: { username } });
      if (coordinatorConflict) {
        return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً في حسابات المنسقات." }, { status: 409 });
      }
      data.username = username;
      changes.username = { from: null, to: username };
      // بريد داخلي فريد يطابق نمط إنشاء الموظفين — ضروري لأن البريد فريد في القاعدة
      const email = `emp.${username}@alifba.internal`;
      const emailConflict = await db.user.findUnique({ where: { email } });
      if (emailConflict) {
        return NextResponse.json({ error: "تعذر توليد بريد داخلي فريد لهذا الاسم — اختر اسم مستخدماً آخر." }, { status: 409 });
      }
      data.email = email;
    }
    // تغيير / إعادة تعيين كلمة المرور
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
      }
      data.passwordHash = await hashPassword(body.password);
    }
    // تفعيل / تعطيل الحساب
    if ("isActive" in body) {
      const target = Boolean(body.isActive);
      if (target !== employee.isActive) {
        data.isActive = target;
        changes.isActive = { from: employee.isActive, to: target };
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد تغييرات للحفظ." }, { status: 400 });
    }

    const updated = await db.user.update({ where: { id }, data: data as never });

    // تغيير كلمة المرور أو التعطيل ينهي جلسات الموظف فوراً
    if (data.passwordHash || data.isActive === false) {
      await destroySessionsFor({ userId: id });
    }

    if (data.passwordHash) {
      await logAudit({
        actorType: "ADMIN",
        actorId: guard.principal.userId,
        actorName: guard.principal.name,
        action: data.username ? AUDIT_ACTIONS.ACTIVATE_EMPLOYEE_ACCOUNT : AUDIT_ACTIONS.RESET_EMPLOYEE_PASSWORD,
        entityType: "USER",
        entityId: id,
        details: { employeeName: employee.name, username: data.username ?? employee.username },
      });
    } else if (data.username) {
      await logAudit({
        actorType: "ADMIN",
        actorId: guard.principal.userId,
        actorName: guard.principal.name,
        action: AUDIT_ACTIONS.ACTIVATE_EMPLOYEE_ACCOUNT,
        entityType: "USER",
        entityId: id,
        details: { employeeName: employee.name, username: data.username, note: "تعيين اسم مستخدم دون كلمة مرور — لا يزال بلا دخول" },
      });
    }
    if ("isActive" in data) {
      await logAudit({
        actorType: "ADMIN",
        actorId: guard.principal.userId,
        actorName: guard.principal.name,
        action: AUDIT_ACTIONS.SET_EMPLOYEE_STATUS,
        entityType: "USER",
        entityId: id,
        details: { employeeName: employee.name, isActive: data.isActive },
      });
    }
    if (Object.keys(changes).length > 0) {
      await logAudit({
        actorType: "ADMIN",
        actorId: guard.principal.userId,
        actorName: guard.principal.name,
        action: AUDIT_ACTIONS.UPDATE_EMPLOYEE,
        entityType: "USER",
        entityId: id,
        details: { employeeName: employee.name, changes },
      });
    }

    return NextResponse.json({ employee: { id: updated.id, isActive: updated.isActive } });
  } catch (error) {
    console.error("خطأ في تعديل حساب الموظف:", error);
    return NextResponse.json({ error: "تعذر تعديل حساب الموظف." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const employee = await getEmployeeOr404(id);
    if (!employee) return NextResponse.json({ error: "حساب الموظف غير موجود." }, { status: 404 });

    // ضابط الحذف الأساسي: السجلات التاريخية والعمليات السابقة لا تُحذف مع الحساب
    const historyCount =
      employee._count.schoolVisits + employee._count.activities + employee._count.followUps +
      employee._count.importLogs + employee._count.discoverySessions;
    if (historyCount > 0) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف الحساب — يرتبط بسجلات تاريخية (${employee._count.schoolVisits} زيارة، ${employee._count.activities} نشاط، ${employee._count.followUps} متابعة). عطّل الحساب بدلاً من حذفه للحفاظ على السجلات.`,
          code: "HAS_HISTORY",
        },
        { status: 409 }
      );
    }

    await destroySessionsFor({ userId: id });
    // قيود التدقيق المرتبطة بالحساب تبقى محفوظة (actorName نصي) — الحذف لا يمسها
    await db.employeePermission.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } });

    await logAudit({
      actorType: "ADMIN",
      actorId: guard.principal.userId,
      actorName: guard.principal.name,
      action: AUDIT_ACTIONS.DELETE_EMPLOYEE,
      entityType: "USER",
      entityId: id,
      details: { name: employee.name, username: employee.username },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("خطأ في حذف حساب الموظف:", error);
    return NextResponse.json({ error: "تعذر حذف حساب الموظف." }, { status: 500 });
  }
}
