// ——— بوابة الموظف: تفاصيل مدرسة ضمن نطاقه + تحديث الموقع الجغرافي ———
// GET: تفاصيل المدرسة (لصفحة تفاصيل القسم ولنموذج تسجيل الزيارة).
// PATCH: تحديث موقع المدرسة (إحداثيات GPS أو تحديد على الخريطة أو تأكيد الموقع المحفوظ)
//        مسموح لمن يملك صلاحية تسجيل زيارة أو تعديل المدارس — وكل تحديث يُسجل في سجل التغييرات.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFieldAccount, getFieldPermissions, getFieldSchoolScope, fieldVisitOwner } from "@/lib/field-account";
import { checkPermission } from "@/lib/permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { isInsideIraq } from "@/lib/geo/iraq";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireFieldAccount();
  if (!guard.principal) return guard.response!;
  const principal = guard.principal;
  try {
    const perms = await getFieldPermissions(principal);
    const schoolsView = checkPermission(perms, "schools", "view").ok;
    const viaVisitForm = checkPermission(perms, "visit_register", "view").ok || checkPermission(perms, "visit_register", "create").ok;
    if (!schoolsView && !viaVisitForm) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية الاطلاع على بيانات المدارس.", code: "ACTION_DENIED" }, { status: 403 });
    }

    const { id } = await params;
    const scope = await getFieldSchoolScope(principal);
    const school = await db.school.findFirst({
      where: { id, ...scope },
      include: { region: { select: { name: true } } },
    });
    if (!school) return NextResponse.json({ error: "المدرسة غير موجودة ضمن نطاق عملك." }, { status: 404 });

    // آخر زيارات الموظف نفسه على هذه المدرسة (لا يرى زيارات الآخرين)
    const myRecentVisits = await db.schoolVisit.findMany({
      where: { schoolId: id, ...fieldVisitOwner(principal) },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, contactType: true, result: true, createdAt: true, notes: true },
    });

    return NextResponse.json({
      school: {
        ...school,
        osmId: school.osmId === null ? null : Number(school.osmId),
        regionName: school.region?.name ?? school.regionText ?? null,
        hasCoords: school.lat !== null && school.lng !== null,
        lastVisitAt: school.lastVisitAt?.toISOString() ?? null,
      },
      myRecentVisits: myRecentVisits.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
    });
  } catch (error) {
    console.error("خطأ في تفاصيل مدرسة الموظف:", error);
    return NextResponse.json({ error: "تعذر جلب بيانات المدرسة." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireFieldAccount();
  if (!guard.principal) return guard.response!;
  const principal = guard.principal;
  try {
    const perms = await getFieldPermissions(principal);
    // تحديث الموقع مسموح: أثناء تدفق تسجيل الزيارة، أو لمن يملك صلاحية تعديل المدارس
    const viaVisitFlow = checkPermission(perms, "visit_register", "create").ok;
    const viaSchoolsEdit = checkPermission(perms, "schools", "edit").ok;
    if (!viaVisitFlow && !viaSchoolsEdit) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية تحديث موقع المدرسة.", code: "ACTION_DENIED" }, { status: 403 });
    }

    const { id } = await params;
    const scope = await getFieldSchoolScope(principal);
    const school = await db.school.findFirst({
      where: { id, ...scope },
      include: { region: { select: { name: true } } },
    });
    if (!school) return NextResponse.json({ error: "المدرسة غير موجودة ضمن نطاق عملك." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;
    const accuracy = typeof body.accuracy === "number" && Number.isFinite(body.accuracy) ? body.accuracy : null;
    const source = ["GPS", "MAP", "SAVED"].includes(body.source) ? body.source : null;

    if (lat === null || lng === null) {
      return NextResponse.json({ error: "الإحداثيات مطلوبة (Latitude وLongitude)." }, { status: 400 });
    }
    if (!isInsideIraq(lat, lng)) {
      return NextResponse.json({ error: "الإحداثيات خارج حدود العراق — تحقق من الموقع." }, { status: 400 });
    }
    if (!source) {
      return NextResponse.json({ error: "مصدر الموقع مطلوب (GPS أو MAP أو SAVED)." }, { status: 400 });
    }

    const before = { lat: school.lat, lng: school.lng };
    const changed = before.lat !== lat || before.lng !== lng;

    const updated = await db.school.updateMany({ where: { id, ...scope }, data: { lat, lng } });
    if (!updated.count) {
      return NextResponse.json({ error: "المدرسة غير موجودة ضمن نطاق عملك." }, { status: 404 });
    }

    // سجل التغييرات: كل تحديث موقع يُوثق في سجل التدقيق (قبل/بعد/المصدر/الدقة)
    await logAudit({
      actorType: principal.isCoordinator ? "COORDINATOR" : "EMPLOYEE",
      actorId: principal.userId,
      actorName: principal.name ?? "موظف",
      action: AUDIT_ACTIONS.EMPLOYEE_UPDATE_SCHOOL_LOCATION,
      entityType: "SCHOOL",
      entityId: id,
      details: {
        schoolName: school.name,
        before,
        after: { lat, lng },
        source,
        accuracy,
        changed,
        viaVisitFlow,
      },
    });

    return NextResponse.json({
      ok: true,
      location: { lat, lng, accuracy, source },
      schoolFieldsUpdated: changed,
    });
  } catch (error) {
    console.error("خطأ في تحديث موقع المدرسة:", error);
    return NextResponse.json({ error: "تعذر تحديث موقع المدرسة." }, { status: 500 });
  }
}
