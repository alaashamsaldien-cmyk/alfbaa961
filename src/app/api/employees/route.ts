// ——— إدارة الموظفين والحسابات — قائمة الموظفين وإضافة موظف جديد ———
// الموظف = حساب User بدور STAFF أو MANAGER. مدير النظام (ADMIN) لا يظهر في هذه القائمة.
// كل العمليات تُسجل في سجل التدقيق AuditLog.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { SECTION_KEYS, CORE_SECTIONS } from "@/lib/permissions";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const EMPLOYEE_ROLES = ["MANAGER", "STAFF"] as const;

export async function GET() {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const employees = await db.user.findMany({
      where: { role: { in: ["MANAGER", "STAFF"] } },
      orderBy: { createdAt: "desc" },
      include: {
        workRegion: { select: { id: true, name: true, governorate: true } },
        permissions: { select: { section: true, visible: true } },
        authSessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
        _count: { select: { schoolVisits: true, activities: true, followUps: true } },
      },
    });

    return NextResponse.json({
      employees: employees.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        phone: u.phone,
        jobTitle: u.jobTitle,
        role: u.role,
        governorate: u.governorate,
        regionId: u.regionId,
        regionName: u.workRegion?.name ?? null,
        isActive: u.isActive,
        hasPassword: Boolean(u.passwordHash),
        hasActiveSession: u.authSessions.length > 0,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        visibleSections: u.permissions.filter((p) => p.visible).length,
        visitsCount: u._count.schoolVisits,
        // ضوابط الحذف: وجود أي سجل تاريخي يمنع الحذف ويستوجب التعطيل
        hasHistory: u._count.schoolVisits > 0 || u._count.activities > 0 || u._count.followUps > 0,
      })),
    });
  } catch (error) {
    console.error("خطأ في جلب قائمة الموظفين:", error);
    return NextResponse.json({ error: "تعذر جلب قائمة الموظفين." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim() : "";
    const governorate = typeof body.governorate === "string" && body.governorate.trim() ? body.governorate.trim() : null;
    const regionId = typeof body.regionId === "string" && body.regionId.trim() ? body.regionId.trim() : null;
    const role = EMPLOYEE_ROLES.includes(body.role) ? body.role : "STAFF";

    if (!name) return NextResponse.json({ error: "الاسم الكامل مطلوب." }, { status: 400 });
    if (!username || !USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "اسم المستخدم: حروف إنجليزية وأرقام فقط (3-32 خانة)." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "كلمة المرور الأولية يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
    }
    if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
      return NextResponse.json({ error: "رقم الهاتف غير صحيح." }, { status: 400 });
    }

    // فحص تكرار اسم المستخدم عبر كل أنواع الحسابات (موظفين ومنسقات)
    const usernameConflict = await db.user.findFirst({ where: { username } });
    if (usernameConflict) return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً." }, { status: 409 });
    const coordinatorConflict = await db.coordinator.findUnique({ where: { username } });
    if (coordinatorConflict) {
      return NextResponse.json({ error: "اسم المستخدم مستخدم مسبقاً في حسابات المنسقات." }, { status: 409 });
    }

    // التحقق من المنطقة ونطاق العمل
    let effectiveGovernorate = governorate;
    if (regionId) {
      const region = await db.region.findUnique({ where: { id: regionId } });
      if (!region) return NextResponse.json({ error: "المنطقة المحددة غير موجودة." }, { status: 400 });
      effectiveGovernorate = governorate ?? region.governorate;
    }

    // بريد إلكتروني داخلي فريد — الحساب لا يعتمد على البريد للدخول (الدخول باسم المستخدم)
    const email = `emp.${username}@alifba.internal`;
    const emailConflict = await db.user.findUnique({ where: { email } });
    if (emailConflict) {
      return NextResponse.json({ error: "تعذر توليد بريد داخلي فريد لهذا الاسم — اختر اسم مستخدماً آخر." }, { status: 409 });
    }

    const created = await db.user.create({
      data: {
        name,
        email,
        username,
        phone: phone || null,
        jobTitle: jobTitle || null,
        governorate: effectiveGovernorate,
        regionId,
        role,
        passwordHash: await hashPassword(password),
        isActive: true,
        // الصلاحيات الأولية: الرئيسية فقط (البوابة نفسها) — المدير يخصص الباقي بعد الإنشاء
        permissions: {
          create: SECTION_KEYS.filter((s) => !CORE_SECTIONS.includes(s)).map((section) => ({
            section,
            visible: false,
          })),
        },
      },
    });

    await logAudit({
      actorType: "ADMIN",
      actorId: guard.principal.userId,
      actorName: guard.principal.name,
      action: AUDIT_ACTIONS.CREATE_EMPLOYEE,
      entityType: "USER",
      entityId: created.id,
      details: { name, username, role, jobTitle: jobTitle || null, governorate: effectiveGovernorate, regionId },
    });

    await db.notification.create({
      data: {
        title: "إنشاء حساب موظف",
        message: `أُنشئ حساب الموظف «${name}» (${role === "MANAGER" ? "مدير إداري" : "موظف"})${jobTitle ? ` — ${jobTitle}` : ""}.`,
        type: "INFO",
      },
    });

    return NextResponse.json({ employee: { id: created.id } }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إنشاء حساب الموظف:", error);
    return NextResponse.json({ error: "تعذر إنشاء حساب الموظف." }, { status: 500 });
  }
}
