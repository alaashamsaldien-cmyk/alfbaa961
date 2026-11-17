"use client";

// ——— إضافة مدرسة من البوابة الميدانية (المنسقة / الموظف) ———
// كل تفاصيل المدرسة + تاريخ الإضافة + موعد زيارة قادم + الموقع (GPS) + فحص التكرار.
import { useEffect, useState } from "react";
import { CalendarDays, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { IRAQ_GOVERNORATES } from "@/lib/geo/iraq";

const NEW_REGION = "__new__";

const todayInBaghdad = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const emptyForm = () => ({
  name: "", governorate: "", regionId: "", regionText: "", sector: "", institutionType: "مدرسة", stages: "",
  principalName: "", phone: "", studentCount: "", address: "", notes: "", facebookUrl: "",
  contractStatus: "NOT_CONTRACTED", addedAt: todayInBaghdad(), nextVisitAt: "", lat: "", lng: "",
});

type Duplicate = { id: string; name: string; regionName: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGovernorate?: string;
  defaultRegionId?: string;
  lockedGovernorate?: string | null;
  onSaved: (school: { id: string; name: string; governorate: string }) => void;
}

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export function AddSchoolDialog({ open, onOpenChange, defaultGovernorate, defaultRegionId, lockedGovernorate, onSaved }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = (key: keyof ReturnType<typeof emptyForm>, value: string) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm(),
      governorate: lockedGovernorate || defaultGovernorate || "",
      regionId: defaultRegionId && defaultRegionId !== "none" ? defaultRegionId : "",
    });
    setDuplicates(null);
  }, [open, defaultGovernorate, defaultRegionId, lockedGovernorate]);

  // مناطق المحافظة المختارة
  useEffect(() => {
    if (!open || !form.governorate) { setRegions([]); return; }
    const controller = new AbortController();
    fetch(`/api/employee/schools?summary=1&governorate=${encodeURIComponent(form.governorate)}`, { cache: "no-store", signal: controller.signal })
      .then((r) => r.json())
      .then((j) => setRegions((j.regions ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }))))
      .catch(() => { if (!controller.signal.aborted) setRegions([]); });
    return () => controller.abort();
  }, [open, form.governorate]);

  const locate = () => {
    if (!navigator.geolocation) {
      toast({ title: "الجهاز لا يدعم تحديد الموقع", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setLocating(false);
        toast({ title: "أُلحق موقعك الحالي", description: `الدقة تقريباً ${Math.round(pos.coords.accuracy)} م — تأكد أنك عند المدرسة.` });
      },
      () => {
        setLocating(false);
        toast({ title: "تعذر الوصول للموقع", description: "فعّل GPS واسمح للمتصفح بالموقع، أو أدخل الإحداثيات يدوياً.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const submit = async (force = false) => {
    if (form.name.trim().length < 2) { toast({ title: "اسم المدرسة مطلوب", variant: "destructive" }); return; }
    if (!form.governorate) { toast({ title: "اختر المحافظة", variant: "destructive" }); return; }
    if (form.regionId === NEW_REGION && !form.regionText.trim()) { toast({ title: "اكتب اسم المنطقة الجديدة", variant: "destructive" }); return; }
    if ((form.lat && !form.lng) || (!form.lat && form.lng)) { toast({ title: "أكمل خط العرض وخط الطول معاً", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        governorate: form.governorate,
        regionId: form.regionId && form.regionId !== NEW_REGION ? form.regionId : undefined,
        regionText: form.regionId === NEW_REGION ? form.regionText.trim() : undefined,
        sector: form.sector || undefined,
        institutionType: form.institutionType || undefined,
        stages: form.stages.trim() || undefined,
        stage: form.stages.trim() || undefined,
        principalName: form.principalName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        studentCount: form.studentCount ? Number(form.studentCount) : undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
        facebookUrl: form.facebookUrl.trim() || undefined,
        contractStatus: form.contractStatus,
        addedAt: form.addedAt || undefined,
        nextVisitAt: form.nextVisitAt || undefined,
        force,
      };
      if (form.lat && form.lng) { body.lat = Number(form.lat); body.lng = Number(form.lng); }
      const res = await fetch("/api/employee/schools", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 409 && j?.code === "DUPLICATE") { setDuplicates(j.duplicates ?? []); return; }
      if (!res.ok) throw new Error(j?.error ?? "تعذر الإضافة");
      toast({ title: "أُضيفت المدرسة", description: `«${form.name.trim()}» صارت ضمن مدارسك وظهرت للإدارة فوراً.` });
      onSaved({ id: j.school.id, name: j.school.name, governorate: form.governorate });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "تعذر إضافة المدرسة", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto nice-scroll" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة مدرسة جديدة</DialogTitle>
          <p className="text-xs text-muted-foreground">تُسجل فوراً في النظام وتُنسّب لك، وتظهر للإدارة مباشرة.</p>
        </DialogHeader>

        {duplicates ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              توجد مدرسة بنفس الاسم «{form.name.trim()}» في {form.governorate}. تأكد أنها ليست نفس المدرسة:
            </p>
            <ul className="space-y-1.5">
              {duplicates.map((d) => (
                <li key={d.id} className="rounded-lg border p-2.5 text-sm"><b>{d.name}</b> <span className="text-xs text-muted-foreground">· {d.regionName ?? "بلا منطقة"}</span></li>
              ))}
            </ul>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDuplicates(null)} disabled={saving}>رجوع للتعديل</Button>
              <Button type="button" onClick={() => submit(true)} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}مدرسة مختلفة · أضفها
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {/* البيانات الأساسية */}
              <fieldset className="space-y-3" disabled={saving}>
                <legend className="mb-1 text-xs font-bold text-sky-700">البيانات الأساسية</legend>
                <div className="space-y-1.5">
                  <Label className="text-xs">اسم المدرسة *</Label>
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثال: مدرسة النور الابتدائية" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">المحافظة *</Label>
                    <select className={selectClass} value={form.governorate} disabled={Boolean(lockedGovernorate)}
                      onChange={(e) => setForm((f) => ({ ...f, governorate: e.target.value, regionId: "", regionText: "" }))}>
                      <option value="">اختر…</option>
                      {IRAQ_GOVERNORATES.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">المنطقة</Label>
                    <select className={selectClass} value={form.regionId} disabled={!form.governorate} onChange={(e) => set("regionId", e.target.value)}>
                      <option value="">بدون</option>
                      {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      <option value={NEW_REGION}>+ منطقة جديدة…</option>
                    </select>
                  </div>
                </div>
                {form.regionId === NEW_REGION && (
                  <Input value={form.regionText} onChange={(e) => set("regionText", e.target.value)} placeholder="اسم المنطقة الجديدة" aria-label="اسم المنطقة الجديدة" />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">القطاع</Label>
                    <select className={selectClass} value={form.sector} onChange={(e) => set("sector", e.target.value)}>
                      <option value="">غير محدد</option>
                      <option value="GOVERNMENT">حكومية</option>
                      <option value="PRIVATE">أهلية</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">نوع المؤسسة</Label>
                    <select className={selectClass} value={form.institutionType} onChange={(e) => set("institutionType", e.target.value)}>
                      {["مدرسة", "روضة", "معهد", "مجمع مدارس", "أخرى"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">المراحل الدراسية</Label>
                  <select className={selectClass} value={form.stages} onChange={(e) => set("stages", e.target.value)}>
                    <option value="">غير محدد</option>
                    {["روضة", "ابتدائية", "متوسطة", "إعدادية", "ثانوية", "ابتدائية ومتوسطة", "متوسطة وإعدادية", "كل المراحل"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </fieldset>

              {/* التواصل */}
              <fieldset className="space-y-3" disabled={saving}>
                <legend className="mb-1 text-xs font-bold text-sky-700">التواصل والتفاصيل</legend>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">اسم المدير/المديرة</Label>
                    <Input value={form.principalName} onChange={(e) => set("principalName", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">رقم الهاتف</Label>
                    <Input dir="ltr" inputMode="tel" className="text-start" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/[^0-9+ ]/g, ""))} placeholder="07xx xxx xxxx" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">عدد الطلاب</Label>
                    <Input dir="ltr" inputMode="numeric" className="text-start" value={form.studentCount} onChange={(e) => set("studentCount", e.target.value.replace(/[^0-9]/g, ""))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">حالة التعاقد</Label>
                    <select className={selectClass} value={form.contractStatus} onChange={(e) => set("contractStatus", e.target.value)}>
                      <option value="NOT_CONTRACTED">غير متعاقدة</option>
                      <option value="CONTRACTED">متعاقدة</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">العنوان / أقرب نقطة دالة</Label>
                  <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">صفحة فيسبوك (اختياري)</Label>
                  <Input dir="ltr" className="text-start" value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} placeholder="https://facebook.com/…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ملاحظات</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="أي معلومة مفيدة عن المدرسة" />
                </div>
              </fieldset>

              {/* التواريخ */}
              <fieldset className="space-y-3" disabled={saving}>
                <legend className="mb-1 flex items-center gap-1 text-xs font-bold text-sky-700"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />التاريخ</legend>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">تاريخ الإضافة</Label>
                    <Input type="date" dir="ltr" max={todayInBaghdad()} value={form.addedAt} onChange={(e) => set("addedAt", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">موعد الزيارة القادمة</Label>
                    <Input type="date" dir="ltr" min={todayInBaghdad()} value={form.nextVisitAt} onChange={(e) => set("nextVisitAt", e.target.value)} />
                  </div>
                </div>
                {form.nextVisitAt && <p className="text-[11px] text-muted-foreground">يُضاف تذكير متابعة بهذا الموعد ويظهر في قائمة المتابعات.</p>}
              </fieldset>

              {/* الموقع */}
              <fieldset className="space-y-2" disabled={saving}>
                <legend className="mb-1 flex items-center gap-1 text-xs font-bold text-sky-700"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />الموقع</legend>
                <Button type="button" variant="outline" className="h-11 w-full gap-2" onClick={locate} disabled={locating}>
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
                  {form.lat ? "تحديث الموقع من GPS" : "أنا عند المدرسة — خذ موقعي (GPS)"}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Input dir="ltr" inputMode="decimal" className="text-start" value={form.lat} onChange={(e) => set("lat", e.target.value)} placeholder="Latitude" aria-label="خط العرض" />
                  <Input dir="ltr" inputMode="decimal" className="text-start" value={form.lng} onChange={(e) => set("lng", e.target.value)} placeholder="Longitude" aria-label="خط الطول" />
                </div>
              </fieldset>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
              <Button type="button" onClick={() => submit(false)} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}حفظ المدرسة
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
