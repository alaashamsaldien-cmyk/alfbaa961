// تفاصيل مدرسة + تعديل من الإدارة (مفتوح للإدارة فقط في هذه المرحلة)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapSchool } from "@/lib/schools-query";
import { mergeFieldMeta, computeDataQuality, type FieldMeta } from "@/lib/geo/normalize";
import { getCurrentUser } from "@/lib/session";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

async function getSchoolOr404(id: string) {
  const school = await db.school.findUnique({
    where: { id },
    include: { region: true, coordinator: { select: { id: true, name: true } } },
  });
  return school;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const { id } = await params;
    const school = await getSchoolOr404(id);
    if (!school) return NextResponse.json({ error: "المدرسة غير موجودة." }, { status: 404 });
    const activities = await db.activity.findMany({
      where: { schoolId: id },
      include: { coordinator: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { occurredAt: "desc" },
      take: 30,
    });
    return NextResponse.json({
      school: mapSchool(school as never),
      activities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        occurredAt: a.occurredAt.toISOString(),
        result: a.result,
        notes: a.notes,
        coordinatorName: a.coordinator?.name ?? null,
        userName: a.user?.name ?? null,
      })),
    });
  } catch (error) {
    console.error("خطأ في جلب تفاصيل المدرسة:", error);
    return NextResponse.json({ error: "تعذر جلب تفاصيل المدرسة." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({}));

    const school = await getSchoolOr404(id);
    if (!school) return NextResponse.json({ error: "المدرسة غير موجودة." }, { status: 404 });

    // الحقول القابلة للتعديل من الإدارة
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const data: Record<string, unknown> = {};
    const changedFields: string[] = [];

    const fieldDefs: [string, (v: unknown) => unknown][] = [
      ["principalName", str],
      ["phone", str],
      ["address", str],
      ["studentCount", (v) => (v === null || v === "" ? null : Number(v))],
      ["stages", str],
      ["website", str],
      ["facebookUrl", str],
      ["instagramUrl", str],
      ["platformName", str],
      ["notes", str],
      ["institutionType", str],
    ];
    for (const [key, fn] of fieldDefs) {
      if (key in body) {
        const val = fn(body[key]);
        const prev = (school as unknown as Record<string, unknown>)[key];
        if (prev !== val) changedFields.push(key);
        data[key] = val;
      }
    }
    if ("sector" in body) {
      const val = body.sector === "GOVERNMENT" || body.sector === "PRIVATE" ? body.sector : null;
      if (school.sector !== val) changedFields.push("sector");
      data.sector = val;
    }
    if ("availabilityStatus" in body) {
      const val = body.availabilityStatus === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
      data.availabilityStatus = val;
    }
    if ("contractStatus" in body) {
      const val = body.contractStatus === "CONTRACTED" ? "CONTRACTED" : "NOT_CONTRACTED";
      data.contractStatus = val;
    }
    if ("discoveryStatus" in body) {
      const allowed = ["DISCOVERED", "NEEDS_VERIFICATION", "OFFICIALLY_DOCUMENTED", "FIELD_CONFIRMED"];
      if (!allowed.includes(body.discoveryStatus)) {
        return NextResponse.json({ error: "حالة توثيق غير صحيحة." }, { status: 400 });
      }
      data.discoveryStatus = body.discoveryStatus;
    }
    if ("regionId" in body) {
      data.regionId = body.regionId && typeof body.regionId === "string" ? body.regionId : null;
    }
    if ("coordinatorId" in body) {
      data.coordinatorId = body.coordinatorId && typeof body.coordinatorId === "string" ? body.coordinatorId : null;
    }
    // تصحيح الإحداثيات يدوياً — بإذن الإدارة فقط
    if ("lat" in body || "lng" in body) {
      const lat = body.lat === null ? null : Number(body.lat);
      const lng = body.lng === null ? null : Number(body.lng);
      if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
        return NextResponse.json({ error: "قيمة خط العرض غير صحيحة." }, { status: 400 });
      }
      if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
        return NextResponse.json({ error: "قيمة خط الطول غير صحيحة." }, { status: 400 });
      }
      data.lat = lat;
      data.lng = lng;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث." }, { status: 400 });
    }

    // تحديث بيانات التوثيق للحقول المعدلة — مصدر الإدخال اليدوي
    if (changedFields.length > 0) {
      const old: FieldMeta = school.fieldMeta ? JSON.parse(school.fieldMeta) : {};
      const updates: FieldMeta = {};
      for (const f of changedFields) {
        updates[f] = {
          source: "MANUAL_ENTRY",
          sourceLabel: "تعديل يدوي من الإدارة",
          collectedAt: new Date().toISOString(),
          verificationStatus: body.discoveryStatus === "OFFICIALLY_DOCUMENTED" ? "OFFICIALLY_DOCUMENTED" : "NEEDS_VERIFICATION",
          reliability: 0.7,
          updatedBy: user.name,
          updatedAt: new Date().toISOString(),
        };
      }
      data.fieldMeta = JSON.stringify(mergeFieldMeta(old, updates));
    }

    const updated = await db.school.update({ where: { id }, data: data as never });
    // إعادة حساب درجة الاكتمال بعد التعديل
    const quality = computeDataQuality({
      phone: updated.phone,
      principalName: updated.principalName,
      lat: updated.lat,
      lng: updated.lng,
      institutionType: updated.institutionType,
      sector: updated.sector,
      regionText: updated.regionText,
      studentCount: updated.studentCount,
      stages: updated.stages,
      website: updated.website,
      address: updated.address,
      facebookUrl: updated.facebookUrl,
      instagramUrl: updated.instagramUrl,
    });
    const final = await db.school.update({ where: { id }, data: { dataQuality: quality } });

    // نشاط بسيط يسجل تعديل الإدارة (إن كان تعديلاً جوهرياً)
    if (changedFields.length > 0) {
      await db.activity.create({
        data: {
          type: "FIELD_UPDATE",
          schoolId: id,
          userId: user.id,
          result: `تحديث حقول: ${changedFields.join("، ")}`,
          notes: "تعديل بيانات من الإدارة",
        },
      });
    }

    return NextResponse.json({ school: mapSchool(final as never) });
  } catch (error) {
    console.error("خطأ في تعديل المدرسة:", error);
    return NextResponse.json({ error: "تعذر تعديل بيانات المدرسة." }, { status: 500 });
  }
}
