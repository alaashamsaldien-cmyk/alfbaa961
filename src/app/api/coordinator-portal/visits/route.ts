// تسجيل نشاط ميداني من المنسقة (زيارة أو اتصال) — مقيد بالمدارس المخصصة لها
// يحفظ سجل فعلي (Activity) في القاعدة المركزية ويحدد lastVisitAt تلقائياً للزيارات
// وينشئ إشعاراً يظهر فوراً في لوحة الإدارة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvedMapSchoolWhere } from "@/lib/map-school-scope";
import { getPrincipal } from "@/lib/auth";
import { getBaghdadStartOfDay, getBaghdadEndOfDay } from "@/lib/time";

const ALLOWED_TYPES = ["VISIT", "CALL"] as const;

export async function POST(request: NextRequest) {
  try {
    const principal = await getPrincipal();
    const body = await request.json().catch(() => ({}));
    const schoolId = typeof body.schoolId === "string" ? body.schoolId : null;
    const activityType = ALLOWED_TYPES.includes(body.type) ? (body.type as "VISIT" | "CALL") : "VISIT";

    let coordinatorId: string | null = null;
    if (principal?.type === "COORDINATOR") {
      const account = await db.coordinator.findUnique({
        where: { id: principal.coordinatorId }, select: { canRegisterVisits: true },
      });
      if (!account?.canRegisterVisits) return NextResponse.json({ error: "لا تملك صلاحية تسجيل زيارة." }, { status: 403 });
      coordinatorId = principal.coordinatorId;
    } else if (principal?.type === "ADMIN" && principal.role === "ADMIN") {
      coordinatorId = typeof body.coordinatorId === "string" && body.coordinatorId ? body.coordinatorId : null;
    }
    if (!coordinatorId) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول بحساب منسقة لتنفيذ هذه العملية." },
        { status: principal ? 403 : 401 }
      );
    }
    if (!schoolId) {
      return NextResponse.json({ error: "معرف المدرسة مطلوب." }, { status: 400 });
    }

    // التحقق الحرج من الصلاحية: المدرسة مخصصة لهذه المنسقة حصراً
    const school = await db.school.findFirst({ where: { id: schoolId, coordinatorId, AND: [approvedMapSchoolWhere] } });
    if (!school) return NextResponse.json({ error: "المدرسة غير موجودة." }, { status: 404 });
    if (school.coordinatorId !== coordinatorId) {
      return NextResponse.json(
        { error: "هذه المدرسة غير مخصصة لهذه المنسقة — تسجيل النشاط مرفوض." },
        { status: 403 }
      );
    }

    // تاريخ النشاط: افتراضياً الآن، مع دعم تاريخ اليوم فقط للإدخال اليدوي المتأخر
    let occurredAt = new Date();
    if (typeof body.occurredAt === "string" && body.occurredAt) {
      const parsed = new Date(body.occurredAt);
      if (!Number.isNaN(parsed.getTime())) {
        const todayStart = getBaghdadStartOfDay();
        const todayEnd = getBaghdadEndOfDay();
        if (parsed >= todayStart && parsed <= todayEnd) {
          occurredAt = parsed;
        } else {
          return NextResponse.json(
            { error: "يُسمح بتسجيل نشاط اليوم فقط — النشاطات السابقة تُدار من لوحة الإدارة." },
            { status: 400 }
          );
        }
      }
    }

    const activity = await db.activity.create({
      data: {
        type: activityType,
        schoolId,
        coordinatorId,
        result: typeof body.result === "string" && body.result.trim() ? body.result.trim() : null,
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
        occurredAt,
      },
    });

    if (activityType === "VISIT") {
      await db.school.update({ where: { id: schoolId }, data: { lastVisitAt: occurredAt } });
    }

    // إشعار فوري للإدارة — يربط نشاط الميدان بلوحة الإدارة مباشرة
    const coordinator = await db.coordinator.findUnique({ where: { id: coordinatorId } });
    await db.notification.create({
      data: {
        title: activityType === "VISIT" ? "زيارة ميدانية جديدة" : "اتصال تواصل جديد",
        message: `المنسقة «${coordinator?.name ?? ""}» سجلت ${
          activityType === "VISIT" ? "زيارة" : "اتصالاً"
        } على مدرسة «${school.name}».`,
        type: "INFO",
      },
    });

    return NextResponse.json(
      { activity: { id: activity.id, occurredAt: activity.occurredAt.toISOString() } },
      { status: 201 }
    );
  } catch (error) {
    console.error("خطأ في تسجيل النشاط الميداني:", error);
    return NextResponse.json({ error: "تعذر تسجيل النشاط." }, { status: 500 });
  }
}
