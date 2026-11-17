"use client";

// ——— بوابة الموظف: قسم المدارس — قائمة نطاقه + بحث + تفاصيل + إضافة مدرسة يدوياً ———
// يخدم أيضاً قسم «اكتشاف وإضافة المدارس» (defaultAddOpen).
import { SchoolFieldWorkflow } from "./school-field-workflow";
import { AddSchoolDialog } from "./add-school-dialog";
import { IRAQ_GOVERNORATES } from "@/lib/geo/iraq";
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/schools/base-map";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Loader2,
  MapPin,
  Map as MapIcon,
  List,
  Phone,
  Plus,
  Search,
  UserRound,
  Navigation,
  Share2,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  followUpDue?: boolean;
  visitedByMe?: boolean;
  lastVisitorName?: string | null;
  hasCoords: boolean;
}

interface GovernorateSummary { name: string; total: number; visited: number }
interface RegionSummary { id: string; name: string; count: number }
const ALL_GOVERNORATES = "__all__";

interface SchoolsSectionProps {
  perms: Record<string, SectionPerms>;
  canCreate: boolean;
  onRegistered: () => void;
  defaultAddOpen?: boolean;
  title?: string;
}

function SchoolLocationActions({ school }: { school: SchoolRow }) {
  const { toast } = useToast();
  const [showLink, setShowLink] = useState(false);
  const { lat, lng } = school;
  if (!school.hasCoords || lat === null || lng === null) {
    return <p className="text-xs text-muted-foreground">بحاجة لتثبيت الموقع</p>;
  }

  const coordinates = `${lat},${lng}`;
  const directionsUrl = `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1", destination: coordinates, dir_action: "navigate",
  })}`;
  const wazeUrl = `https://waze.com/ul?${new URLSearchParams({ ll: coordinates, navigate: "yes" })}`;
  const locationUrl = `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: coordinates })}`;

  const copyLocation = async () => {
    try {
      await navigator.clipboard.writeText(locationUrl);
      toast({ title: "تم نسخ رابط الموقع" });
    } catch {
      setShowLink(true);
    }
  };

  const shareLocation = async () => {
    if (!navigator.share) {
      await copyLocation();
      return;
    }
    try {
      await navigator.share({ title: school.name, text: school.name, url: locationUrl });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await copyLocation();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="h-10">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
            <Navigation aria-hidden="true" /> الذهاب إلى هناك
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-10">
          <a href={wazeUrl} target="_blank" rel="noopener noreferrer">Waze</a>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="h-10" onClick={shareLocation}>
          <Share2 aria-hidden="true" /> مشاركة الموقع
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-10" onClick={copyLocation}>
          <Copy aria-hidden="true" /> نسخ رابط الموقع
        </Button>
      </div>
      {showLink && (
        <Input readOnly dir="ltr" aria-label="رابط موقع المدرسة" value={locationUrl} onFocus={(event) => event.currentTarget.select()} />
      )}
    </div>
  );
}

export function EmployeeSchoolsSection({ perms, canCreate, onRegistered, defaultAddOpen, title }: SchoolsSectionProps) {
  const { toast } = useToast();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [view, setView] = useState("list");
  const [visitStatus, setVisitStatus] = useState("all");
  const [mapCounts, setMapCounts] = useState<{ total: number; mapped: number } | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [detail, setDetail] = useState<{ school: SchoolRow & { regionName: string | null; address: string | null }; myRecentVisits: { id: string; contactType: string; result: string; createdAt: string; notes: string | null }[] } | null>(null);
  const [addOpen, setAddOpen] = useState(Boolean(defaultAddOpen));
  // المحافظة المختارة: "" = مربعات المحافظات، ALL_GOVERNORATES = كل المدارس (العرض القديم)
  const [governorate, setGovernorate] = useState("");
  const [regionId, setRegionId] = useState("all");
  const [govSummary, setGovSummary] = useState<GovernorateSummary[] | null>(null);
  const [regionSummary, setRegionSummary] = useState<{ regions: RegionSummary[]; unregioned: number } | null>(null);
  const [lockedGovernorate, setLockedGovernorate] = useState<string | null>(null);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const showTiles = !governorate && !searchQ.trim();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query: string, signal?: AbortSignal) => {
    if (!governorate && !query.trim()) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: view === "map" ? "2000" : "1000" });
      if (view === "map") params.set("onlyMap", "1");
      if (governorate && governorate !== ALL_GOVERNORATES) params.set("governorate", governorate);
      if (governorate && governorate !== ALL_GOVERNORATES && regionId !== "all") params.set("regionId", regionId);
      if (visitStatus !== "all") params.set("visitStatus", visitStatus);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/employee/schools?${params.toString()}`, { cache: "no-store", signal });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر جلب قائمة المدارس");
      if (signal?.aborted) return;
      setSchools((j.schools ?? []).sort((a: SchoolRow,b: SchoolRow)=>Number(Boolean(b.followUpDue))-Number(Boolean(a.followUpDue))));
      setMapCounts(j.mappedTotal === undefined ? null : { total: j.total, mapped: j.mappedTotal });
    } catch (error) {
      if (signal?.aborted) return;
      setSchools([]);
      setMapCounts(null);
      toast({ title: "تعذر جلب المدارس", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [toast, view, visitStatus, governorate, regionId]);

  // ملخص المحافظات (المربعات) ومناطق المحافظة المختارة
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ summary: "1" });
    if (governorate && governorate !== ALL_GOVERNORATES) params.set("governorate", governorate);
    fetch(`/api/employee/schools?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error); return j; })
      .then((j) => {
        setGovSummary(j.governorates ?? []);
        setLockedGovernorate(j.scope?.governorate ?? null);
        setRegionSummary(j.regions ? { regions: j.regions, unregioned: j.unregioned ?? 0 } : null);
      })
      .catch(() => { if (!controller.signal.aborted) setGovSummary([]); });
    return () => controller.abort();
  }, [governorate, summaryVersion]);

  const openGovernorate = (name: string) => {
    setSelectedMarker(null);
    setRegionId("all");
    setRegionSummary(null);
    setSchools([]);
    setGovernorate(name);
  };

  useEffect(() => {
    const refresh = () => { if (!document.hidden) void load(searchQ); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load, searchQ]);

  useEffect(() => {
    const controller = new AbortController();
    load(searchQ, controller.signal);
    return () => controller.abort();
  }, [searchQ, load]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

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

  const markers = useMemo<MapMarker[]>(() => schools.flatMap((school) => {
    if (!school.hasCoords || school.lat === null || school.lng === null) return [];
    return [{
      id: school.id,
      lat: school.lat,
      lng: school.lng,
      color: school.lastVisitAt ? "green" : "sky",
      title: school.name,
      onClick: () => setSelectedMarker(school.id),
    }];
  }), [schools]);
  const focusedSchool = schools.find((school) => school.id === selectedMarker);
  const addSchoolDisabled = !canCreate;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {governorate && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="رجوع للمحافظات" onClick={() => openGovernorate("")}>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}
          <p className="truncate text-lg font-extrabold text-foreground">
            {governorate === ALL_GOVERNORATES ? "كل المدارس" : governorate || (title ?? "المدارس")}
          </p>
        </div>
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

      {showTiles && (
        <GovernorateTiles summary={govSummary} onOpen={openGovernorate} />
      )}

      {governorate && governorate !== ALL_GOVERNORATES && regionSummary && (regionSummary.regions.some((r) => r.count > 0) || regionSummary.unregioned > 0) && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 nice-scroll" role="group" aria-label="فلتر المنطقة">
          {[
            { id: "all", name: "كل المناطق", count: regionSummary.regions.reduce((a, r) => a + r.count, 0) + regionSummary.unregioned },
            ...regionSummary.regions.filter((r) => r.count > 0),
            ...(regionSummary.unregioned > 0 ? [{ id: "none", name: "بلا منطقة", count: regionSummary.unregioned }] : []),
          ].map((r) => (
            <button key={r.id} type="button" aria-pressed={regionId === r.id}
              onClick={() => { setSelectedMarker(null); setRegionId(r.id); }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${regionId === r.id ? "border-sky-600 bg-sky-600 text-white" : "bg-white text-foreground"}`}>
              {r.name} <span className={regionId === r.id ? "text-sky-100" : "text-muted-foreground"}>{formatNumber(r.count)}</span>
            </button>
          ))}
        </div>
      )}

      {!showTiles && perms.schools?.view && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={view} onValueChange={(value) => { setSelectedMarker(null); setView(value); }}>
            <TabsList>
              <TabsTrigger value="list" className="gap-1"><List className="h-4 w-4" />القائمة</TabsTrigger>
              <TabsTrigger value="map" className="gap-1"><MapIcon className="h-4 w-4" />الخريطة</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={visitStatus} onValueChange={(value) => { setSelectedMarker(null); setVisitStatus(value); }}>
            <SelectTrigger className="w-auto" aria-label="حالة الزيارة"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المدارس</SelectItem>
              <SelectItem value="VISITED">تمت زيارتها</SelectItem>
              <SelectItem value="NOT_VISITED">لم تُزر</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {showTiles ? null : loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-white p-6 text-muted-foreground">
          <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" /> جارٍ التحميل...
        </div>
      ) : view === "map" ? (
        <div className="space-y-2">
          {mapCounts && (
            <p className="text-xs text-muted-foreground">
              {markers.length} من {mapCounts.total} مدرسة تظهر على الخريطة
              {mapCounts.mapped < mapCounts.total ? ` · بلا إحداثيات: ${mapCounts.total - mapCounts.mapped}` : ""}
              {mapCounts.mapped > markers.length ? " · ضيّق البحث لعرض بقية المواقع" : ""}
            </p>
          )}
          {markers.length ? (
            <>
              <div className="flex gap-3 text-xs">
                <span className="text-green-700">● تمت زيارتها</span>
                <span className="text-sky-700">● لم تُزر</span>
              </div>
              <div className="relative isolate h-[min(55dvh,420px)] min-h-64 overflow-hidden rounded-xl border">
                <BaseMap center={IRAQ_GOVERNORATES.find((g) => g.name === governorate)?.center ?? { lat: 33.3152, lng: 44.3661 }} markers={markers} fitMarkers ariaLabel="خريطة مدارس نطاق العمل" />
              </div>
              {focusedSchool && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                  <div>
                    <p className="text-sm font-bold">{focusedSchool.name}</p>
                    <p className="text-xs text-muted-foreground">{focusedSchool.address ?? focusedSchool.regionName}</p>
                    <p className={`text-xs ${focusedSchool.lastVisitAt ? "font-semibold text-emerald-700" : ""}`}>
                      {focusedSchool.lastVisitAt ? `✓ تمّت الزيارة · ${focusedSchool.lastVisitorName ?? ""} · ${formatFullDate(focusedSchool.lastVisitAt)}` : "لم تُزر"}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => openDetail(focusedSchool.id)}>تفاصيل المدرسة</Button>
                </div>
              )}
            </>
          ) : <p className="rounded-xl border p-4 text-center text-sm">لا مدارس مطابقة بإحداثيات محفوظة.</p>}
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
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-start shadow-sm active:scale-[0.99] ${s.lastVisitAt ? "border-emerald-200 bg-emerald-50/50" : "bg-white"}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.lastVisitAt ? "bg-emerald-100 text-emerald-700" : "bg-sky-500/10 text-sky-600"}`}>
                {s.lastVisitAt ? <Check className="h-5 w-5" aria-hidden="true" /> : <MapPin className="h-5 w-5" aria-hidden="true" />}
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
                  {s.visitedByMe && <Badge className="bg-sky-100 text-sky-900">زرتها أنا</Badge>}
                  {s.followUpDue && <Badge className="bg-amber-100 text-amber-900">حان موعد المتابعة</Badge>}
                  {s.lastVisitorName && <span className="text-xs text-emerald-700">آخر زيارة: {s.lastVisitorName}</span>}
                  {s.lastVisitAt && (
                    <Badge variant="outline" className="border-emerald-300 bg-white text-[9px] text-emerald-800">تمّت الزيارة</Badge>
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
              {detail.school.lastVisitAt && <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800"><Check size={14} aria-hidden="true" /> تمّت الزيارة</Badge>}
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
              <div className="space-y-2 rounded-lg border bg-white p-2.5">
                {detail.school.address && <p className="text-xs text-muted-foreground">{detail.school.address}</p>}
                <SchoolLocationActions key={detail.school.id} school={detail.school} />
                <SchoolFieldWorkflow key={detail.school.id} schoolId={detail.school.id} />
              </div>
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
                        color: detail.school.lastVisitAt ? "green" : "sky",
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

      {/* إضافة مدرسة */}
      <AddSchoolDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultGovernorate={governorate && governorate !== ALL_GOVERNORATES ? governorate : undefined}
        defaultRegionId={regionId !== "all" ? regionId : undefined}
        lockedGovernorate={lockedGovernorate}
        onSaved={(school) => {
          setSummaryVersion((v) => v + 1);
          if (governorate !== school.governorate && governorate !== ALL_GOVERNORATES) openGovernorate(school.governorate);
          else void load(searchQ);
          onRegistered();
        }}
      />
    </div>
  );
}

// ——— مربعات المحافظات: كل مربع محافظة مع عدد مدارسها وما تمت زيارته ———
function GovernorateTiles({ summary, onOpen }: { summary: GovernorateSummary[] | null; onOpen: (name: string) => void }) {
  const counts = new Map((summary ?? []).map((g) => [g.name, g]));
  const total = (summary ?? []).reduce((a, g) => a + g.total, 0);
  const visited = (summary ?? []).reduce((a, g) => a + g.visited, 0);
  // المحافظات التي فيها مدارس أولاً
  const ordered = [...IRAQ_GOVERNORATES].sort((a, b) => (counts.get(b.name)?.total ?? 0) - (counts.get(a.name)?.total ?? 0));
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="المحافظات">
      <button type="button" onClick={() => onOpen(ALL_GOVERNORATES)}
        className="col-span-2 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-600 p-4 text-start text-white shadow-sm active:scale-[0.98] sm:col-span-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><LayoutGrid className="h-6 w-6" aria-hidden="true" /></span>
        <span className="flex-1">
          <span className="block text-base font-extrabold">كل مدارسي</span>
          <span className="text-xs text-sky-100">{summary ? `${formatNumber(total)} مدرسة · ${formatNumber(visited)} تمت زيارتها` : "جارٍ التحميل…"}</span>
        </span>
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      {ordered.map(({ name }) => {
        const g = counts.get(name);
        const pct = g && g.total ? Math.round((g.visited / g.total) * 100) : 0;
        return (
          <button key={name} type="button" onClick={() => onOpen(name)}
            className={`aspect-square rounded-2xl border p-3 text-start shadow-sm transition active:scale-[0.97] ${g?.total ? "bg-white" : "bg-muted/40 text-muted-foreground"}`}>
            <span className="flex h-full flex-col justify-between">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${g?.total ? "bg-sky-100 text-sky-700" : "bg-muted text-muted-foreground"}`}>
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-extrabold">{name}</span>
                <span className="block text-xs">{summary ? `${formatNumber(g?.total ?? 0)} مدرسة` : "…"}</span>
                {g?.total ? (
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`نسبة الزيارة ${pct}%`}>
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
