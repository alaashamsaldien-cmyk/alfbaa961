"use client";

import { useCallback, useMemo, useState } from "react";
import { ExternalLink, MapPin, Search, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoogleSchoolCount } from "./google-school-count";
import { GoogleSchoolsMap } from "./google-schools-map";
import { SCHOOL_GOVERNORATES } from "@/lib/geo/school-governorates";
import type { DiscoveredPlace } from "@/lib/geo/providers";

type Result = DiscoveredPlace & {
  school: { id: string; sector: string | null; lastVisitAt: string | null; coordinator: { name: string } | null } | null;
};

export function GoogleSchoolsSearch({ governorate, onAssign }: {
  governorate: string;
  onAssign?: (id: string, name: string) => void;
}) {
  const [q, setQuery] = useState("");
  const [type, setType] = useState("school");
  const [view, setView] = useState("map");
  const [places, setPlaces] = useState<Result[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string>();
  const [error, setError] = useState("");
  const [copiedPlaceId, setCopiedPlaceId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const region = SCHOOL_GOVERNORATES.find((item) => item.name === governorate);
  const select = useCallback((id: string) => setChosen(id), []);
  const markers = useMemo(() => (places ?? []).map((place) => ({
    id: place.providerRef, name: place.name ?? "", lat: place.lat, lng: place.lng,
    visited: Boolean(place.school?.lastVisitAt),
  })), [places]);
  const selected = places?.find((place) => place.providerRef === chosen);
  const department = type === "school" ? "مدرسة" : "معهد";

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!region) return;
    setLoading(true);
    setError("");
    setPlaces(null);
    setChosen(undefined);
    setWarnings([]);
    try {
      const params = new URLSearchParams({ governorate, q, type });
      const response = await fetch(`/api/schools/google?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذر البحث.");
      setPlaces(data.places);
      setWarnings(data.warnings);
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر البحث.");
    } finally {
      setLoading(false);
    }
  }

  function details(place: Result) {
    const sector = place.school?.sector;
    return (
      <article className="space-y-2 rounded-xl border bg-card p-3">
        <p className="font-semibold">{place.name}</p>
        <p className="text-sm text-muted-foreground">{place.address ?? "العنوان غير متوفر"}</p>
        <p className="text-xs">{place.institutionType === "SCHOOL" ? "مدرسة" : "معهد"} · {sector === "PRIVATE" ? "أهلية" : sector === "GOVERNMENT" ? "حكومية" : "القطاع غير موثق"}</p>
        {place.website && /^https?:\/\//i.test(place.website) && <a href={place.website} target="_blank" rel="noreferrer" className="text-xs text-primary">الموقع الإلكتروني</a>}
        {place.phone && <p className="text-xs"><a href={`tel:${place.phone}`} dir="ltr">{place.phone}</a></p>}
        {place.school?.coordinator && <p className="text-xs">المنسّق المخصّص · {place.school.coordinator.name}</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><a href={place.mapsUrl} target="_blank" rel="noreferrer"><ExternalLink />معاينة في Google Maps</a></Button>
          {view === "table" && <Button size="sm" variant="ghost" onClick={() => { setChosen(place.providerRef); setView("map"); }}><MapPin />إظهار على الخريطة</Button>}
          {!place.school && place.placeId && (
            <Button size="sm" variant="ghost" onClick={async () => {
              if (!place.placeId) return;
              try {
                await navigator.clipboard.writeText(place.placeId);
                setCopiedPlaceId(place.placeId);
              } catch {
                setError("تعذر نسخ المعرّف.");
              }
            }}>{copiedPlaceId === place.placeId ? "نُسخ المعرّف" : "نسخ معرّف Google للاستيراد من Excel"}</Button>
          )}
          {place.school && onAssign && <Button size="sm" variant="outline" onClick={() => { if (place.school) onAssign(place.school.id, place.name ?? ""); }}><UserRoundPlus />تنسيب</Button>}
        </div>
      </article>
    );
  }

  if (!region) return <p className="rounded-xl border p-4 text-sm">اختر محافظة من أعلى الصفحة للبحث في Google Maps.</p>;
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <GoogleSchoolCount governorate={governorate} />
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQuery(e.target.value)} maxLength={120} className="min-w-44 flex-1" placeholder={`اسم ${department} أو العنوان`} aria-label="الاسم أو العنوان" />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36" aria-label="نوع المؤسسة"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="school">مدارس</SelectItem><SelectItem value="institute">معاهد</SelectItem></SelectContent>
        </Select>
        <Button disabled={loading}><Search />{loading ? "جارٍ البحث…" : "بحث في Google"}</Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {places && (
        <>
          <Tabs value={view} onValueChange={setView}>
            <TabsList><TabsTrigger value="map">خريطة النظام</TabsTrigger><TabsTrigger value="table">جدول النتائج</TabsTrigger></TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground" role="status">{places.length} نتيجة · {governorate}</p>
          {warnings.map((warning) => <p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}
          {view === "map" && (
            <>
              <GoogleSchoolsMap markers={markers} center={region.center} selected={chosen} onSelect={select} />
              {selected && details(selected)}
            </>
          )}
          {view === "table" && (
            <div className="space-y-2">
              <span className="inline-block rounded-md border bg-white px-2 py-1 text-xs text-slate-800" translate="no">Google Maps</span>
              {places.map((place) => <div key={place.providerRef}>{details(place)}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
