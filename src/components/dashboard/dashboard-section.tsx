"use client";

// ——— قسم لوحة التحكم الرئيسية ———
// نفس المنطق والتصميم السابق دون أي تغيير وظيفي؛ استُخرج هنا ليصبح
// قسماً ضمن نظام الأقسام في الصفحة الرئيسية.

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TodayActivity } from "@/components/dashboard/today-activity";
import { FollowUpsPanel } from "@/components/dashboard/followups-panel";
import { RegionChart } from "@/components/dashboard/region-chart";
import { RecentActivities } from "@/components/dashboard/recent-activities";
import { formatFullDate, formatTime } from "@/lib/time";
import type {
  DashboardData,
  ActivityPeriod,
} from "@/lib/dashboard";

export function DashboardSection() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<ActivityPeriod>("all");
  const [todayDate, setTodayDate] = useState("");
  const periodRef = useRef(period);
  periodRef.current = period;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?period=${periodRef.current}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "تعذر جلب بيانات لوحة التحكم.");
      }
      const json: DashboardData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // تحميل أولي + تحديث تلقائي كل دقيقة
  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), 60_000);
    return () => clearInterval(t);
  }, [load]);

  // تاريخ اليوم (في العميل فقط لتفادي عدم تطابق التهيئة)
  useEffect(() => {
    const update = () => setTodayDate(formatFullDate(new Date()));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  const handlePeriodChange = (p: ActivityPeriod) => {
    setPeriod(p);
    // إعادة تحميل مع الفترة الجديدة — يؤثر على النشاطات فقط ولا يمس إجمالي المدارس
    setLoading(true);
    fetch(`/api/dashboard?period=${p}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((json: DashboardData) => setData(json))
      .catch(() => setError("تعذر تطبيق فلتر الفترة الزمنية."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-6" aria-label="محتوى لوحة التحكم">
      {/* رأس الصفحة: العنوان + زر التحديث اليدوي */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">نظرة عامة</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {todayDate
              ? `التاريخ: ${todayDate}${data?.updatedAt ? ` — آخر تحديث ${formatTime(data.updatedAt)}` : ""}`
              : "جارٍ تجهيز البيانات..."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => load({ silent: true })}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          {refreshing ? "جارٍ التحديث..." : "تحديث البيانات"}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-red-800">تعذر تحميل البيانات</p>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => load()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* القسم الأول: بطاقات الإحصائيات الرئيسية */}
      <StatCards stats={data?.stats ?? null} loading={loading} />

      {/* القسم الثاني: نشاط اليوم */}
      <TodayActivity data={data?.todayActivity ?? null} loading={loading} todayDate={todayDate} />

      {/* القسم الثالث: المتابعات */}
      <FollowUpsPanel data={data?.followUps ?? null} loading={loading} />

      {/* القسم الرابع: توزيع المدارس حسب المناطق + مؤشر المدارس غير المخصصة */}
      <RegionChart
        data={data?.regionDistribution ?? []}
        unassigned={data?.unassignedSchools ?? 0}
        loading={loading}
      />

      {/* القسم الخامس: آخر النشاطات */}
      <RecentActivities
        items={data?.recentActivities ?? []}
        period={period}
        onPeriodChange={handlePeriodChange}
        loading={loading}
      />

      {/* تذييل المحتوى */}
      <footer className="pb-4 text-center text-xs text-muted-foreground">
        لوحة إدارة المدارس – منصة ألف باء · لوحة التحكم الرئيسية
      </footer>
    </div>
  );
}
