#!/bin/bash
# جولة الواجهات: نسخة معزولة جديدة + خادم معزول + سكربت Playwright في الجلسة نفسها
cd /home/z/my-project
pkill -f "next dev -p 3100" 2>/dev/null
sleep 1

node scripts/review-setup-isolated.mjs
if [ $? != 0 ]; then echo "❌ فشل تجهيز النسخة المعزولة"; exit 2; fi

DATABASE_URL="file:/home/z/my-project/db/review-isolated.db" NEXT_REVIEW_DIST_DIR=".next-review" setsid nohup npx next dev -p 3100 > review-server.log 2>&1 < /dev/null &

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

NODE_PATH=/home/z/.npm-global/lib/node_modules node scripts/closeout-screenshots.mjs
EXIT=$?
echo "SHOTS_EXIT=$EXIT"
exit $EXIT
