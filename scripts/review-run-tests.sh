#!/bin/bash
# تشغيل خادم الفحص المعزول + سكربت الفحص الشامل في جلسة واحدة
cd /home/z/my-project

# تنظيف أي خادم فحص سابق
pkill -f "next dev -p 3100" 2>/dev/null
sleep 1

DATABASE_URL="file:/home/z/my-project/db/review-isolated.db" NEXT_REVIEW_DIST_DIR=".next-review" setsid nohup npx next dev -p 3100 > review-server.log 2>&1 < /dev/null &
SERVER_PID=$!

# انتظار الجاهزية
for i in $(seq 1 30); do
  if curl -s -m 2 http://localhost:3100/api/auth/me > /dev/null 2>&1; then
    echo "✅ الخادم المعزول جاهز (محاولة $i)"
    break
  fi
  sleep 1
done

curl -s -m 5 -H "Cookie: alifba_session=69baff624a3e9ae7aa774c34f9d324b97795332345f454ac" http://localhost:3100/api/auth/me | head -c 120
echo ""

node scripts/review-visit-tests.mjs
TEST_EXIT=$?

echo "TEST_EXIT=$TEST_EXIT"
