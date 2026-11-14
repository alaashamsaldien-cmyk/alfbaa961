"use client";

import { CalendarCheck, AlertTriangle, CalendarClock, School as SchoolIcon, UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";
import { daysOverdue, formatTime, formatShortDate } from "@/lib/time";
import { FOLLOW_UP_TYPE_LABELS } from "@/lib/labels";
import type { FollowUpItem, FollowUpsData } from "@/lib/dashboard";

function FollowUpList({
  items,
  variant,
}: {
  items: FollowUpItem[];
  variant: "today" | "overdue" | "upcoming";
}) {
  if (items.length === 0) {
    const emptyByVariant = {
      today: {
        title: "لا توجد مراجعات اليوم",
        description: "ستظهر هنا المراجعات التي يُستحق موعدها اليوم فور تسجيلها.",
      },
      overdue: {
        title: "لا توجد مراجعات متأخرة",
        description: "أحسنت — لا توجد مراجعات تجاوزت موعدها المستحق.",
      },
      upcoming: {
        title: "لا توجد مواعيد متابعة قادمة",
        description: "ستظهر هنا مواعيد المتابعة المجدولة بعد اليوم.",
      },
    }[variant];

    return <EmptyState icon={CalendarCheck} title={emptyByVariant.title} description={emptyByVariant.description} compact />;
  }

  return (
    <ul className="nice-scroll max-h-72 space-y-2 overflow-y-auto pe-1">
      {items.map((item) => {
        const overdueDays = variant === "overdue" ? daysOverdue(item.dueDate) : 0;
        return (
          <li
            key={item.id}
            className={cn(
              "rounded-lg border bg-white p-3",
              variant === "overdue" && "border-red-100 bg-red-50/40",
              variant === "today" && "border-sky-100 bg-sky-50/40",
              variant === "upcoming" && "border-orange-100 bg-orange-50/30"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                {item.schoolName}
              </p>
              {variant === "today" && (
                <span className="shrink-0 rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                  {formatTime(item.dueDate)}
                </span>
              )}
              {variant === "overdue" && (
                <span className="shrink-0 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
                  {overdueDays === 1 ? "متأخرة يوماً واحداً" : overdueDays === 2 ? "متأخرة يومين" : `متأخرة ${overdueDays} أيام`}
                </span>
              )}
              {variant === "upcoming" && (
                <span className="shrink-0 rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                  {formatShortDate(item.dueDate)}
                </span>
              )}
            </div>
            {item.title && (
              <p className="mt-1 truncate text-xs text-muted-foreground">{item.title}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {item.regionName && (
                <span className="flex items-center gap-1">
                  <SchoolIcon className="h-3 w-3" aria-hidden="true" />
                  {item.regionName}
                </span>
              )}
              {item.coordinatorName && (
                <span className="flex items-center gap-1">
                  <UserRound className="h-3 w-3" aria-hidden="true" />
                  {item.coordinatorName}
                </span>
              )}
              {variant !== "today" && (
                <span>
                  {FOLLOW_UP_TYPE_LABELS[item.type] ?? item.type}
                  {" — "}
                  {formatShortDate(item.dueDate)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function FollowUpsPanel({ data, loading }: { data: FollowUpsData | null; loading: boolean }) {
  const panels = [
    {
      key: "today" as const,
      title: "مراجعات اليوم",
      icon: CalendarCheck,
      headerClass: "text-primary",
      iconClass: "bg-primary/10 text-primary",
      items: data?.todayReviews ?? [],
    },
    {
      key: "overdue" as const,
      title: "المراجعات المتأخرة",
      icon: AlertTriangle,
      headerClass: "text-red-700",
      iconClass: "bg-red-50 text-red-600",
      items: data?.overdueReviews ?? [],
    },
    {
      key: "upcoming" as const,
      title: "مواعيد المتابعة القادمة",
      icon: CalendarClock,
      headerClass: "text-orange-700",
      iconClass: "bg-orange-50 text-orange-600",
      items: data?.upcomingFollowUps ?? [],
    },
  ];

  return (
    <section aria-labelledby="followups-heading">
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 id="followups-heading" className="text-base font-bold text-foreground">
            المتابعات
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            المراجعات المبرمجة ومواعيد المتابعة المرتبطة بالمدارس والمنسقات
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
          {panels.map((panel) => {
            const Icon = panel.icon;
            return (
              <div key={panel.key} className="rounded-xl border bg-muted/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", panel.iconClass)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className={cn("text-sm font-bold", panel.headerClass)}>{panel.title}</h3>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-muted-foreground ring-1 ring-border">
                    {loading ? "..." : panel.items.length}
                  </span>
                </div>
                {loading || !data ? <PanelSkeleton /> : <FollowUpList items={panel.items} variant={panel.key} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
