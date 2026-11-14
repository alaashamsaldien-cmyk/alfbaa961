"use client";

// ——— قسم التقارير والإحصائيات — أرقام حقيقية محسوبة من قاعدة البيانات ———
// رسوم بيانية + مؤشرات جودة البيانات + أداء المنسقات — كل شيء من المصدر الوحيد (القاعدة المركزية)

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Database, FileSpreadsheet } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, formatTime } from "@/lib/time";
import { DISCOVERY_STATUS_LABELS } from "@/lib/types";

interface ReportsData {
  schools: {
    total: number;
    visited: number;
    notVisited: number;
    avgDataQuality: number;
    byGovernorate: { name: string; count: number }[];
    byType: { name: string; count: number }[];
    bySector: { government: number; private: number; unknown: number };
    contract: { contracted: number; notContracted: number };
    availability: { available: number; unavailable: number };
    discovery: { name: string; count: number }[];
    topRegions: { name: string; count: number }[];
  };
  activities: {
    today: number;
    byType: { type: string; count: number }[];
    weekly: { label: string; visits: number; calls: number; total: number }[];
  };
  coordinators: {
    id: string;
    name: string;
    schoolCount: number;
    contractedCount: number;
    visitedCount: number;
    activitiesTotal: number;
    activitiesLast7Days: number;
  }[];
  dataGaps: { missingPhone: number; missingPrincipal: number; missingCoords: number; missingRegion: number };
  system: { importLogs: number; discoverySessionsCount: number };
  updatedAt: string;
}

const PIE_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#64748b"];

