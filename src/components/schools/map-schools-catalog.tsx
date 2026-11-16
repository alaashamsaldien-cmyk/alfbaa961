"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber } from "@/lib/time";
import { IRAQ_GOVERNORATES } from "@/lib/geo/iraq";
import type { MapMarker } from "./base-map";
import { useToast } from "@/hooks/use-toast";
import type { MapSchoolDataset } from "@/data/map-schools/catalog";
import { GovernorateCards } from "./governorate-cards";

const BaseMap = dynamic(() => import("./base-map"), { ssr: false });
const pageSize = 25;

type SavedMapSchool = {
  id: string; name: string; address: string | null; regionText: string | null; approved: boolean;
  lat: number | null; lng: number | null; coordinator: { name: string } | null; sourceId: string | null;
  lastVisitAt: string | null;
  assigneeNames?: string[];
};
type LinkCandidate = { id: string; name: string; address: string | null; regionText: string | null; canLink: boolean };
type Review = { sourceId: string; candidates: LinkCandidate[] };

export default function MapSchoolsCatalog({ revision, onAssign, onEdit }: {
  revision: number;
  onAssign: (ids: string[], names: string[]) => void;
  onEdit?: (id: string) => void;
}) {
  const { toast } = useToast();
  const [governorate, setGovernorate] = useState("");
  const [district, setDistrict] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showMap, setShowMap] = useState(false);
  const [showSavedMap, setShowSavedMap] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedMapSchool[]>([]);
  const [dataset, setDataset] = useState<MapSchoolDataset | null>(null);
  const [loadedGovernorate, setLoadedGovernorate] = useState<string>();
  const [failedGovernorate, setFailedGovernorate] = useState<string>();
  const mapContainer = useRef<HTMLDivElement>(null);
  const [counts, setCounts] = useState<Record<string, number>>();
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [refresh, setRefresh] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ governorate });
    const load = async () => {
      try {
        const response = await fetch(`/api/schools/map-catalog?${params}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (controller.signal.aborted) return;
        setCounts(Object.fromEntries(Object.keys(payload.pendingCounts).map((name) => [name, payload.counts[name] ?? 0]).concat(Object.entries(payload.counts))));
        setPendingCounts(payload.pendingCounts);
        setSaved(payload.schools);
        setDataset(payload.candidates);
        setLoadedGovernorate(governorate);
      } catch (error) {
        if (!controller.signal.aborted) {
          setFailedGovernorate(governorate);
          toast({ title: "تعذر تحميل مدارس الخريطة", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [governorate, refresh, revision, toast]);

  const approve = async (body: { savedId?: string; sourceId?: string; linkSchoolId?: string; createSeparate?: boolean }) => {
    setBusy(true);
    try {
      const response = await fetch("/api/schools/map-catalog", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (response.status === 409 && body.sourceId && Array.isArray(payload.candidates)) {
        setReview({ sourceId: body.sourceId, candidates: payload.candidates });
        return;
      }
      if (!response.ok) throw new Error(payload.error);
      setReview(null);
      setRefresh((value) => value + 1);
      toast({ title: "اعتُمِد موقع المدرسة", description: "يمكنك الآن تنسيبها للمنسّق من القائمة المعتمدة." });
    } catch (error) {
      toast({ title: "تعذّر اعتماد الموقع", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const districts = useMemo(() => Object.entries(dataset ?? {}), [dataset]);
  const schools = useMemo(() => districts.flatMap(([district, entries]) => entries.map((school) => ({ ...school, district }))), [districts]);
  const unnamedCount = schools.filter(({ name }) => !name).length;
  const mapCenter = IRAQ_GOVERNORATES.find(({ name }) => name === governorate)?.center ?? { lat: 33.3152, lng: 44.3661 };

  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ar");
    return schools.filter((school) =>
      (district === "all" || district === school.district) &&
      (!term || school.name?.toLocaleLowerCase("ar").includes(term)),
    );
  }, [district, query, schools]);
  const savedBySource = useMemo(() => new Map(saved.map((school) => [school.sourceId, school])), [saved]);
  const markers = useMemo<MapMarker[]>(() => results.map((school) => ({
    id: school.id, lat: school.lat, lng: school.lng,
    title: school.name ?? "مدرسة بلا اسم في المصدر",
    color: savedBySource.get(school.id)?.lastVisitAt ? "green" : school.id === selectedId ? "amber" : "sky",
    onClick: () => setSelectedId(school.id),
  })), [results, savedBySource, selectedId]);
  const savedMarkers = useMemo<MapMarker[]>(() => saved.flatMap((school) => {
    if (school.lat === null || school.lng === null) return [];
    return [{ id: school.id, lat: school.lat, lng: school.lng, title: school.name,
      color: school.lastVisitAt ? "green" : "sky", onClick: () => onEdit?.(school.id) }];
  }), [saved, onEdit]);
  const selectedSchool = results.find(({ id }) => id === selectedId);
  useEffect(() => {
    if (showMap && selectedId) mapContainer.current?.scrollIntoView({ block: "nearest" });
  }, [showMap, selectedId]);
  const totals = counts && Object.fromEntries(Object.entries(counts).map(([name, approved]) => [name, approved + (pendingCounts[name] ?? 0)]));
  const pages = Math.max(1, Math.ceil(results.length / pageSize));

  const selectGovernorate = (name: string) => {
    setGovernorate(name);
    setChecked([]);
    setDistrict("all");
    setQuery("");
    setPage(1);
    setShowMap(false);
    setShowSavedMap(false);
    setSelectedId(null);
    setSaved([]);
    setDataset(null);
    setLoadedGovernorate(undefined);
    setFailedGovernorate(undefined);
    setReview(null);
  };

  if (!governorate) return (
    <section className="space-y-4" aria-label="مدارس الخريطة">
      <GovernorateCards counts={totals} onSelect={selectGovernorate} missing={counts ? "بانتظار البيانات" : "—"} unit="موقع مدرسة"
        secondary={Object.fromEntries(Object.entries(pendingCounts).filter(([, count]) => count > 0).map(([name, count]) => [name, `${formatNumber(count)} قيد المراجعة`]))} />
    </section>
  );

  return (
    <section className="space-y-4" aria-label="مدارس الخريطة">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">خريطة مدارس {governorate}</h2>
          {totals?.[governorate] !== undefined && <p className="text-sm text-muted-foreground">{formatNumber(totals[governorate])} موقع · {formatNumber(counts?.[governorate] ?? 0)} معتمد</p>}
        </div>
        <Button type="button" variant="outline" onClick={() => selectGovernorate("")}><ChevronRight aria-hidden="true" />المحافظات</Button>
      </div>
      {loadedGovernorate !== governorate && <p role="status" className="text-sm text-muted-foreground">
        {failedGovernorate === governorate ? "تعذّر تحميل المواقع المحفوظة." : "جارٍ تحميل المواقع المحفوظة…"}
      </p>}
      {governorate && saved.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">مدارس الخريطة المحفوظة في {governorate}</h2>
            {savedMarkers.length > 0 && <Button type="button" size="sm" variant="outline" aria-pressed={showSavedMap}
              onClick={() => setShowSavedMap((visible) => !visible)}>{showSavedMap ? "إخفاء خريطة المدارس المحفوظة" : "خريطة المدارس المحفوظة"}</Button>}
          </div>
          {showSavedMap && savedMarkers.length > 0 && (
            <div className="h-80 overflow-hidden rounded-lg border">
              <BaseMap center={mapCenter}
                zoom={9} markers={savedMarkers} fitMarkers ariaLabel={`مواقع المدارس المحفوظة في ${governorate}`} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3"><label className="text-sm"><input type="checkbox" checked={saved.some(s=>s.approved) && saved.filter(s=>s.approved).every(s=>checked.includes(s.id))} onChange={e=>setChecked(e.target.checked?saved.filter(s=>s.approved).map(s=>s.id):[])} /> تحديد المعتمدة</label><Button disabled={!checked.length || checked.length > 500} onClick={()=>{const chosen=saved.filter(s=>checked.includes(s.id)&&s.approved);onAssign(chosen.map(s=>s.id),chosen.map(s=>s.name));}}>تنسيب المحدد ({checked.length})</Button>{checked.length > 500 && <p>حدد حتى ٥٠٠ مدرسة في كل دفعة.</p>}</div>
          <ul className="divide-y">
            {saved.map((school) => (
              <li key={school.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  {school.approved && <input type="checkbox" aria-label={`تحديد ${school.name}`} checked={checked.includes(school.id)} onChange={e=>setChecked(ids=>e.target.checked?[...ids,school.id]:ids.filter(id=>id!==school.id))} className="me-2" />}
                  {onEdit ? <button type="button" onClick={() => onEdit(school.id)} className="text-start font-semibold text-sky-800 hover:underline">{school.name}</button> : <p className="font-semibold">{school.name}</p>}
                  <p className="text-xs text-muted-foreground">
                    {school.regionText && `${school.regionText} · `}
                    {school.approved ? (school.assigneeNames?.join("، ") || school.coordinator?.name || "معتمدة · بلا تنسيب") : "بحاجة للمراجعة"}
                  </p>
                  {school.lastVisitAt && <p className="text-xs font-semibold text-emerald-700">✓ تمّت الزيارة</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {school.approved ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onAssign([school.id], [school.name])}>تنسيب</Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={busy || school.lat === null || school.lng === null}
                      onClick={() => approve({ savedId: school.id })}>اعتماد الموقع</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {loadedGovernorate === governorate && !dataset && saved.length === 0 && (
        <p role="status" className="rounded-lg border p-3 text-sm">بيانات الخريطة لمحافظة {governorate} بانتظار الاستخراج.</p>
      )}
      {dataset && (
        <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
          <div>
            <h2 className="font-bold">مدارس الخريطة في {governorate}</h2>
            <p className="text-xs text-muted-foreground">
              {formatNumber(schools.length)} موقعًا من OpenStreetMap للمراجعة، منها {formatNumber(unnamedCount)} بلا اسم في المصدر.
            </p>
            <p className="text-xs text-muted-foreground">توزيع الأقضية حسب حدود OpenStreetMap.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={district} onValueChange={(value) => { setDistrict(value); setPage(1); setSelectedId(null); }}>
              <SelectTrigger aria-label="القضاء"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقضية</SelectItem>
                {districts.map(([name, entries]) => (
                  <SelectItem key={name} value={name}>{name} ({formatNumber(entries.length)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="w-full sm:w-60"
              aria-label="ابحث عن مدرسة على الخريطة"
              placeholder="ابحث عن اسم مدرسة"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); setSelectedId(null); }}
            />
            <Button type="button" variant="outline" aria-pressed={showMap} onClick={() => setShowMap((shown) => !shown)}>
              {showMap ? "إخفاء الخريطة" : "عرض على الخريطة"}
            </Button>
          </div>
          {review && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" role="status">
              <p className="font-semibold">في سجلات قريبة أو بأسماء مطابقة. اختَر سجل المدرسة نفسها للربط.</p>
              {review.candidates.map((candidate) => (
                <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{candidate.name} {[candidate.regionText, candidate.address].filter(Boolean).join(" · ")}</span>
                  {candidate.canLink && <Button type="button" size="sm" variant="outline" disabled={busy}
                    onClick={() => approve({ sourceId: review.sourceId, linkSchoolId: candidate.id })}>ربط بالسجل</Button>}
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => approve({ sourceId: review.sourceId, createSeparate: true })}>مدرسة مختلفة · أضف سجلًا</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setReview(null)}>إلغاء</Button>
            </div>
          )}
          {showMap && results.length > 0 && (
            <div className="space-y-2">
              <div ref={mapContainer} className="h-80 overflow-hidden rounded-lg border">
                <BaseMap center={selectedSchool ?? mapCenter} zoom={selectedSchool ? 17 : 9} markers={markers} fitMarkers={!selectedSchool} ariaLabel={`مواقع مدارس ${governorate}`} />
              </div>
              {selectedSchool && <p className="text-sm font-semibold">{selectedSchool.name ?? "مدرسة بلا اسم في المصدر"} · {selectedSchool.district}</p>}
            </div>
          )}
          {results.length ? (
            <ul className="divide-y rounded-lg border" aria-label="أسماء مدارس الخريطة">
              {results.slice((page - 1) * pageSize, page * pageSize).map((school) => (
                <li key={school.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                  <div>
                    <p className="font-semibold">{school.name ?? "مدرسة بلا اسم في المصدر"}</p>
                    <p className="text-xs text-muted-foreground">{school.district}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="ghost" className="text-sky-700 hover:bg-sky-100 hover:text-sky-800" aria-pressed={showMap && selectedId === school.id}
                      onClick={() => { setSelectedId(school.id); setShowMap(true); }}><MapPin aria-hidden="true" />معاينة الموقع <span className="sr-only">{school.name ?? school.district}</span></Button>
                    {savedBySource.get(school.id)?.approved ? (
                      <span className="text-xs font-semibold text-emerald-700">معتمدة</span>
                    ) : school.name && (
                      <Button type="button" size="sm" variant="outline" disabled={busy}
                        onClick={() => approve({ sourceId: school.id })}>اعتماد الموقع</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">ما في مدارس مطابقة للبحث.</p>}
          {pages > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>السابق</Button>
              <span className="text-xs text-muted-foreground">صفحة {page} من {pages} · {formatNumber(results.length)} موقع</span>
              <Button type="button" variant="outline" size="sm" disabled={page === pages} onClick={() => setPage(page + 1)}>التالي</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            <a href="https://www.openstreetmap.org/copyright" className="underline" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
            {" · "}
            <a href="https://download.geofabrik.de/asia/iraq.html" className="underline" target="_blank" rel="noreferrer">نسخة Geofabrik من 13 نوفمبر 2026</a>
          </p>
        </div>
      )}
    </section>
  );
}
