"use client";

// ——— قسم المراجعات اليومية — المراجعات والمتابعات المبرمجة الحقيقية ———
// ملخص اليوم: مستحقة اليوم / متأخرة / قادمة / منجزة هذا الأسبوع
// فلاتر كاملة + إنشاء مراجعة + إنجاز/إلغاء/إعادة جدولة

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, ClipboardCheck, ChevronRight, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { FOLLOW_UP_TYPE_LABELS } from "@/lib/labels";
import { formatFullDate, formatNumber, formatShortDate } from "@/lib/time";

interface FollowUpItem {
  id: string;
  title: string | null;
  type: string;
  status: string;
  schoolId: string;
  schoolName: string;
  regionName: string | null;
  coordinatorId: string | null;
  coordinatorName: string | null;
  dueDate: string;
  completedAt: string | null;
  overdue: boolean;
  notes: string | null;
}

interface FollowUpsResponse {
  total: number;
  summary: { pendingToday: number; overdue: number; upcoming: number; doneThisWeek: number };
  followUps: FollowUpItem[];
}

export function ReviewsView() {
  const { toast } = useToast();
  const [data, setData] = useState<FollowUpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "PENDING", type: "all", period: "all", coordinatorId: "all" });
  const [coordinators, setCoordinators] = useState<{ id: string; name: string }[]>([]);
  const [schoolOptions, setSchoolOptions] = useState<{ id: string; name: string; regionName: string | null }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ schoolId: "", type: "REVIEW", title: "", dueDate: "", coordinatorId: "none", notes: "" });
  const [scheduleTarget, setScheduleTarget] = useState<FollowUpItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: filters.status,
        type: filters.type,
        period: filters.period,
        coordinatorId: filters.coordinatorId,
      });
      const res = await fetch(`/api/followups?${params.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      setData(j as FollowUpsResponse);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

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
    setForm({ schoolId: "", type: "REVIEW", title: "", dueDate: "", coordinatorId: "none", notes: "" });
    setAddOpen(true);
  };

  const submit = async () => {
    if (!form.schoolId || !form.dueDate) {
      toast({ title: "أكمل الحقول المطلوبة", description: "المدرسة وموعد الاستحقاق مطلوبان.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: form.schoolId,
          type: form.type,
          title: form.title,
          dueDate: new Date(form.dueDate).toISOString(),
          coordinatorId: form.coordinatorId === "none" ? null : form.coordinatorId,
          notes: form.notes,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الإنشاء");
      toast({
        title: "أُنشئت المراجعة",
        description: form.coordinatorId !== "none" ? "ستظهر فوراً في بوابة المنسقة المخصصة لها." : "",
      });
      setAddOpen(false);
      load();
    } catch (e) {
      toast({ title: "تعذر الإنشاء", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const act = async (f: FollowUpItem, action: "complete" | "cancel" | "reopen") => {
    try {
      const res = await fetch(`/api/followups/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر التنفيذ");
      toast({
        title: action === "complete" ? "أُنجزت المراجعة" : action === "cancel" ? "أُلغيت المراجعة" : "أُعيد فتح المراجعة",
      });
      load();
    } catch (e) {
      toast({ title: "تعذر التنفيذ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const reschedule = async () => {
    if (!scheduleTarget || !scheduleDate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/followups/${scheduleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: new Date(scheduleDate).toISOString() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر إعادة الجدولة");
      toast({ title: "أُعيدت جدولة المراجعة" });
      setScheduleTarget(null);
      load();
    } catch (e) {
      toast({ title: "تعذر إعادة الجدولة", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (f: FollowUpItem) => {
    if (!window.confirm(`حذف المراجعة «${f.title ?? f.schoolName}»؟ هذا سجل فعلي — الحذف لا يُسترد.`)) return;
    try {
      const res = await fetch(`/api/followups/${f.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      toast({ title: "حُذفت المراجعة" });
      load();
    } catch (e) {
      toast({ title: "تعذر الحذف", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const statusBadge = (f: FollowUpItem) => {
    if (f.status === "DONE")
      return <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">منجزة</Badge>;
    if (f.status === "CANCELLED")
      return <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">ملغاة</Badge>;
    if (f.overdue)
      return <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">متأخرة</Badge>;
    return <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">معلقة</Badge>;
  };

  const summaryCards = data
    ? [
        { label: "مستحقة اليوم", value: data.summary.pendingToday, tone: "text-sky-600" },
        { label: "متأخرة عن موعدها", value: data.summary.overdue, tone: "text-red-600" },
        { label: "قادمة", value: data.summary.upcoming, tone: "text-amber-600" },
        { label: "منجزة آخر 7 أيام", value: data.summary.doneThisWeek, tone: "text-emerald-600" },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">المراجعات اليومية</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            مراجعات ومتابعات مبرمجة على مدارس محددة — المراجعات المخصصة لمنسقة تظهر في بوابتها مباشرة.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="icon" onClick={load} aria-label="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <Button type="button" onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            مراجعة جديدة
          </Button>
        </div>
      </div>

      {summaryCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summaryCards.map((s) => (
            <Card key={s.label} className="p-0">
              <CardContent className="p-3 text-center">
                <p className={`text-2xl font-extrabold ${s.tone}`}>{formatNumber(s.value)}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* الفلاتر */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <Select
          value={filters.status}
          onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        >
          <SelectTrigger className="w-[140px]" aria-label="فلتر الحالة"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="PENDING">المعلقة</SelectItem>
            <SelectItem value="DONE">المنجزة</SelectItem>
            <SelectItem value="CANCELLED">الملغاة</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.type}
          onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}
        >
          <SelectTrigger className="w-[130px]" aria-label="فلتر النوع"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            <SelectItem value="REVIEW">مراجعة</SelectItem>
            <SelectItem value="FOLLOW_UP">متابعة</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.period}
          onValueChange={(v) => setFilters((f) => ({ ...f, period: v }))}
        >
          <SelectTrigger className="w-[150px]" aria-label="فلتر الموعد"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المواعيد</SelectItem>
            <SelectItem value="today">مستحقة اليوم</SelectItem>
            <SelectItem value="overdue">المتأخرة</SelectItem>
            <SelectItem value="week">هذا الأسبوع</SelectItem>
            <SelectItem value="upcoming">القادمة</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.coordinatorId}
          onValueChange={(v) => setFilters((f) => ({ ...f, coordinatorId: v }))}
        >
          <SelectTrigger className="w-[170px]" aria-label="فلتر المنسقة"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المنسقات</SelectItem>
            <SelectItem value="none_only">بلا منسقة</SelectItem>
            {coordinators.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!data && loading && (
        <div className="rounded-xl border bg-white p-6">
          <p className="text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
        </div>
      )}

      {data && data.followUps.length === 0 && (
        <EmptyState
          icon={ClipboardCheck}
          title="لا مراجعات مطابقة"
          description="أنشئ مراجعة جديدة لجدولة أعمال اليوم — المراجعات التي تخصص لمنسقة تظهر في بوابتها فوراً وترتبط بحسابها."
        />
      )}

      {data && data.followUps.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto nice-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-semibold">الاستحقاق</th>
                  <th className="px-4 py-2.5 text-start font-semibold">المدرسة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">الوصف</th>
                  <th className="px-4 py-2.5 text-start font-semibold">النوع</th>
                  <th className="px-4 py-2.5 text-start font-semibold">المنسقة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">الحالة</th>
                  <th className="px-4 py-2.5 text-center font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.followUps.map((f) => (
                  <tr key={f.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 whitespace-nowrap" suppressHydrationWarning>
                      <p className="text-xs font-semibold text-foreground">{formatFullDate(f.dueDate)}</p>
                      {f.completedAt && (
                        <p className="text-[11px] text-muted-foreground">
                          أُنجزت {formatShortDate(f.completedAt)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-foreground">{f.schoolName}</p>
                      {f.regionName && <p className="text-[11px] text-muted-foreground">{f.regionName}</p>}
                    </td>
                    <td className="px-4 py-2.5 max-w-[220px]">
                      <p className="text-xs leading-relaxed">{f.title ?? "—"}</p>
                      {f.notes && <p className="mt-0.5 text-[11px] text-muted-foreground">{f.notes}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{FOLLOW_UP_TYPE_LABELS[f.type] ?? f.type}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{f.coordinatorName ?? "—"}</td>
                    <td className="px-4 py-2.5">{statusBadge(f)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        {f.status === "PENDING" && (
                          <>
                            <Button type="button" size="sm" className="h-7 text-xs" onClick={() => act(f, "complete")}>
                              إنجاز
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setScheduleTarget(f);
                                setScheduleDate(f.dueDate.slice(0, 16));
                              }}
                            >
                              جدولة
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => act(f, "cancel")}>
                              إلغاء
                            </Button>
                          </>
                        )}
                        {f.status !== "PENDING" && (
                          <>
                            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => act(f, "reopen")}>
                              إعادة فتح
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-600"
                              aria-label="حذف"
                              onClick={() => remove(f)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* مراجعة جديدة */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>مراجعة أو متابعة جديدة</DialogTitle>
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
              <Label className="text-xs">النوع</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REVIEW">مراجعة</SelectItem>
                  <SelectItem value="FOLLOW_UP">متابعة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">موعد الاستحقاق *</Label>
              <Input
                type="datetime-local"
                className="text-start"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">وصف المراجعة</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="مثال: مراجعة بيانات المدير وتحديث رقم التواصل"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">المنسقة المخصصة لها (اختياري)</Label>
              <Select value={form.coordinatorId} onValueChange={(v) => setForm((f) => ({ ...f, coordinatorId: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بلا منسقة — للإدارة</SelectItem>
                  {coordinators.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                عند تخصيصها لمنسقة تظهر فوراً في تبويب «مراجعاتي» في بوابتها الميدانية.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={submit} disabled={saving}>{saving ? "جارٍ الإنشاء..." : "إنشاء المراجعة"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إعادة جدولة */}
      <Dialog open={Boolean(scheduleTarget)} onOpenChange={(o) => !o && setScheduleTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إعادة جدولة المراجعة</DialogTitle>
          </DialogHeader>
          <p className="truncate text-xs text-muted-foreground">{scheduleTarget?.schoolName}</p>
          <div className="space-y-1.5">
            <Label className="text-xs">الموعد الجديد *</Label>
            <Input
              type="datetime-local"
              className="text-start"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScheduleTarget(null)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={reschedule} disabled={saving || !scheduleDate}>{saving ? "جارٍ الحفظ..." : "حفظ الموعد"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
