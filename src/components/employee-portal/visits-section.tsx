"use client";

// ——— بوابة الموظف: قائمة زياراته (أو زيارات الجميع إن منح المدير صلاحية الإدارة) ———
// + فلتر تاريخ مخصص (بداية/نهاية بتوقيت بغداد) + تصدير Excel وفق صلاحية «تصدير البيانات».
import { useCallback, useEffect, useState } from "react";
import { CalendarX2, Download, Eye, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatFullDate, formatNumber, formatTime } from "@/lib/time";
import { VISIT_CONTACT_TYPE_LABELS, VISIT_RESULT_LABELS } from "@/components/visits/school-visits-table";

const NEEDS_LABELS: Record<string, string> = {
  PAINT: "طلاء",
  SEATS: "مقاعد",
  SMART_SCREEN: "شاشة ذكية",
  AC: "تكييف",
  NONE: "لا تحتاج إلى شيء",
  OTHER: "أخرى",
};

interface MyVisitRow {
  id: string;
  contactType: string;
  contactOther: string | null;
  result: string;
  resultOther: string | null;
  rejectionReason: string | null;
  contactPersonName: string | null;
  needs: string[];
  needsOther: string | null;
  subscribersCount: number | null;
  nextFollowUpAt: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  schoolId: string;
  schoolName: string;
  schoolAddress: string | null;
  regionName: string | null;
  employeeName: string | null;
  isMine: boolean;
}

