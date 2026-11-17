"use client";

// ——— مدارس الخريطة: المحافظة ← مناطقها ← أسماء مدارسها ———
// أُلغيت خطوة «اعتماد الموقع»: فتح المحافظة يضيف مدارسها تلقائياً ويوزعها على المناطق.
// التنسيب على مستوى المنطقة (يشمل المدارس المستقبلية) أو على مستوى المدرسة.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, MapPin, Pencil, RefreshCw, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber } from "@/lib/time";
import { IRAQ_GOVERNORATES } from "@/lib/geo/iraq";
import type { MapMarker } from "./base-map";
import { useToast } from "@/hooks/use-toast";
import { GovernorateCards } from "./governorate-cards";
import { RegionAssignDialog, type AssignableRegion } from "@/components/regions/region-assign-dialog";

const BaseMap = dynamic(() => import("./base-map"), { ssr: false });
const pageSize = 50;
const UNNAMED_SCHOOL = "مدرسة بلا اسم";
const NO_REGION = "__none__";

type MapSchool = {
  id: string; name: string; regionId: string | null; regionText: string | null;
  lat: number | null; lng: number | null; lastVisitAt: string | null; contractStatus: string;
  assigneeNames: string[];
};
type RegionRow = { id: string; name: string; schoolCount: number; coordinators: { id: string; name: string }[] };
type SyncInfo = { created: number; linked: number; regionLinked: number; assigned: number } | null;
type StatusFilter = "all" | "unassigned" | "assigned" | "visited" | "unnamed";

