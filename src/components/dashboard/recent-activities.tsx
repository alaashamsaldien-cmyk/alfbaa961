"use client";

import { Activity } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { activityTypeMeta, ACTIVITY_PERIOD_OPTIONS } from "@/lib/labels";
import { formatFullDate, formatTime, formatNumber } from "@/lib/time";
import type { RecentActivityItem, ActivityPeriod } from "@/lib/dashboard";

export function RecentActivities({
  items,
  period,
  onPeriodChange,
  loading,
}: {
  items: RecentActivityItem[];
  period: ActivityPeriod;
  onPeriodChange: (p: ActivityPeriod) => void;
  loading: boolean;
}) {
  const { toast } = useToast();

  return (
    <section aria-labelledby="activities-heading">
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id="activities-heading" className="text-base font-bold text-foreground">
              آخر النشاطات
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              أحدث عمليات التواصل والزيارات المسجلة — الفلتر الزمني لا يؤثر على إجمالي المدارس
            </p>
          </div>
          <Select value={period} onValueChange={(v) => onPeriodChange(v as ActivityPeriod)}>
            <SelectTrigger className="w-40" aria-label="فلترة النشاطات حسب الفترة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="لا توجد أنشطة مسجلة في هذه الفترة"
            description="ستظهر هنا أحدث الزيارات والمكالمات والموافقات والتعاقدات فور تسجيلها في قسم الزيارات والتواصل."
          />
        ) : (
          <div className="nice-scroll max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow className="hover:bg-slate-50">
                  <TableHead className="text-start font-bold text-slate-600">التاريخ والوقت</TableHead>
                  <TableHead className="text-start font-bold text-slate-600">اسم المدرسة</TableHead>
                  <TableHead className="text-start font-bold text-slate-600">المنطقة</TableHead>
                  <TableHead className="text-start font-bold text-slate-600">المنسقة</TableHead>
                  <TableHead className="text-start font-bold text-slate-600">نوع النشاط</TableHead>
                  <TableHead className="text-start font-bold text-slate-600">نتيجة النشاط</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const meta = activityTypeMeta(item.type);
                  return (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() =>
                        toast({
                          title: "تفاصيل النشاط",
                          description:
                            "سيتم فتح تفاصيل هذا النشاط مباشرة بعد تنفيذ قسم الزيارات والتواصل في المرحلة القادمة.",
                        })
                      }
                    >
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <div title={formatFullDate(item.occurredAt)}>
                          {formatFullDate(item.occurredAt)}
                          <span className="mx-1 text-border">|</span>
                          {formatTime(item.occurredAt)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-semibold text-foreground">
                        {item.schoolName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.regionName ?? <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.coordinatorName ?? <span className="text-muted-foreground/60">غير مخصصة</span>}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {item.result ?? <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="border-t px-5 py-3 text-xs text-muted-foreground">
              عرض أحدث {formatNumber(items.length)} نشاط
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
