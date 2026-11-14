"use client";

// ——— جدول «زيارات الموظفين» في قسم الزيارات والتواصل — سجلات نموذج الموبايل الكاملة ———
// الأعمدة كما طلبها المدير + فلاتر (موظف/مدرسة/محافظة/منطقة/نوع تواصل/نتيجة/فترة)
// + أيقونة عين لتفاصيل الزيارة + زر عرض الموقع على الخريطة الداخلية للنظام.
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/schools/base-map";
import { useCallback, useEffect, useState } from "react";
import { CalendarX2, Download, Eye, EyeOff, Loader2, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
const BaseMap = dynamic(() => import("@/components/schools/base-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">جارٍ تحميل الخريطة...</div>,
});
import { formatFullDate, formatNumber, formatTime } from "@/lib/time";

export const VISIT_CONTACT_TYPE_LABELS: Record<string, string> = {
  FIELD_VISIT: "زيارة ميدانية",
  PHONE: "اتصال هاتفي",
  WHATSAPP: "واتساب",
  SMS: "رسالة SMS",
  MEETING: "اجتماع متابعة",
};

export const VISIT_RESULT_LABELS: Record<string, string> = {
  INITIAL_APPROVAL: "موافقة أولية",
  APPROVED: "موافقة",
  NEEDS_ANOTHER_VISIT: "يحتاج زيارة أخرى",
  CONTRACTED: "تم التعاقد",
  REJECTED: "رفض",
  SCHOOL_NOT_FOUND: "المدرسة غير موجودة",
  OTHER: "أخرى",
};

const VISIT_RESULT_BADGES: Record<string, string> = {
  INITIAL_APPROVAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
  APPROVED: "bg-green-100 text-green-800 border-green-300",
  NEEDS_ANOTHER_VISIT: "bg-amber-50 text-amber-700 border-amber-200",
  CONTRACTED: "bg-green-100 text-green-800 border-green-300",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  SCHOOL_NOT_FOUND: "bg-gray-100 text-gray-600 border-gray-200",
  OTHER: "bg-gray-100 text-gray-600 border-gray-200",
};

const NEEDS_LABELS: Record<string, string> = {
  PAINT: "طلاء",
  SEATS: "مقاعد",
  SMART_SCREEN: "شاشة ذكية",
  AC: "تكييف",
  NONE: "لا تحتاج إلى شيء",
  OTHER: "أخرى",
};

const LOCATION_SOURCE_LABELS: Record<string, string> = {
  GPS: "موقع GPS من الهاتف",
  MAP: "تحديد على الخريطة",
  SAVED: "تأكيد الموقع المحفوظ",
};

interface SchoolVisitRow {
  id: string;
  createdAt: string;
  contactType: string;
  result: string;
  resultOther: string | null;
  rejectionReason: string | null;
  contactPersonName: string | null;
  contactPersonTitle: string | null;
  principalName: string | null;
  schoolPhone: string | null;
  studentCount: number | null;
  needs: string[];
  needsOther: string | null;
  subscribersCount: number | null;
  nextFollowUpAt: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  locationSource: string | null;
  schoolFieldsUpdated: boolean;
  schoolId: string;
  schoolName: string;
  governorate: string | null;
  regionName: string | null;
  employeeId: string;
  employeeName: string;
  employeeJobTitle: string | null;
}

interface DetailResponse {
  visit: Omit<SchoolVisitRow, "schoolName" | "governorate" | "regionName" | "employeeId" | "employeeName" | "employeeJobTitle"> & {
    locationAccuracy: number | null;
    school: {
      id: string;
      name: string;
      governorate: string | null;
      regionName: string | null;
      address: string | null;
      phone: string | null;
      principalName: string | null;
      studentCount: number | null;
      lat: number | null;
      lng: number | null;
    };
    employee: { id: string; name: string; username: string; jobTitle: string | null; phone: string | null };
  };
  auditEntries: { id: string; action: string; actorName: string; details: Record<string, unknown> | null; createdAt: string }[];
}

interface FilterOptions {
  employees: { id: string; name: string; jobTitle: string | null }[];
  governorates: string[];
}

const emptyFilters = { employeeId: "all", governorate: "all", regionId: "all", contactType: "all", result: "all", period: "all", dateFrom: "", dateTo: "", q: "" };

export function SchoolVisitsTable() {
  const { toast } = useToast();
  const [rows, setRows] = useState<SchoolVisitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState<FilterOptions>({ employees: [], governorates: [] });
  const [regions, setRegions] = useState<{ id: string; name: string; governorate: string }[]>([]);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // الخريطة المباشرة من الجدول: فتح موقع زيارة بدون المرور بتفاصيلها — الخريطة الداخلية نفسها دون أي تغيير
  const [mapVisit, setMapVisit] = useState<{ id: string; schoolName: string; lat: number; lng: number; contactType: string; result: string; employeeName: string } | null>(null);

  const filterParams = useCallback(() => {
    const params = new URLSearchParams({
      employeeId: filters.employeeId,
      governorate: filters.governorate,
      regionId: filters.regionId,
      contactType: filters.contactType,
      result: filters.result,
      period: filters.period,
    });
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    return params;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/school-visits?${params.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (res.ok) {
        setRows(j.visits ?? []);
        setTotal(j.total ?? 0);
        if (j.filterOptions) setOptions(j.filterOptions);
      }
    } finally {
      setLoading(false);
    }
  }, [filterParams, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/regions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRegions(j?.regions ?? []))
      .catch(() => setRegions([]));
  }, []);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/school-visits/${id}`, { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setDetail(j);
      else toast({ title: "تعذر جلب التفاصيل", description: j?.error, variant: "destructive" });
    } catch {
      toast({ title: "تعذر الاتصال بالخادم", variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // تصدير Excel بنفس الفلاتر الحالية — الملف يُحمّل مباشرة من الخادم
  const exportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/school-visits/export?${filterParams().toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "تعذر التصدير");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `زيارات_الموظفين_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "صدر ملف Excel", description: `${total} سجل زيارة بالفلاتر الحالية — العمود الأول التاريخ بتوقيت بغداد.` });
    } catch (e) {
      toast({ title: "تعذر تصدير الزيارات", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // الفترة الجاهزة والنطاق المخصص يتبادلان: تحديد تاريخ مخصص يعيد الفترة إلى «الكل» والعكس
  const setPeriod = (v: string) => setFilters((f) => ({ ...f, period: v, dateFrom: "", dateTo: "" }));
  const setDate = (key: "dateFrom" | "dateTo", v: string) =>
    setFilters((f) => ({ ...f, [key]: v, period: "all" }));
  const hasCustomRange = Boolean(filters.dateFrom || filters.dateTo);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          سجلات الزيارات المسجلة من واجهة الموظفين على الموبايل — كل زيارة سجل مستقل ودائم.
          الإجمالي: <span className="font-bold text-foreground">{formatNumber(total)}</span>
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportExcel} disabled={exporting || loading}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
            تصدير Excel
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={load} aria-label="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* الفلاتر */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <Select value={filters.employeeId} onValueChange={(v) => { setFilters((f) => ({ ...f, employeeId: v })); setPage(1); }}>
          <SelectTrigger className="w-[150px]" aria-label="فلتر الموظف"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموظفين</SelectItem>
            {options.employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.governorate} onValueChange={(v) => { setFilters((f) => ({ ...f, governorate: v, regionId: "all" })); setPage(1); }}>
          <SelectTrigger className="w-[140px]" aria-label="فلتر المحافظة"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المحافظات</SelectItem>
            {options.governorates.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.regionId} onValueChange={(v) => { setFilters((f) => ({ ...f, regionId: v })); setPage(1); }}>
          <SelectTrigger className="w-[140px]" aria-label="فلتر المنطقة"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المناطق</SelectItem>
            {regions
              .filter((r) => filters.governorate === "all" || r.governorate === filters.governorate)
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={filters.contactType} onValueChange={(v) => { setFilters((f) => ({ ...f, contactType: v })); setPage(1); }}>
          <SelectTrigger className="w-[140px]" aria-label="فلتر نوع التواصل"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل أنواع التواصل</SelectItem>
            {Object.entries(VISIT_CONTACT_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.result} onValueChange={(v) => { setFilters((f) => ({ ...f, result: v })); setPage(1); }}>
          <SelectTrigger className="w-[150px]" aria-label="فلتر النتيجة"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل النتائج</SelectItem>
            {Object.entries(VISIT_RESULT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.period} onValueChange={(v) => { setPeriod(v); setPage(1); }}>
          <SelectTrigger className="w-[130px]" aria-label="فلتر الفترة"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفترات</SelectItem>
            <SelectItem value="today">اليوم</SelectItem>
            <SelectItem value="week">آخر 7 أيام</SelectItem>
            <SelectItem value="month">آخر 30 يوماً</SelectItem>
          </SelectContent>
        </Select>
        {/* نطاق تاريخ مخصص (بتوقيت بغداد) — يتجاوز الفترة الجاهزة عند استخدامه */}
        <div className="flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1">
          <span className="text-[10px] font-semibold text-muted-foreground">من</span>
          <Input
            type="date"
            className="h-7 w-[130px] border-0 bg-transparent px-1 text-xs shadow-none"
            value={filters.dateFrom}
            onChange={(e) => { setDate("dateFrom", e.target.value); setPage(1); }}
            aria-label="تاريخ البداية"
          />
          <span className="text-[10px] font-semibold text-muted-foreground">إلى</span>
          <Input
            type="date"
            className="h-7 w-[130px] border-0 bg-transparent px-1 text-xs shadow-none"
            value={filters.dateTo}
            onChange={(e) => { setDate("dateTo", e.target.value); setPage(1); }}
            aria-label="تاريخ النهاية"
          />
          {hasCustomRange && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => { setFilters((f) => ({ ...f, dateFrom: "", dateTo: "", period: "all" })); setPage(1); }}
              aria-label="مسح نطاق التاريخ"
              title="مسح نطاق التاريخ المخصص"
            >
              <CalendarX2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </Button>
          )}
        </div>
        <Input
          className="w-[190px]"
          placeholder="بحث باسم المدرسة..."
          value={filters.q}
          onChange={(e) => { setFilters((f) => ({ ...f, q: e.target.value })); setPage(1); }}
        />
      </div>

      {/* الجدول */}
      {loading && rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-6">
          <p className="text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <Eye className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-foreground">لا زيارات موظفين مطابقة</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ستظهر هنا تلقائياً وفوراً كل زيارة يسجلها الموظفون من واجهتهم على الموبايل.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto nice-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-start font-semibold">التاريخ</th>
                  <th className="px-3 py-2.5 text-start font-semibold">المدرسة</th>
                  <th className="px-3 py-2.5 text-start font-semibold">الموظف</th>
                  <th className="px-3 py-2.5 text-start font-semibold">نوع التواصل</th>
                  <th className="px-3 py-2.5 text-start font-semibold">النتيجة</th>
                  <th className="px-3 py-2.5 text-start font-semibold">الشخص المتواصل معه</th>
                  <th className="px-3 py-2.5 text-start font-semibold">هاتف المدرسة</th>
                  <th className="px-3 py-2.5 text-start font-semibold">الطلاب</th>
                  <th className="px-3 py-2.5 text-start font-semibold">المشتركون</th>
                  <th className="px-3 py-2.5 text-start font-semibold">المتابعة القادمة</th>
                  <th className="px-3 py-2.5 text-start font-semibold">الاحتياجات</th>
                  <th className="px-3 py-2.5 text-start font-semibold">الملاحظات</th>
                  <th className="px-3 py-2.5 text-start font-semibold">الموقع</th>
                  <th className="px-3 py-2.5 text-center font-semibold">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs" suppressHydrationWarning>
                      {formatFullDate(v.createdAt)}
                      <br />
                      <span className="text-[10px] text-muted-foreground">{formatTime(v.createdAt)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-foreground">{v.schoolName}</p>
                      <p className="text-[11px] text-muted-foreground">{v.governorate ?? ""}{v.regionName ? ` — ${v.regionName}` : ""}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <p className="font-semibold text-foreground">{v.employeeName}</p>
                      {v.employeeJobTitle && <p className="text-[10px] text-muted-foreground">{v.employeeJobTitle}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">
                        {VISIT_CONTACT_TYPE_LABELS[v.contactType] ?? v.contactType}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={`text-[10px] ${VISIT_RESULT_BADGES[v.result] ?? ""}`}>
                        {VISIT_RESULT_LABELS[v.result] ?? v.result}
                      </Badge>
                      {v.result === "OTHER" && v.resultOther && <p className="mt-1 max-w-[160px] text-[10px] text-muted-foreground">{v.resultOther}</p>}
                      {v.result === "REJECTED" && v.rejectionReason && <p className="mt-1 max-w-[160px] text-[10px] text-muted-foreground">السبب: {v.rejectionReason}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {v.contactPersonName ?? "—"}
                      {v.contactPersonTitle && <p className="text-[10px]">{v.contactPersonTitle}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-xs" dir="ltr">{v.schoolPhone ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{v.studentCount !== null ? formatNumber(v.studentCount) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{v.subscribersCount !== null ? formatNumber(v.subscribersCount) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap" suppressHydrationWarning>{v.nextFollowUpAt ? formatFullDate(v.nextFollowUpAt) : "—"}</td>
                    <td className="px-3 py-2.5 max-w-[140px] text-[11px] text-muted-foreground">
                      {v.needs.length === 0 ? "—" : v.needs.map((n) => NEEDS_LABELS[n] ?? n).join("، ")}
                      {v.needsOther && ` (${v.needsOther})`}
                    </td>
                    <td className="px-3 py-2.5 max-w-[160px] text-[11px] text-muted-foreground">{v.notes ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {v.lat !== null && v.lng !== null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground" dir="ltr">
                            {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
                            <br />
                            {LOCATION_SOURCE_LABELS[v.locationSource ?? ""] ?? ""}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => {
                              setMapVisit({
                                id: v.id,
                                schoolName: v.schoolName,
                                lat: v.lat as number,
                                lng: v.lng as number,
                                contactType: v.contactType,
                                result: v.result,
                                employeeName: v.employeeName,
                              });
                              setMapOpen(true);
                            }}
                            aria-label={`عرض موقع ${v.schoolName} على الخريطة`}
                            title="عرض الموقع مباشرة على الخريطة الداخلية"
                          >
                            <MapPin className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openDetail(v.id)}
                        aria-label={`تفاصيل زيارة ${v.schoolName} من ${v.employeeName}`}
                        title="عرض تفاصيل الزيارة كاملة"
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2.5">
              <p className="text-xs text-muted-foreground">
                صفحة {formatNumber(page)} من {formatNumber(totalPages)}
              </p>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="السابق">
                  <span aria-hidden="true">›</span>
                </Button>
                <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="التالي">
                  <span aria-hidden="true">‹</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* نافذة تفاصيل الزيارة */}
      <Dialog open={Boolean(detail) || detailLoading} onOpenChange={(open) => { if (!open) { setDetail(null); setDetailLoading(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto nice-scroll">
          {detailLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" /> جارٍ جلب التفاصيل...
            </div>
          )}
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  تفاصيل الزيارة — {detail.visit.school?.name ?? ""}
                </DialogTitle>
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {formatFullDate(detail.visit.createdAt)} · {formatTime(detail.visit.createdAt)} · المسجلة من الموظف «{detail.visit.employee.name}»
                </p>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  { label: "نوع التواصل", value: VISIT_CONTACT_TYPE_LABELS[detail.visit.contactType] ?? detail.visit.contactType },
                  {
                    label: "نتيجة الزيارة",
                    value:
                      (detail.visit.result === "OTHER" && detail.visit.resultOther)
                        ? `أخرى — ${detail.visit.resultOther}`
                        : VISIT_RESULT_LABELS[detail.visit.result] ?? detail.visit.result,
                  },
                  ...(detail.visit.rejectionReason ? [{ label: "سبب الرفض", value: detail.visit.rejectionReason }] : []),
                  { label: "الشخص الذي تم التواصل معه", value: detail.visit.contactPersonName ?? "—" },
                  { label: "منصبه الوظيفي", value: detail.visit.contactPersonTitle ?? "—" },
                  { label: "اسم مدير المدرسة (كما أدخله الموظف)", value: detail.visit.principalName ?? "—" },
                  { label: "هاتف المدرسة (كما أدخله الموظف)", value: detail.visit.schoolPhone ?? "—", ltr: true },
                  { label: "عدد الطلاب (كما أدخله الموظف)", value: detail.visit.studentCount !== null ? formatNumber(detail.visit.studentCount) : "—" },
                  { label: "المشتركون بالمنصة", value: detail.visit.subscribersCount !== null ? formatNumber(detail.visit.subscribersCount) : "—" },
                  { label: "موعد المتابعة القادم", value: detail.visit.nextFollowUpAt ? formatFullDate(detail.visit.nextFollowUpAt) : "—" },
                  {
                    label: "الاحتياجات",
                    value:
                      detail.visit.needs.length === 0
                        ? "—"
                        : detail.visit.needs.map((n) => NEEDS_LABELS[n] ?? n).join("، ") + (detail.visit.needsOther ? ` — ${detail.visit.needsOther}` : ""),
                  },
                  {
                    label: "الموقع الجغرافي",
                    value:
                      detail.visit.lat !== null
                        ? `${detail.visit.lat.toFixed(6)}, ${detail.visit.lng?.toFixed(6)} — ${LOCATION_SOURCE_LABELS[detail.visit.locationSource ?? ""] ?? ""}`
                        : "—",
                    ltr: true,
                  },
                  { label: "ملاحظات الموظف", value: detail.visit.notes ?? "—" },
                  {
                    label: "تحديث بيانات المدرسة",
                    value: detail.visit.schoolFieldsUpdated
                      ? "نعم — حُدثت بيانات المدرسة الأصلية بقيم الموظف ووُثق التحديث في سجل التغييرات"
                      : "لا — بيانات المدرسة الأصلية كما هي",
                  },
                ].map((row) => (
                  <div key={row.label} className="rounded-lg border bg-white p-2.5">
                    <p className="text-[10px] text-muted-foreground">{row.label}</p>
                    <p className="mt-0.5 text-xs font-semibold leading-relaxed text-foreground" dir={row.ltr ? "ltr" : undefined} style={row.ltr ? { textAlign: "start" } : undefined}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>

              {detail.auditEntries.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">سجل التغييرات المرتبط:</p>
                  <ul className="space-y-1">
                    {detail.auditEntries.slice(0, 3).map((a) => (
                      <li key={a.id} className="text-[10px] text-muted-foreground">
                        {formatFullDate(a.createdAt)} — {a.actorName}: {a.action === "REGISTER_VISIT" ? "تسجيل الزيارة" : a.action === "EMPLOYEE_UPDATE_SCHOOL_LOCATION" ? "تحديث موقع المدرسة" : a.action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <p className="text-[11px] text-muted-foreground">
                  <EyeOff className="inline h-3 w-3" aria-hidden="true" /> كل البيانات أعلاه محفوظة كما أدخلها الموظف — سجل دائم لا يُستبدل.
                </p>
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => {
                    // فتح الخريطة الداخلية مباشرة من تفاصيل الزيارة — زر واحد فقط
                    setMapVisit({
                      id: detail.visit.id,
                      schoolName: detail.visit.school?.name ?? "",
                      lat: detail.visit.lat as number,
                      lng: (detail.visit.lng ?? 0) as number,
                      contactType: detail.visit.contactType,
                      result: detail.visit.result,
                      employeeName: detail.visit.employee.name,
                    });
                    setMapOpen(true);
                  }}
                  disabled={detail.visit.lat === null}
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  عرض موقع المدرسة على الخريطة
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* خريطة الموقع — مكوّن الخريطة الداخلية الحالي للنظام دون أي تغيير عليه */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-sky-600" aria-hidden="true" />
              موقع المدرسة — {mapVisit?.schoolName}
            </DialogTitle>
          </DialogHeader>
          {mapVisit && (
            <div className="h-[420px] overflow-hidden rounded-xl border">
              <BaseMap
                center={{ lat: mapVisit.lat, lng: mapVisit.lng }}
                zoom={16}
                markers={[
                  {
                    id: mapVisit.id,
                    lat: mapVisit.lat,
                    lng: mapVisit.lng,
                    color: "sky",
                    title: mapVisit.schoolName,
                    popupHtml: `<div dir="rtl" style="font-family:inherit"><strong>${mapVisit.schoolName}</strong><br/><span style="font-size:11px">زيارة: ${VISIT_CONTACT_TYPE_LABELS[mapVisit.contactType] ?? ""} — ${VISIT_RESULT_LABELS[mapVisit.result] ?? ""}</span><br/><span style="font-size:11px">الموظف: ${mapVisit.employeeName}</span></div>`,
                  } satisfies MapMarker,
                ]}
                ariaLabel="خريطة موقع المدرسة"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
