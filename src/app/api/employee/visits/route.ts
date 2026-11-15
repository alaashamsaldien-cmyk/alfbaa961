// ——— بوابة الموظف: تسجيل زيارة مدرسة (نموذج متعدد الخطوات) + قائمة زياراته ———
// كل زيارة سجل مستقل ودائم لا يُستبدل أو يُحدث — الزيارات المتكررة لنفس المدرسة تُحفظ كلها.
// منع التكرار: dedupeKey (UUID من جهاز الموظف) فريد في القاعدة — إعادة الإرسال بعد انقطاع
// الشبكة تعيد السجل الأصلي نفسه (200) دون إنشاء زيارة مكررة أبداً.
// الصلاحيات: تسجيل زيارة يتطلب قسم «تسجيل زيارة للمدرسة» بصلاحية إضافة.
// الاطلاع على زيارات الموظفين الآخرين يتطلب صلاحية «إدارة البيانات» في قسم الزيارات.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFieldAccount, getFieldPermissions, getFieldSchoolScope, fieldVisitOwner } from "@/lib/field-account";
import { checkPermission } from "@/lib/permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { isInsideIraq } from "@/lib/geo/iraq";
import { parseVisitFilters, VISIT_CONTACT_TYPES } from "@/lib/visit-filters";
import { approvedMapSchoolWhere, isMapSchoolSource } from "@/lib/map-school-scope";

const RESULTS = ["INITIAL_APPROVAL", "APPROVED", "NEEDS_ANOTHER_VISIT", "CONTRACTED", "REJECTED", "SCHOOL_NOT_FOUND", "OTHER"] as const;
const NEEDS = ["PAINT", "SEATS", "SMART_SCREEN", "AC", "NONE", "OTHER"] as const;

