"use client";

// ——— قسم الزيارات والتواصل — سجل النشاطات الحقيقي من قاعدة البيانات ———
// فلاتر: النوع، المنسقة، الفترة، البحث بالاسم — وتسجيل نشاط جديد من الإدارة

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, PhoneCall, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { ACTIVITY_TYPE_META, activityTypeMeta } from "@/lib/labels";
import { ACTIVITY_PERIOD_OPTIONS } from "@/lib/labels";
import { formatFullDate, formatNumber, formatTime } from "@/lib/time";
import { SchoolVisitsTable } from "@/components/visits/school-visits-table";

interface ActivityItem {
  id: string;
  type: string;
  occurredAt: string;
  schoolId: string;
  schoolName: string;
  regionName: string | null;
  coordinatorId: string | null;
  coordinatorName: string | null;
  userName: string | null;
  result: string | null;
  notes: string | null;
}

interface ActivitiesResponse {
  total: number;
  page: number;
  pageSize: number;
  activities: ActivityItem[];
  typeCounts: { type: string; count: number }[];
}

interface CoordinatorOption {
  id: string;
  name: string;
}

interface SchoolOption {
  id: string;
  name: string;
  regionName: string | null;
}

export function VisitsView() {
  const { toast } = useToast();
  const [data, setData] = useState<ActivitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: "all", coordinatorId: "all", period: "all", q: "" });
  const [page, setPage] = useState(1);
  const [coordinators, setCoordinators] = useState<CoordinatorOption[]>([]);
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ schoolId: "", type: "VISIT", coordinatorId: "none", occurredAt: "", result: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: filters.type,
        coordinatorId: filters.coordinatorId,
        period: filters.period,
        page: String(page),
        pageSize: "25",
      });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      const res = await fetch(`/api/activities?${params.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      setData(j as ActivitiesResponse);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  // خيارات المنسقات والمدارس للحوار
  useEffect(() => {
    fetch("/api/coordinators", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCoordinators(j?.coordinators ?? []))
      .catch(() => setCoordinators([]));
    fetch("/api/schools?limit=1000", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) =>
        setSchoolOptions(
          (j?.schools ?? []).map((s: { id: string; name: string; regionName?: string | null }) => ({
            id: s.id,
            name: s.name,
            regionName: s.regionName ?? null,
          }))
        )
      )
      .catch(() => setSchoolOptions([]));
  }, []);

  const openAdd = () => {
    setForm({ schoolId: "", type: "VISIT", coordinatorId: "none", occurredAt: "", result: "", notes: "" });
    setAddOpen(true);
  };

  const submit = async () => {
    if (!form.schoolId) {
      toast({ title: "اختر المدرسة", variant: "destructive" });
      return;
    }
    if (!form.result.trim() && !form.notes.trim()) {
      toast({ title: "اكتب نتيجة النشاط أو ملاحظة", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: form.schoolId,
          type: form.type,
          coordinatorId: form.coordinatorId === "none" ? null : form.coordinatorId,
          occurredAt: form.occurredAt || undefined,
          result: form.result,
          notes: form.notes,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر التسجيل");
      toast({ title: "سُجل النشاط", description: "أُضيف إلى السجل المركزي وسيظهر في لوحة التحكم." });
      setAddOpen(false);
      load();
    } catch (e) {
      toast({ title: "تعذر التسجيل", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const summary = data?.typeCounts ?? [];
  const summaryMap: Record<string, number> = {};
  for (const t of summary) summaryMap[t.type] = t.count;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">الزيارات والتواصل</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            سجل فعلي لكل نشاط: زيارات، اتصالات، موافقات، تعاقدات، وتحديثات ميدانية — من الإدارة والمنسقات والموظفين.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="icon" onClick={load} aria-label="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <Button type="button" onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            تسجيل نشاط تواصل
          </Button>
        </div>
      </div>

      <Tabs defaultValue="employee-visits" className="space-y-3">
        <TabsList>
          <TabsTrigger value="employee-visits">استبيانات الزيارات</TabsTrigger>
          <TabsTrigger value="activities">سجل التواصل العام</TabsTrigger>
        </TabsList>

        <TabsContent value="employee-visits">
          <SchoolVisitsTable />
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">

      {/* ملخص النوع المفلتر */}
      {data && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {(["VISIT", "CALL", "INITIAL_APPROVAL", "CONTRACT", "FIELD_UPDATE", "OTHER"] as const).map((t) => {
            const meta = ACTIVITY_TYPE_META[t];
            return (
              <Card key={t} className="p-0">
                <CardContent className="p-3 text-center">
                  <p className="text-xl font-extrabold text-primary">{formatNumber(summaryMap[t] ?? 0)}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{meta.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* الفلاتر */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <Select
          value={filters.type}
          onValueChange={(v) => {
            setFilters((f) => ({ ...f, type: v }));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]" aria-label="فلتر النوع"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            {Object.entries(ACTIVITY_TYPE_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.coordinatorId}
          onValueChange={(v) => {
            setFilters((f) => ({ ...f, coordinatorId: v }));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[170px]" aria-label="فلتر المنسقة"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المنسقات</SelectItem>
            {coordinators.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.period}
          onValueChange={(v) => {
            setFilters((f) => ({ ...f, period: v }));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]" aria-label="فلتر الفترة"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTIVITY_PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-[200px]"
          placeholder="بحث باسم المدرسة..."
          value={filters.q}
          onChange={(e) => {
            setFilters((f) => ({ ...f, q: e.target.value }));
            setPage(1);
          }}
        />
      </div>

      {/* الجدول */}
      {!data && loading && (
        <div className="rounded-xl border bg-white p-6">
          <p className="text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
        </div>
      )}

      {data && data.activities.length === 0 && (
        <EmptyState
          icon={PhoneCall}
          title="لا نشاطات مطابقة"
          description="لا توجد نشاطات بهذه الفلاتر. سجل نشاطاً جديداً أو عدّل الفلاتر — نشاطات المنسقات الميدانية تظهر هنا تلقائياً عند تسجيلها من بواباتهم."
        />
      )}

      {data && data.activities.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto nice-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-semibold">التاريخ والوقت</th>
                  <th className="px-4 py-2.5 text-start font-semibold">المدرسة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">النوع</th>
                  <th className="px-4 py-2.5 text-start font-semibold">المنسقة / المسجل</th>
                  <th className="px-4 py-2.5 text-start font-semibold">النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {data.activities.map((a) => {
                  const meta = activityTypeMeta(a.type);
                  const actor = a.coordinatorName ?? a.userName ?? "—";
                  return (
                    <tr key={a.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 whitespace-nowrap" suppressHydrationWarning>
                        <p className="text-xs font-semibold text-foreground">{formatFullDate(a.occurredAt)}</p>
                        <p className="text-[11px] text-muted-foreground">{formatTime(a.occurredAt)}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-foreground">{a.schoolName}</p>
                        {a.regionName && <p className="text-[11px] text-muted-foreground">{a.regionName}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-[10px] ${meta.badge}`}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{actor}</td>
                      <td className="px-4 py-2.5 max-w-[280px]">
                        <p className="text-xs leading-relaxed text-foreground">{a.result ?? "—"}</p>
                        {a.notes && <p className="mt-0.5 text-[11px] text-muted-foreground">{a.notes}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2.5">
              <p className="text-xs text-muted-foreground">
                صفحة {formatNumber(data.page)} من {formatNumber(totalPages)} — إجمالي {formatNumber(data.total)} نشاط
              </p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="السابق"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="التالي"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
        </TabsContent>
      </Tabs>

      {/* حوار تسجيل نشاط */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل نشاط تواصل</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">المدرسة *</Label>
              <Select value={form.schoolId} onValueChange={(v) => setForm((f) => ({ ...f, schoolId: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر المدرسة" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {schoolOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.regionName ? ` — ${s.regionName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نوع النشاط</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TYPE_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المنسقة ذات العلاقة</Label>
              <Select value={form.coordinatorId} onValueChange={(v) => setForm((f) => ({ ...f, coordinatorId: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بلا منسقة</SelectItem>
                  {coordinators.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">تاريخ ووقت النشاط (افتراضياً الآن)</Label>
              <Input
                dir="ltr"
                type="datetime-local"
                className="text-start"
                value={form.occurredAt}
                onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">نتيجة النشاط *</Label>
              <Textarea
                rows={3}
                value={form.result}
                onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
                placeholder="مثال: اجتمعت بمدير المدرسة وتمت الموافقة المبدئية على الدخول للمنصة"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">ملاحظات إضافية</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={submit} disabled={saving}>{saving ? "جارٍ التسجيل..." : "تسجيل النشاط"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