export function EmployeeVisitsSection({ canManage, canExport }: { canManage: boolean; canExport: boolean }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<MyVisitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState("all");
  const [contactType, setContactType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<MyVisitRow | null>(null);

  const filterParams = useCallback(() => {
    const params = new URLSearchParams({ period, contactType });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params;
  }, [period, contactType, dateFrom, dateTo]);

  const load = useCallback(async (background = false, signal?: AbortSignal) => {
    if (!background) setLoading(true);
    try {
      const res = await fetch(`/api/employee/visits?${filterParams().toString()}&pageSize=30`, { cache: "no-store", signal });
      const j = await res.json();
      if (res.ok) {
        setRows(j.visits ?? []);
        setTotal(j.total ?? 0);
      } else if (!background) {
        toast({ title: "تعذر جلب الزيارات", description: j?.error, variant: "destructive" });
      }
    } catch {
      if (!background && !signal?.aborted) toast({ title: "تعذر جلب الزيارات", variant: "destructive" });
    } finally {
      if (!background && !signal?.aborted) setLoading(false);
    }
  }, [filterParams, toast]);

  useEffect(() => {
    const controller = new AbortController();
    load(false, controller.signal);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(true, controller.signal);
    }, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load]);

  // الفترة الجاهزة والنطاق المخصص يتبادلان — تحديد تاريخ يعيد الفترة إلى «الكل»
  const setPeriodSafe = (v: string) => { setPeriod(v); setDateFrom(""); setDateTo(""); };
  const setDate = (key: "dateFrom" | "dateTo", v: string) => { if (key === "dateFrom") { setDateFrom(v); setPeriod("all"); } else { setDateTo(v); setPeriod("all"); } };
  const hasCustomRange = Boolean(dateFrom || dateTo);

  // تصدير Excel — الخادم يتحقق من صلاحية «تصدير البيانات» ويحدد نطاق البيانات حصراً
  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/employee/visits/export?${filterParams().toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "تعذر التصدير");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `زياراتي_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "صدر ملف Excel", description: `${total} سجل زيارة بالفلاتر الحالية.` });
    } catch (e) {
      toast({ title: "تعذر تصدير الزيارات", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-extrabold text-foreground">الزيارات والتواصل</p>
          <p className="text-[11px] text-muted-foreground">
            {canManage ? "لديك صلاحية الاطلاع على زيارات الموظفين الآخرين" : "زياراتك المسجلة — كل زيارة سجل دائم مستقل"}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriodSafe}>
            <SelectTrigger className="w-[130px] bg-white" aria-label="فترة"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفترات</SelectItem>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="week">آخر 7 أيام</SelectItem>
              <SelectItem value="month">آخر 30 يوماً</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => load()} aria-label="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* فلتر تاريخ مخصص (بتوقيت بغداد) + زر التصدير */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={contactType} onValueChange={setContactType}>
          <SelectTrigger className="h-9 w-full bg-white" aria-label="نوع التواصل"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل أنواع التواصل</SelectItem>
            {Object.entries(VISIT_CONTACT_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-1 items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground">من</span>
          <Input
            type="date"
            className="h-8 flex-1 border-0 bg-transparent px-1 text-xs shadow-none"
            value={dateFrom}
            onChange={(e) => setDate("dateFrom", e.target.value)}
            aria-label="تاريخ البداية"
          />
          <span className="text-[10px] font-semibold text-muted-foreground">إلى</span>
          <Input
            type="date"
            className="h-8 flex-1 border-0 bg-transparent px-1 text-xs shadow-none"
            value={dateTo}
            onChange={(e) => setDate("dateTo", e.target.value)}
            aria-label="تاريخ النهاية"
          />
          {hasCustomRange && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => { setDateFrom(""); setDateTo(""); setPeriod("all"); }}
              aria-label="مسح نطاق التاريخ"
              title="مسح نطاق التاريخ المخصص"
            >
              <CalendarX2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </Button>
          )}
        </div>
        {canExport && (
          <Button type="button" variant="outline" className="h-9 gap-1.5 text-xs" onClick={exportExcel} disabled={exporting || loading}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
            تصدير Excel
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">الإجمالي: {formatNumber(total)}</p>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border bg-white p-6 text-muted-foreground">
          <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" /> جارٍ التحميل...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="text-sm font-bold text-foreground">لا زيارات بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">سجّل أول زيارة من أيقونة «تسجيل زيارة للمدرسة».</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setDetail(v)}
              className="w-full rounded-xl border bg-white p-3 text-start shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{v.schoolName}</p>
                  {v.schoolAddress && <p className="text-xs text-muted-foreground">{v.schoolAddress}</p>}
                  <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                    {formatFullDate(v.createdAt)} · {formatTime(v.createdAt)}
                    {!v.isMine && v.employeeName ? ` · المسجلة من: ${v.employeeName}` : ""}
                  </p>
                </div>
                <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-200">
                  {v.contactOther ?? VISIT_CONTACT_TYPE_LABELS[v.contactType] ?? v.contactType}
                </Badge>
                <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                  {v.result === "OTHER" && v.resultOther ? v.resultOther : VISIT_RESULT_LABELS[v.result] ?? v.result}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>{detail?.schoolName}</DialogTitle>
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              {detail && `${formatFullDate(detail.createdAt)} · ${formatTime(detail.createdAt)}`}
            </p>
          </DialogHeader>
          {detail && (
            <div className="space-y-1.5 text-xs">
              {[
                { label: "نوع التواصل", value: detail.contactOther ?? VISIT_CONTACT_TYPE_LABELS[detail.contactType] ?? detail.contactType },
                { label: "النتيجة", value: detail.result === "OTHER" && detail.resultOther ? `أخرى — ${detail.resultOther}` : VISIT_RESULT_LABELS[detail.result] ?? detail.result },
                ...(detail.rejectionReason ? [{ label: "سبب الرفض", value: detail.rejectionReason }] : []),
                { label: "الشخص المتواصل معه", value: detail.contactPersonName ?? "—" },
                { label: "الاحتياجات", value: detail.needs.length ? detail.needs.map((n) => NEEDS_LABELS[n] ?? n).join("، ") + (detail.needsOther ? ` — ${detail.needsOther}` : "") : "—" },
                { label: "المشتركون بالمنصة", value: detail.subscribersCount !== null ? formatNumber(detail.subscribersCount) : "—" },
                { label: "المتابعة القادمة", value: detail.nextFollowUpAt ? formatFullDate(detail.nextFollowUpAt) : "—" },
                { label: "الموقع", value: detail.lat !== null ? `${detail.lat.toFixed(5)}, ${detail.lng?.toFixed(5)}` : "—", ltr: true },
                { label: "ملاحظات", value: detail.notes ?? "—" },
              ].map((r) => (
                <div key={r.label} className="flex items-start justify-between gap-2 rounded-lg border bg-white px-2.5 py-2">
                  <span className="shrink-0 text-[10px] text-muted-foreground">{r.label}</span>
                  <span className="text-end text-[11px] font-semibold" dir={r.ltr ? "ltr" : undefined}>{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
