-- Additive rollout. Apply before deploying the new application. No school or visit rows are deleted.
BEGIN;
CREATE TABLE IF NOT EXISTS "SchoolAssignment" (
 "schoolId" TEXT NOT NULL REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "coordinatorId" TEXT NOT NULL REFERENCES "Coordinator"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("schoolId", "coordinatorId")
);
CREATE INDEX IF NOT EXISTS "SchoolAssignment_coordinatorId_idx" ON "SchoolAssignment"("coordinatorId");
INSERT INTO "SchoolAssignment" ("schoolId", "coordinatorId")
SELECT "id", "coordinatorId" FROM "School" WHERE "coordinatorId" IS NOT NULL
ON CONFLICT DO NOTHING;
COMMIT;
