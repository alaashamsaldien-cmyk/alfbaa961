// ——— تنسيب المناطق للمنسقات ———
// يحفظ منسقات كل منطقة (RegionCoordinator) ثم يزامن مدارس المنطقة فوراً.
// المدارس التي تُضاف للمنطقة لاحقاً تُنسّب تلقائياً لنفس المنسقات.
//   mode = shared   : كل المنسقات المختارات يشتركن في كل المناطق المختارة
//   mode = separate : المناطق تُوزّع بالتناوب — كل منطقة لمنسقة واحدة (استبدال)
//   action = add | replace | remove
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { syncRegionAssignments, unassignRegionSchools } from "@/lib/region-sync";

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && s.length > 0))] : [];

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const regionIds = ids(body.regionIds);
    const coordinatorIds = ids(body.coordinatorIds);
    const mode = body.mode === "separate" ? "separate" : "shared";
    const action = mode === "separate" ? "replace" : body.action;
    if (!regionIds.length || regionIds.length > 500 || !coordinatorIds.length || coordinatorIds.length > 100 ||
        !["add", "replace", "remove"].includes(action)) {
      return NextResponse.json({ error: "حدد المناطق والمنسقات والعملية." }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const regions = await tx.region.findMany({
        where: { id: { in: regionIds } },
        select: { id: true, name: true, governorate: true, coordinatorLinks: { select: { coordinatorId: true } } },
      });
      const coordinators = await tx.coordinator.findMany({
        where: { id: { in: coordinatorIds }, ...(action === "remove" ? {} : { isActive: true }) },
        select: { id: true, name: true },
      });
      if (regions.length !== regionIds.length) throw new Error("بعض المناطق غير موجودة.");
      if (coordinators.length !== coordinatorIds.length) throw new Error("بعض المنسقات غير نشطات.");

      // ترتيب ثابت حسب ترتيب الاختيار — المعاينة في الواجهة تطابق النتيجة
      const ordered = regionIds.map((id) => regions.find((r) => r.id === id)!);
      const plan = ordered.map((region, index) => {
        const before = region.coordinatorLinks.map((l) => l.coordinatorId);
        const selected = mode === "separate" ? [coordinatorIds[index % coordinatorIds.length]] : coordinatorIds;
        const after = action === "replace" ? selected
          : action === "remove" ? before.filter((id) => !selected.includes(id))
          : [...new Set([...before, ...selected])];
        return { region, before, after };
      });

      for (const { region, before, after } of plan) {
        const removed = before.filter((id) => !after.includes(id));
        if (removed.length) {
          await tx.regionCoordinator.deleteMany({ where: { regionId: region.id, coordinatorId: { in: removed } } });
          await unassignRegionSchools(tx, [region.id], removed);
        }
        if (after.length) {
          await tx.regionCoordinator.createMany({
            skipDuplicates: true,
            data: after.map((coordinatorId) => ({ regionId: region.id, coordinatorId })),
          });
        }
        await tx.auditLog.create({ data: {
          actorType: "ADMIN", actorId: guard.principal.userId, actorName: guard.principal.name,
          action: "ASSIGN_REGION", entityType: "REGION", entityId: region.id,
          details: JSON.stringify({ action, mode, region: region.name, governorate: region.governorate, before, after }),
        } });
      }

      const added = await syncRegionAssignments(tx, { regionIds });
      const schools = await tx.school.count({ where: { regionId: { in: regionIds } } });
      return { regions: plan.length, schools, added };
    }, { timeout: 60000 });

    return NextResponse.json(result);
  } catch (error) {
    console.error("تعذر تنسيب المناطق", error);
    const message = error instanceof Error && /[؀-ۿ]/.test(error.message) ? error.message : "لم يُحفظ التنسيب. أعد المحاولة.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
