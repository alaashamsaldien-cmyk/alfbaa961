"use client";

// ——— التحديث التلقائي لبوابة المنسقة/الموظف ———
// تقارن نسخة الواجهة المحمّلة مع نسخة الخادم كل دقيقة وعند الرجوع للتطبيق.
// عند نشر تحديث جديد: تحدّث الصفحة تلقائياً، إلا إذا المستخدم بنص إدخال بيانات
// (نافذة مفتوحة أو نموذج تسجيل زيارة) — عندها تظهر رسالة «اكو تحديث» ولا تضيع البيانات.
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const CHECK_EVERY_MS = 60_000;

function isBusy(busy: boolean) {
  if (busy) return true;
  // نافذة مفتوحة (إضافة مدرسة، تفاصيل، ...) أو حقل نصي قيد الكتابة
  if (document.querySelector('[role="dialog"]')) return true;
  const active = document.activeElement;
  return Boolean(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT"));
}

export function UpdateWatcher({ busy = false }: { busy?: boolean }) {
  const [available, setAvailable] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const reload = useCallback(() => window.location.reload(), []);

  const check = useCallback(async () => {
    if (!CURRENT) return;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const { buildId } = await res.json();
      if (!buildId || buildId === CURRENT) return;
      // تحديث جديد منشور
      if (document.hidden || !isBusy(busyRef.current)) reload();
      else setAvailable(true);
    } catch {
      // بلا إنترنت — نحاول لاحقاً
    }
  }, [reload]);

  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) void check(); }, CHECK_EVERY_MS);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    void check();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [check]);

  // بعد ما يخلص المستخدم من الإدخال، نحدّث تلقائياً
  useEffect(() => {
    if (!available) return;
    const timer = setInterval(() => { if (!isBusy(busyRef.current)) reload(); }, 5000);
    return () => clearInterval(timer);
  }, [available, reload]);

  if (!available) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-between gap-2 bg-sky-600 px-4 py-2 text-sm text-white">
      <span>اكو تحديث جديد للتطبيق — يتحدّث وحده بعد ما تخلص، أو</span>
      <button type="button" onClick={reload} className="flex shrink-0 items-center gap-1 rounded-lg bg-white/15 px-3 py-1 font-bold">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />حدّث الآن
      </button>
    </div>
  );
}
