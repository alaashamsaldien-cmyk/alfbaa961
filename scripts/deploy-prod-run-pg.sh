#!/bin/bash
# مشغّل اختبار النشر الكامل على Postgres (نفس تسلسل deploy-prod-run.sh لكن بقاعدة PG معزولة)
set -u
cd /home/z/my-project/.next/standalone || exit 2

ENV_ARGS='DATABASE_URL=postgresql://postgres@127.0.0.1:5433/alifba_fresh PORT=3100 HOSTNAME=0.0.0.0 NODE_ENV=production'

start_server() {
  env $ENV_ARGS node server.js > /home/z/my-project/.deploy-test/server-pg.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/ 2>/dev/null)
    [ "$code" = "200" ] && return 0
    sleep 0.5
  done
  echo "SERVER FAILED TO START"; tail -20 /home/z/my-project/.deploy-test/server-pg.log; exit 2
}

stop_server() {
  kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null
}

mkdir -p /home/z/my-project/.deploy-test

# حارس المنفذ: أي خادم قديم عالق على 3100 يجعل الاختبار يجيب للخادم الخطأ صامتاً — أوقف كل شيء
if ss -tln 2>/dev/null | grep -q ":3100 "; then
  echo "✗ المنفذ 3100 محتل بخادم آخر — اقتل العملية القديمة أولاً (ss -tlnp | grep 3100)"; exit 2
fi

echo "############ 1) تشغيل الخادم الإنتاجي على Postgres + الاختبار الشامل ############"
start_server
cd /home/z/my-project && PG_URL="postgresql://postgres@127.0.0.1:5433/alifba_fresh" node scripts/deploy-prod-test.mjs
MAIN_EXIT=$?

echo ""
echo "############ 2) إعادة تشغيل الخادم ثم فحص بقاء البيانات ############"
stop_server
sleep 1
cd /home/z/my-project/.next/standalone && start_server
cd /home/z/my-project && PG_URL="postgresql://postgres@127.0.0.1:5433/alifba_fresh" node scripts/deploy-prod-test.mjs persist
PERSIST_EXIT=$?

echo ""
echo "############ 3) إيقاف الخادم الاختباري ############"
stop_server
echo "MAIN_EXIT=$MAIN_EXIT PERSIST_EXIT=$PERSIST_EXIT"
[ $MAIN_EXIT -eq 0 ] && [ $PERSIST_EXIT -eq 0 ]
