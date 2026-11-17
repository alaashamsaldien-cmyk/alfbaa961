"use client";

// ——— قسم المناطق — قائمة المناطق الحقيقية من قاعدة البيانات ———
// عرض أعداد المدارس المحسوبة فعلياً لكل منطقة + إضافة/تعديل/تعطيل/حذف آمن

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, MapPin, RefreshCw, Pencil, Trash2, ListPlus, Users, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/time";

import { RegionAssignDialog } from "@/components/regions/region-assign-dialog";

interface RegionItem {
  id: string;
  name: string;
  governorate: string;
  isActive: boolean;
  createdAt: string;
  schoolCount: number;
  assignableCount: number;
  contractedCount: number;
  unassignedCount: number;
  availableCount: number;
  coordinators: number;
  regionCoordinators: { id: string; name: string }[];
}

export function RegionsView() {
  const { toast } = useToast();
  const [list, setList] = useState<RegionItem[] | null>(null);
  const [governorates, setGovernorates] = useState<string[]>([]);
  const [govFilter, setGovFilter] = useState("بغداد");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [assignRegions, setAssignRegions] = useState<string[]>([]);
  const openAssignment = (ids: string[]) => setAssignRegions(ids);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", governorate: "بغداد" });
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<RegionItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", governorate: "" });
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetGov, setPresetGov] = useState("بغداد");
  const [presetBusy, setPresetBusy] = useState(false);

  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const res = await fetch(`/api/regions?governorate=${encodeURIComponent(govFilter)}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      if (version !== loadVersion.current) return;
      setList(j.regions);
      setSelectedRegions(current => current.filter(id => j.regions.some((r: RegionItem) => r.id === id)));
      setGovernorates(j.governorates ?? []);
    } catch {
      if (version !== loadVersion.current) return;
      setList([]);
      toast({ title: "تعذر تحميل المناطق", variant: "destructive" });
    }
  }, [govFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!form.name.trim()) {
      toast({ title: "اسم المنطقة مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الإضافة");
      toast({ title: "أُضيفت المنطقة" });
      setAddOpen(false);
      setForm({ name: "", governorate: form.governorate });
      load();
    } catch (e) {
      toast({ title: "تعذر الإضافة", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addPresets = async () => {
    setPresetBusy(true);
    try {
      const res = await fetch("/api/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addGovernorateAreas", governorate: presetGov }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الإضافة");
      toast({
        title: j.added > 0 ? `أُضيفت ${j.added} منطقة من القائمة المرجعية` : "لا جديد",
        description: j.message ?? "المناطق المضافة أسماء جغرافية رسمية — تُستخدم في الاكتشاف والاستيراد.",
      });
      setPresetOpen(false);
      load();
    } catch (e) {
      toast({ title: "تعذر الإضافة", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setPresetBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) {
      toast({ title: "اسم المنطقة مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/regions/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
      toast({ title: "حُفظ التعديل" });
      setEditTarget(null);
      load();
    } catch (e) {
      toast({ title: "تعذر الحفظ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: RegionItem) => {
    try {
      const res = await fetch(`/api/regions/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      toast({ title: r.isActive ? "عُطّلت المنطقة" : "فُعّلت المنطقة" });
      load();
    } catch (e) {
      toast({ title: "تعذر التنفيذ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const remove = async (r: RegionItem) => {
    if (!window.confirm(`حذف منطقة «${r.name}»؟ الحذف مسموح فقط إن كانت خالية من المدارس.`)) return;
    try {
      const res = await fetch(`/api/regions/${r.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      toast({ title: "حُذفت المنطقة" });
      load();
    } catch (e) {
      toast({ title: "تعذر الحذف", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const totals = list
    ? {
        regions: list.length,
        schools: list.reduce((a, r) => a + r.schoolCount, 0),
        unassigned: list.reduce((a, r) => a + r.unassignedCount, 0),
        contracted: list.reduce((a, r) => a + r.contractedCount, 0),
      }
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">المناطق</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            مناطق العمل التعليمية — الأعداد محسوبة فعلياً من مدارس كل منطقة في قاعدة البيانات.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={govFilter} onValueChange={value => { loadVersion.current++; setSelectedRegions([]); setList(null); setGovFilter(value); }}>
            <SelectTrigger className="w-[170px]" aria-label="فلتر المحافظة">
              <Map className="h-4 w-4 text-sky-600" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المحافظات</SelectItem>
              {governorates.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" disabled={!selectedRegions.length} onClick={() => openAssignment(selectedRegions)} className="gap-2"><Users className="h-4 w-4" />تنسيب المحدد ({selectedRegions.length})</Button>
          <Button type="button" variant="outline" onClick={() => setPresetOpen(true)} className="gap-2">
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            إضافة مناطق مرجعية
          </Button>
          <Button type="button" onClick={() => { setForm({ name: "", governorate: govFilter === "all" ? "بغداد" : govFilter }); setAddOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            إضافة منطقة
          </Button>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "مناطق مسجلة", value: totals.regions },
            { label: "إجمالي مدارسها", value: totals.schools },
            { label: "مدارس بلا تخصيص", value: totals.unassigned },
            { label: "متعاقدة", value: totals.contracted },
          ].map((s) => (
            <Card key={s.label} className="p-0">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-extrabold text-primary">{formatNumber(s.value)}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!list && (
        <div className="rounded-xl border bg-white p-6">
          <p className="text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
        </div>
      )}

      {list && list.length === 0 && (
        <EmptyState
          icon={MapPin}
          title="لا مناطق مسجلة"
          description="أضف المناطق يدوياً أو استخدم القائمة المرجعية لمناطق بغداد — تُستخدم المناطق في مطابقة نتائج الاكتشاف واستيراد Excel وتخصيص المنسقات."
        />
      )}

      {list && list.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto nice-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5"><input type="checkbox" aria-label="تحديد كل المناطق" checked={list.length > 0 && list.every(r => selectedRegions.includes(r.id))} onChange={e => setSelectedRegions(e.target.checked ? list.map(r => r.id) : [])} /></th>
                  <th className="px-4 py-2.5 text-start font-semibold">المنطقة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">المحافظة</th>
                  <th className="px-4 py-2.5 text-center font-semibold">المدارس</th>
                  <th className="px-4 py-2.5 text-center font-semibold">متعاقدة</th>
                  <th className="px-4 py-2.5 text-center font-semibold">بلا تخصيص</th>
                  <th className="px-4 py-2.5 text-start font-semibold">المنسقات</th>
                  <th className="px-4 py-2.5 text-center font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5"><input type="checkbox" aria-label={`تحديد منطقة ${r.name}`} checked={selectedRegions.includes(r.id)} onChange={e => setSelectedRegions(ids => e.target.checked ? [...ids, r.id] : ids.filter(id => id !== r.id))} /></td>
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-foreground">{r.name}</p>
                      {!r.isActive && (
                        <Badge variant="outline" className="mt-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200">معطلة</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.governorate}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-primary">{formatNumber(r.schoolCount)}</td>
                    <td className="px-4 py-2.5 text-center">{formatNumber(r.contractedCount)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.unassignedCount > 0 ? (
                        <span className="font-semibold text-amber-600">{formatNumber(r.unassignedCount)}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.regionCoordinators.length ? (
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {r.regionCoordinators.map((c) => (
                            <Badge key={c.id} variant="outline" className="border-sky-200 bg-sky-50 text-[11px] text-sky-800">{c.name}</Badge>
                          ))}
                        </div>
                      ) : r.coordinators > 0 ? (
                        <span className="text-xs text-muted-foreground">{formatNumber(r.coordinators)} بتنسيب مدارس فردي</span>
                      ) : (
                        <span className="text-xs text-amber-600">غير منسّبة</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="outline" className="h-7 gap-1 border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => openAssignment([r.id])}><Users className="h-3.5 w-3.5" />تنسيب</Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`تعديل منطقة ${r.name}`}
                          onClick={() => {
                            setEditTarget(r);
                            setEditForm({ name: r.name, governorate: r.governorate });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => toggleActive(r)}
                        >
                          {r.isActive ? "تعطيل" : "تفعيل"}
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-600"
                          aria-label={`حذف منطقة ${r.name}`}
                          onClick={() => remove(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RegionAssignDialog
        open={assignRegions.length > 0}
        onOpenChange={open => { if (!open) setAssignRegions([]); }}
        regions={assignRegions.flatMap(id => {
          const r = (list ?? []).find(item => item.id === id);
          return r ? [{ id: r.id, name: r.name, governorate: r.governorate, schoolCount: r.schoolCount, coordinators: r.regionCoordinators }] : [];
        })}
        onDone={() => { setSelectedRegions([]); load(); }}
      />
      <p className="text-xs text-muted-foreground">
        تنسيب المنطقة يشمل كل مدارسها الحالية، وأي مدرسة تُضاف للمنطقة لاحقاً (من الخريطة أو Excel أو الاكتشاف) تُنسّب تلقائياً لنفس المنسقات.
      </p>
      {/* إضافة منطقة */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة منطقة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المنطقة *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="مثال: الكرادة" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المحافظة</Label>
              <Select value={form.governorate} onValueChange={(v) => setForm((f) => ({ ...f, governorate: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {governorates.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={add} disabled={saving}>{saving ? "جارٍ الإضافة..." : "إضافة"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إضافة مناطق مرجعية */}
      <Dialog open={presetOpen} onOpenChange={setPresetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة مناطق من القائمة المرجعية</DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            القائمة المرجعية أسماء جغرافية رسمية للمناطق — تُضاف فقط الأسماء غير الموجودة مسبقاً في النظام ولا يتأثر أي سجل قائم.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">المحافظة</Label>
            <Select value={presetGov} onValueChange={setPresetGov}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {governorates.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">القائمة المرجعية متاحة حالياً لمناطق بغداد؛ بقية المحافظات تُضاف يدوياً بعد اعتماد أسمائها.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPresetOpen(false)} disabled={presetBusy}>إلغاء</Button>
            <Button type="button" onClick={addPresets} disabled={presetBusy}>
              {presetBusy ? "جارٍ الإضافة..." : "إضافة المناطق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تعديل منطقة */}
      <Dialog open={Boolean(editTarget)} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المنطقة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المنطقة</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المحافظة</Label>
              <Select value={editForm.governorate} onValueChange={(v) => setEditForm((f) => ({ ...f, governorate: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {governorates.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={saveEdit} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
