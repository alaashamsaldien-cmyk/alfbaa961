#!/bin/bash
# تشغيل الخادم المعزول + التقاط الصور في جلسة واحدة
cd /home/z/my-project
pkill -f "next dev -p 3100" 2>/dev/null
sleep 1

DATABASE_URL="file:/home/z/my-project/db/review-isolated.db" NEXT_REVIEW_DIST_DIR=".next-review" setsid nohup npx next dev -p 3100 > review-server.log 2>&1 < /dev/null &

for i in $(seq 1 30); do
  if curl -s -m 2 http://localhost:3100/api/auth/me > /dev/null 2>&1; then
    echo "✅ الخادم المعزول جاهز"
    break
  fi
  sleep 1
done

# تحديث متغير اسم الموظف إذا تغير اللاحقة: نقرأ اسم المستخدم من آخر سجل
EMP_USER=$(node -e "
import('@prisma/client').then(async ({PrismaClient}) => {
  const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/review-isolated.db' } } });
  const u = await db.user.findFirst({ where: { username: { startsWith: 'review_a_' } }, orderBy: { createdAt: 'desc' } });
  console.log(u ? u.username : 'review_a_fvxswm');
  await db.\$disconnect();
});
")
echo "الموظف الاختباري: $EMP_USER"
sed -i "s/review_a_[a-z0-9_]*/$EMP_USER/g" scripts/review-screenshots.mjs

NODE_PATH=/home/z/.npm-global/lib/node_modules node scripts/review-screenshots.mjs
echo "SHOTS_EXIT=$?"
