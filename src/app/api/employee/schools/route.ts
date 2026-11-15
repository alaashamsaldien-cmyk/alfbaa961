// ——— بوابة الموظف: قائمة المدارس ضمن نطاق عمله ———
// نطاق العمل: المحافظة والمنطقة المعرفة في حساب الموظف. البحث بالاسم متاح.
// GET يتطلب صلاحية schools.view — أو صلاحية تسجيل زيارة (قائمة اختيار المدرسة في نموذج الزيارة).
// POST إضافة مدرسة يدوياً يتطلب schools.create — تُسجل بمصدر MANUAL_ENTRY وتُدقق جغرافياً.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFieldAccount, getFieldPermissions, getFieldSchoolScope, coordinatorSchoolContact } from "@/lib/field-account";
import { checkPermission } from "@/lib/permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { computeDataQuality } from "@/lib/geo/normalize";
import { isInsideIraq } from "@/lib/geo/iraq";

export async function GET(request: NextRequest) {
  const guard = await requireFieldAccount();
  if (!guard.principal) return guard.response!;
  const principal = guard.principal;
  try {
    // القائمة تخدم قسمين: المدارس (view) ونموذج تسجيل الزيارة (اختيار المدرسة)
    const perms = await getFieldPermissions(principal);
    const schoolsView = checkPermission(perms, "schools", "view").ok;
    const viaVisitForm =
      checkPermission(perms, "visit_register", "create").ok ||
      checkPermission(perms, "visit_register", "view").ok;
    if (!schoolsView && !viaVisitForm) {
      return NextResponse.json(
        { error: "غير مصرح — لا تملك صلاحية الاطلاع على قائمة المدارس.", code: "ACTION_DENIED" },
        { status: 403 }
      );
    }

    const sp = request.nextUrl.searchParams;
    const mapView = sp.get("onlyMap") === "1";
    if (mapView && !schoolsView) {
      return NextResponse.json({ error: "لا تملك صلاحية عرض خريطة المدارس." }, { status: 403 });
    }
    const q = sp.get("q")?.trim();
    const visitStatus = sp.get("visitStatus");
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 200) || 200));
    const scope = await getFieldSchoolScope(principal);

    const where: Record<string, unknown> = { ...scope };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        ...(!principal.isCoordinator ? [{ address: { contains: q } }] : []),
        { regionText: { contains: q } },
        { region: { is: { name: { contains: q } } } },
      ];
    }

    if (visitStatus === "VISITED") where.lastVisitAt = { not: null };
    if (visitStatus === "NOT_VISITED") where.lastVisitAt = null;
    const mapWhere = { ...where, lat: { not: null }, lng: { not: null } };
    const [schools, mappedTotal, total] = await Promise.all([
      db.school.findMany({
        where: (mapView ? mapWhere : where) as never,
        orderBy: { name: "asc" },
        take: limit,
        select: {
          id: true, name: true, governorate: true, regionText: true,
          region: { select: { name: true } },
          institutionType: true, stage: true, principalName: true, phone: true,
          address: true, lat: true, lng: true, studentCount: true,
          availabilityStatus: true, contractStatus: true, lastVisitAt: true,
          discoveryStatus: true, dataQuality: true, dataSource: true,
        },
      }),
      mapView ? db.school.count({ where: mapWhere as never }) : undefined,
      mapView ? db.school.count({ where: where as never }) : undefined,
    ]);

    return NextResponse.json({
      scope,
      total: total ?? schools.length,
      mappedTotal,
      schools: schools.map((s) => ({
        ...s,
        ...(principal.isCoordinator ? coordinatorSchoolContact(s) : {}),
        regionName: s.region?.name ?? s.regionText ?? null,
        hasCoords: s.lat !== null && s.lng !== null,
        lastVisitAt: s.lastVisitAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("خطأ في قائمة مدارس الموظف:", error);
    return NextResponse.json({ error: "تعذر جلب قائمة المدارس." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireFieldAccount();
  if (!guard.principal) return guard.response!;
  const principal = guard.principal;
  try {
    const perms = await getFieldPermissions(principal);
    if (!checkPermission(perms, "schools", "create").ok) {
      return NextResponse.json(
        { error: "غير مصرح — لا تملك صلاحية إضافة مدرسة جديدة.", code: "ACTION_DENIED" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "اسم المدرسة مطلوب." }, { status: 400 });

    const scope = await getFieldSchoolScope(principal);

    const governorate = (scope.governorate ?? (typeof body.governorate === "string" ? body.governorate.trim() : "")) || "بغداد";

    // إحداثيات اختيارية — تُدقق جغرافياً إن وُجدت (داخل العراق فقط)
    let lat: number | null = null;
    let lng: number | null = null;
    if (typeof body.lat === "number" && typeof body.lng === "number" && Number.isFinite(body.lat) && Number.isFinite(body.lng)) {
      if (!isInsideIraq(body.lat, body.lng)) {
        return NextResponse.json({ error: "الإحداثيات خارج حدود العراق — تحقق من الموقع." }, { status: 400 });
      }
      lat = body.lat;
      lng = body.lng;
    }

    // المنطقة: نص حر يُطابق جدول المناطق أو ينشئ منطقة جديدة ضمن المحافظة
    const regionText = typeof body.regionText === "string" && body.regionText.trim() ? body.regionText.trim() : null;
    let regionId = scope.regionId ?? null;
    if (!regionId && regionText) {
      const region = await db.region.upsert({
        where: { name_governorate: { name: regionText, governorate } },
        create: { name: regionText, governorate },
        update: {},
      });
      regionId = region.id;
    }

    const phone = typeof body.phone === "string" ? body.phone.trim() : null;
    const principalName = typeof body.principalName === "string" ? body.principalName.trim() : null;
    const address = typeof body.address === "string" ? body.address.trim() : null;
    const institutionType = typeof body.institutionType === "string" && body.institutionType.trim() ? body.institutionType.trim() : null;
    const stage = typeof body.stage === "string" && body.stage.trim() ? body.stage.trim() : null;
    const studentCount = typeof body.studentCount === "number" && Number.isFinite(body.studentCount) ? Math.round(body.studentCount) : null;

    const dataQuality = computeDataQuality({ phone, principalName, lat, lng, institutionType, regionText, studentCount, address });

    const school = await db.school.create({
      data: {
        name,
        governorate,
        regionId,
        coordinatorId: scope.coordinatorId,
        regionText,
        phone,
        principalName,
        address,
        institutionType,
        stage,
        studentCount,
        lat,
        lng,
        dataSource: "MANUAL_ENTRY",
        discoveryStatus: "FIELD_CONFIRMED", // مدرسة أضيفت ميدانياً من موظف فعلي
        dataQuality,
        discoveredAt: new Date(),
      },
    });

    await logAudit({
      actorType: principal.isCoordinator ? "COORDINATOR" : "EMPLOYEE",
      actorId: principal.userId,
      actorName: principal.name ?? "موظف",
      action: AUDIT_ACTIONS.EMPLOYEE_CREATE_SCHOOL,
      entityType: "SCHOOL",
      entityId: school.id,
      details: { name, governorate, regionText, lat, lng },
    });

    await db.notification.create({
      data: {
        title: "إضافة مدرسة جديدة",
        message: `الموظف «${principal.name}» أضاف مدرسة «${name}» يدوياً${governorate ? ` — ${governorate}` : ""}.`,
        type: "SUCCESS",
      },
    });

    const region = regionId ? await db.region.findUnique({ where: { id: regionId }, select: { name: true } }) : null;
    return NextResponse.json({
      school: {
        ...school, osmId: school.osmId === null ? null : Number(school.osmId),
        regionName: region?.name ?? regionText,
        hasCoords: school.lat !== null && school.lng !== null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إضافة مدرسة من الموظف:", error);
    return NextResponse.json({ error: "تعذر إضافة المدرسة." }, { status: 500 });
  }
}
