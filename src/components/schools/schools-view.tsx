"use client";

// ——— قسم المدارس الرئيسي ———
// جدول كل المدارس + فلاتر شاملة + خريطة النظام + أزرار الاكتشاف وExcel.
// النتائج تُحدّث تلقائياً عند تغيير أي فلتر.

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Table2, Map as MapIcon, Compass, FileSpreadsheet, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { GoogleSchoolsMap } from "./google-schools-map";
import { GoogleSchoolsSearch } from "./google-schools-search";
import { GovernorateCards } from "./governorate-cards";
import { SCHOOL_GOVERNORATES } from "@/lib/geo/school-governorates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchoolsFilters, EMPTY_FILTERS, type FiltersState } from "./schools-filters";
import { SchoolsTable } from "./schools-table";
import { SchoolEditDialog } from "./school-edit-dialog";
import { AssignDialog } from "./assign-dialog";
import { ExcelDialog } from "./excel-dialog";
import { CONTRACT_LABELS } from "@/lib/labels";
import { formatFullDate } from "@/lib/time";
import {
  SECTOR_LABELS_UI,
  type SchoolDTO,
  type SchoolsListResponse,
  type CoordinatorDTO,
} from "@/lib/types";

const MapSchoolsCatalog = dynamic(() => import("./map-schools-catalog"), {
  loading: () => <p className="text-sm text-muted-foreground">جارٍ تحميل مدارس الخريطة…</p>,
});

