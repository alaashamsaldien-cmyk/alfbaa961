// ——— فحص الرابط الحي للمنصة على Render (بلا بيانات دخول — آمن تماماً) ———
// الاستخدام: RENDER_URL="https://alifba-platform.onrender.com" node scripts/render-verify.mjs
// يتحمل بداية التشغيل الباردة (الخطة المجانية تنام بعد 15 دقيقة — أول طلب قد يأخذ دقيقة).
const RENDER_URL = (process.env.RENDER_URL || "").replace(/\/$/, "");
if (!RENDER_URL) { console.error("ضبط RENDER_URL أولاً — مثال: https://alifba-platform.onrender.com"); process.exit(1); }

let pass = 0, fail = 0;
function record(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitUntilUp(maxSeconds = 100) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxSeconds) {
    try {
      const res = await fetch(RENDER_URL + "/api/session", { signal: AbortSignal.timeout(15000) });
      if (res.status === 200) return { seconds: Math.round((Date.now() - start) / 1000), body: await res.json().catch(() => null) };
    } catch {}
    await sleep(4000);
  }
  return null;
}

async function main() {
  console.log(`=== فحص الرابط الحي: ${RENDER_URL} ===`);
  console.log("انتظار الاستيقاظ (الخطة المجانية تدخل النوم بعد 15 دقيقة بلا استخدام)...");

  const up = await waitUntilUp();
  record("الخادم يستجيب على /api/session", Boolean(up), up ? `استغرق ${up.seconds}s` : "لم يستجب خلال 100 ثانية");
  if (up) {
    record("واجهة الجلسة تعيد JSON سليماً", typeof up.body === "object" && up.body !== null, JSON.stringify(up.body ?? {}).slice(0, 80));
  }

  const home = await fetch(RENDER_URL + "/", { signal: AbortSignal.timeout(20000) }).then(r => r.status).catch(e => "ERR:" + e.message);
  record("الصفحة الرئيسية تعمل (200)", home === 200, `status=${home}`);

  // واجهة محمية بلا جلسة — يجب أن ترفض (دليل أن الحماية فعالة على الإنتاج)
  const protectedApi = await fetch(RENDER_URL + "/api/schools?page=1", { signal: AbortSignal.timeout(20000) }).then(r => r.status).catch(() => "ERR");
  record("واجهة المدارس ترفض بلا تسجيل دخول (401)", protectedApi === 401, `status=${protectedApi}`);

  console.log(`\n=== الملخص: نجح ${pass} | فشل ${fail} ===`);
  if (fail === 0) console.log("✓ المنصة تعمل على الإنترنت بشكل سليم. جرّب الآن تسجيل الدخول من المتصفح.");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error("خطأ:", e.message); process.exit(2); });
