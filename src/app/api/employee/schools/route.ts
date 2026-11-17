// ——— بوابة الموظف: قائمة المدارس ضمن نطاق عمله ———
// نطاق العمل: المحافظة والمنطقة المعرفة في حساب الموظف. البحث بالاسم متاح.
// GET يتطلب صلاحية schools.view — أو صلاحية تسجيل زيارة (قائمة اختيار المدرسة في نموذج الزيارة).
// POST إضافة مدرسة يدوياً يتطلب schools.create — تُسجل بمصدر MANUAL_ENTRY وتُدقق جغرافياً.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFieldAccount, getFieldPermissions, getFieldSchoolScope, coordinatorSchoolContact, fieldVisitOwner } from "@/lib/field-account";
import { checkPermission } from "@/lib/permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { computeDataQuality } from "@/lib/geo/normalize";
import { isInsideIraq, IRAQ_GOVERNORATES } from "@/lib/geo/iraq";
import { syncRegionAssignments } from "@/lib/region-sync";

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
    const limit = Math.min(5000, Math.max(1, Number(sp.get("limit") ?? 200) || 200));
    const scope = await getFieldSchoolScope(principal);
    // المنسقة: مزامنة مدارس مناطقها المنسّبة قبل عرض القائمة
    if (principal.isCoordinator) {
      await syncRegionAssignments(db, { coordinatorId: principal.userId }).catch((error) => console.error("تعذرت مزامنة مناطق المنسقة", error));
    }

    // فلاتر المحافظة والمنطقة — تُضاف فوق نطاق الحساب (لا تتجاوزه)
    const governorateParam = sp.get("governorate")?.trim();
    const regionParam = sp.get("regionId")?.trim();
    const scoped: Record<string, unknown>[] = [scope as Record<string, unknown>];
    if (governorateParam) scoped.push({ governorate: governorateParam });
    if (regionParam) scoped.push({ regionId: regionParam === "none" ? null : regionParam });

    // وضع الملخص: مربعات المحافظات (+ مناطق المحافظة المختارة) مع الأعداد
    if (sp.get("summary") === "1") {
      const base = { AND: [scope as Record<string, unknown>] };
      const [byGov, visitedByGov] = await Promise.all([
        db.school.groupBy({ by: ["governorate"], where: base as never, _count: { _all: true } }),
        db.school.groupBy({ by: ["governorate"], where: { AND: [scope, { lastVisitAt: { not: null } }] } as never, _count: { _all: true } }),
      ]);
      const visited = new Map(visitedByGov.map((r) => [r.governorate, r._count._all]));
      let regions: { id: string; name: string; count: number }[] | undefined;
      let unregioned = 0;
      if (governorateParam) {
        const [byRegion, list] = await Promise.all([
          db.school.groupBy({ by: ["regionId"], where: { AND: [scope, { governorate: governorateParam }] } as never, _count: { _all: true } }),
          db.region.findMany({
            where: { governorate: governorateParam, isActive: true, ...(scope.regionId ? { id: scope.regionId } : {}) },
            orderBy: { name: "asc" }, select: { id: true, name: true },
          }),
        ]);
        const counts = new Map(byRegion.map((r) => [r.regionId, r._count._all]));
        unregioned = counts.get(null) ?? 0;
        regions = list.map((r) => ({ ...r, count: counts.get(r.id) ?? 0 }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"));
      }
      return NextResponse.json({
        scope,
        governorates: byGov.flatMap((r) => r.governorate ? [{ name: r.governorate, total: r._count._all, visited: visited.get(r.governorate) ?? 0 }] : []),
        noGovernorate: byGov.find((r) => !r.governorate)?._count._all ?? 0,
        regions,
        unregioned,
      });
    }

    const where: Record<string, unknown> = { AND: scoped };
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
          _count: {select:{schoolVisits:{where:{contactType:"FIELD_VISIT",...fieldVisitOwner(principal)}}}},
          followUps: {where:{status:"PENDING",dueDate:{lte:new Date()}},select:{id:true},take:1},
          schoolVisits: { where: { contactType: "FIELD_VISIT" }, orderBy: {createdAt:"desc"}, take:1, select:{createdAt:true, coordinatorId:true, employeeId:true, coordinator:{select:{name:true}}, employee:{select:{name:true}}}},
        },
      }),
      mapView ? db.school.count({ where: mapWhere as never }) : undefined,
      mapView ? db.school.count({ where: where as never }) : undefined,
    ]);

    return NextResponse.json({
      scope,
      total: total ?? schools.length,
      mappedTotal,
      schools: schools.map(({ schoolVisits, followUps, _count, ...s }) => ({
        visitedByMe: _count.schoolVisits > 0,
        followUpDue: followUps.length > 0,
        lastVisitorName: schoolVisits[0]?.coordinator?.name ?? schoolVisits[0]?.employee?.name ?? null,
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
    if (!IRAQ_GOVERNORATES.some((g) => g.name === governorate)) {
      return NextResponse.json({ error: "اختر محافظة صحيحة." }, { status: 400 });
    }

    // منع التكرار: مدرسة بنفس الاسم في نفس المحافظة — تُعرض للمستخدم ليؤكد أنها مدرسة مختلفة
    if (body.force !== true) {
      const duplicates = await db.school.findMany({
        where: { governorate, name: { equals: name, mode: "insensitive" } },
        select: { id: true, name: true, regionText: true, region: { select: { name: true } } },
        take: 5,
      });
      if (duplicates.length) {
        return NextResponse.json({
          error: "توجد مدرسة بنفس الاسم في هذه المحافظة.",
          code: "DUPLICATE",
          duplicates: duplicates.map((d) => ({ id: d.id, name: d.name, regionName: d.region?.name ?? d.regionText ?? null })),
        }, { status: 409 });
      }
    }

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
    let regionText = typeof body.regionText === "string" && body.regionText.trim() ? body.regionText.trim() : null;
    let regionId = scope.regionId ?? null;
    // منطقة مختارة من القائمة — يجب أن تتبع المحافظة نفسها
    if (!regionId && typeof body.regionId === "string" && body.regionId) {
      const chosen = await db.region.findFirst({ where: { id: body.regionId, governorate }, select: { id: true, name: true } });
      if (!chosen) return NextResponse.json({ error: "المنطقة المختارة لا تتبع هذه المحافظة." }, { status: 400 });
      regionId = chosen.id;
      regionText = regionText ?? chosen.name;
    }
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
    const text = (v: unknown, max = 2000) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
    const sector = body.sector === "GOVERNMENT" || body.sector === "PRIVATE" ? body.sector : null;
    const notes = text(body.notes);
    const stages = text(body.stages, 300);
    const facebookUrl = text(body.facebookUrl, 500);
    const website = text(body.website, 500);
    const availabilityStatus = body.availabilityStatus === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
    const contractStatus = body.contractStatus === "CONTRACTED" ? "CONTRACTED" : "NOT_CONTRACTED";
    // تاريخ الإضافة/الاكتشاف الذي يحدده المستخدم (لا يقبل تاريخاً مستقبلياً)
    const parseDate = (v: unknown) => {
      if (typeof v !== "string" || !v) return null;
      const d = new Date(v.length === 10 ? `${v}T12:00:00+03:00` : v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    let discoveredAt = parseDate(body.addedAt) ?? new Date();
    if (discoveredAt.getTime() > Date.now()) discoveredAt = new Date();
    const nextVisitAt = parseDate(body.nextVisitAt);

    const dataQuality = computeDataQuality({ phone, principalName, lat, lng, institutionType, regionText, studentCount, address });

    const school = await db.school.create({
      data: {
        name,
        governorate,
        regionId,
        coordinatorId: principal.isCoordinator ? principal.userId : undefined,
        regionText,
        phone,
        principalName,
        address,
        institutionType,
        stage,
        studentCount,
        lat,
        lng,
        sector,
        notes,
        stages,
        facebookUrl,
        website,
        availabilityStatus,
        contractStatus,
        dataSource: "MANUAL_ENTRY",
        discoveryStatus: "FIELD_CONFIRMED", // مدرسة أضيفت ميدانياً من موظف فعلي
        dataQuality,
        discoveredAt,
        // المنسقة التي أضافت المدرسة تُنسّب لها مباشرة (تظهر في قائمتها فوراً)
        ...(principal.isCoordinator ? { assignments: { create: { coordinatorId: principal.userId } } } : {}),
      },
    });

    // منسقات المنطقة (تنسيب المناطق) يحصلن على المدرسة الجديدة تلقائياً
    if (regionId) await syncRegionAssignments(db, { schoolIds: [school.id] }).catch((error) => console.error("تعذرت مزامنة تنسيب المنطقة", error));

    // موعد زيارة/متابعة قادم — يظهر في التذكيرات
    if (nextVisitAt && nextVisitAt.getTime() > Date.now() - 24 * 60 * 60 * 1000) {
      await db.followUp.create({
        data: {
          schoolId: school.id,
          type: "FOLLOW_UP",
          title: "زيارة مخططة عند إضافة المدرسة",
          dueDate: nextVisitAt,
          ...(principal.isCoordinator ? { coordinatorId: principal.userId } : { userId: principal.userId }),
        },
      });
    }

    await logAudit({
      actorType: principal.isCoordinator ? "COORDINATOR" : "EMPLOYEE",
      actorId: principal.userId,
      actorName: principal.name ?? "موظف",
      action: AUDIT_ACTIONS.EMPLOYEE_CREATE_SCHOOL,
      entityType: "SCHOOL",
      entityId: school.id,
      details: { name, governorate, regionId, regionText, lat, lng, addedAt: discoveredAt.toISOString(), nextVisitAt: nextVisitAt?.toISOString() ?? null },
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
