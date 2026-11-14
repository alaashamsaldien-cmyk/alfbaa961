"use client";

// ——— قسم المنسقات الميدانيات — إدارة الحسابات وعرض المدارس المخصصة ———

import { useCallback, useEffect, useState } from "react";
import { Plus, UserRoundCheck, DoorOpen, KeyRound, RotateCcw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import type { CoordinatorDTO } from "@/lib/types";
import { formatShortDate } from "@/lib/time";

interface Props {
  onOpenPortal: () => void;
}

export function CoordinatorsView({ onOpenPortal }: Props) {
  const { toast } = useToast();
  const [list, setList] = useState<CoordinatorDTO[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);
  // إدارة حساب الدخول للمنسقة
  const [accountTarget, setAccountTarget] = useState<CoordinatorDTO | null>(null);
  const [accountMode, setAccountMode] = useState<"create" | "reset">("create");
  const [accountForm, setAccountForm] = useState({ username: "", password: "" });
  const [accountSaving, setAccountSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/coordinators", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      setList(j.coordinators);
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!form.name.trim()) {
      toast({ title: "اسم المنسقة مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/coordinators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الإضافة");
      toast({ title: "تمت إضافة المنسقة", description: "يمكن الآن تخصيص مدارس لها من صفحة المدارس." });
      setAddOpen(false);
      setForm({ name: "", phone: "", email: "", notes: "" });
      load();
    } catch (e) {
      toast({ title: "تعذر الإضافة", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (c: CoordinatorDTO) => {
    try {
      const res = await fetch(`/api/coordinators/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر التعطيل");
      toast({
        title: "تم تعطيل الحساب",
        description: c.schoolCount > 0 ? `فُصلت ${c.schoolCount} مدرسة كانت مخصصة لها — أعد تخصيصها لمنسقات نشطات.` : "",
      });
      load();
    } catch (e) {
      toast({ title: "تعذر التعطيل", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const openAccount = (c: CoordinatorDTO) => {
    setAccountTarget(c);
    setAccountMode(c.hasAccount ? "reset" : "create");
    setAccountForm({ username: c.username ?? "", password: "" });
  };

  const saveAccount = async () => {
    if (!accountTarget) return;
    const { username, password } = accountForm;
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) {
      toast({ title: "اسم المستخدم غير صالح", description: "حروف إنجليزية وأرقام فقط (3-32 خانة).", variant: "destructive" });
      return;
    }
    if (accountMode === "create" && password.length < 6) {
      toast({ title: "كلمة المرور قصيرة", description: "6 أحرف على الأقل.", variant: "destructive" });
      return;
    }
    if (accountMode === "reset" && password && password.length < 6) {
      toast({ title: "كلمة المرور قصيرة", description: "6 أحرف على الأقل.", variant: "destructive" });
      return;
    }
    setAccountSaving(true);
    try {
      const res = await fetch(`/api/coordinators/${accountTarget.id}/account`, {
        method: accountMode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          accountMode === "create"
            ? { username: username.trim(), password }
            : { username: username.trim(), ...(password ? { password } : {}) }
        ),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
      toast({
        title: accountMode === "create" ? "أُنشئ حساب الدخول" : "حُدّثت بيانات الدخول",
        description: `تدخل المنسقة باسم المستخدم «${username.trim()}» وتنحصر رؤيتها في مدارسها المخصصة فقط.`,
      });
      setAccountTarget(null);
      load();
    } catch (e) {
      toast({ title: "تعذر حفظ الحساب", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setAccountSaving(false);
    }
  };

  const removeAccount = async (c: CoordinatorDTO) => {
    if (!window.confirm(`إزالة حساب الدخول للمنسقة «${c.name}»؟ سيُمنع دخولها للبوابة فوراً وتبقى سجلاتها ومدارسها كما هي.`)) return;
    try {
      const res = await fetch(`/api/coordinators/${c.id}/account`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الإزالة");
      toast({ title: "أُزيل حساب الدخول", description: "لن تستطيع المنسقة تسجيل الدخول حتى يُنشأ حساب جديد." });
      load();
    } catch (e) {
      toast({ title: "تعذر الإزالة", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">المنسقات الميدانيات</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            حسابات المنسقات التي تخصم لها المدارس لتتبعها ميدانياً وتحديث بياناتها.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onOpenPortal} className="gap-2">
            <DoorOpen className="h-4 w-4" aria-hidden="true" />
            فتح بوابة المنسقة
          </Button>
          <Button type="button" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            إضافة منسقة
          </Button>
        </div>
      </div>

      {!list && <div className="rounded-xl border bg-white p-6"><p className="text-center text-sm text-muted-foreground">جارٍ التحميل...</p></div>}

      {list && list.length === 0 && (
        <EmptyState
          icon={UserRoundCheck}
          title="لا توجد منسقات بعد"
          description="أضف منسقة أولاً، ثم اذهب إلى صفحة المدارس وخصص لها مدارس لتظهر في حسابها وخريطتها الميدانية."
        />
      )}

      {list && list.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Card key={c.id} className="p-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{c.name}</p>
                    <p dir="ltr" className="text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                    {c.email && <p dir="ltr" className="truncate text-xs text-muted-foreground">{c.email}</p>}
                  </div>
                  <Badge variant="outline" className="shrink-0 bg-sky-50 text-sky-700 border-sky-200">
                    {c.schoolCount} مدرسة
                  </Badge>
                </div>
                {c.notes && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.notes}</p>}
                {c.hasAccount && (
                  <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] leading-relaxed text-emerald-700">
                    حساب دخول فعّال باسم المستخدم <span dir="ltr" className="font-bold">{c.username}</span>
                    {c.lastLoginAt ? ` · آخر دخول ${formatShortDate(c.lastLoginAt)}` : " · لم تسجل دخولها بعد"}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenPortal}>
                    بوابة المنسقة
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => openAccount(c)}>
                    {c.hasAccount ? <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> : <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
                    {c.hasAccount ? "إعادة تعيين الدخول" : "إنشاء حساب دخول"}
                  </Button>
                  {c.hasAccount && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs text-red-600" onClick={() => removeAccount(c)}>
                      <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                      إزالة الحساب
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => deactivate(c)}>
                    تعطيل المنسقة
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة منسقة ميدانية</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الهاتف</Label>
              <Input dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={add} disabled={saving}>{saving ? "جارٍ الإضافة..." : "إضافة"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إنشاء/إعادة تعيين حساب الدخول للبوابة الميدانية */}
      <Dialog open={Boolean(accountTarget)} onOpenChange={(o) => !o && setAccountTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {accountMode === "create" ? "إنشاء حساب دخول للمنسقة" : "إعادة تعيين بيانات الدخول"}
            </DialogTitle>
          </DialogHeader>
          <p className="truncate text-xs text-muted-foreground">{accountTarget?.name}</p>
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800">
            عند تسجيل دخولها سترى فقط المدارس المخصصة لها من صفحة المدارس، مع أدوات الزيارة والتواصل وتحديث البيانات —
            ولا يمكنها تعديل أي مدرسة غير مخصصة لها.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المستخدم (إنجليزي) *</Label>
              <Input
                dir="ltr"
                className="text-start"
                value={accountForm.username}
                onChange={(e) => setAccountForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="coordinator.name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {accountMode === "create" ? "كلمة المرور * (6 أحرف على الأقل)" : "كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)"}
              </Label>
              <Input
                dir="ltr"
                type="password"
                autoComplete="new-password"
                className="text-start"
                value={accountForm.password}
                onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            {accountMode === "reset" && (
              <p className="text-[11px] text-amber-700">
                تنبيه: سيُنهى أي تسجيل دخول نشط للمنسقة عند الحفظ لتدخل بالبيانات الجديدة.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAccountTarget(null)} disabled={accountSaving}>إلغاء</Button>
            <Button type="button" onClick={saveAccount} disabled={accountSaving}>
              {accountSaving ? "جارٍ الحفظ..." : accountMode === "create" ? "إنشاء الحساب" : "حفظ التغييرات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
