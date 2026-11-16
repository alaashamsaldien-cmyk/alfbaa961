import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { approvedMapSchoolWhere, MAP_APPROVED } from "@/lib/map-school-scope";
import { assignmentPlan, resultingAssignees, type AssignmentAction } from "@/lib/assignment-plan";

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  const schoolId = request.nextUrl.searchParams.get("schoolId");
  if (!schoolId) return NextResponse.json({ error: "حدد المدرسة." }, { status: 400 });
  const history = await db.auditLog.findMany({
    where: { entityType: "SCHOOL", entityId: schoolId, action: "ASSIGN_SCHOOL" },
    orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, actorName: true, createdAt: true, details: true },
  });
  return NextResponse.json({ history });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json();
    const ids = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && s.length > 0))] : [];
    const schoolIds = ids(body.schoolIds);
    const coordinatorIds = ids(body.coordinatorIds);
    const action = body.action as AssignmentAction;
    if (!["add", "replace", "remove"].includes(action) || !["shared", "separate"].includes(body.mode) ||
        !schoolIds.length || schoolIds.length > 500 || !coordinatorIds.length || coordinatorIds.length > 100 ||
        (body.mode === "separate" && action !== "replace")) {
      return NextResponse.json({ error: "حدد المدارس والمنسّقين وطريقة صحيحة. التوزيع المنفصل يستبدل التكليف السابق." }, { status: 400 });
    }
    const result = await db.$transaction(async (tx) => {
      // Lock parents in a stable order: concurrent administrators cannot lose assignments.
      for (const id of [...schoolIds].sort()) await tx.$queryRaw`SELECT id FROM "School" WHERE id = ${id} FOR UPDATE`;
      const schools = await tx.school.findMany({
        where: { id: { in: schoolIds }, ...(action === "remove" ? {} : { AND: [approvedMapSchoolWhere] }) },
        select: { id: true, name: true, coordinatorId: true, assignments: { select: { coordinatorId: true } } },
      });
      const coordinators = await tx.coordinator.findMany({ where: { id: { in: coordinatorIds }, ...(action === "remove" ? {} : { isActive: true }) }, select: { id: true, name: true } });
      if (schools.length !== schoolIds.length || coordinators.length !== coordinatorIds.length) throw new Error("تأكد من اعتماد المدارس ونشاط المنسّقين.");
      const plan = assignmentPlan(schoolIds, coordinatorIds, body.mode);
      const allPeople = await tx.coordinator.findMany({ where: { id: { in: [...new Set([...coordinatorIds, ...schools.flatMap(s => [s.coordinatorId, ...s.assignments.map(a => a.coordinatorId)].filter((id): id is string => Boolean(id)))])] } }, select: { id: true, name: true } });
      const names = (values: string[]) => values.map(id => ({ id, name: allPeople.find(p => p.id === id)?.name ?? id }));
      const preview = plan.map(item => {
        const school = schools.find(s => s.id === item.schoolId)!;
        const before = [...new Set([school.coordinatorId, ...school.assignments.map(a => a.coordinatorId)].filter((id): id is string => Boolean(id)))];
        return { schoolId: school.id, schoolName: school.name, before: names(before), after: names(resultingAssignees(before, item.coordinatorIds, action)) };
      });
      if (body.preview === true) return { preview, affected: 0 };
      if (body.expected && JSON.stringify(body.expected) !== JSON.stringify(preview)) throw new Error("تغيّر التنسيب؛ أعد المعاينة.");
      for (const item of preview) {
        await tx.schoolAssignment.deleteMany({ where: { schoolId: item.schoolId, coordinatorId: { notIn: item.after.map(p=>p.id) } } });
        if (item.after.length) await tx.schoolAssignment.createMany({ skipDuplicates:true, data: item.after.map(p => ({ schoolId: item.schoolId, coordinatorId: p.id })) });
        await tx.school.update({ where: { id: item.schoolId }, data: {
          coordinatorId: item.after[0]?.id ?? null,
          ...(action !== "remove" ? { discoveryStatus: MAP_APPROVED } : {}),
        } });
        await tx.auditLog.create({ data: {
          actorType: "ADMIN", actorId: guard.principal.userId, actorName: guard.principal.name,
          action: "ASSIGN_SCHOOL", entityType: "SCHOOL", entityId: item.schoolId,
          details: JSON.stringify({ action, mode: body.mode, ...item }),
        } });
      }
      return { preview, affected: preview.length };
    }, { timeout: 30000 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Assignment failed", error);
    return NextResponse.json({ error: "لم يُحفظ التنسيب. تحقق من المدارس والمنسّقين وأعد المحاولة." }, { status: 409 });
  }
}
