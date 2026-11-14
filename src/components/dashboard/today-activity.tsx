"use client";

import { Route, Phone, ThumbsUp, FileSignature } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber, formatFullDate } from "@/lib/time";
import type { TodayActivity as TodayActivityData } from "@/lib/dashboard";

const TILES = [
  {
    key: "visits" as const,
    label: "الزيارات الميدانية",
    icon: Route,
    tileClass: "bg-primary/5",
    iconClass: "bg-primary/10 text-primary",
  },
  {
    key: "calls" as const,
    label: "الاتصالات الهاتفية",
    icon: Phone,
    tileClass: "bg-sky-50",
    iconClass: "bg-sky-100 text-sky-700",
  },
  {
    key: "initialApprovals" as const,
    label: "الموافقات الأولية",
    icon: ThumbsUp,
    tileClass: "bg-emerald-50",
    iconClass: "bg-emerald-100 text-emerald-700",
  },
  {
    key: "contracts" as const,
    label: "التعاقدات الجديدة",
    icon: FileSignature,
    tileClass: "bg-green-50",
    iconClass: "bg-green-100 text-green-700",
  },
];

export function TodayActivity({
  data,
  loading,
  todayDate,
}: {
  data: TodayActivityData | null;
  loading: boolean;
  todayDate: string;
}) {
  return (
    <section aria-labelledby="today-heading">
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <div>
            <h2 id="today-heading" className="text-base font-bold text-foreground">
              نشاط اليوم
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {todayDate ? `الأنشطة المسجلة بتاريخ ${todayDate}` : "الأنشطة المسجلة اليوم"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
          {loading || !data
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-muted/60 p-4">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Skeleton className="mt-3 h-7 w-10" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </div>
              ))
            : TILES.map((tile) => {
                const Icon = tile.icon;
                return (
                  <div key={tile.key} className={cn("rounded-lg p-4", tile.tileClass)}>
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", tile.iconClass)}>
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-2xl font-extrabold tabular-nums text-foreground">
                      {formatNumber(data[tile.key])}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">{tile.label}</p>
                  </div>
                );
              })}
        </div>
      </div>
    </section>
  );
}
