"use client";

import {
  Building2,
  CheckCircle2,
  Clock,
  FileCheck,
  FileX,
  DoorOpen,
  DoorClosed,
  ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/time";
import type { SchoolStats } from "@/lib/dashboard";

interface StatCardConfig {
  key: keyof SchoolStats;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  /** ألوان الحالة: أخضر للنجاح والتعاقد، برتقالي للمتابعات، أحمر للانتباه */
  boxClass: string;
  numberClass: string;
  filterName: string;
}

const STAT_CARDS: StatCardConfig[] = [
  {
    key: "total",
    title: "إجمالي المدارس",
    hint: "كل المدارس المسجلة في النظام",
    icon: Building2,
    boxClass: "bg-primary/5 text-primary",
    numberClass: "text-primary",
    filterName: "إجمالي المدارس",
  },
  {
    key: "visited",
    title: "مدارس تمت زيارتها",
    hint: "لها زيارة ميدانية مسجلة",
    icon: CheckCircle2,
    boxClass: "bg-green-50 text-green-600",
    numberClass: "text-green-700",
    filterName: "المدارس التي تمت زيارتها",
  },
  {
    key: "notVisited",
    title: "مدارس لم تتم زيارتها",
    hint: "لم تُسجل لها أي زيارة بعد",
    icon: Clock,
    boxClass: "bg-orange-50 text-orange-600",
    numberClass: "text-orange-700",
    filterName: "المدارس التي لم تتم زيارتها",
  },
  {
    key: "contracted",
    title: "مدارس متعاقدة",
    hint: "متعاقدة مع منصة ألف باء",
    icon: FileCheck,
    boxClass: "bg-green-50 text-green-600",
    numberClass: "text-green-700",
    filterName: "المدارس المتعاقدة مع منصة ألف باء",
  },
  {
    key: "notContracted",
    title: "مدارس غير متعاقدة",
    hint: "لا يوجد تعاقد حتى الآن",
    icon: FileX,
    boxClass: "bg-slate-100 text-slate-600",
    numberClass: "text-slate-700",
    filterName: "المدارس غير المتعاقدة",
  },
  {
    key: "available",
    title: "مدارس متاحة",
    hint: "متاحة للعمل والزيارة",
    icon: DoorOpen,
    boxClass: "bg-sky-50 text-sky-600",
    numberClass: "text-sky-700",
    filterName: "المدارس المتاحة",
  },
  {
    key: "unavailable",
    title: "مدارس غير متاحة",
    hint: "غير متاحة حالياً — تحتاج متابعة",
    icon: DoorClosed,
    boxClass: "bg-red-50 text-red-600",
    numberClass: "text-red-700",
    filterName: "المدارس غير المتاحة",
  },
  {
    key: "dueReviews",
    title: "المراجعات المستحقة",
    hint: "مراجعات معلقة انتهى موعدها أو يستحق اليوم",
    icon: ClipboardList,
    boxClass: "bg-orange-50 text-orange-600",
    numberClass: "text-orange-700",
    filterName: "المراجعات المستحقة",
  },
];

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-8 w-14" />
      </div>
      <Skeleton className="mt-4 h-4 w-28" />
      <Skeleton className="mt-2 h-3 w-36" />
    </div>
  );
}

export function StatCards({ stats, loading }: { stats: SchoolStats | null; loading: boolean }) {
  const { toast } = useToast();

  return (
    <section aria-labelledby="stats-heading" className="space-y-3">
      <h2 id="stats-heading" className="sr-only">الإحصائيات الرئيسية للمدارس</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !stats
          ? Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
          : STAT_CARDS.map((card) => {
              const Icon = card.icon;
              const value = stats[card.key];
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() =>
                    toast({
                      title: `فلتر «${card.filterName}»`,
                      description:
                        "سيتم الانتقال إلى قائمة المدارس مع تطبيق هذا الفلتر تلقائياً بعد تنفيذ قسم المدارس في المرحلة القادمة.",
                    })
                  }
                  className="group rounded-xl border bg-card p-5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", card.boxClass)}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className={cn("text-3xl font-extrabold tabular-nums", card.numberClass)}>
                      {formatNumber(value)}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-bold text-foreground">{card.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.hint}</p>
                </button>
              );
            })}
      </div>
    </section>
  );
}
