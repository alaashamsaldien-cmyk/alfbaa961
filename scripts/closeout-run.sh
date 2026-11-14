#!/bin/bash
# تشغيل الخادم المعزول (3100) وتنفيذ الاختبارات في الجلسة نفسها — يضمن بقاء الخادم طوال الاختبار
cd /home/z/my-project

# تنظيف أي خادم فحص سابق
pkill -f "next dev -p 3100" 2>/dev/null
sleep 1

# نسخة معزولة جديدة في كل تشغيل — لقطة نظيفة من القاعدة الحقيقية (قراءة فقط من الأصل)
node scripts/review-setup-isolated.mjs
if [ $? != 0 ]; then echo "❌ فشل تجهيز النسخة المعزولة"; exit 2; fi

# بدء الخادم المعزول بقاعدة النسخة المعزولة ودليل بناء منفصل
DATABASE_URL="file:/home/z/my-project/db/review-isolated.db" NEXT_REVIEW_DIST_DIR=".next-review" setsid nohup npx next dev -p 3100 > review-server.log 2>&1 < /dev/null &
SERVER_PID=$!

# انتظار الجاهزية
READY=0
for i in $(seq 1 120); do
  if curl -s -m 2 http://localhost:3100/api/auth/me > /dev/null 2>&1; then
    echo "✅ الخادم المعزول جاهز (محاولة $i)"
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "❌ الخادم المعزول لم يجهز"
  tail -20 review-server.log
  exit 2
fi

# التأكد من الجلسة المحقونة
curl -s -m 5 -H "Cookie: alifba_session=69baff624a3e9ae7aa774c34f9d324b97795332345f454ac" http://localhost:3100/api/auth/me | head -c 120
echo ""

# تنفيذ الاختبارات
node scripts/closeout-tests.mjs
TEST_EXIT=$?
echo "TEST_EXIT=$TEST_EXIT"
exit $TEST_EXIT
