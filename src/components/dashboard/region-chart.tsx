"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { MapPinned, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/time";
import type { RegionDistributionItem } from "@/lib/dashboard";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div dir="rtl" className="rounded-lg border bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-bold text-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        عدد المدارس: <span className="font-bold text-primary">{formatNumber(value)}</span>
      </p>
    </div>
  );
}

export function RegionChart({
  data,
  unassigned,
  loading,
}: {
  data: RegionDistributionItem[];
  unassigned: number;
  loading: boolean;
}) {
  const { toast } = useToast();
  const hasRegions = data.length > 0;

  return (
    <section aria-labelledby="regions-heading">
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="regions-heading" className="text-base font-bold text-foreground">
              توزيع المدارس حسب المناطق
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              يتحدث الرسم تلقائياً عند إضافة مدارس أو مناطق جديدة
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cnUnassigned(unassigned)}
            onClick={() =>
              toast({
                title: `عدد المدارس التي لم يتم تخصيصها لأي منسقة: ${formatNumber(unassigned)}`,
                description:
                  "سيتم فتح قائمة المدارس مع فلتر «غير مخصصة لمنسقة» بعد تنفيذ قسم توزيع المدارس والمناطق.",
              })
            }
          >
            <UserRoundX className="h-4 w-4 text-orange-600" aria-hidden="true" />
            <span>
              مدارس بدون منسقة: <strong className="tabular-nums">{formatNumber(unassigned)}</strong>
            </span>
          </Button>
        </div>
        <div className="p-5">
          {loading ? (
            <Skeleton className="h-[320px] w-full rounded-lg" />
          ) : !hasRegions ? (
            <EmptyState
              icon={MapPinned}
              title="لا توجد مناطق أو مدارس مسجلة بعد"
              description="ستظهر بيانات التوزيع هنا تلقائياً بمجرد إضافة المناطق والمدارس إلى قاعدة البيانات."
            />
          ) : (
            <div dir="ltr" className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf0" />
                  <XAxis
                    dataKey="regionName"
                    reversed
                    tick={{ fontSize: 12, fill: "#5c6b7c", fontFamily: "inherit" }}
                    tickLine={false}
                    axisLine={{ stroke: "#d8dfe8" }}
                    interval={0}
                  />
                  <YAxis
                    orientation="right"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#5c6b7c" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(14, 42, 71, 0.04)" }} />
                  <Bar
                    dataKey="schoolCount"
                    name="عدد المدارس"
                    fill="#0e2a47"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={56}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function cnUnassigned(unassigned: number): string {
  return unassigned > 0
    ? "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100"
    : "text-muted-foreground";
}
