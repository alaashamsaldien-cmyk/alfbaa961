// تخصيص مدارس لمنسقة — دفعة واحدة أو فصل تخصيص
// أي تخصيص يجعل المدارس تظهر فوراً في حساب المنسقة وخريطتها
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { approvedMapSchoolWhere } from "@/lib/map-school-scope";

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action === "unassign" ? "unassign" : "assign";
    const schoolIds: string[] = Array.isArray(body.schoolIds) ? [...new Set<string>(body.schoolIds.filter((s: unknown) => typeof s === "string"))] : [];
    if (schoolIds.length === 0) return NextResponse.json({ error: "حدد مدرسة واحدة على الأقل." }, { status: 400 });

    if (action === "unassign") {
      const res = await db.school.updateMany({ where: { id: { in: schoolIds } }, data: { coordinatorId: null } });
      return NextResponse.json({ affected: res.count, action });
    }

    const coordinatorId = typeof body.coordinatorId === "string" ? body.coordinatorId : null;
    if (!coordinatorId) return NextResponse.json({ error: "حدد المنسقة." }, { status: 400 });
    const coordinator = await db.coordinator.findFirst({ where: { id: coordinatorId, isActive: true } });
    if (!coordinator) return NextResponse.json({ error: "المنسقة غير موجودة أو غير نشطة." }, { status: 404 });

    const scope = { id: { in: schoolIds }, AND: [approvedMapSchoolWhere] };
    if (await db.school.count({ where: scope }) !== schoolIds.length) {
      return NextResponse.json({ error: "يمكن تنسيب مدارس الخريطة المعتمدة فقط." }, { status: 409 });
    }
    const res = await db.school.updateMany({ where: scope, data: { coordinatorId } });

    await db.notification.create({
      data: {
        title: "تخصيص مدارس لمنسقة",
        message: `تم تخصيص ${res.count} مدرسة للمنسقة «${coordinator.name}». ستظهر فوراً في حسابها وخريطتها الميدانية.`,
        type: "INFO",
      },
    });

    return NextResponse.json({ affected: res.count, action, coordinatorName: coordinator.name });
  } catch (error) {
    console.error("خطأ في تخصيص المدارس:", error);
    return NextResponse.json({ error: "تعذر تنفيذ التخصيص." }, { status: 500 });
  }
}