export function SchoolsView({ onOpenChangeNotification }: { onOpenChangeNotification?: () => void }) {
  const { toast } = useToast();
  const [googleOpen, setGoogleOpen] = useState(false);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [data, setData] = useState<SchoolsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<"schools" | "map-schools">("schools");
  const [mapRevision, setMapRevision] = useState(0);
  const [view, setView] = useState<"table" | "map">("table");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // نوافذ
  const [editSchool, setEditSchool] = useState<SchoolDTO | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [assignNames, setAssignNames] = useState<string[]>([]);
  const [excelOpen, setExcelOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [locateTarget, setLocateTarget] = useState<SchoolDTO | null>(null);
  const [coordinators, setCoordinators] = useState<CoordinatorDTO[]>([]);

  const buildQuery = useCallback(
    (p: number) => {
      const sp = new URLSearchParams();
      if (filters.q.trim()) sp.set("q", filters.q.trim());
      for (const [k, v] of Object.entries(filters)) {
        if (k === "q" || v === "all" || v === "") continue;
        if (k === "dataSource" && v === "__missing") {
          // فلتر خاص: السجلات الناقصة فقط — تقريبًا: بلا هاتف وبلا مدير
          sp.set("hasPhone", "0");
          continue;
        }
        sp.set(k, v);
      }
      sp.set("page", String(p));
      sp.set("pageSize", String(pageSize));
      if (view === "map") sp.set("onlyMap", "1");
      sp.set("schoolCoverage", "1");
      sp.set("catalog", "research");
      return sp.toString();
    },
    [filters, view]
  );

  const load = useCallback(
    async (p: number, background = false, signal?: AbortSignal) => {
      if (!background) setLoading(true);
      try {
        const res = await fetch(`/api/schools?${buildQuery(p)}&withOptions=1`, { cache: "no-store", signal });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "تعذر جلب المدارس");
        if (!signal?.aborted) setData(j as SchoolsListResponse);
      } catch (e) {
        if (!background && !signal?.aborted) toast({
          title: "تعذر جلب المدارس",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        });
      } finally {
        if (!background && !signal?.aborted) setLoading(false);
      }
    },
    [buildQuery, toast]
  );

  // تحديث تلقائي عند تغيير الفلاتر أو العرض
  useEffect(() => {
    if (catalog !== "schools") return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setPage(1);
      load(1, false, controller.signal);
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [catalog, load]);

  useEffect(() => {
    if (catalog !== "schools") return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(page, true, controller.signal);
    }, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [catalog, load, page, view]);

  const loadCoordinators = useCallback(async () => {
    try {
      const res = await fetch("/api/coordinators", { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setCoordinators(j.coordinators ?? []);
    } catch {
      // لا شيء — تُحمل مرة أخرى عند الحاجة
    }
  }, []);

  useEffect(() => {
    loadCoordinators();
  }, [loadCoordinators]);

  const refresh = () => {
    load(page);
    loadCoordinators();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set((data?.schools ?? []).map((s) => s.id)) : new Set());
  };

  const openAssign = (ids: string[], names: string[]) => {
    if (ids.length === 0) {
      toast({ title: "حدد مدرسة واحدة على الأقل من الجدول", variant: "destructive" });
      return;
    }
    setAssignIds(ids);
    setAssignNames(names);
    setAssignOpen(true);
  };

  const openMapSchool = async (id: string) => {
    try {
      const response = await fetch(`/api/schools/${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setEditSchool(result.school);
    } catch (error) {
      toast({ title: "تعذر فتح تفاصيل المدرسة", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const mapMarkers = useMemo(() => {
    const schools = (data?.schools ?? []).filter((school) => school.hasCoords);
    if (locateTarget?.hasCoords && !schools.some(({ id }) => id === locateTarget.id)) schools.push(locateTarget);
    return schools.flatMap((school) => school.lat === null || school.lng === null ? [] : [{
      id: school.id, lat: school.lat, lng: school.lng, name: school.name, visited: Boolean(school.lastVisitAt),
    }]);
  }, [data, locateTarget]);
  const selectMapSchool = useCallback((id: string) => {
    const school = data?.schools.find((item) => item.id === id);
    if (school) setLocateTarget(school);
  }, [data]);
  const focusedSchool = data?.schools.find((school) => school.id === locateTarget?.id) ?? locateTarget;
  const mapCenter = SCHOOL_GOVERNORATES.find(({ name }) => name === filters.governorate)?.center ?? { lat: 33.3152, lng: 44.3661 };

  const exportQuery = useMemo(() => buildQuery(1), [buildQuery]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="space-y-4">
      <Tabs value={catalog} onValueChange={(value) => setCatalog(value === "map-schools" ? "map-schools" : "schools")}>
        <TabsList aria-label="قوائم المدارس">
          <TabsTrigger value="schools">المدارس</TabsTrigger>
          <TabsTrigger value="map-schools">مدارس الخريطة</TabsTrigger>
        </TabsList>
      </Tabs>
      {catalog === "map-schools" ? <MapSchoolsCatalog revision={mapRevision} onAssign={(id, name) => openAssign([id], [name])} onEdit={openMapSchool} /> : <>
      {/* رأس القسم */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">إدارة المدارس</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data ? `${data.total} مدرسة في النتائج` : "جارٍ التحميل..."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.governorate} onValueChange={(governorate) => {
            setSelectedIds(new Set());
            setLocateTarget(null);
            setFilters((current) => ({ ...current, governorate, regionId: "all" }));
          }}>
            <SelectTrigger className="w-auto gap-2" aria-label="المحافظة">
              <MapIcon className="h-4 w-4" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المحافظات</SelectItem>
              {SCHOOL_GOVERNORATES.map(({ name }) => <SelectItem value={name} key={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" onClick={() => setGoogleOpen((open) => !open)} className="gap-2" aria-expanded={googleOpen}>
            <Compass className="h-4 w-4" aria-hidden="true" />
            اكتشاف المدارس
          </Button>
          <Button type="button" variant="outline" onClick={() => setExcelOpen(true)} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Excel
          </Button>
        </div>
      </div>

      <GovernorateCards
        counts={data?.options?.governorateCounts}
        selected={filters.governorate}
        missing={data?.options?.governorateCounts ? "0 مدرسة" : "—"}
        onSelect={(governorate) => {
          setLocateTarget(null);
          setSelectedIds(new Set());
          setView("table");
          setFilters({ ...EMPTY_FILTERS, governorate });
        }}
      />

      {googleOpen && <GoogleSchoolsSearch key={filters.governorate} governorate={filters.governorate} />}
      <SchoolsFilters filters={filters} onChange={(next) => { setLocateTarget(null); setSelectedIds(new Set()); setFilters(next); }} options={data?.options ? { ...data.options, governorates: SCHOOL_GOVERNORATES.map(({ name }) => name) } : null} resultCount={data?.total ?? 0} />


      <Tabs value={view} onValueChange={(v) => { setLocateTarget(null); setView(v as "table" | "map"); }}>
        <TabsList>
          <TabsTrigger value="table" className="gap-1.5"><Table2 className="h-4 w-4" />الجدول</TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5"><MapIcon className="h-4 w-4" />خريطة النظام</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "table" ? (
        <>
          <SchoolsTable
            schools={data?.schools ?? []}
            loading={loading}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onEdit={(s) => setEditSchool(s)}
            onLocate={(s) => {
              setView("map");
              setLocateTarget(s);
            }}
          />

          {/* ترقيم الصفحات */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}>
                السابق
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحة {page} من {totalPages} — {data?.total ?? 0} سجل
              </span>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); load(p); }}>
                التالي
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {data?.mappedTotal !== undefined && (
            <p className="text-xs text-muted-foreground">
              {Math.min(data.mappedTotal, data.schools.length)} من {data.total} مدرسة تظهر على الخريطة
              {data.mappedTotal < data.total ? ` · بلا إحداثيات: ${data.total - data.mappedTotal}` : ""}
              {data.mappedTotal > data.schools.length ? " · ضيّق الفلاتر لعرض بقية المواقع" : ""}
            </p>
          )}
          <div className="flex gap-3 text-xs">
            <span className="text-sky-700">● لم تُزر</span>
            <span className="text-green-700">● تمت زيارتها</span>
          </div>
          <GoogleSchoolsMap center={mapCenter} markers={mapMarkers} selected={locateTarget?.id} onSelect={selectMapSchool} />
          {!mapMarkers.length && !loading && <p className="text-sm text-muted-foreground">لا توجد مدارس مطابقة بإحداثيات محفوظة.</p>}
          {focusedSchool && (
            <div className="space-y-2 rounded-xl border bg-card p-3 text-sm">
              <p className="font-bold">{focusedSchool.name}</p>
              <p>{focusedSchool.address ?? focusedSchool.regionName ?? focusedSchool.governorate}</p>
              <p>{[focusedSchool.institutionType, focusedSchool.sector && SECTOR_LABELS_UI[focusedSchool.sector],
                CONTRACT_LABELS[focusedSchool.contractStatus]].filter(Boolean).join(" · ")}</p>
              {focusedSchool.principalName && <p>المدير · {focusedSchool.principalName}</p>}
              {focusedSchool.phone && <p dir="ltr" className="w-fit">{focusedSchool.phone}</p>}
              {focusedSchool.studentCount !== null && <p>الطلاب · {focusedSchool.studentCount}</p>}
              {focusedSchool.coordinator && <p>المنسّق المخصّص · {focusedSchool.coordinator.name}</p>}
              {focusedSchool.lastVisitAt && <p>آخر زيارة · {formatFullDate(focusedSchool.lastVisitAt)} {focusedSchool.lastVisitorName}</p>}
              <div className="flex flex-wrap gap-2">
                {focusedSchool.mapsUrl && <Button asChild variant="outline" size="sm">
                  <a href={focusedSchool.mapsUrl} target="_blank" rel="noreferrer"><ExternalLink />معاينة في Google Maps</a>
                </Button>}
                <Button variant="ghost" size="sm" onClick={() => setLocateTarget(null)}>إلغاء التركيز</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* النوافذ */}
      <ExcelDialog
        open={excelOpen}
        onOpenChange={setExcelOpen}
        exportQuery={exportQuery}
        onImported={refresh}
      />
      </>}
      <SchoolEditDialog
        school={editSchool}
        open={Boolean(editSchool)}
        onOpenChange={(open) => !open && setEditSchool(null)}
        regions={data?.options?.regions ?? []}
        onSaved={() => {
          if (catalog === "schools") refresh();
          else setMapRevision((value) => value + 1);
        }}
      />
      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        schoolIds={assignIds}
        schoolNames={assignNames}
        coordinators={coordinators}
        onDone={() => {
          setSelectedIds(new Set());
          if (catalog === "schools") refresh();
          else setMapRevision((value) => value + 1);
          onOpenChangeNotification?.();
        }}
      />

    </div>
  );
}
