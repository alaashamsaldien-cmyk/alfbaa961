#!/bin/bash
set -u
cd /home/z/my-project/.next/standalone
DATABASE_URL="file:/home/z/my-project/.deploy-test/prod.db" PORT=3100 HOSTNAME=0.0.0.0 NODE_ENV=production node server.js > /home/z/my-project/.deploy-test/server.log 2>&1 &
SERVER_PID=$!
cleanup() { kill $SERVER_PID 2>/dev/null; }
trap cleanup EXIT
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 0.5
done
S=/home/z/my-project/download/صور-النشر
echo "server ready: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/)"

agent-browser set viewport 1440 900 > /dev/null 2>&1
agent-browser cookies clear > /dev/null 2>&1
agent-browser open http://localhost:3100 > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
agent-browser wait 1500 > /dev/null 2>&1

# ملء الحقول ثم النقر على زر «دخول» فعلياً
agent-browser find first "#login-username" fill "deploy_tester"
agent-browser find first "#login-password" fill "deploy-test-2026"
agent-browser find role button click --name "دخول" || echo "role-click failed"
agent-browser wait 3000 > /dev/null 2>&1
echo "---BODY AFTER ROLE CLICK---"
agent-browser eval "document.body.innerText.slice(0,150)"

# إن لم تنجح الطريقة: دخول عبر fetch داخل الصفحة ثم تحديث (نفس الكوكي HttpOnly)
BODY=$(agent-browser eval "document.body.innerText.slice(0,80)")
if echo "$BODY" | grep -q "تسجيل الدخول"; then
  echo "---FALLBACK: fetch login in page---"
  agent-browser eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'deploy_tester',password:'deploy-test-2026'})}).then(r=>r.status+':'+JSON.stringify(r.body)).catch(e=>'ERR'+e.message)"
  agent-browser eval "location.reload(); 'reloading'"
  agent-browser wait --load networkidle > /dev/null 2>&1
  agent-browser wait 2500 > /dev/null 2>&1
  echo "---BODY AFTER FALLBACK---"
  agent-browser eval "document.body.innerText.slice(0,150)"
fi

echo "---FINAL SHOTS---"
agent-browser screenshot "$S/كمبيوتر-03-لوحة-الإدارة-الرئيسية.png" && echo "shot-dashboard ok"
agent-browser eval "location.hash='#/visits'; 'ok'" > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
agent-browser wait 2500 > /dev/null 2>&1
agent-browser screenshot "$S/كمبيوتر-04-جدول-الزيارات-مع-التصدير-والفلاتر.png" && echo "shot-visits ok"
agent-browser eval "location.hash='#/schools'; 'ok'" > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
agent-browser wait 2500 > /dev/null 2>&1
agent-browser screenshot "$S/كمبيوتر-05-قائمة-المدارس.png" && echo "shot-schools ok"

echo "---MOBILE---"
agent-browser set device "iPhone 14" > /dev/null 2>&1
agent-browser open http://localhost:3100 > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
agent-browser wait 2500 > /dev/null 2>&1
agent-browser screenshot "$S/موبايل-01-لوحة-الإدارة-على-الموبايل.png" && echo "shot-mobile-dashboard ok"
agent-browser eval "location.hash='#/schools'; 'ok'" > /dev/null 2>&1
agent-browser wait --load networkidle > /dev/null 2>&1
agent-browser wait 2500 > /dev/null 2>&1
agent-browser screenshot "$S/موبايل-02-المدارس-على-الموبايل.png" && echo "shot-mobile-schools ok"
agent-browser set viewport 1440 900 > /dev/null 2>&1
echo "ALL DONE"