export default function MapSchoolsCatalog({ revision, onAssign, onEdit }: {
  revision: number;
  onAssign: (ids: string[], names: string[]) => void;
  onEdit?: (id: string) => void;
}) {
  const { toast } = useToast();
  const [governorate, setGovernorate] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>();
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [schools, setSchools] = useState<MapSchool[] | null>(null);
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [sync, setSync] = useState<SyncInfo>(null);
  const [refresh, setRefresh] = useState(0);
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<string[]>([]);
  const [checkedRegions, setCheckedRegions] = useState<string[]>([]);
  const [assignRegionIds, setAssignRegionIds] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(governorate ? { governorate } : {});
    (async () => {
      try {
        const response = await fetch(`/api/schools/map-catalog?${params}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (controller.signal.aborted) return;
        if (!governorate) {
          setCounts(payload.counts);
          setAssignedCounts(payload.assignedCounts ?? {});
          return;
        }
        setSchools(payload.schools);
        setRegions(payload.regions);
        setSync(payload.sync);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (governorate) setSchools([]);
        toast({ title: "تعذر تحميل مدارس الخريطة", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      }
    })();
    return () => controller.abort();
  }, [governorate, refresh, revision, toast]);

  const selectGovernorate = (name: string) => {
    setGovernorate(name);
    setSchools(null); setRegions([]); setSync(null);
    setRegion("all"); setStatus("all"); setQuery(""); setPage(1);
    setChecked([]); setCheckedRegions([]); setShowMap(false); setEditing(null);
  };

  const regionName = useMemo(() => new Map(regions.map((r) => [r.id, r.name])), [regions]);
  const all = useMemo(() => schools ?? [], [schools]);
  const unregioned = all.filter((s) => !s.regionId).length;

  const results = useMemo(() => {
    const term = query.trim();
    return all.filter((s) =>
      (region === "all" || (region === NO_REGION ? !s.regionId : s.regionId === region)) &&
      (status === "all" ||
        (status === "unassigned" && !s.assigneeNames.length) ||
        (status === "assigned" && s.assigneeNames.length > 0) ||
        (status === "visited" && s.lastVisitAt) ||
        (status === "unnamed" && s.name === UNNAMED_SCHOOL)) &&
      (!term || s.name.includes(term) || (s.regionText ?? "").includes(term)));
  }, [all, region, status, query]);

  const stats = useMemo(() => ({
    total: all.length,
    assigned: all.filter((s) => s.assigneeNames.length).length,
    visited: all.filter((s) => s.lastVisitAt).length,
    unnamed: all.filter((s) => s.name === UNNAMED_SCHOOL).length,
  }), [all]);

  const pages = Math.max(1, Math.ceil(results.length / pageSize));
  const pageItems = results.slice((page - 1) * pageSize, page * pageSize);
  const markers = useMemo<MapMarker[]>(() => results.flatMap((s) => s.lat === null || s.lng === null ? [] : [{
    id: s.id, lat: s.lat, lng: s.lng, title: s.name,
    color: s.lastVisitAt ? "green" : s.assigneeNames.length ? "sky" : "amber",
    onClick: () => onEdit?.(s.id),
  }]).slice(0, 3000), [results, onEdit]);
  const mapCenter = IRAQ_GOVERNORATES.find(({ name }) => name === governorate)?.center ?? { lat: 33.3152, lng: 44.3661 };

  const syncAll = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/schools/map-catalog", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "syncAll" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      toast({
        title: "اكتملت المزامنة",
        description: `أُضيفت ${formatNumber(payload.total.created + payload.total.linked)} مدرسة · رُبطت ${formatNumber(payload.total.regionLinked)} بمناطقها · ${formatNumber(payload.total.assigned)} تنسيب تلقائي.`,
      });
      setRefresh((v) => v + 1);
    } catch (error) {
      toast({ title: "تعذرت المزامنة", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (name.length < 2) { toast({ title: "اكتب اسم المدرسة", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/schools/map-catalog", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", schoolId: editing.id, name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setSchools((list) => list?.map((s) => s.id === editing.id ? { ...s, name: payload.name } : s) ?? list);
      setEditing(null);
      toast({ title: "حُفظ اسم المدرسة" });
    } catch (error) {
      toast({ title: "تعذر حفظ الاسم", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const assignableRegions: AssignableRegion[] = assignRegionIds.flatMap((id) => {
    const r = regions.find((item) => item.id === id);
    return r ? [{ ...r, governorate }] : [];
  });

  // ——— قائمة المحافظات ———
  if (!governorate) return (
    <section className="space-y-4" aria-label="مدارس الخريطة">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">مدارس الخريطة</h2>
          <p className="text-xs text-muted-foreground">اختر محافظة لعرض مدارسها موزعة على المناطق. الإضافة والتوزيع تلقائيان.</p>
        </div>
        <Button type="button" variant="outline" className="gap-2" disabled={busy} onClick={syncAll}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
          {busy ? "جارٍ المزامنة…" : "مزامنة كل المحافظات"}
        </Button>
      </div>
      <GovernorateCards
        counts={counts} onSelect={selectGovernorate} missing={counts ? "0 مدرسة" : "—"} unit="مدرسة"
        secondary={Object.fromEntries(Object.entries(assignedCounts).filter(([, n]) => n > 0).map(([name, n]) => [name, `${formatNumber(n)} منسّبة`]))}
      />
    </section>
  );

  // ——— محافظة واحدة: المناطق + المدارس ———
  return (
    <section className="space-y-4" aria-label={`مدارس ${governorate}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">مدارس {governorate}</h2>
          {schools && (
            <p className="text-sm text-muted-foreground">
              {formatNumber(stats.total)} مدرسة · {formatNumber(regions.length)} منطقة · {formatNumber(stats.assigned)} منسّبة · {formatNumber(stats.visited)} تمت زيارتها
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={!schools} onClick={() => setRefresh((v) => v + 1)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />تحديث
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => selectGovernorate("")}><ChevronRight aria-hidden="true" />المحافظات</Button>
        </div>
      </div>

      {!schools && <p role="status" className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">جارٍ تحميل المدارس وتوزيعها على المناطق…</p>}

      {sync && (sync.created > 0 || sync.linked > 0 || sync.regionLinked > 0) && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          أُضيفت {formatNumber(sync.created + sync.linked)} مدرسة ووُزّعت على مناطقها تلقائياً
          {sync.assigned > 0 && ` · ${formatNumber(sync.assigned)} تنسيب تلقائي من تنسيب المناطق`}.
        </p>
      )}

      {schools && schools.length === 0 && (
        <p className="rounded-xl border p-4 text-sm">لا توجد مدارس خريطة لمحافظة {governorate} بعد. أضفها من قسم «المدارس» عبر Excel أو الاكتشاف وستظهر هنا موزعة على مناطقها.</p>
      )}

      {/* المناطق */}
      {schools && regions.length > 0 && (
        <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">المناطق</h3>
              <p className="text-xs text-muted-foreground">تنسيب المنطقة يشمل مدارسها الحالية والمستقبلية تلقائياً.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={regions.every((r) => checkedRegions.includes(r.id))}
                  onChange={(e) => setCheckedRegions(e.target.checked ? regions.map((r) => r.id) : [])} />
                تحديد الكل
              </label>
              <Button type="button" size="sm" className="gap-1" disabled={!checkedRegions.length} onClick={() => setAssignRegionIds(checkedRegions)}>
                <Users className="h-4 w-4" aria-hidden="true" />تنسيب المناطق المحددة ({formatNumber(checkedRegions.length)})
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {regions.map((r) => (
              <div key={r.id} className={`rounded-xl border p-3 transition-colors ${region === r.id ? "border-sky-400 bg-sky-50/60" : "bg-background"}`}>
                <div className="flex items-start justify-between gap-2">
                  <label className="flex min-w-0 cursor-pointer items-start gap-2">
                    <input type="checkbox" className="mt-1" aria-label={`تحديد منطقة ${r.name}`} checked={checkedRegions.includes(r.id)}
                      onChange={(e) => setCheckedRegions((ids) => e.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id))} />
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{formatNumber(r.schoolCount)} مدرسة</span>
                    </span>
                  </label>
                  <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => setAssignRegionIds([r.id])}>
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />تنسيب
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {r.coordinators.length ? r.coordinators.map((c) => (
                    <Badge key={c.id} variant="outline" className="border-sky-200 bg-sky-50 text-[11px] text-sky-800">{c.name}</Badge>
                  )) : <span className="text-xs text-amber-600">غير منسّبة</span>}
                  <button type="button" className="ms-auto text-xs font-semibold text-sky-700 hover:underline"
                    onClick={() => { setRegion(region === r.id ? "all" : r.id); setPage(1); }}>
                    {region === r.id ? "عرض الكل" : "عرض مدارسها"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* المدارس */}
      {schools && schools.length > 0 && (
        <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={region} onValueChange={(v) => { setRegion(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]" aria-label="المنطقة"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المناطق</SelectItem>
                {regions.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({formatNumber(r.schoolCount)})</SelectItem>)}
                {unregioned > 0 && <SelectItem value={NO_REGION}>بلا منطقة ({formatNumber(unregioned)})</SelectItem>}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v as StatusFilter); setPage(1); }}>
              <SelectTrigger className="w-[160px]" aria-label="الحالة"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المدارس</SelectItem>
                <SelectItem value="unassigned">غير منسّبة</SelectItem>
                <SelectItem value="assigned">منسّبة</SelectItem>
                <SelectItem value="visited">تمت زيارتها</SelectItem>
                <SelectItem value="unnamed">بلا اسم ({formatNumber(stats.unnamed)})</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute end-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input aria-label="ابحث عن مدرسة" placeholder="ابحث باسم المدرسة" value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1" aria-pressed={showMap} onClick={() => setShowMap((v) => !v)}>
              <MapPin className="h-4 w-4" aria-hidden="true" />{showMap ? "إخفاء الخريطة" : "الخريطة"}
            </Button>
          </div>

          {showMap && markers.length > 0 && (
            <div className="h-80 overflow-hidden rounded-lg border">
              <BaseMap center={mapCenter} zoom={9} markers={markers} fitMarkers ariaLabel={`مواقع مدارس ${governorate}`} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={pageItems.length > 0 && pageItems.every((s) => checked.includes(s.id))}
                onChange={(e) => setChecked((ids) => e.target.checked
                  ? [...new Set([...ids, ...pageItems.map((s) => s.id)])]
                  : ids.filter((id) => !pageItems.some((s) => s.id === id)))} />
              تحديد الصفحة
            </label>
            <button type="button" className="text-xs font-semibold text-sky-700 hover:underline"
              onClick={() => setChecked(results.slice(0, 500).map((s) => s.id))}>
              تحديد كل النتائج ({formatNumber(Math.min(results.length, 500))})
            </button>
            {checked.length > 0 && <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setChecked([])}>إلغاء التحديد</button>}
            <Button type="button" size="sm" disabled={!checked.length || checked.length > 500} onClick={() => {
              const chosen = all.filter((s) => checked.includes(s.id));
              onAssign(chosen.map((s) => s.id), chosen.map((s) => s.name));
            }}>تنسيب المدارس المحددة ({formatNumber(checked.length)})</Button>
            <span className="text-xs text-muted-foreground">{formatNumber(results.length)} نتيجة</span>
          </div>

          {results.length ? (
            <ul className="divide-y rounded-lg border" aria-label="أسماء المدارس">
              {pageItems.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <input type="checkbox" className="mt-1" aria-label={`تحديد ${s.name}`} checked={checked.includes(s.id)}
                      onChange={(e) => setChecked((ids) => e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id))} />
                    <div className="min-w-0 flex-1">
                      {editing?.id === s.id ? (
                        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
                          <Input autoFocus className="h-8 w-full sm:w-72" value={editing.name} placeholder="اكتب اسم المدرسة"
                            onChange={(e) => setEditing({ id: s.id, name: e.target.value })} aria-label="اسم المدرسة" />
                          <Button type="submit" size="sm" className="h-8" disabled={busy}>حفظ</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>إلغاء</Button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {s.name === UNNAMED_SCHOOL ? (
                            <span className="font-semibold text-amber-700">{s.name}</span>
                          ) : onEdit ? (
                            <button type="button" onClick={() => onEdit(s.id)} className="text-start font-semibold text-sky-800 hover:underline">{s.name}</button>
                          ) : <span className="font-semibold">{s.name}</span>}
                          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`تعديل اسم ${s.name}`} onClick={() => setEditing({ id: s.id, name: s.name === UNNAMED_SCHOOL ? "" : s.name })}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          {s.lastVisitAt && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">تمت الزيارة</Badge>}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {(s.regionId && regionName.get(s.regionId)) || s.regionText || "بلا منطقة"}
                        {" · "}
                        {s.assigneeNames.length ? <span className="text-sky-700">{s.assigneeNames.join("، ")}</span> : <span className="text-amber-600">غير منسّبة</span>}
                      </p>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onAssign([s.id], [s.name])}>تنسيب</Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">لا توجد مدارس مطابقة.</p>}

          {pages > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>السابق</Button>
              <span className="text-xs text-muted-foreground">صفحة {formatNumber(page)} من {formatNumber(pages)}</span>
              <Button type="button" variant="outline" size="sm" disabled={page === pages} onClick={() => setPage(page + 1)}>التالي</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            <a href="https://www.openstreetmap.org/copyright" className="underline" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
          </p>
        </div>
      )}

      <RegionAssignDialog
        open={assignRegionIds.length > 0}
        onOpenChange={(open) => { if (!open) setAssignRegionIds([]); }}
        regions={assignableRegions}
        onDone={() => { setCheckedRegions([]); setRefresh((v) => v + 1); }}
      />
    </section>
  );
}
