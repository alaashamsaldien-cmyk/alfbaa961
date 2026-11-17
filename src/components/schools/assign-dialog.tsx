"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { CoordinatorDTO } from "@/lib/types";

type Preview = { schoolId: string; schoolName: string; before: {id: string; name: string}[]; after: {id: string; name: string}[] };
interface Props { regionIds?: string[]; governorate?: string; open: boolean; onOpenChange: (o: boolean) => void; schoolIds: string[]; schoolNames: string[]; coordinators: CoordinatorDTO[]; onDone: () => void }
export function AssignDialog({ open, onOpenChange, schoolIds, schoolNames, coordinators, onDone, regionIds, governorate }: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState("shared");
  const [action, setAction] = useState("add");
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [history, setHistory] = useState<{id:string; actorName:string; createdAt:string; details:string | null}[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSelected([]); setMode("shared"); setAction("add"); setPreview(null); setHistory([]);
    const controller = new AbortController();
    if (schoolIds.length === 1) void fetch(`/api/coordinators/assignments?schoolId=${encodeURIComponent(schoolIds[0])}`, {signal: controller.signal})
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(j => setHistory(j.history ?? []))
      .catch(() => { if (!controller.signal.aborted) toast({title:"تعذر تحميل سجل التنسيب",variant:"destructive"}); });
    return () => controller.abort();
  }, [open, schoolIds, toast]);
  const submit = async (isPreview: boolean) => {
    setBusy(true);
    try {
      const r = await fetch("/api/coordinators/assignments", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({schoolIds,regionIds,governorate,coordinatorIds:selected,mode,action,preview:isPreview,expected:isPreview?undefined:preview})});
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (isPreview) setPreview(j.preview);
      else {toast({title:"تم حفظ التنسيب",description:`تم تحديث تكليف ${j.affected} مدرسة وحفظ السجل.`});onDone();onOpenChange(false);}
    } catch(e) { toast({title:"تعذر التنسيب",description:e instanceof Error ? e.message : undefined,variant:"destructive"}); }
    finally {setBusy(false);}
  };
  return <Dialog open={open} onOpenChange={v => {if (!busy) onOpenChange(v);}}><DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto" dir="rtl">
    <DialogHeader><DialogTitle>تنسيب المدارس</DialogTitle><DialogDescription>{regionIds?.length ? `${regionIds.length} منطقة · ${governorate}` : `${schoolIds.length} مدرسة`} · {schoolNames.slice(0,3).join("، ")}</DialogDescription></DialogHeader>
    {preview ? <div className="space-y-3"><p className="font-bold">مراجعة قبل الحفظ · {preview.length} مدرسة</p>{preview.map(s => <div key={s.schoolId} className="rounded-xl border p-3 text-sm"><b>{s.schoolName}</b><p>حالياً: {s.before.map(p=>p.name).join("، ") || "بلا تنسيب"}</p><p className="text-sky-700">بعد الحفظ: {s.after.map(p=>p.name).join("، ") || "بلا تنسيب"}</p></div>)}</div> : <fieldset disabled={busy} className="space-y-4">
      <label className="block">طريقة التوزيع<select className="mt-1 w-full rounded-lg border p-2" value={mode} onChange={e=>{setMode(e.target.value);if(e.target.value === "separate") setAction("replace");}}><option value="shared">مشترك — نفس المدارس لكل المختارين</option><option value="separate">منفصل — مجموعة مختلفة لكل منسّق</option></select></label>
      <label className="block">العملية<select className="mt-1 w-full rounded-lg border p-2" value={action} onChange={e=>setAction(e.target.value)} disabled={mode === "separate"}><option value="add">إضافة مع الحفاظ على التكليف الحالي</option><option value="replace">استبدال التكليف الحالي</option><option value="remove">إزالة المختارين فقط من التكليف</option></select></label>
      {mode === "separate" && <p className="rounded-lg bg-amber-50 p-3 text-sm">توزيع بالتناوب حسب ترتيب الاختيار، مع استبدال التكليف السابق. راجع حصة كل منسّق قبل الحفظ.</p>}
      <p className="font-semibold">اختر المنسّقين</p><div className="max-h-56 space-y-2 overflow-y-auto">{coordinators.map(c=><label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/><span>{c.name} <small className="text-muted-foreground">· {c.schoolCount} مدرسة</small></span></label>)}</div>
      {!coordinators.length && <p>أضف حساب منسّق نشط من إعدادات الإدارة أولاً.</p>}
    </fieldset>}
    <DialogFooter className="gap-2"><Button variant="outline" disabled={busy} onClick={()=>preview?setPreview(null):onOpenChange(false)}>{preview?"رجوع للتعديل":"إلغاء"}</Button><Button disabled={busy || !selected.length} onClick={()=>submit(!preview)}>{busy?"جارٍ التنفيذ…":preview?"تأكيد وحفظ التنسيب":"معاينة التوزيع"}</Button></DialogFooter>
    {schoolIds.length===1 && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-semibold">سجل التنسيب</summary>{!history.length?<p>لا يوجد سجل تنسيب جديد لهذه المدرسة.</p>:history.map(h=>{let d:Partial<Preview>={};try{d=JSON.parse(h.details??"{}");}catch{}return <div key={h.id} className="border-t py-2"><b>{h.actorName}</b> · {new Date(h.createdAt).toLocaleString("ar-IQ")}<p>من: {d.before?.map(p=>p.name).join("، ") || "بلا تنسيب"}</p><p>إلى: {d.after?.map(p=>p.name).join("، ") || "بلا تنسيب"}</p></div>;})}</details>}
  </DialogContent></Dialog>;
}
