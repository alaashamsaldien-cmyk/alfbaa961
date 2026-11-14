// ——— بوابة الموظف: قائمة المدارس ضمن نطاق عمله ———
// نطاق العمل: المحافظة والمنطقة المعرفة في حساب الموظف. البحث بالاسم متاح.
// GET يتطلب صلاحية schools.view — أو صلاحية تسجيل زيارة (قائمة اختيار المدرسة في نموذج الزيارة).
// POST إضافة مدرسة يدوياً يتطلب schools.create — تُسجل بمصدر MANUAL_ENTRY وتُدقق جغرافياً.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmployee } from "@/lib/auth";
import { checkPermission, getPermissionMap } from "@/lib/permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { computeDataQuality } from "@/lib/geo/normalize";
import { isInsideIraq } from "@/lib/geo/iraq";

/** شرط نطاق عمل الموظف على جدول المدارس — يُطبق إلزامياً في كل استعلام */
function employeeSchoolScope(employee: { governorate: string | null; regionId: string | null }): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (employee.governorate) and.push({ governorate: employee.governorate });
  if (employee.regionId) and.push({ regionId: employee.regionId });
  return and.length ? { AND: and } : {};
}

export async function GET(request: NextRequest) {
  const guard = await requireEmployee();
  if ("response" in guard && guard.response) return guard.response;
  const principal = (guard as { principal: { userId: string; name: string } }).principal;
  try {
    // القائمة تخدم قسمين: المدارس (view) ونموذج تسجيل الزيارة (اختيار المدرسة)
    const perms = await getPermissionMap(principal.userId);
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
    const q = sp.get("q")?.trim();
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 200) || 200));
    const employee = await db.user.findUnique({
      where: { id: principal.userId },
      select: { governorate: true, regionId: true },
    });
    if (!employee) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });

    const where: Record<string, unknown> = { ...employeeSchoolScope(employee) };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { address: { contains: q } },
        { regionText: { contains: q } },
        { region: { is: { name: { contains: q } } } },
      ];
    }

    const schools = await db.school.findMany({
      where: where as never,
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true, name: true, governorate: true, regionText: true,
        region: { select: { name: true } },
        institutionType: true, stage: true, principalName: true, phone: true,
        address: true, lat: true, lng: true, studentCount: true,
        availabilityStatus: true, contractStatus: true, lastVisitAt: true,
        discoveryStatus: true, dataQuality: true,
      },
    });

    return NextResponse.json({
      scope: { governorate: employee.governorate, regionId: employee.regionId },
      total: schools.length,
      schools: schools.map((s) => ({
        ...s,
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
  const guard = await requireEmployee();
  if ("response" in guard && guard.response) return guard.response;
  const principal = (guard as { principal: { userId: string; name: string } }).principal;
  try {
    const perms = await getPermissionMap(principal.userId);
    if (!checkPermission(perms, "schools", "create").ok) {
      return NextResponse.json(
        { error: "غير مصرح — لا تملك صلاحية إضافة مدرسة جديدة.", code: "ACTION_DENIED" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "اسم المدرسة مطلوب." }, { status: 400 });

    const employee = await db.user.findUnique({
      where: { id: principal.userId },
      select: { governorate: true, regionId: true, name: true },
    });
    if (!employee) return NextResponse.json({ error: "الحساب غير متاح." }, { status: 403 });

    const governorate = typeof body.governorate === "string" && body.governorate.trim()
      ? body.governorate.trim()
      : employee.governorate ?? "بغداد";

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
    let regionId = employee.regionId;
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
      actorType: "EMPLOYEE",
      actorId: principal.userId,
      actorName: employee.name ?? "موظف",
      action: AUDIT_ACTIONS.EMPLOYEE_CREATE_SCHOOL,
      entityType: "SCHOOL",
      entityId: school.id,
      details: { name, governorate, regionText, lat, lng },
    });

    await db.notification.create({
      data: {
        title: "إضافة مدرسة جديدة",
        message: `الموظف «${employee.name}» أضاف مدرسة «${name}» يدوياً${governorate ? ` — ${governorate}` : ""}.`,
        type: "SUCCESS",
      },
    });

    return NextResponse.json({ school: { id: school.id, name: school.name } }, { status: 201 });
  } catch (error) {
    console.error("خطأ في إضافة مدرسة من الموظف:", error);
    return NextResponse.json({ error: "تعذر إضافة المدرسة." }, { status: 500 });
  }
}
