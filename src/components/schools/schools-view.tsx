"use client";

// ——— قسم المدارس الرئيسي ———
// جدول كل المدارس + فلاتر شاملة + خريطة النظام + أزرار الاكتشاف وExcel.
// النتائج تُحدّث تلقائياً عند تغيير أي فلتر.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Table2, Map as MapIcon, Compass, FileSpreadsheet, Loader2, UserRoundPlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import dynamic from "next/dynamic";
import { SchoolsFilters, EMPTY_FILTERS, type FiltersState } from "./schools-filters";
import { SchoolsTable } from "./schools-table";
import { SchoolEditDialog } from "./school-edit-dialog";
import { AssignDialog } from "./assign-dialog";
import { ExcelDialog } from "./excel-dialog";
import { DiscoveryDialog } from "./discovery-dialog";
import { CONTRACT_LABELS, AVAILABILITY_LABELS } from "@/lib/labels";
import {
  DISCOVERY_STATUS_BADGE,
  DISCOVERY_STATUS_LABELS,
  SECTOR_LABELS_UI,
  DATA_SOURCE_LABELS,
  type SchoolDTO,
  type SchoolsListResponse,
  type CoordinatorDTO,
} from "@/lib/types";

const BaseMap = dynamic(() => import("./base-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">جارٍ تحميل الخريطة...</div>,
});