export function ReportsView() {
  const { toast } = useToast();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      setData(j as ReportsData);
    } catch {
      setData(null);
      toast({ title: "تعذر جلب التقارير", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-foreground">التقارير والإحصائيات</p>
            <p className="mt-0.5 text-xs text-muted-foreground">جارٍ حساب الإحصائيات من قاعدة البيانات...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-lg font-extrabold text-foreground">التقارير والإحصائيات</p>
        <EmptyState title="تعذر جلب التقارير" description="حاول التحديث مرة أخرى." />
      </div>
    );
  }

  const s = data.schools;
  const sectorPie = [
    { name: "حكومية", value: s.bySector.government },
    { name: "أهلية", value: s.bySector.private },
    { name: "غير محدد", value: s.bySector.unknown },
  ].filter((x) => x.value > 0);

  const contractPie = [
    { name: "متعاقدة", value: s.contract.contracted },
    { name: "غير متعاقدة", value: s.contract.notContracted },
  ].filter((x) => x.value > 0);

  const gapItems = [
    { label: "بلا رقم تواصل", value: data.dataGaps.missingPhone },
    { label: "بلا اسم مدير", value: data.dataGaps.missingPrincipal },
    { label: "بلا إحداثيات جغرافية", value: data.dataGaps.missingCoords },
    { label: "بلا منطقة", value: data.dataGaps.missingRegion },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">التقارير والإحصائيات</p>
          <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
            أرقام محسوبة فعلياً من قاعدة البيانات لحظة الطلب — آخر تحديث {formatTime(data.updatedAt)}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          تحديث
        </Button>
      </div>

      {/* البطاقات الرئيسية */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "إجمالي المدارس", value: s.total },
          { label: "تمت زيارتها", value: s.visited },
          { label: "متعاقدة", value: s.contract.contracted },
          { label: "متاحة", value: s.availability.available },
          { label: "نشاطات اليوم", value: data.activities.today },
          { label: "متوسط اكتمال البيانات", value: `${s.avgDataQuality}%` },
        ].map((c) => (
          <Card key={c.label} className="p-0">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-extrabold text-primary">{c.value}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* الرسوم البيانية */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* النشاطات الأسبوعية */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-bold">النشاطات الميدانية — آخر 8 أسابيع</p>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">زيارات واتصالات مسجلة فعلياً (بتوقيت بغداد)</p>
          {data.activities.weekly.every((w) => w.total === 0) ? (
            <div className="flex h-56 items-center justify-center">
              <EmptyState compact title="لا نشاطات بعد" description="ستظهر منحنى النشاطات عند تسجيل أول زيارة أو اتصال." />
            </div>
          ) : (
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.activities.weekly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ direction: "rtl", fontSize: 12, borderRadius: 8 }} />
                  <Legend formatter={(v) => (v === "visits" ? "زيارات" : "اتصالات")} wrapperStyle={{ fontSize: 12, direction: "rtl" }} />
                  <Bar dataKey="visits" name="visits" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="calls" name="calls" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* توزيع المدارس حسب النوع */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-bold">توزيع المدارس حسب نوع المؤسسة</p>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">من حقول النوع الفعلية لكل مدرسة</p>
          {s.byType.length === 0 ? (
            <div className="flex h-56 items-center justify-center">
              <EmptyState compact title="لا مدارس بعد" description="ستظهر التوزيعات عند إدخال بيانات المدارس." />
            </div>
          ) : (
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.byType.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ direction: "rtl", fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" name="المدارس" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* القطاع */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-bold">القطاع الحكومي والأهلي</p>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">حسب القطاع الموثق لكل مدرسة</p>
          {sectorPie.length === 0 ? (
            <div className="flex h-52 items-center justify-center">
              <EmptyState compact title="لا بيانات قطاع بعد" />
            </div>
          ) : (
            <div className="h-52" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sectorPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {sectorPie.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ direction: "rtl", fontSize: 12, borderRadius: 8 }} />
                  <Legend formatter={(v: string, e) => `${v}: ${e?.payload?.value ?? 0}`} wrapperStyle={{ fontSize: 12, direction: "rtl" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* التعاقد */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-bold">حالة التعاقد</p>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">الحالات مستقلة تماماً عن حالة التوفر</p>
          {contractPie.length === 0 ? (
            <div className="flex h-52 items-center justify-center">
              <EmptyState compact title="لا مدارس بعد" />
            </div>
          ) : (
            <div className="h-52" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={contractPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    <Cell fill="#22c55e" />
                    <Cell fill="#94a3b8" />
                  </Pie>
                  <Tooltip contentStyle={{ direction: "rtl", fontSize: 12, borderRadius: 8 }} />
                  <Legend formatter={(v: string, e) => `${v}: ${e?.payload?.value ?? 0}`} wrapperStyle={{ fontSize: 12, direction: "rtl" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* جودة البيانات + فجوات الحقول */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-bold">فجوات البيانات — حقول ناقصة تحتاج استكمالاً</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            تعمل المنسقات الميدانيات على استكمالها من الميدان عبر بواباتهم
          </p>
          <div className="mt-3 space-y-2">
            {gapItems.map((g) => {
              const pct = s.total > 0 ? Math.round((g.value / s.total) * 100) : 0;
              return (
                <div key={g.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{g.label}</span>
                    <span className="font-bold text-foreground">
                      {formatNumber(g.value)} <span className="text-muted-foreground font-normal">({pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${pct > 60 ? "bg-red-400" : pct > 30 ? "bg-amber-400" : "bg-sky-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* أعلى المناطق */}
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-bold">أعلى 10 مناطق من حيث عدد المدارس</p>
          <p className="mt-0.5 text-xs text-muted-foreground">مفيد لتحديد أولويات تخصيص المنسقات</p>
          {s.topRegions.length === 0 ? (
            <div className="mt-3">
              <EmptyState compact title="لا مناطق بمدارس بعد" />
            </div>
          ) : (
            <ol className="mt-3 space-y-1.5">
              {s.topRegions.map((r, i) => (
                <li key={r.name} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-700">
                      {i + 1}
                    </span>
                    <span className="font-semibold text-foreground">{r.name}</span>
                  </span>
                  <span className="font-bold text-primary">{formatNumber(r.count)} مدرسة</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* أداء المنسقات */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-bold">أداء المنسقات الميدانيات</p>
          <p className="mt-0.5 text-xs text-muted-foreground">محسوب من مدارسها المخصصة ونشاطاتها المسجلة فعلياً</p>
        </div>
        {data.coordinators.length === 0 ? (
          <div className="p-6">
            <EmptyState compact title="لا منسقات نشطات" description="أضف منسقات من قسم المنسقات الميدانيات." />
          </div>
        ) : (
          <div className="overflow-x-auto nice-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-semibold">المنسقة</th>
                  <th className="px-4 py-2.5 text-center font-semibold">مدارسها</th>
                  <th className="px-4 py-2.5 text-center font-semibold">متعاقدة</th>
                  <th className="px-4 py-2.5 text-center font-semibold">تمت زيارتها</th>
                  <th className="px-4 py-2.5 text-center font-semibold">نشاطاتها الكلية</th>
                  <th className="px-4 py-2.5 text-center font-semibold">آخر 7 أيام</th>
                </tr>
              </thead>
              <tbody>
                {data.coordinators.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-bold text-foreground">{c.name}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-primary">{formatNumber(c.schoolCount)}</td>
                    <td className="px-4 py-2.5 text-center">{formatNumber(c.contractedCount)}</td>
                    <td className="px-4 py-2.5 text-center">{formatNumber(c.visitedCount)}</td>
                    <td className="px-4 py-2.5 text-center">{formatNumber(c.activitiesTotal)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {c.activitiesLast7Days > 0 ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                          {formatNumber(c.activitiesLast7Days)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نظام */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm font-bold">معلومات النظام</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5">
            <Database className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
            قاعدة بيانات مركزية واحدة
          </span>
          <span className="rounded-lg border px-3 py-1.5">
            جلسات اكتشاف منفذة: <b>{formatNumber(data.system.discoverySessionsCount)}</b>
          </span>
          <span className="rounded-lg border px-3 py-1.5">
            عمليات استيراد Excel: <b>{formatNumber(data.system.importLogs)}</b>
          </span>
          <span className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            التصدير من قسم المدارس
          </span>
        </div>
        {s.discovery.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {s.discovery.map((d) => (
              <Badge key={d.name} variant="outline" className="text-[11px] font-normal">
                {DISCOVERY_STATUS_LABELS[d.name] ?? d.name}: {formatNumber(d.count)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
