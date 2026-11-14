"use client";

// ——— نافذة «تخصيص الواجهة والصلاحيات» — إظهار/إخفاء كل أيقونة + صلاحيات تفصيلية لكل قسم ———
// تستخدم من قسم إدارة الموظفين. القوالب الجاهزة تُطبق من هنا ثم يمكن تعديلها يدوياً.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Loader2, Save, ShieldCheck, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  SECTION_KEYS,
  ACTION_KEYS,
  ACTION_LABELS_AR,
  SECTION_META_AR,
  CORE_SECTIONS,
  COMING_SOON_SECTIONS,
  emptyPerms,
  type SectionKey,
  type ActionKey,
  type SectionPerms,
} from "@/lib/sections-catalog";
import { SECTION_ICONS } from "@/components/employees/section-icons";

interface TemplateOption {
  key?: string;
  id?: string;
  name: string;
  description: string | null;
  sections: Record<string, SectionPerms>;
  isBuiltIn: boolean;
}

interface PermissionsDialogProps {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** يُستدعى بعد حفظ ناجح لتحديث القائمة */
  onSaved: () => void;
}

export function PermissionsDialog({ employeeId, employeeName, open, onOpenChange, onSaved }: PermissionsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [map, setMap] = useState<Record<SectionKey, SectionPerms>>(() => {
    const m = {} as Record<SectionKey, SectionPerms>;
    for (const k of SECTION_KEYS) m[k] = emptyPerms();
    return m;
  });
  const [expanded, setExpanded] = useState<SectionKey | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateChoice, setTemplateChoice] = useState<string>("");
  const [templateName, setTemplateName] = useState("");

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const [permRes, tplRes] = await Promise.all([
        fetch(`/api/employees/${employeeId}/permissions`, { cache: "no-store" }),
        fetch("/api/employees/templates", { cache: "no-store" }),
      ]);
      const pj = await permRes.json();
      if (permRes.ok && pj?.permissions) {
        const next = {} as Record<SectionKey, SectionPerms>;
        for (const k of SECTION_KEYS) {
          next[k] = { ...emptyPerms(), ...(pj.permissions[k] ?? {}) };
          if (k === "home") next[k].visible = true;
        }
        setMap(next);
      } else {
        toast({ title: "تعذر جلب الصلاحيات", description: pj?.error, variant: "destructive" });
      }
      const tj = await tplRes.json();
      if (tplRes.ok && tj) {
        setTemplates([
          ...((tj.builtIn ?? []) as TemplateOption[]),
          ...((tj.custom ?? []) as TemplateOption[]),
        ]);
      }
    } catch {
      toast({ title: "تعذر الاتصال بالخادم", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [employeeId, toast]);

  useEffect(() => {
    if (open) {
      setExpanded(null);
      setTemplateChoice("");
      load();
    }
  }, [open, load]);

  const applyTemplate = (id: string) => {
    const tpl = templates.find((t) => (t.key ?? t.id) === id);
    if (!tpl) return;
    const next = {} as Record<SectionKey, SectionPerms>;
    for (const k of SECTION_KEYS) {
      const raw = (tpl.sections ?? {})[k] ?? {};
      next[k] = { ...emptyPerms(), ...raw };
      if (k === "home") next[k].visible = true;
    }
    setMap(next);
    setTemplateChoice(id);
    toast({ title: `طُبق قالب «${tpl.name}»`, description: "راجع الصلاحيات ثم عدّل ما تشاء قبل الحفظ." });
  };

  const toggleSection = (key: SectionKey, visible: boolean) => {
    if (key === "home") return; // الرئيسية أساسية دائمة الظهور
    setMap((m) => {
      const p = { ...m[key] };
      p.visible = visible;
      if (!visible) {
        // إخفاء القسم يطفئ كل صلاحياته — إخفاء الأيقونة يعني منع الوصول كلياً على الخادم
        p.view = false;
        p.create = false;
        p.edit = false;
        p.delete = false;
        p.export = false;
        p.approve = false;
        p.manage = false;
      }
      return { ...m, [key]: p };
    });
  };

  const toggleAction = (key: SectionKey, action: ActionKey, value: boolean) => {
    setMap((m) => {
      const p = { ...m[key], [action]: value };
      // تفعيل أي صلاحية تفصيلية يتطلب إظهار القسم ومنح «عرض»
      if (value) {
        p.visible = true;
        if (action !== "view") p.view = true;
      }
      return { ...m, [key]: p };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: map }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
      toast({ title: "حُفظت الصلاحيات", description: `طُبقت على حساب «${employeeName}» فوراً — تسري على الجلسة الحالية والقادمة.` });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "تعذر حفظ الصلاحيات", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: "اكتب اسم القالب أولاً", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/employees/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName.trim(), description: `قالب مخصص محفوظ من صلاحيات «${employeeName}»`, sections: map }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
      toast({ title: "أُنشئ القالب", description: `يمكن تطبيق «${templateName.trim()}» على أي موظف آخر.` });
      setTemplateName("");
      const tj = await fetch("/api/employees/templates", { cache: "no-store" }).then((r) => r.json());
      if (tj) setTemplates([...(tj.builtIn ?? []), ...(tj.custom ?? [])]);
    } catch (e) {
      toast({ title: "تعذر إنشاء القالب", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const visibleCount = useMemo(
    () => SECTION_KEYS.filter((k) => map[k].visible).length,
    [map]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-600" aria-hidden="true" />
            تخصيص الواجهة والصلاحيات — {employeeName}
          </DialogTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            اختر الأقسام التي تظهر للموظف في واجهته، ثم حدد صلاحياته التفصيلية داخل كل قسم.
            الصلاحيات تُطبق فعلياً على الخادم — الإخفاء يمنع الوصول إلى القسم وعملياته بالكامل.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" /> جارٍ التحميل...
          </div>
        ) : (
          <>
            {/* القوالب الجاهزة */}
            <div className="rounded-xl border bg-sky-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <WandSparkles className="h-4 w-4 text-sky-600" aria-hidden="true" />
                <Label className="text-xs font-bold">تطبيق قالب جاهز ثم التعديل يدوياً:</Label>
                <Select value={templateChoice} onValueChange={applyTemplate}>
                  <SelectTrigger className="w-[240px] bg-white" aria-label="اختيار قالب">
                    <SelectValue placeholder="اختر قالباً..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.key ?? t.id} value={t.key ?? t.id ?? t.name}>
                        {t.name}{t.isBuiltIn ? "" : " (مخصص)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground">{visibleCount} من {SECTION_KEYS.length} قسم مرئي حالياً</span>
              </div>
            </div>

            {/* قائمة الأقسام */}
            <div className="space-y-2">
              {SECTION_KEYS.map((key) => {
                const meta = SECTION_META_AR[key];
                const perms = map[key];
                const Icon = SECTION_ICONS[key];
                const isCore = CORE_SECTIONS.includes(key);
                const comingSoon = COMING_SOON_SECTIONS.includes(key);
                const isOpen = expanded === key;
                return (
                  <div key={key} className={`rounded-xl border ${perms.visible ? "border-sky-200 bg-sky-50/40" : "bg-white"}`}>
                    <div className="flex items-center gap-3 p-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${perms.visible ? "bg-sky-500/15" : "bg-muted"}`}>
                        <Icon className={`h-4.5 w-4.5 h-5 w-5 ${perms.visible ? "text-sky-600" : "text-muted-foreground"}`} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-bold text-foreground">{meta.label}</p>
                          {isCore && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">أساسي — دائم</Badge>}
                          {comingSoon && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">قيد الإعداد</Badge>}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{meta.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={perms.visible}
                          disabled={isCore}
                          onCheckedChange={(v) => toggleSection(key, v)}
                          aria-label={`إظهار قسم ${meta.label}`}
                        />
                        {!isCore && perms.visible && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setExpanded(isOpen ? null : key)}
                            aria-label={`صلاحيات ${meta.label}`}
                            aria-expanded={isOpen}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronLeft className="h-4 w-4" aria-hidden="true" />}
                          </Button>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t bg-white px-3 py-3 rounded-b-xl">
                        <p className="mb-2 text-[11px] font-bold text-muted-foreground">صلاحيات تفصيلية داخل «{meta.label}»:</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {ACTION_KEYS.map((action) => (
                            <label
                              key={action}
                              className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted/50 has-[:checked]:border-sky-300 has-[:checked]:bg-sky-50"
                            >
                              <Checkbox
                                checked={perms[action]}
                                onCheckedChange={(v) => toggleAction(key, action, v === true)}
                                aria-label={`${ACTION_LABELS_AR[action]} — ${meta.label}`}
                              />
                              {ACTION_LABELS_AR[action]}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* حفظ كقالب مخصص */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
              <Label className="text-xs font-bold">حفظ هذه الصلاحيات كقالب مخصص باسم:</Label>
              <Input
                className="h-8 w-56 text-xs"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="مثال: فريق بغداد الميداني"
                maxLength={40}
              />
              <Button type="button" variant="outline" size="sm" onClick={saveAsTemplate} disabled={!templateName.trim()}>
                حفظ كقالب
              </Button>
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button type="button" onClick={save} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saving ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