export function SchoolsView({ onOpenChangeNotification }: { onOpenChangeNotification?: () => void }) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [data, setData] = useState<SchoolsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "map">("table");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // نوافذ
  const [editSchool, setEditSchool] = useState<SchoolDTO | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [assignNames, setAssignNames] = useState<string[]>([]);
  const [excelOpen, setExcelOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
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
        setData(j as SchoolsListResponse);
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
    const t = setTimeout(() => {
      setPage(1);
      load(1);
    }, 250);
    return () => clearTimeout(t);
  }, [filters, view]);

  useEffect(() => {
    if (view === "map") return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(page, true, controller.signal);
    }, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load, page, view]);

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

  // ——— خريطة النظام ———
  const mapMarkers = useMemo(() => {
    const schools = (data?.schools ?? []).filter((s) => s.hasCoords);
    return schools.map((s) => {
      const esc = (t: string | null | undefined) =>
        (t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const popup = `
        <div style="font-family:inherit;min-width:220px;direction:rtl;text-align:right">
          <p style="margin:0 0 6px;font-weight:800;font-size:14px">${esc(s.name)}</p>
          <p style="margin:0 0 3px;font-size:12px">النوع: ${esc(s.institutionType ?? "غير متوفرة")}${s.sector ? ` · ${esc(SECTOR_LABELS_UI[s.sector] ?? "")}` : ""}</p>
          <p style="margin:0 0 3px;font-size:12px">المدير: ${esc(s.principalName ?? "غير متوفرة")}</p>
          <p style="margin:0 0 3px;font-size:12px">الطلاب: ${s.studentCount !== null ? s.studentCount : "غير متوفرة"}</p>
          <p style="margin:0 0 3px;font-size:12px" dir="ltr">هاتف: ${esc(s.phone ?? "غير متوفرة")}</p>
          <p style="margin:0 0 3px;font-size:12px">التعاقد: ${esc(CONTRACT_LABELS[s.contractStatus] ?? s.contractStatus)} · الزيارة: ${s.lastVisitAt ? "تمت" : "لم تُزر"}</p>
          <p style="margin:0 0 3px;font-size:12px">المنسقة: ${esc(s.coordinator?.name ?? "غير مخصصة")}</p>
          <p style="margin:0 0 6px;font-size:11px;color:#64748b">التوثيق: ${esc(DISCOVERY_STATUS_LABELS[s.discoveryStatus] ?? s.discoveryStatus)}</p>
          ${s.mapsUrl ? `<a href="${s.mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#0284c7;font-size:12px">فتح الموقع على Google Maps</a>` : ""}
        </div>`;
      return {
        id: s.id,
        lat: s.lat!,
        lng: s.lng!,
        color: s.contractStatus === "CONTRACTED" ? ("green" as const) : s.lastVisitAt ? ("amber" as const) : ("sky" as const),
        title: s.name,
        popupHtml: popup,
      };
    });
  }, [data]);

  const exportQuery = useMemo(() => buildQuery(1), [buildQuery]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="space-y-4">
      {/* رأس القسم */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">إدارة المدارس</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data ? `${data.total} مدرسة مسجلة في النظام` : "جارٍ التحميل..."} — تظهر جميع المدارس افتراضياً وتُصفّى بالفلاتر.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setDiscoveryOpen(true)} className="gap-2">
            <Compass className="h-4 w-4" aria-hidden="true" />
            اكتشاف المدارس
          </Button>
          <Button type="button" variant="outline" onClick={() => setExcelOpen(true)} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Excel
          </Button>
          {selectedIds.size > 0 && (
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              onClick={() =>
                openAssign(
                  Array.from(selectedIds),
                  (data?.schools ?? []).filter((s) => selectedIds.has(s.id)).map((s) => s.name)
                )
              }
            >
              <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
              تخصيص المحدد ({selectedIds.size}) لمنسقة
            </Button>
          )}
        </div>
      </div>

      <SchoolsFilters filters={filters} onChange={setFilters} options={data?.options ?? null} resultCount={data?.total ?? 0} />

      <Tabs value={view} onValueChange={(v) => setView(v as "table" | "map")}>
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
            onAssign={(s) => openAssign([s.id], [s.name])}
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
        <div className="relative h-[560px] overflow-hidden rounded-xl border bg-white">
          {mapMarkers.length === 0 && !loading && (
            <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/95 p-6 text-center">
              <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold">لا توجد مدارس بإحداثيات محفوظة</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                كل مدرسة معتمدة يجب أن يكون لها موقع جغرافي. استخدم اكتشاف المدارس لتسجيل مواقع حقيقية.
              </p>
            </div>
          )}
          <BaseMap
            center={{ lat: locateTarget?.lat ?? 33.3152, lng: locateTarget?.lng ?? 44.3661 }}
            zoom={locateTarget ? 15 : 12}
            markers={mapMarkers}
            fitBounds={locateTarget ? null : null}
          />
          {locateTarget && (
            <div className="absolute bottom-3 start-3 z-[1000] rounded-lg border bg-white px-3 py-2 shadow-md">
              <p className="text-xs font-bold">{locateTarget.name}</p>
              <p className="text-[11px] text-muted-foreground">مركز الخريطة على هذه المدرسة</p>
              <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => setLocateTarget(null)}>
                إلغاء التركيز
              </Button>
            </div>
          )}
          <div className="absolute top-3 start-3 z-[1000] flex flex-wrap gap-1.5 rounded-lg border bg-white/95 px-3 py-2 shadow-md text-[11px]">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />غير متعاقدة</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />تمت زيارتها</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-600" />متعاقدة</span>
          </div>
        </div>
      )}

      {/* النوافذ */}
      <SchoolEditDialog
        school={editSchool}
        open={Boolean(editSchool)}
        onOpenChange={(o) => !o && setEditSchool(null)}
        regions={data?.options?.regions ?? []}
        onSaved={refresh}
      />

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        schoolIds={assignIds}
        schoolNames={assignNames}
        coordinators={coordinators}
        onDone={() => {
          setSelectedIds(new Set());
          refresh();
          onOpenChangeNotification?.();
        }}
      />

      <ExcelDialog
        open={excelOpen}
        onOpenChange={setExcelOpen}
        exportQuery={exportQuery}
        onImported={refresh}
      />

      <DiscoveryDialog
        open={discoveryOpen}
        onOpenChange={setDiscoveryOpen}
        governorates={data?.options?.governorates ?? []}
        regions={data?.options?.regions ?? []}
        onSaved={refresh}
      />
    </div>
  );
}
