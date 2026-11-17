"use client";

// ——— نافذة تنسيب المناطق للمنسقات ———
// تنسيب منطقة أو أكثر لمنسقة أو أكثر. التنسيب محفوظ على مستوى المنطقة،
// فكل مدرسة موجودة أو تُضاف لاحقاً إلى المنطقة تُنسّب تلقائياً.
import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/time";
import type { CoordinatorDTO } from "@/lib/types";

export interface AssignableRegion {
  id: string;
  name: string;
  governorate?: string;
  schoolCount: number;
  coordinators: { id: string; name: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regions: AssignableRegion[];
  onDone: () => void;
}

type Mode = "shared" | "separate";
type Action = "add" | "replace" | "remove";

export function RegionAssignDialog({ open, onOpenChange, regions, onDone }: Props) {
  const { toast } = useToast();
  const [coordinators, setCoordinators] = useState<CoordinatorDTO[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("shared");
  const [action, setAction] = useState<Action>("add");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected([]); setMode("shared"); setAction("add"); setSearch("");
    const controller = new AbortController();
    setCoordinators(null);
    fetch("/api/coordinators", { cache: "no-store", signal: controller.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => setCoordinators(j.coordinators ?? []))
      .catch(() => { if (!controller.signal.aborted) { setCoordinators([]); toast({ title: "تعذر تحميل المنسقات", variant: "destructive" }); } });
    return () => controller.abort();
  }, [open, toast]);

  const effectiveAction: Action = mode === "separate" ? "replace" : action;
  const names = (ids: string[]) => ids.map((id) => coordinators?.find((c) => c.id === id)?.name ?? "—");

  // معاينة النتيجة لكل منطقة — نفس منطق الخادم
  const plan = useMemo(() => regions.map((region, index) => {
    const before = region.coordinators.map((c) => c.id);
    const chosen = mode === "separate" && selected.length ? [selected[index % selected.length]] : selected;
    const after = effectiveAction === "replace" ? chosen
      : effectiveAction === "remove" ? before.filter((id) => !chosen.includes(id))
      : [...new Set([...before, ...chosen])];
    return { region, after };
  }), [regions, selected, mode, effectiveAction]);

  const totalSchools = regions.reduce((sum, r) => sum + r.schoolCount, 0);
  const visible = (coordinators ?? []).filter((c) => !search.trim() || c.name.includes(search.trim()));

  const submit = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/regions/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionIds: regions.map((r) => r.id), coordinatorIds: selected, mode, action: effectiveAction }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast({
        title: "تم حفظ تنسيب المناطق",
        description: `${formatNumber(result.regions)} منطقة · ${formatNumber(result.schools)} مدرسة. المدارس الجديدة في هذه المناطق تُنسّب تلقائياً.`,
      });
      onDone();
      onOpenChange(false);
    } catch (error) {
      toast({ title: "تعذر التنسيب", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-sky-600" />تنسيب المناطق</DialogTitle>
          <DialogDescription>
            {formatNumber(regions.length)} منطقة · {formatNumber(totalSchools)} مدرسة · {regions.slice(0, 4).map((r) => r.name).join("، ")}{regions.length > 4 ? "…" : ""}
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">طريقة التوزيع
              <select className="mt-1 w-full rounded-lg border bg-background p-2 font-normal" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="shared">مشترك — كل المختارات لكل المناطق</option>
                <option value="separate" disabled={regions.length < 2}>منفصل — توزيع المناطق بالتناوب</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">العملية
              <select className="mt-1 w-full rounded-lg border bg-background p-2 font-normal" value={effectiveAction} onChange={(e) => setAction(e.target.value as Action)} disabled={mode === "separate"}>
                <option value="add">إضافة مع الحفاظ على الحاليات</option>
                <option value="replace">استبدال المنسقات الحاليات</option>
                <option value="remove">إزالة المختارات من المنطقة</option>
              </select>
            </label>
          </div>
          {mode === "separate" && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              كل منطقة تذهب لمنسقة واحدة بالتناوب حسب ترتيب اختيارك، ويُستبدل تنسيبها السابق.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">اختر المنسقات ({formatNumber(selected.length)})</p>
              <Input className="h-8 w-40" placeholder="بحث" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث عن منسقة" />
            </div>
            {coordinators === null ? (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            ) : !coordinators.length ? (
              <p className="text-sm text-muted-foreground">أضف منسقة نشطة من قسم المنسقات أولاً.</p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {visible.map((c) => {
                  const order = selected.indexOf(c.id);
                  return (
                    <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-sm has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50">
                      <input type="checkbox" checked={order >= 0} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id))} />
                      <span className="flex-1">{c.name}</span>
                      <small className="text-muted-foreground">{formatNumber(c.schoolCount)} مدرسة</small>
                      {mode === "separate" && order >= 0 && <span className="rounded bg-sky-600 px-1.5 text-xs text-white">{order + 1}</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {selected.length > 0 && (
            <div className="space-y-1 rounded-xl border bg-muted/30 p-3 text-xs">
              <p className="font-semibold">بعد الحفظ</p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {plan.map(({ region, after }) => (
                  <p key={region.id}>
                    <b>{region.name}</b> ({formatNumber(region.schoolCount)}): <span className="text-sky-700">{names(after).join("، ") || "بلا تنسيب"}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </fieldset>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button disabled={busy || !selected.length || !regions.length} onClick={submit}>{busy ? "جارٍ الحفظ…" : "حفظ التنسيب"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
