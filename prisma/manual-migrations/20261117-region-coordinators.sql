-- تنسيب المناطق للمنسقات + المزامنة التلقائية للمدارس.
-- إضافي فقط: ينشئ جدول الربط ولا يحذف أي مدرسة أو زيارة أو تنسيب موجود.
-- طبّقه على قاعدة البيانات قبل تشغيل النسخة الجديدة من التطبيق.
BEGIN;
CREATE TABLE IF NOT EXISTS "RegionCoordinator" (
 "regionId" TEXT NOT NULL REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "coordinatorId" TEXT NOT NULL REFERENCES "Coordinator"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("regionId", "coordinatorId")
);
CREATE INDEX IF NOT EXISTS "RegionCoordinator_coordinatorId_idx" ON "RegionCoordinator"("coordinatorId");
COMMIT;
