// تحديث بيانات ميدانية من المنسقة — مقيد حصراً بالمدارس المخصصة لها
// الحقول المسموحة فقط: اسم المدير، الهاتف، عدد الطلاب، المراحل، القطاع، ملاحظات
// كل تعديل يُسجل في قاعدة البيانات المركزية ويظهر في لوحة الإدارة فوراً
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrincipal } from "@/lib/auth";
import { mapSchool } from "@/lib/schools-query";
import { mergeFieldMeta, computeDataQuality, type FieldMeta } from "@/lib/geo/normalize";

type Params = { params: Promise<{ id: string }> };

/** أسماء الحقول بالعربية لتظهر في سجل النشاطات بشكل مفهوم للإدارة */
const FIELD_LABELS_AR: Record<string, string> = {
  principalName: "اسم المدير",
  phone: "رقم التواصل",
  stages: "المراحل الدراسية",
  notes: "الملاحظات",
  studentCount: "عدد الطلاب",
  sector: "القطاع",
};

/** التحقق الحرج من الصلاحية: المدرسة يجب أن تكون مخصصة لهذه المنسقة */
async function assertAssigned(schoolId: string, coordinatorId: string) {
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) return { school: null, error: "المدرسة غير موجودة." as const };
  if (school.coordinatorId !== coordinatorId) {
    return { school: null, error: "هذه المدرسة غير مخصصة لهذه المنسقة — التعديل مرفوض." as const };
  }
  const coordinator = await db.coordinator.findFirst({ where: { id: coordinatorId, isActive: true } });
  if (!coordinator) return { school: null, error: "المنسقة غير نشطة." as const };
  return { school, error: null };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // تحديد هوية المنسقة: من الجلسة الحقيقية (إجباري) أو من الإدارة لوضع المعاينة
    const principal = await getPrincipal();
    let coordinatorId: string | null = null;
    if (principal?.type === "COORDINATOR") {
      coordinatorId = principal.coordinatorId; // من الجلسة — لا يقبل وسائط خارجية
    } else if (principal?.type === "ADMIN") {
      coordinatorId = typeof body.coordinatorId === "string" && body.coordinatorId ? body.coordinatorId : null;
    }
    if (!coordinatorId) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول بحساب منسقة لتنفيذ هذه العملية." },
        { status: principal ? 403 : 401 }
      );
    }

    const { school, error } = await assertAssigned(id, coordinatorId);
    if (error || !school) return NextResponse.json({ error }, { status: 403 });

    const data: Record<string, unknown> = {};
    const changedFields: string[] = [];
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

    const allowed: [string, (v: unknown) => unknown][] = [
      ["principalName", str],
      ["phone", str],
      ["stages", str],
      ["notes", str],
    ];
    for (const [key, fn] of allowed) {
      if (key in body) {
        const val = fn(body[key]);
        if ((school as unknown as Record<string, unknown>)[key] !== val) changedFields.push(key);
        data[key] = val;
      }
    }
    if ("studentCount" in body) {
      const val = body.studentCount === null || body.studentCount === "" ? null : Number(body.studentCount);
      if (val !== null && (!Number.isFinite(val) || val < 0 || val > 20000)) {
        return NextResponse.json({ error: "عدد الطلاب غير صحيح." }, { status: 400 });
      }
      if (school.studentCount !== val) changedFields.push("studentCount");
      data.studentCount = val;
    }
    if ("sector" in body) {
      const val = body.sector === "GOVERNMENT" || body.sector === "PRIVATE" ? body.sector : null;
      if (school.sector !== val) changedFields.push("sector");
      data.sector = val;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث." }, { status: 400 });
    }

    // توثيق كل حقل معدل بمصدر «تحديث ميداني» وحالة مؤكدة ميدانياً
    const old: FieldMeta = school.fieldMeta ? JSON.parse(school.fieldMeta) : {};
    const updates: FieldMeta = {};
    for (const f of changedFields) {
      updates[f] = {
        source: "COORDINATOR_FIELD",
        sourceLabel: "تحديث ميداني من المنسقة",
        collectedAt: new Date().toISOString(),
        verificationStatus: "FIELD_CONFIRMED",
        reliability: 0.95,
        updatedAt: new Date().toISOString(),
      };
    }
    data.fieldMeta = JSON.stringify(mergeFieldMeta(old, updates));
    // المدرسة التي أصبحت بياناتها مؤكدة ميدانياً تحصل على الحالة المقابلة إن كانت مكتشفة فقط
    if (school.discoveryStatus === "DISCOVERED" || school.discoveryStatus === "NEEDS_VERIFICATION") {
      data.discoveryStatus = "FIELD_CONFIRMED";
    }

    const updated = await db.school.update({ where: { id }, data: data as never });
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

    // سجل نشاط مركزي يظهر في لوحة الإدارة — فقط عند وجود تغيير فعلي في الحقول
    if (changedFields.length > 0) {
      await db.activity.create({
        data: {
          type: "FIELD_UPDATE",
          schoolId: id,
          coordinatorId,
          result: `تحديث ميداني للحقول: ${changedFields.map((f) => FIELD_LABELS_AR[f] ?? f).join("، ")}`,
          notes: "تحديث من بوابة المنسقة الميدانية",
        },
      });
    }

    return NextResponse.json({ school: mapSchool(final as never) });
  } catch (error) {
    console.error("خطأ في التحديث الميداني:", error);
    return NextResponse.json({ error: "تعذر حفظ التحديث الميداني." }, { status: 500 });
  }
}
