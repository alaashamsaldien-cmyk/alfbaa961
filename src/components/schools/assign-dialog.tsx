"use client";

// ——— نافذة تخصيص مدارس لمنسقة (مدرسة واحدة أو دفعة) ———

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { CoordinatorDTO } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schoolIds: string[];
  schoolNames: string[];
  coordinators: CoordinatorDTO[];
  onDone: () => void;
}

export function AssignDialog({ open, onOpenChange, schoolIds, schoolNames, coordinators, onDone }: Props) {
  const { toast } = useToast();
  const [coordinatorId, setCoordinatorId] = useState("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setCoordinatorId("none");
  }, [open]);

  const submit = async (action: "assign" | "unassign") => {
    setSaving(true);
    try {
      const res = await fetch("/api/coordinators/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, coordinatorId: action === "assign" ? coordinatorId : null, schoolIds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "تعذر تنفيذ العملية");
      }
      const j = await res.json();
      toast({
        title: action === "assign" ? "تم التخصيص" : "تم فصل التخصيص",
        description:
          action === "assign"
            ? `خصصت ${j.affected} مدرسة للمنسقة «${j.coordinatorName}» — ستظهر فوراً في حسابها وخريطتها.`
            : `فُصل التخصيص عن ${j.affected} مدرسة.`,
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({ title: "تعذر تنفيذ العملية", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تخصيص المدارس لمنسقة ميدانية</DialogTitle>
          <DialogDescription>
            {schoolNames.length <= 3 ? schoolNames.join("، ") : `${schoolNames.slice(0, 3).join("، ")} و${schoolNames.length - 3} أخرى`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">المنسقة</Label>
          {coordinators.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              لا توجد منسقات نشطات — أضف منسقة أولاً من قسم «المنسقات الميدانيات».
            </p>
          ) : (
            <Select value={coordinatorId} onValueChange={setCoordinatorId}>
              <SelectTrigger><SelectValue placeholder="اختر المنسقة" /></SelectTrigger>
              <SelectContent>
                {coordinators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.schoolCount} مدرسة مخصصة حالياً)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            عند التخصيص تظهر المدرسة تلقائياً في حساب المنسقة وعلى خريطتها الميدانية، وتستطيع تحديث بياناتها الميدانية فقط (اسم المدير، الهاتف، عدد الطلاب، المراحل، الملاحظات) وتسجيل نتائج الزيارة. لا تستطيع تعديل أي مدرسة غير مخصصة لها.
          </p>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button type="button" variant="secondary" onClick={() => submit("unassign")} disabled={saving}>
            فصل التخصيص الحالي
          </Button>
          <Button type="button" onClick={() => submit("assign")} disabled={saving || coordinatorId === "none" || coordinators.length === 0}>
            {saving ? "جارٍ التنفيذ..." : "تخصيص للمنسقة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
