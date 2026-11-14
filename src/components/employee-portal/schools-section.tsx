"use client";

// ——— بوابة الموظف: قسم المدارس — قائمة نطاقه + بحث + تفاصيل + إضافة مدرسة يدوياً ———
// يخدم أيضاً قسم «اكتشاف وإضافة المدارس» (defaultAddOpen).
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/schools/base-map";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import type { SectionPerms } from "@/lib/sections-catalog";
import { formatFullDate, formatNumber } from "@/lib/time";
const BaseMap = dynamic(() => import("@/components/schools/base-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">جارٍ تحميل الخريطة...</div>,
});

interface SchoolRow {
  id: string;
  name: string;
  governorate: string | null;
  regionName: string | null;
  institutionType: string | null;
  stage: string | null;
  principalName: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  studentCount: number | null;
  availabilityStatus: string;
  contractStatus: string;
  lastVisitAt: string | null;
  hasCoords: boolean;
}

interface SchoolsSectionProps {
  perms: Record<string, SectionPerms>;
  canCreate: boolean;
  onRegistered: () => void;
  defaultAddOpen?: boolean;
  title?: string;
}

export function EmployeeSchoolsSection({ perms, canCreate, onRegistered, defaultAddOpen, title }: SchoolsSectionProps) {
  const { toast } = useToast();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [detail, setDetail] = useState<{ school: SchoolRow & { regionName: string | null; address: string | null }; myRecentVisits: { id: string; contactType: string; result: string; createdAt: string; notes: string | null }[] } | null>(null);
  const [addOpen, setAddOpen] = useState(Boolean(defaultAddOpen));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", regionText: "", phone: "", principalName: "", address: "", institutionType: "", stage: "", studentCount: "", lat: "", lng: "" });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/employee/schools?${params.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setSchools(j.schools ?? []);
      else toast({ title: "تعذر جلب المدارس", description: j?.error, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load(searchQ);
  }, [searchQ, load]);

  const onSearchInput = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQ(value), 350);
  };

  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/employee/schools/${id}`, { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setDetail(j);
      else toast({ title: "تعذر جلب التفاصيل", description: j?.error, variant: "destructive" });
    } catch {
      toast({ title: "تعذر الاتصال بالخادم", variant: "destructive" });
    }
  };

  const submitAdd = async () => {
    if (!form.name.trim()) {
      toast({ title: "اسم المدرسة مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        regionText: form.regionText.trim() || undefined,
        phone: form.phone.trim() || undefined,
        principalName: form.principalName.trim() || undefined,
        address: form.address.trim() || undefined,
        institutionType: form.institutionType.trim() || undefined,
        stage: form.stage.trim() || undefined,
        studentCount: form.studentCount ? Number(form.studentCount) : undefined,
      };
      if (form.lat && form.lng) {
        body.lat = Number(form.lat);
        body.lng = Number(form.lng);
      }
      const res = await fetch("/api/employee/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر الإضافة");
      toast({ title: "أُضيفت المدرسة", description: `سُجلت «${form.name.trim()}» في النظام وظهرت للإدارة فوراً.` });
      setAddOpen(false);
      setForm({ name: "", regionText: "", phone: "", principalName: "", address: "", institutionType: "", stage: "", studentCount: "", lat: "", lng: "" });
      load(searchQ);
      onRegistered();
    } catch (e) {
      toast({ title: "تعذر إضافة المدرسة", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addSchoolDisabled = !canCreate;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-extrabold text-foreground">{title ?? "المدارس"}</p>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => setAddOpen(true)}
          disabled={addSchoolDisabled}
          title={addSchoolDisabled ? "لا تملك صلاحية إضافة مدرسة — تواصل مع مدير النظام" : undefined}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          إضافة مدرسة
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          inputMode="search"
          className="h-11 ps-9 text-sm"
          placeholder="ابحث باسم المدرسة أو المنطقة..."
          value={q}
          onChange={(e) => onSearchInput(e.target.value)}
          aria-label="بحث في المدارس"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-white p-6 text-muted-foreground">
          <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" /> جارٍ التحميل...
        </div>
      ) : schools.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="text-sm font-bold text-foreground">لا مدارس مطابقة</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchQ ? "جرّب كلمة بحث أخرى" : "لا مدارس في نطاق عملك بعد — أضف مدرسة يدوياً إن كانت لديك الصلاحية"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {schools.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openDetail(s.id)}
              className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-start shadow-sm active:scale-[0.99]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10">
                <MapPin className="h-5 w-5 text-sky-600" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{s.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[s.regionName, s.governorate].filter(Boolean).join(" — ") || "—"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline" className={`text-[9px] ${s.contractStatus === "CONTRACTED" ? "bg-green-100 text-green-800 border-green-300" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
                    {s.contractStatus === "CONTRACTED" ? "متعاقدة" : "غير متعاقدة"}
                  </Badge>
                  {s.lastVisitAt && (
                    <span className="text-[9px] text-muted-foreground" suppressHydrationWarning>آخر زيارة: {formatFullDate(s.lastVisitAt)}</span>
                  )}
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {/* تفاصيل المدرسة */}
      <Sheet open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <SheetContent side="bottom" className="mx-auto max-h-[88vh] max-w-lg overflow-y-auto rounded-t-2xl nice-scroll">
          <SheetHeader className="p-4 pb-0">
            <SheetTitle className="text-start">{detail?.school.name}</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="space-y-2 p-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "المحافظة", value: detail.school.governorate ?? "—" },
                  { label: "المنطقة", value: detail.school.regionName ?? "—" },
                  { label: "نوع المؤسسة", value: detail.school.institutionType ?? "—" },
                  { label: "المرحلة", value: detail.school.stage ?? "—" },
                  { label: "عدد الطلاب", value: detail.school.studentCount !== null ? formatNumber(detail.school.studentCount) : "—" },
                  { label: "آخر زيارة", value: detail.school.lastVisitAt ? formatFullDate(detail.school.lastVisitAt) : "—" },
                ].map((r) => (
                  <div key={r.label} className="rounded-lg border bg-white p-2.5">
                    <p className="text-[10px] text-muted-foreground">{r.label}</p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground">{r.value}</p>
                  </div>
                ))}
              </div>
              {detail.school.principalName && (
                <div className="flex items-center gap-2 rounded-lg border bg-white p-2.5">
                  <UserRound className="h-4 w-4 text-sky-600" aria-hidden="true" />
                  <p className="text-xs text-foreground">مدير المدرسة: <span className="font-bold">{detail.school.principalName}</span></p>
                </div>
              )}
              {detail.school.phone && (
                <a href={`tel:${detail.school.phone}`} className="flex items-center gap-2 rounded-lg border bg-white p-2.5" dir="ltr">
                  <Phone className="h-4 w-4 text-sky-600" aria-hidden="true" />
                  <span className="text-xs font-semibold text-foreground" style={{ direction: "ltr" }}>{detail.school.phone}</span>
                </a>
              )}
              {detail.school.address && (
                <p className="rounded-lg border bg-white p-2.5 text-xs text-muted-foreground">{detail.school.address}</p>
              )}
              {detail.school.hasCoords && detail.school.lat !== null && (
                <div className="h-44 overflow-hidden rounded-xl border">
                  <BaseMap
                    center={{ lat: detail.school.lat, lng: detail.school.lng ?? 0 }}
                    zoom={15}
                    markers={[
                      {
                        id: detail.school.id,
                        lat: detail.school.lat,
                        lng: detail.school.lng ?? 0,
                        color: "sky",
                        title: detail.school.name,
                      } satisfies MapMarker,
                    ]}
                    ariaLabel="موقع المدرسة"
                  />
                </div>
              )}
              {detail.myRecentVisits.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">زياراتك الأخيرة على هذه المدرسة:</p>
                  <ul className="space-y-1">
                    {detail.myRecentVisits.map((v) => (
                      <li key={v.id} className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                        {formatFullDate(v.createdAt)} — نتيجة: {v.result === "OTHER" && v.notes ? v.notes : v.result}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* إضافة مدرسة يدوياً */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>إضافة مدرسة جديدة يدوياً</DialogTitle>
            <p className="text-xs text-muted-foreground">
              تُسجل المدرسة في القاعدة المركزية فوراً وتظهر للإدارة — أضف الإحداثيات إن توفرت من GPS جهازك.
            </p>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المدرسة *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">المنطقة</Label>
                <Input value={form.regionText} onChange={(e) => setForm((f) => ({ ...f, regionText: e.target.value }))} placeholder="مثال: الكرادة" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">هاتف المدرسة</Label>
                <Input dir="ltr" className="text-start" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">اسم المدير/المديرة</Label>
                <Input value={form.principalName} onChange={(e) => setForm((f) => ({ ...f, principalName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">عدد الطلاب</Label>
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  className="text-start"
                  value={form.studentCount}
                  onChange={(e) => setForm((f) => ({ ...f, studentCount: e.target.value.replace(/[^0-9]/g, "") }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">العنوان</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Latitude</Label>
                <Input dir="ltr" inputMode="decimal" className="text-start" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} placeholder="33.3152" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Longitude</Label>
                <Input dir="ltr" inputMode="decimal" className="text-start" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} placeholder="44.3661" />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                navigator.geolocation?.getCurrentPosition(
                  (pos) => {
                    setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
                    toast({ title: "أُلحق موقعك الحالي", description: "راجع الإحداثيات قبل الحفظ — إن كنت جالساً عند المدرسة فهي صحيحة." });
                  },
                  () => toast({ title: "تعذر الوصول للموقع", description: "فعّل GPS أو أدخل الإحداثيات يدوياً.", variant: "destructive" })
                );
              }}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              إلحاق موقعي الحالي (GPS)
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={submitAdd} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              حفظ المدرسة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