export async function GET(request: NextRequest) {
  const guard = await requireFieldAccount();
  if (!guard.principal) return guard.response!;
  const principal = guard.principal;
  try {
    const perms = await getFieldPermissions(principal);
    if (!checkPermission(perms, "visits", "view").ok) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية الاطلاع على الزيارات.", code: "ACTION_DENIED" }, { status: 403 });
    }
    const seeOthers = checkPermission(perms, "visits", "manage").ok; // منح المدير صلاحية رؤية زيارات الآخرين

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(5, Number(sp.get("pageSize") ?? 20) || 20));

    // الفلاتر المشتركة: الفترات الجاهزة + نطاق تاريخ مخصص (dateFrom/dateTo بتوقيت بغداد)
    const filters = parseVisitFilters(sp);
    const where: Record<string, unknown> = {};
    if (!seeOthers) {
      Object.assign(where, fieldVisitOwner(principal)); // زياراته هو فقط — منع صارم لزيارات الآخرين
      if (principal.isCoordinator) where.school = approvedMapSchoolWhere;
    } else {
      where.school = await getFieldSchoolScope(principal);
    }
    if (filters.createdAt) where.createdAt = filters.createdAt;
    if (filters.contactType) where.contactType = filters.contactType;
    if (filters.result) where.result = filters.result;

    const [total, visits] = await Promise.all([
      db.schoolVisit.count({ where: where as never }),
      db.schoolVisit.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          school: { select: { name: true, address: true, dataSource: true, regionText: true, region: { select: { name: true } }, governorate: true } },
          employee: { select: { name: true } },
          coordinator: { select: { name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      seeOthers,
      visits: visits.map((v) => ({
        id: v.id,
        contactType: v.contactType,
        contactOther: v.contactOther,
        result: v.result,
        resultOther: v.resultOther,
        rejectionReason: v.rejectionReason,
        contactPersonName: v.contactPersonName,
        contactPersonTitle: v.contactPersonTitle,
        needs: v.needs ? JSON.parse(v.needs) : [],
        needsOther: v.needsOther,
        subscribersCount: v.subscribersCount,
        nextFollowUpAt: v.nextFollowUpAt?.toISOString() ?? null,
        notes: v.notes,
        lat: v.lat,
        lng: v.lng,
        createdAt: v.createdAt.toISOString(),
        schoolId: v.schoolId,
        schoolName: v.school.name,
        schoolAddress: !principal.isCoordinator || isMapSchoolSource(v.school.dataSource) ? v.school.address : null,
        regionName: v.school.region?.name ?? v.school.regionText,
        employeeName: v.coordinator?.name ?? v.employee?.name ?? null,
        isMine: principal.isCoordinator ? v.coordinatorId === principal.userId : v.employeeId === principal.userId,
      })),
    });
  } catch (error) {
    console.error("خطأ في قائمة زيارات الموظف:", error);
    return NextResponse.json({ error: "تعذر جلب قائمة الزيارات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireFieldAccount();
  if (!guard.principal) return guard.response!;
  const principal = guard.principal;
  try {
    const perms = await getFieldPermissions(principal);
    if (!checkPermission(perms, "visit_register", "create").ok) {
      return NextResponse.json({ error: "غير مصرح — لا تملك صلاحية تسجيل زيارة.", code: "ACTION_DENIED" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.accountId !== undefined && body.accountId !== principal.userId) {
      return NextResponse.json({ error: "هذه الزيارة محفوظة لحساب آخر." }, { status: 403 });
    }

    // ——— مفتاح منع التكرار: إلزامي — إعادة الإرسال تعيد السجل الأصلي دون تكرار ———
    const dedupeKey = typeof body.dedupeKey === "string" && body.dedupeKey.trim() ? body.dedupeKey.trim() : "";
    if (!dedupeKey || dedupeKey.length < 8 || dedupeKey.length > 64) {
      return NextResponse.json({ error: "مفتاح العملية (dedupeKey) مطلوب لمنع التسجيل المكرر." }, { status: 400 });
    }

    const existing = await db.schoolVisit.findUnique({ where: { dedupeKey } });
    if (existing) {
      const owner = principal.isCoordinator ? existing.coordinatorId : existing.employeeId;
      if (owner !== principal.userId) return NextResponse.json({ error: "مفتاح زيارة مستخدم." }, { status: 409 });
      // إعادة إرسال بعد انقطاع شبكة: الزيارة مسجلة بالفعل — نعيد السجل الأصلي دون تكرار
      return NextResponse.json(
        { visit: { id: existing.id, dedupeKey: existing.dedupeKey, createdAt: existing.createdAt.toISOString() }, duplicate: true },
        { status: 200 }
      );
    }

    // ——— الخطوة 1: المدرسة ضمن نطاق عمل الموظف ———
    const schoolId = typeof body.schoolId === "string" ? body.schoolId : "";
    if (!schoolId) return NextResponse.json({ error: "اختيار المدرسة مطلوب." }, { status: 400 });
    const school = await db.school.findFirst({ where: { id: schoolId, ...await getFieldSchoolScope(principal) } });
    if (!school) return NextResponse.json({ error: "المدرسة غير موجودة أو خارج نطاق عملك." }, { status: 404 });

    // الموقع: إلزامي — يُحدد في الخطوة الأولى (GPS أو خريطة أو تأكيد محفوظ) ويُحفظ مع الزيارة
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;
    const locationAccuracy = typeof body.locationAccuracy === "number" && Number.isFinite(body.locationAccuracy) ? body.locationAccuracy : null;
    const locationSource = ["GPS", "MAP", "SAVED"].includes(body.locationSource) ? body.locationSource : null;
    if (lat === null || lng === null || !locationSource) {
      return NextResponse.json({ error: "تحديد موقع المدرسة مطلوب قبل التسجيل (الخطوة الأولى)." }, { status: 400 });
    }
    if (!isInsideIraq(lat, lng)) {
      return NextResponse.json({ error: "الإحداثيات خارج حدود العراق — تحقق من الموقع." }, { status: 400 });
    }

    // ——— الخطوة 2: نوع التواصل ———
    const contactType = VISIT_CONTACT_TYPES.includes(body.contactType) ? body.contactType : null;
    if (!contactType) {
      return NextResponse.json({ error: "نوع التواصل مطلوب (الخطوة الثانية)." }, { status: 400 });
    }

    const contactOther = contactType === "OTHER" && typeof body.contactOther === "string" ? body.contactOther.trim() : null;
    if (contactType === "OTHER" && !contactOther) {
      return NextResponse.json({ error: "اكتب نوع التواصل عند اختيار «أخرى»." }, { status: 400 });
    }

    // ——— الخطوة 3: نتيجة الزيارة ———
    const result = RESULTS.includes(body.result) ? body.result : null;
    if (!result) {
      return NextResponse.json({ error: "نتيجة الزيارة مطلوبة (الخطوة الثالثة)." }, { status: 400 });
    }
    const resultOther = typeof body.resultOther === "string" && body.resultOther.trim() ? body.resultOther.trim() : null;
    if (result === "OTHER" && !resultOther) {
      return NextResponse.json({ error: "اكتب نص النتيجة عند اختيار «أخرى»." }, { status: 400 });
    }
    const rejectionReason = typeof body.rejectionReason === "string" && body.rejectionReason.trim() ? body.rejectionReason.trim() : null;
    if (result === "REJECTED" && !rejectionReason) {
      return NextResponse.json({ error: "سبب الرفض إلزامي عند اختيار نتيجة «رفض»." }, { status: 400 });
    }

    // ——— الخطوة 4: معلومات الشخص الذي تم التواصل معه (كما أدخلها الموظف) ———
    const contactPersonName = typeof body.contactPersonName === "string" && body.contactPersonName.trim() ? body.contactPersonName.trim() : null;
    const contactPersonTitle = typeof body.contactPersonTitle === "string" && body.contactPersonTitle.trim() ? body.contactPersonTitle.trim() : null;
    const principalName = typeof body.principalName === "string" && body.principalName.trim() ? body.principalName.trim() : null;
    const schoolPhone = typeof body.schoolPhone === "string" && body.schoolPhone.trim() ? body.schoolPhone.trim() : null;
    const studentCount = typeof body.studentCount === "number" && Number.isFinite(body.studentCount) && body.studentCount >= 0 ? Math.round(body.studentCount) : null;

    // ——— الخطوة 5: احتياجات المدرسة (اختيار متعدد) ———
    let needs: string[] = [];
    if (Array.isArray(body.needs)) {
      needs = body.needs.filter((n: unknown) => NEEDS.includes(n as never));
    }
    if (needs.includes("NONE") && needs.length > 1) {
      return NextResponse.json({ error: "لا يمكن اختيار «لا تحتاج إلى شيء» مع احتياجات أخرى." }, { status: 400 });
    }
    const needsOther = typeof body.needsOther === "string" && body.needsOther.trim() ? body.needsOther.trim() : null;
    if (needs.includes("OTHER") && !needsOther) {
      return NextResponse.json({ error: "شرح الاحتياج الآخر إلزامي عند اختيار «أخرى»." }, { status: 400 });
    }

    // ——— الخطوة 6: معلومات المتابعة ———
    const subscribersCount = typeof body.subscribersCount === "number" && Number.isFinite(body.subscribersCount) && body.subscribersCount >= 0 ? Math.round(body.subscribersCount) : null;
    let nextFollowUpAt: Date | null = null;
    if (typeof body.nextFollowUpAt === "string" && body.nextFollowUpAt) {
      const date = body.nextFollowUpAt;
      const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00+03:00` : date);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "موعد المتابعة القادم غير صحيح." }, { status: 400 });
      }
      nextFollowUpAt = parsed;
    }

    // ——— الخطوة 7: ملاحظات ———
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    // تحديث بيانات المدرسة الأصلية فقط مع تسجيل التحديث في سجل التغييرات (AuditLog)
    const schoolChanges: Record<string, { from: unknown; to: unknown }> = {};
    const schoolUpdateData: Record<string, unknown> = {};
    const canUpdateSchool = !principal.isCoordinator || isMapSchoolSource(school.dataSource);
    if (canUpdateSchool && principalName && principalName !== school.principalName) {
      schoolChanges.principalName = { from: school.principalName, to: principalName };
      schoolUpdateData.principalName = principalName;
    }
    if (canUpdateSchool && schoolPhone && schoolPhone !== school.phone) {
      schoolChanges.phone = { from: school.phone, to: schoolPhone };
      schoolUpdateData.phone = schoolPhone;
    }
    if (canUpdateSchool && studentCount !== null && studentCount !== school.studentCount) {
      schoolChanges.studentCount = { from: school.studentCount, to: studentCount };
      schoolUpdateData.studentCount = studentCount;
    }
    const schoolFieldsUpdated = Object.keys(schoolChanges).length > 0;

    const visit = await db.$transaction(async (tx) => {
      const created = await tx.schoolVisit.create({
        data: {
          dedupeKey,
          schoolId,
          ...fieldVisitOwner(principal),
          contactType,
          contactOther,
          result,
          resultOther,
          rejectionReason,
          contactPersonName,
          contactPersonTitle,
          principalName,
          schoolPhone,
          studentCount,
          needs: JSON.stringify(needs),
          needsOther,
          subscribersCount,
          nextFollowUpAt,
          notes,
          lat,
          lng,
          locationAccuracy,
          locationSource,
          schoolFieldsUpdated,
        },
      });

      if (schoolFieldsUpdated) {
        await tx.school.update({
          where: { id: schoolId },
          data: schoolUpdateData as never,
        });
      }

      if (contactType === "FIELD_VISIT") {
        await tx.school.updateMany({
          where: { id: schoolId, OR: [{ lastVisitAt: null }, { lastVisitAt: { lt: created.createdAt } }] },
          data: { lastVisitAt: created.createdAt },
        });
      }

      // ربط الزيارة بسجل النشاطات المركزي الحالي — تظهر فوراً في لوحة الإدارة
      await tx.activity.create({
        data: {
          type: contactType === "FIELD_VISIT" ? "VISIT" : "CALL",
          schoolId,
          coordinatorId: principal.isCoordinator ? principal.userId : undefined,
          userId: principal.isCoordinator ? undefined : principal.userId,
          occurredAt: created.createdAt,
          result:
            result === "OTHER" && resultOther
              ? resultOther
              : {
                  INITIAL_APPROVAL: "موافقة أولية",
                  APPROVED: "موافقة",
                  NEEDS_ANOTHER_VISIT: "يحتاج زيارة أخرى",
                  CONTRACTED: "تم التعاقد",
                  REJECTED: "رفض",
                  SCHOOL_NOT_FOUND: "المدرسة غير موجودة",
                  OTHER: "أخرى",
                }[result] ?? null,
          notes: notes ?? null,
        },
      });

      await tx.notification.create({
        data: {
          title: contactType === "FIELD_VISIT" ? "زيارة ميدانية جديدة" : "تواصل جديد من موظف",
          message: `${principal.isCoordinator ? "المنسّق" : "الموظف"} «${principal.name}» سجل ${contactType === "FIELD_VISIT" ? "زيارة" : "تواصل"} على مدرسة «${school.name}».`,
          type: "INFO",
        },
      });

      return created;
    }).catch(async (error: unknown) => {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
      return null;
    });

    if (!visit) {
      const registered = await db.schoolVisit.findUnique({ where: { dedupeKey } });
      const owner = principal.isCoordinator ? registered?.coordinatorId : registered?.employeeId;
      if (!registered || owner !== principal.userId) {
        return NextResponse.json({ error: "مفتاح زيارة مستخدم." }, { status: 409 });
      }
      return NextResponse.json({
        visit: { id: registered.id, dedupeKey, createdAt: registered.createdAt.toISOString() },
        duplicate: true,
      });
    }

    await logAudit({
      actorType: principal.isCoordinator ? "COORDINATOR" : "EMPLOYEE",
      actorId: principal.userId,
      actorName: principal.name ?? "موظف",
      action: AUDIT_ACTIONS.REGISTER_VISIT,
      entityType: "SCHOOL_VISIT",
      entityId: visit.id,
      details: {
        schoolId,
        schoolName: school.name,
        contactType,
        result,
        lat,
        lng,
        locationSource,
        schoolChanges: schoolFieldsUpdated ? schoolChanges : null,
      },
    });

    return NextResponse.json(
      { visit: { id: visit.id, createdAt: visit.createdAt.toISOString() }, duplicate: false },
      { status: 201 }
    );
  } catch (error) {
    console.error("خطأ في تسجيل زيارة الموظف:", error);
    return NextResponse.json({ error: "تعذر تسجيل الزيارة." }, { status: 500 });
  }
}
