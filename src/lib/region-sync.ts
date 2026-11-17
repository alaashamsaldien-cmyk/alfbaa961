// ——— المزامنة التلقائية بين المناطق والمنسقات والمدارس ———
// مصدر الحقيقة: جدول RegionCoordinator (منسقات كل منطقة).
// كل مدرسة داخل منطقة منسّبة تُضاف تلقائياً لتكليف منسقات المنطقة (SchoolAssignment)،
// سواء كانت موجودة وقت التنسيب أو أُضيفت لاحقاً من الخريطة أو Excel أو الاكتشاف أو البوابة الميدانية.
// المزامنة إضافية فقط: لا تحذف تنسيباً يدوياً على مستوى المدرسة.
import { Prisma } from "@prisma/client";

type Client = Prisma.TransactionClient;

export interface RegionSyncScope {
  regionIds?: string[];
  schoolIds?: string[];
  coordinatorId?: string;
}

function schoolFilter(scope: RegionSyncScope) {
  const parts: Prisma.Sql[] = [];
  if (scope.regionIds?.length) parts.push(Prisma.sql`s."regionId" IN (${Prisma.join(scope.regionIds)})`);
  if (scope.schoolIds?.length) parts.push(Prisma.sql`s."id" IN (${Prisma.join(scope.schoolIds)})`);
  return parts;
}

/** يملأ الحقل القديم School.coordinatorId من أقدم تكليف، للمدارس التي لا تملك قيمة فيه */
async function fillLegacyCoordinator(client: Client, scope: RegionSyncScope) {
  const parts = schoolFilter(scope);
  const extra = parts.length ? Prisma.sql`AND ${Prisma.join(parts, " AND ")}` : Prisma.empty;
  return client.$executeRaw`
    UPDATE "School" s SET "coordinatorId" = x."coordinatorId", "updatedAt" = NOW()
    FROM (
      SELECT DISTINCT ON (sa."schoolId") sa."schoolId", sa."coordinatorId"
      FROM "SchoolAssignment" sa
      ORDER BY sa."schoolId", sa."assignedAt", sa."coordinatorId"
    ) x
    WHERE x."schoolId" = s."id" AND s."coordinatorId" IS NULL ${extra}`;
}

/**
 * يطبّق تنسيب المناطق على مدارسها. آمن للتكرار (ON CONFLICT DO NOTHING) ويمكن استدعاؤه في أي وقت.
 * يُرجع عدد التكليفات الجديدة التي أُضيفت.
 */
export async function syncRegionAssignments(client: Client, scope: RegionSyncScope = {}): Promise<number> {
  if (scope.regionIds && !scope.regionIds.length) return 0;
  if (scope.schoolIds && !scope.schoolIds.length) return 0;
  const parts = schoolFilter(scope);
  if (scope.coordinatorId) parts.push(Prisma.sql`rc."coordinatorId" = ${scope.coordinatorId}`);
  const extra = parts.length ? Prisma.sql`AND ${Prisma.join(parts, " AND ")}` : Prisma.empty;
  const added = await client.$executeRaw`
    INSERT INTO "SchoolAssignment" ("schoolId", "coordinatorId")
    SELECT s."id", rc."coordinatorId"
    FROM "School" s
    JOIN "RegionCoordinator" rc ON rc."regionId" = s."regionId"
    JOIN "Coordinator" c ON c."id" = rc."coordinatorId"
    WHERE c."isActive" = true ${extra}
    ON CONFLICT DO NOTHING`;
  if (added > 0) await fillLegacyCoordinator(client, { regionIds: scope.regionIds, schoolIds: scope.schoolIds });
  return added;
}

/** يزيل منسقات من مدارس مناطق محددة (عند إلغاء تنسيب المنطقة أو استبداله) */
export async function unassignRegionSchools(client: Client, regionIds: string[], coordinatorIds: string[]) {
  if (!regionIds.length || !coordinatorIds.length) return 0;
  const removed = await client.$executeRaw`
    DELETE FROM "SchoolAssignment" sa USING "School" s
    WHERE sa."schoolId" = s."id"
      AND s."regionId" IN (${Prisma.join(regionIds)})
      AND sa."coordinatorId" IN (${Prisma.join(coordinatorIds)})`;
  await client.$executeRaw`
    UPDATE "School" SET "coordinatorId" = NULL, "updatedAt" = NOW()
    WHERE "regionId" IN (${Prisma.join(regionIds)}) AND "coordinatorId" IN (${Prisma.join(coordinatorIds)})`;
  await fillLegacyCoordinator(client, { regionIds });
  return removed;
}
