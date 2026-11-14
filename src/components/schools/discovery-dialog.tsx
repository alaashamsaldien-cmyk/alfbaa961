"use client";

// ——— واجهة اكتشاف المدارس والمؤسسات التعليمية ———
// خريطة تفاعلية + بحث داخل نطاق جغرافي + نتائج على الخريطة والقائمة.
// البحث محصور بالمؤسسات التعليمية فقط عبر فئات محددة مسبقاً في طبقة المصادر.
// النتائج لا تُحفظ إلا بعد قرار المستخدم، مع منع تكرار تلقائي ومراجعة للمشابهات.

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Compass, Search, Loader2, PlusSquare, ExternalLink, Pencil, ShieldAlert, Info } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { INSTITUTION_TYPE_LABELS, type InstitutionTypeKey } from "@/lib/geo/normalize";
import {
  SECTOR_LABELS_UI,
  type AppConfig,
  type DiscoverySearchResponse,
  type DiscoveryResultItem,
  type SaveSummaryDTO,
  type DiscoveredPlaceDTO,
} from "@/lib/types";

const BaseMap = dynamic(() => import("./base-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">جارٍ تحميل الخريطة...</div>,
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  governorates: string[];
  regions: { id: string; name: string; governorate: string }[];
  onSaved: () => void;
}

interface ProvidersConfig {
  googlePlacesEnabled: boolean;
}

const EDU_TYPE_KEYS: InstitutionTypeKey[] = [
  "SCHOOL",
  "KINDERGARTEN",
  "COLLEGE_INSTITUTE",
  "UNIVERSITY",
  "TRAINING_CENTER",
  "LANGUAGE_CENTER",
];

export function DiscoveryDialog({ open, onOpenChange, governorates, regions, onSaved }: Props) {
  const { toast } = useToast();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [provider, setProvider] = useState<"OSM" | "GOOGLE_PLACES" | "OVERPASS">("OSM");
  const [governorate, setGovernorate] = useState("بغداد");
  const [areaName, setAreaName] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [types, setTypes] = useState<Set<InstitutionTypeKey>>(new Set(["SCHOOL", "KINDERGARTEN", "COLLEGE_INSTITUTE", "UNIVERSITY"]));

  const [center, setCenter] = useState({ lat: 33.3152, lng: 44.3661 });
  const [radius, setRadius] = useState(2000);
  const [bounds, setBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null);

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DiscoveryResultItem[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [lastSummary, setLastSummary] = useState<SaveSummaryDTO | null>(null);

  // مراجعة المشابهات
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<{ place: DiscoveredPlaceDTO; candidates: { name: string; similarity: number; distanceM: number | null }[] }[]>([]);

  // تعديل البيانات قبل الحفظ
  const [editPlace, setEditPlace] = useState<DiscoveredPlaceDTO | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", sector: "none", stages: "", address: "" });

  useEffect(() => {
    if (!open) return;
    fetch("/api/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: AppConfig | null) => {
        if (j) {
          setConfig(j);
          const baghdad = j.governorates.find((g) => g.name === "بغداد");
          if (baghdad) setCenter(baghdad.center);
        }
      })
      .catch(() => {});
  }, [open]);

  // تحريك مركز الخريطة حسب اختيار المنطقة
  useEffect(() => {
    if (!config) return;
    if (governorate !== "بغداد") {
      const g = config.governorates.find((x) => x.name === governorate);
      if (g) setCenter(g.center);
      return;
    }
    if (areaName !== "all") {
      const a = config.baghdadAreas.find((x) => x.name === areaName);
      if (a) setCenter(a.center);
    }
  }, [config, governorate, areaName]);

  const search = useCallback(async () => {
    setSearching(true);
    setWarnings([]);
    setLastSummary(null);
    try {
      const body: Record<string, unknown> = {
        provider,
        mode: "AREA",
        governorate,
        areaName: areaName === "all" ? undefined : areaName,
        keyword: keyword.trim() || undefined,
        types: Array.from(types),
        bounds: bounds ?? undefined,
        // مزود Google يعمل بدائرة حول المركز
        ...(provider === "GOOGLE_PLACES" ? { center, radiusMeters: radius } : {}),
      };
      const res = await fetch("/api/schools/discovery/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر تنفيذ البحث");
      const data = j as DiscoverySearchResponse;
      setResults(data.items);
      setWarnings(data.meta.warnings ?? []);
      setSelected(new Set(data.items.filter((i) => !i.inSystem).map((i) => i.place.providerRef)));
      if (data.items.length === 0) {
        toast({
          title: "لا نتائج",
          description: "لم يعثر المصدر على مؤسسات تعليمية مسجلة في هذا النطاق. وسّع النطاق أو حرّك الخريطة.",
        });
      } else {
        toast({ title: `تم العثور على ${data.items.length} نتيجة`, description: `${data.items.filter((i) => i.inSystem).length} منها مسجلة مسبقاً في النظام.` });
      }
    } catch (e) {
      toast({ title: "فشل البحث", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }, [provider, governorate, areaName, keyword, types, bounds, center, radius, toast]);

  // حفظ دفعة أو مدرسة واحدة — مع منع التكرار تلقائياً في الخادم
  const saveItems = useCallback(
    async (items: DiscoveryResultItem[], forceRefs: string[] = []) => {
      if (items.length === 0) return;
      setSaving(true);
      try {
        const res = await fetch("/api/schools/discovery/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            mode: "AREA",
            governorate,
            areaName: areaName === "all" ? undefined : areaName,
            keyword: keyword.trim() || undefined,
            types: Array.from(types),
            bounds,
            resultCount: results?.length ?? items.length,
            forceNewProviderRefs: forceRefs,
            places: items.map((i) => i.place),
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
        const summary = j as SaveSummaryDTO;

        const similar = summary.items.filter((s) => s.state === "SIMILAR_REVIEW");
        setLastSummary(summary);

        if (similar.length > 0) {
          // عرض المشابهات للمراجعة — لا دمج تلقائي أبداً
          setReviewItems(
            similar.map((s) => ({
              place: items.find((i) => i.place.name === s.name)?.place ?? { ...items[0].place, name: s.name },
              candidates: s.candidates,
            }))
          );
          setReviewOpen(true);
        }

        const addedNames = summary.items.filter((s) => s.state === "SAVED").map((s) => s.name);
        if (addedNames.length > 0) {
          toast({
            title: `تمت إضافة ${summary.addedCount} مدرسة إلى النظام`,
            description: addedNames.slice(0, 3).join("، ") + (addedNames.length > 3 ? ` و${addedNames.length - 3} أخرى` : ""),
          });
          onSaved();
        } else if (summary.duplicateCount > 0) {
          toast({
            title: "لا سجلات جديدة",
            description: `${summary.duplicateCount} مدرسة موجودة مسبقاً في النظام — منع التكرار منع الإضافة.`,
          });
        }

        // تحديث حالة النتائج المعروضة
        setResults((prev) =>
          prev
            ? prev.map((i) => {
                const st = summary.items.find((s) => s.state === "SAVED" && s.name === i.place.name);
                if (st && st.state === "SAVED") return { ...i, inSystem: true, existingSchoolId: st.schoolId };
                return i;
              })
            : prev
        );
        setSelected(new Set());
      } catch (e) {
        toast({ title: "فشل الحفظ", description: e instanceof Error ? e.message : "", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [provider, governorate, areaName, keyword, types, bounds, results, toast, onSaved]
  );

  const markers = useMemo(() => {
    if (!results) return [];
    return results.map((i) => ({
      id: i.place.providerRef,
      lat: i.place.lat,
      lng: i.place.lng,
      color: (i.inSystem ? "green" : selected.has(i.place.providerRef) ? "sky" : "amber") as "green" | "sky" | "amber",
      title: i.place.name ?? "",
      onClick: () => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(i.place.providerRef)) next.delete(i.place.providerRef);
          else next.add(i.place.providerRef);
          return next;
        });
      },
    }));
  }, [results, selected]);

  const toggleType = (t: InstitutionTypeKey) => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const openEdit = (p: DiscoveredPlaceDTO) => {
    setEditPlace(p);
    setEditForm({
      name: p.name ?? "",
      phone: p.phone ?? "",
      sector: p.sector ?? "none",
      stages: p.stages ?? "",
      address: p.address ?? "",
    });
  };

  const applyEdit = () => {
    if (!editPlace) return;
    const edited: DiscoveredPlaceDTO = {
      ...editPlace,
      name: editForm.name.trim() || editPlace.name,
      phone: editForm.phone.trim() || undefined,
      sector: editForm.sector === "none" ? undefined : (editForm.sector as "GOVERNMENT" | "PRIVATE"),
      stages: editForm.stages.trim() || undefined,
      address: editForm.address.trim() || undefined,
    };
    setResults((prev) =>
      prev ? prev.map((i) => (i.place.providerRef === editPlace.providerRef ? { ...i, place: edited } : i)) : prev
    );
    setEditPlace(null);
    toast({ title: "عدّلت البيانات محلياً", description: "ستُحفظ القيم المعدلة عند الإضافة إلى النظام." });
  };

  const selectedItems = (results ?? []).filter((i) => selected.has(i.place.providerRef) && !i.inSystem);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-label="واجهة اكتشاف المدارس">
      {/* رأس الواجهة */}
      <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/30">
            <Compass className="h-5 w-5 text-sky-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-extrabold">اكتشاف المدارس والمؤسسات التعليمية</p>
            <p className="text-xs text-muted-foreground">
              بحث حقيقي في المصادر العامة المفتوحة{config?.googlePlacesEnabled ? " وGoogle Places" : ""} — المؤسسات التعليمية فقط
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={() => onOpenChange(false)} aria-label="إغلاق واجهة الاكتشاف">
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* لوحة البحث — أول العناصر في RTL أي الجهة اليمنى */}
        <aside className="w-full shrink-0 border-b bg-white lg:w-80 lg:border-b-0 lg:border-s" aria-label="لوحة البحث">
          <ScrollArea className="h-[46vh] lg:h-[calc(100vh-64px)]">
            <div className="space-y-3.5 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs">مصدر البيانات</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OSM">المصادر العامة المفتوحة (OpenStreetMap — مجاني)</SelectItem>
                    <SelectItem value="GOOGLE_PLACES" disabled={!config?.googlePlacesEnabled}>
                      Google Places {config?.googlePlacesEnabled ? "" : "(يتطلب مفتاح API)"}
                    </SelectItem>
                    <SelectItem value="OVERPASS">OpenStreetMap عبر Overpass (تجميع أعمق)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {provider === "OSM" && "Nominatim الرسمي — حد 50 نتيجة لكل طلب وفاصل ثانٍ بين الطلبات."}
                  {provider === "GOOGLE_PLACES" && "بحث دائري حتى 50 ألف متر حول مركز الخريطة."}
                  {provider === "OVERPASS" && "أعمق تغطية للمدارس لكن قد يكون محجوباً من بيئة التشغيل الحالية."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">المحافظة</Label>
                  <Select value={governorate} onValueChange={(v) => { setGovernorate(v); setAreaName("all"); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(config?.governorates ?? [{ name: "بغداد" }]).map((g) => (
                        <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>
                      ))}
                      {governorates.filter((g) => !config?.governorates.some((cg) => cg.name === g)).map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">المنطقة (بغداد)</Label>
                  <Select value={areaName} onValueChange={setAreaName}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل المناطق — حدد النطاق على الخريطة</SelectItem>
                      {(config?.baghdadAreas ?? []).map((a) => (
                        <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">كلمة بحث اختيارية (اسم مدرسة)</Label>
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="مثال: ثانوية الحارثية" className="h-9" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">أنواع المؤسسات المطلوبة</Label>
                <div className="space-y-1.5 rounded-lg border p-2.5">
                  {EDU_TYPE_KEYS.map((t) => (
                    <label key={t} className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={types.has(t)} onCheckedChange={() => toggleType(t)} aria-label={INSTITUTION_TYPE_LABELS[t]} />
                      {INSTITUTION_TYPE_LABELS[t]}
                    </label>
                  ))}
                </div>
              </div>

              {provider === "GOOGLE_PLACES" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">نصف قطر البحث حول مركز الخريطة</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={500}
                      max={20000}
                      step={500}
                      value={radius}
                      onChange={(e) => setRadius(Number(e.target.value))}
                      className="flex-1"
                      aria-label="نصف القطر بالمتر"
                    />
                    <span className="w-20 text-center text-xs font-semibold">{(radius / 1000).toFixed(1)} كم</span>
                  </div>
                </div>
              )}

              <Button type="button" onClick={search} disabled={searching || !bounds} className="w-full gap-2">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                {searching ? "جارٍ البحث..." : "البحث عن المؤسسات التعليمية ضمن النطاق الظاهر"}
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                حدّد النطاق بتحريك الخريطة وتكبيرها — البحث يشمل ما يظهر في الإطار الحالي فقط. النتائج لا تُضاف للنظام إلا بعد تحديدها والضغط على إضافة.
              </p>

              {warnings.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-[11px] leading-relaxed text-amber-800">⚠ {w}</p>
                  ))}
                </div>
              )}

              {lastSummary && (
                <div className="rounded-lg border bg-slate-50 p-2.5 text-[11px] leading-relaxed">
                  <p className="font-bold">آخر عملية حفظ:</p>
                  <p>أُضيفت: {lastSummary.addedCount} · مكررة: {lastSummary.duplicateCount} · للمراجعة: {lastSummary.reviewCount}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* الخريطة */}
        <div className="h-[38vh] min-h-[260px] lg:h-auto lg:flex-1" aria-label="الخريطة التفاعلية">
          <BaseMap
            center={center}
            zoom={13}
            markers={markers}
            onBoundsChange={setBounds}
            ariaLabel="خريطة تحديد نطاق اكتشاف المدارس"
          />
          <div className="pointer-events-none absolute" />
        </div>

        {/* النتائج */}
        <div className="w-full shrink-0 border-t bg-white lg:flex lg:w-[380px] lg:flex-col lg:border-t-0 lg:border-e" aria-label="نتائج البحث">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-bold">
              النتائج {results ? `(${results.length})` : ""}
            </p>
            {results && selectedItems.length > 0 && (
              <Button type="button" size="sm" onClick={() => saveItems(selectedItems)} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <PlusSquare className="h-3.5 w-3.5" aria-hidden="true" />}
                إضافة المحدد ({selectedItems.length})
              </Button>
            )}
          </div>
          <ScrollArea className="h-[32vh] flex-1 lg:h-[calc(100vh-64px-41px)]">
            <div className="space-y-2.5 p-3">
              {!results && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Info className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-2 text-xs text-muted-foreground">حدد النطاق على الخريطة ثم اضغط زر البحث.</p>
                </div>
              )}
              {results?.length === 0 && (
                <p className="py-10 text-center text-xs text-muted-foreground">لا نتائج في هذا النطاق.</p>
              )}
              {results?.map((i) => {
                const p = i.place;
                return (
                  <div key={p.providerRef} className="rounded-xl border p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{p.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">{INSTITUTION_TYPE_LABELS[p.institutionType as InstitutionTypeKey] ?? p.institutionType}</Badge>
                          {p.sector && <Badge variant="outline" className="text-[10px]">{SECTOR_LABELS_UI[p.sector]}</Badge>}
                          {i.inSystem ? (
                            <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">مسجلة مسبقاً في النظام</Badge>
                          ) : i.similarCandidates.length > 0 ? (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">تشابه محتمل — مراجعة عند الحفظ</Badge>
                          ) : (
                            <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">جديدة</Badge>
                          )}
                        </div>
                      </div>
                      <Checkbox
                        aria-label={`تحديد ${p.name}`}
                        checked={selected.has(p.providerRef) && !i.inSystem}
                        disabled={i.inSystem}
                        onCheckedChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.providerRef)) next.delete(p.providerRef);
                            else next.add(p.providerRef);
                            return next;
                          });
                        }}
                      />
                    </div>

                    <dl className="mt-2 space-y-0.5 text-[11px] leading-relaxed">
                      <div className="flex gap-1"><dt className="shrink-0 font-semibold">العنوان:</dt><dd className="truncate text-muted-foreground">{p.address ?? "غير متوفرة"}</dd></div>
                      <div className="flex gap-1"><dt className="shrink-0 font-semibold">المنطقة:</dt><dd className="text-muted-foreground">{p.regionText ?? "غير متوفرة"}</dd></div>
                      <div className="flex gap-1"><dt className="shrink-0 font-semibold">الهاتف:</dt><dd dir="ltr" className="text-muted-foreground">{p.phone ?? "غير متوفرة"}</dd></div>
                      <div className="flex gap-1"><dt className="shrink-0 font-semibold">المدير:</dt><dd className="text-muted-foreground">غير متوفرة — يحتاج تحقق ميداني</dd></div>
                      <div className="flex gap-1"><dt className="shrink-0 font-semibold">الطلاب:</dt><dd className="text-muted-foreground">غير متوفرة — يحتاج تحقق ميداني</dd></div>
                      <div className="flex gap-1"><dt className="shrink-0 font-semibold">الموقع:</dt><dd dir="ltr" className="truncate text-muted-foreground">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</dd></div>
                    </dl>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!i.inSystem && (
                        <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={() => saveItems([i])} disabled={saving}>
                          <PlusSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          إضافة إلى النظام
                        </Button>
                      )}
                      <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer">
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          عرض الموقع
                        </Button>
                      </a>
                      <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        تعديل البيانات
                      </Button>
                      <span className="ms-auto self-center text-[10px] text-muted-foreground">{p.provider}</span>
                    </div>

                    {i.similarCandidates.length > 0 && !i.inSystem && (
                      <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800">
                        <ShieldAlert className="me-1 inline h-3 w-3" aria-hidden="true" />
                        يشابه سجلات موجودة: {i.similarCandidates.slice(0, 2).map((c) => `«${c.name}» (${Math.round(c.similarity * 100)}%)`).join("، ")} — لن تُدمج تلقائياً، ستُعرض للمراجعة.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* مراجعة المشابهات قبل الحفظ النهائي */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>مراجعة سجلات متشابهة</DialogTitle>
            <DialogDescription className="sr-only">قائمة سجلات تشابه مدارس موجودة — لا يتم دمج تلقائي، حدد الإجراء لكل سجل.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              السجلات التالية تشابه مدارس موجودة في النظام. لا يتم دمج أي مدرستين تلقائياً — حدد الإجراء لكل سجل.
            </p>
            {reviewItems.map((r, idx) => (
              <div key={`${r.place.providerRef}-${idx}`} className="rounded-lg border p-3">
                <p className="text-sm font-bold">{r.place.name}</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {r.candidates.map((c) => (
                    <li key={c.name}>
                      يشابه «{c.name}» — تشابه {Math.round(c.similarity * 100)}%{c.distanceM !== null ? ` على بعد ${c.distanceM} م` : ""}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => saveItems([{ place: r.place, inSystem: false, existingSchoolId: null, similarCandidates: [] }], [r.place.providerRef])}
                  >
                    أضف كسجل جديد مستقل
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReviewItems((prev) => prev.filter((_, k) => k !== idx))}>
                    تجاهل هذه النتيجة
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setReviewOpen(false)}>إنهاء المراجعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تعديل بيانات النتيجة قبل الحفظ */}
      <Dialog open={Boolean(editPlace)} onOpenChange={(o) => !o && setEditPlace(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل بيانات النتيجة قبل الحفظ</DialogTitle>
            <DialogDescription className="sr-only">تعديل محلي لبيانات النتيجة قبل إضافتها إلى النظام.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المؤسسة</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">رقم التواصل إن توفر</Label>
              <Input dir="ltr" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} placeholder="يُترك فارغاً إن غير مؤكد" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">القطاع إن تأكدت</Label>
              <Select value={editForm.sector} onValueChange={(v) => setEditForm((f) => ({ ...f, sector: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">غير محدد</SelectItem>
                  <SelectItem value="GOVERNMENT">حكومية</SelectItem>
                  <SelectItem value="PRIVATE">أهلية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المراحل الدراسية إن توفرت</Label>
              <Input value={editForm.stages} onChange={(e) => setEditForm((f) => ({ ...f, stages: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">العنوان</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              التعديل محلي على هذه النتيجة قبل إضافتها. اسم المدير وعدد الطلاب لا يمكن جمعهما آلياً — يُسجلهما المنسقة ميدانياً.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditPlace(null)}>إلغاء</Button>
            <Button type="button" onClick={applyEdit}>حفظ التعديل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
