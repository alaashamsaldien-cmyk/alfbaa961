#!/bin/bash
# مشغّل اختبار النشر الكامل — يشغّل خادم الإنتاج على 3100 مع قاعدة معزولة،
# ينفّذ الاختبارات، يعيد تشغيل الخادم، ويفحص بقاء البيانات — كل ذلك في جلسة واحدة.
set -u
cd /home/z/my-project/.next/standalone || exit 2

ENV_ARGS='DATABASE_URL=file:/home/z/my-project/.deploy-test/prod.db PORT=3100 HOSTNAME=0.0.0.0 NODE_ENV=production'

start_server() {
  env $ENV_ARGS node server.js > /home/z/my-project/.deploy-test/server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/ 2>/dev/null)
    [ "$code" = "200" ] && return 0
    sleep 0.5
  done
  echo "SERVER FAILED TO START"; tail -20 /home/z/my-project/.deploy-test/server.log; exit 2
}

stop_server() {
  kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
}

echo "############ 1) تشغيل الخادم الإنتاجي + الاختبار الشامل ############"
start_server
cd /home/z/my-project && node scripts/deploy-prod-test.mjs
MAIN_EXIT=$?

echo ""
echo "############ 2) إعادة تشغيل الخادم ثم فحص بقاء البيانات ############"
stop_server
sleep 1
cd /home/z/my-project/.next/standalone && start_server
cd /home/z/my-project && node scripts/deploy-prod-test.mjs persist
PERSIST_EXIT=$?

echo ""
echo "############ 3) إيقاف الخادم الاختباري ############"
stop_server
echo "MAIN_EXIT=$MAIN_EXIT PERSIST_EXIT=$PERSIST_EXIT"
[ $MAIN_EXIT -eq 0 ] && [ $PERSIST_EXIT -eq 0 ]
