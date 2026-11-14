"use client";

// ——— قسم «إدارة الموظفين والحسابات» — لوحة الإدارة ———
// المدير يضيف موظفاً (اسم/هاتف/مستخدم/كلمة مرور أولية/مسمى/محافظة/منطقة)، يعدل،
// يعيد تعيين كلمة المرور، يفعّل/يعطل، يحذف بضوابط، ويخصص واجهة كل موظف وصلاحياته.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  History,
  KeyRound,
  Loader2,
  LogIn,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  UserRoundPlus,
  UserRoundSearch,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatFullDate, formatNumber, formatTime } from "@/lib/time";
import { PermissionsDialog } from "@/components/employees/permissions-dialog";
import { AuditDialog } from "@/components/employees/audit-dialog";

interface EmployeeRow {
  id: string;
  name: string;
  username: string | null;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  role: string;
  governorate: string | null;
  regionId: string | null;
  regionName: string | null;
  isActive: boolean;
  hasPassword: boolean;
  hasActiveSession: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  visibleSections: number;
  visitsCount: number;
  hasHistory: boolean;
}

interface RegionOption {
  id: string;
  name: string;
  governorate: string;
}

const emptyForm = {
  name: "",
  phone: "",
  username: "",
  password: "",
  jobTitle: "",
  role: "STAFF",
  governorate: "",
  regionId: "",
};

export function EmployeesView() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [governorates, setGovernorates] = useState<string[]>([]);

  // النوافذ
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [permEmployee, setPermEmployee] = useState<EmployeeRow | null>(null);
  const [resetTarget, setResetTarget] = useState<EmployeeRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  // تفعيل حساب الدخول — للموظف الذي أُنشئ بلا حساب (بلا اسم مستخدم). عملية يدوية صريحة من المدير:
  // لا يُفعّل أي حساب تلقائياً ولا تتغير صلاحيات الموظف القائمة بأي شكل
  const [activateTarget, setActivateTarget] = useState<EmployeeRow | null>(null);
  const [activateForm, setActivateForm] = useState({ username: "", password: "" });
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employees", { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setEmployees(j.employees ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/regions?limit=1000", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRegions(j?.regions ?? []))
      .catch(() => setRegions([]));
    fetch("/api/schools?withOptions=1&pageSize=5", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setGovernorates(j?.options?.governorates ?? []))
      .catch(() => setGovernorates([]));
  }, [load]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter((e) => e.isActive).length,
    online: employees.filter((e) => e.hasActiveSession).length,
    withPermissions: employees.filter((e) => e.visibleSections > 1).length,
  }), [employees]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (e: EmployeeRow) => {
    setEditing(e);
    setForm({
      name: e.name ?? "",
      phone: e.phone ?? "",
      username: e.username ?? "",
      password: "",
      jobTitle: e.jobTitle ?? "",
      role: e.role,
      governorate: e.governorate ?? "",
      regionId: e.regionId ?? "",
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.name.trim()) {
      toast({ title: "الاسم الكامل مطلوب", variant: "destructive" });
      return;
    }
    if (!editing && (!form.username.trim() || form.password.length < 6)) {
      toast({ title: "اسم المستخدم وكلمة مرور أولية (6 أحرف على الأقل) مطلوبان", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
      const body = editing
        ? { name: form.name, phone: form.phone, jobTitle: form.jobTitle, role: form.role, governorate: form.governorate || null, regionId: form.regionId || null }
        : { ...form, governorate: form.governorate || null, regionId: form.regionId || null };
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
      toast({
        title: editing ? "حُدثت بيانات الموظف" : "أُنشئ حساب الموظف",
        description: editing ? "التغييرات سارية فوراً." : "الخطوة التالية: افتح «تخصيص الواجهة والصلاحيات» لتحديد ما يظهر له.",
      });
      setFormOpen(false);
      load();
    } catch (e) {
      toast({ title: "تعذر الحفظ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (e: EmployeeRow) => {
    try {
      const res = await fetch(`/api/employees/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !e.isActive }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر التنفيذ");
      toast({
        title: !e.isActive ? "عُطل الحساب" : "فُعل الحساب",
        description: !e.isActive
          ? "مُنعت جلساته فوراً ولا يستطيع تسجيل الدخول. السجلات التاريخية محفوظة بالكامل."
          : "يمكن للموظف تسجيل الدخول من جديد.",
      });
      load();
    } catch (err) {
      toast({ title: "تعذر التنفيذ", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const submitReset = async () => {
    if (!resetTarget || resetPassword.length < 6) {
      toast({ title: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`/api/employees/${resetTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر التنفيذ");
      toast({ title: "أُعيد تعيين كلمة المرور", description: "أُنهيت جلساته الحالية — سجّل الدخول بالكلمة الجديدة." });
      setResetTarget(null);
      setResetPassword("");
    } catch (err) {
      toast({ title: "تعذر التنفيذ", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/employees/${deleteTarget.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحذف");
      toast({ title: "حُذف الحساب", description: `حُذف حساب «${deleteTarget.name}» — سجلات التدقيق الخاصة به بقيت محفوظة.` });
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast({ title: "الحذف مرفوض", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  // تفعيل حساب الدخول — يدوي بالكامل: المدير يعين اسم المستخدم وكلمة المرور الأولية بنفسه
  // لا يُنفذ تلقائياً لأي موظف، ولا يغير الصلاحيات الممنوحة مسبقاً
  const submitActivate = async () => {
    if (!activateTarget) return;
    const username = activateForm.username.trim();
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      toast({ title: "اسم المستخدم: حروف إنجليزية وأرقام فقط (3-32 خانة)", variant: "destructive" });
      return;
    }
    if (activateForm.password.length < 6) {
      toast({ title: "كلمة المرور الأولية يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    setActivating(true);
    try {
      const res = await fetch(`/api/employees/${activateTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: activateForm.password }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر التفعيل");
      toast({
        title: "فُعل حساب الدخول",
        description: `«${activateTarget.name}» يستطيع الآن الدخول باسم المستخدم ${username} — صلاحياته السابقة كما هي دون تغيير.`,
      });
      setActivateTarget(null);
      setActivateForm({ username: "", password: "" });
      load();
    } catch (err) {
      toast({ title: "تعذر تفعيل الحساب", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">إدارة الموظفين والحسابات</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            حسابات الموظفين وصلاحياتهم التفصيلية — كل موظف يرى في واجهته على الموبايل ما يسمح له به المدير فقط.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="icon" onClick={load} aria-label="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" onClick={() => setAuditOpen(true)} className="gap-2">
            <History className="h-4 w-4" aria-hidden="true" />
            سجل التدقيق
          </Button>
          <Button type="button" onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            إضافة موظف
          </Button>
        </div>
      </div>

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "إجمالي الموظفين", value: stats.total, icon: UsersRound },
          { label: "حسابات مفعّلة", value: stats.active, icon: Power },
          { label: "مسجلون دخول الآن", value: stats.online, icon: LogIn },
          { label: "لك قسم مخصص", value: stats.withPermissions, icon: ShieldCheck },
        ].map((s) => (
          <Card key={s.label} className="p-0">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10">
                <s.icon className="h-4.5 w-4.5 h-5 w-5 text-sky-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-foreground">{formatNumber(s.value)}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* جدول الموظفين */}
      {!loading && employees.length === 0 && (
        <div className="rounded-xl border bg-white p-10 text-center">
          <UserRoundPlus className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-foreground">لا يوجد موظفون بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">أضف أول موظف ثم خصص واجهته وصلاحياته — سيدخل من هاتفه بحسابه.</p>
        </div>
      )}

      {employees.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto nice-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-semibold">الموظف</th>
                  <th className="px-4 py-2.5 text-start font-semibold">اسم المستخدم</th>
                  <th className="px-4 py-2.5 text-start font-semibold">نطاق العمل</th>
                  <th className="px-4 py-2.5 text-start font-semibold">الحالة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">آخر تسجيل دخول</th>
                  <th className="px-4 py-2.5 text-start font-semibold">الأقسام المسموحة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white">
                          {(e.name ?? "?").trim().charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{e.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {e.jobTitle ?? "—"} {e.phone ? `· ${e.phone}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span dir="ltr" className="text-xs font-semibold text-foreground">{e.username ?? "—"}</span>
                      {!e.username ? (
                        <p className="text-[10px] font-bold text-amber-700">بلا حساب دخول — يُفعّل يدوياً</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">{e.hasPassword ? "كلمة مرور مضبوطة" : "بلا كلمة مرور"}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {e.governorate ?? "كل المحافظات"}
                      {e.regionName ? ` — ${e.regionName}` : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={`text-[10px] w-fit ${e.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                          {e.isActive ? "مفعّل" : "معطل"}
                        </Badge>
                        {e.hasActiveSession && <Badge variant="outline" className="text-[10px] w-fit bg-sky-50 text-sky-700 border-sky-200">متصل الآن</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground" suppressHydrationWarning>
                      {e.lastLoginAt ? (
                        <>
                          {formatFullDate(e.lastLoginAt)}
                          <br />
                          {formatTime(e.lastLoginAt)}
                        </>
                      ) : (
                        "لم يسجل دخولاً بعد"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="font-bold text-foreground">{formatNumber(e.visibleSections)}</span> قسم
                      {e.visitsCount > 0 && <p className="text-[10px] text-muted-foreground">{formatNumber(e.visitsCount)} زيارة مسجلة</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setPermEmployee(e)} title="تخصيص الواجهة والصلاحيات">
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          الصلاحيات
                        </Button>
                        {!e.username && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 border-sky-200 bg-sky-50 text-[11px] text-sky-700 hover:bg-sky-100"
                            onClick={() => { setActivateTarget(e); setActivateForm({ username: "", password: "" }); }}
                            title="تفعيل حساب الدخول: تعيين اسم مستخدم وكلمة مرور أولية — يدوي وبدون أي تغيير على الصلاحيات"
                          >
                            <UserRoundSearch className="h-3.5 w-3.5" aria-hidden="true" />
                            تفعيل حساب الدخول
                          </Button>
                        )}
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => openEdit(e)} title="تعديل البيانات" aria-label={`تعديل ${e.name}`}>
                          <UserRoundCog className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => { setResetTarget(e); setResetPassword(""); }} title="إعادة تعيين كلمة المرور" aria-label={`كلمة مرور ${e.name}`}>
                          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <div className="flex items-center gap-1 border-e border-b border-s border-t border-input rounded-md px-2 h-7">
                          <Switch checked={e.isActive} onCheckedChange={() => toggleActive(e)} aria-label={e.isActive ? `تعطيل ${e.name}` : `تفعيل ${e.name}`} className="scale-75" />
                          <span className="text-[10px] text-muted-foreground">{e.isActive ? "مفعّل" : "معطل"}</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          onClick={() => setDeleteTarget(e)}
                          disabled={e.hasHistory}
                          title={e.hasHistory ? "له سجلات تاريخية — عطّل الحساب بدلاً من الحذف" : "حذف الحساب"}
                          aria-label={`حذف ${e.name}`}
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
          <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            الموظف الذي له سجلات تاريخية (زيارات/نشاطات/متابعات) لا يُحذف حفاظاً على السجلات — عطّله بدلاً من حذفه.
          </div>
        </div>
      )}

      {/* نافذة إضافة/تعديل موظف */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>{editing ? `تعديل بيانات «${editing.name}»` : "إضافة موظف جديد"}</DialogTitle>
            {!editing && (
              <p className="text-xs text-muted-foreground">
                أنشئ الحساب بكلمة مرور أولية، ثم افتح «تخصيص الواجهة والصلاحيات» لتحديد أقسامه وصلاحياته التفصيلية.
              </p>
            )}
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">الاسم الكامل *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">رقم الهاتف</Label>
              <Input dir="ltr" className="text-start" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="07XX XXX XXXX" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المسمى الوظيفي</Label>
              <Input value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="مثال: موظف زيارات ميدانية" maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المستخدم {editing ? "(غير قابل للتعديل)" : "*"}</Label>
              <Input
                dir="ltr"
                className="text-start"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                disabled={Boolean(editing)}
                autoComplete="off"
                placeholder="employee1"
              />
              <p className="text-[11px] text-muted-foreground">حروف إنجليزية وأرقام فقط (3-32 خانة) — به يدخل الموظف من هاتفه.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{editing ? "كلمة مرور جديدة (اتركها فارغة للإبقاء)" : "كلمة المرور الأولية *"}</Label>
              <Input
                dir="ltr"
                type="text"
                className="text-start"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
                placeholder="6 أحرف على الأقل"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الصفة الوظيفية</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">موظف</SelectItem>
                  <SelectItem value="MANAGER">مدير إداري</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المحافظة (نطاق العمل)</Label>
              <Select
                value={form.governorate || "all"}
                onValueChange={(v) => setForm((f) => ({ ...f, governorate: v === "all" ? "" : v, regionId: "" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المحافظات</SelectItem>
                  {governorates.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المنطقة (نطاق العمل)</Label>
              <Select
                value={form.regionId || "all"}
                onValueChange={(v) => setForm((f) => ({ ...f, regionId: v === "all" ? "" : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="all">كل المناطق</SelectItem>
                  {regions
                    .filter((r) => !form.governorate || r.governorate === form.governorate)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name} — {r.governorate}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">تحديد النطاق يقيّد المدارس الظاهرة للموظف في واجهته.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={submitForm} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? "حفظ التعديلات" : "إنشاء الحساب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة تخصيص الواجهة والصلاحيات */}
      <PermissionsDialog
        employeeId={permEmployee?.id ?? ""}
        employeeName={permEmployee?.name ?? ""}
        open={Boolean(permEmployee)}
        onOpenChange={(open) => { if (!open) setPermEmployee(null); }}
        onSaved={load}
      />

      {/* نافذة إعادة تعيين كلمة المرور */}
      <Dialog open={Boolean(resetTarget)} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-sky-600" aria-hidden="true" />
              إعادة تعيين كلمة مرور «{resetTarget?.name}»
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">كلمة المرور الجديدة (6 أحرف على الأقل)</Label>
            <Input dir="ltr" className="text-start" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} autoComplete="new-password" />
            <p className="text-[11px] text-muted-foreground">تُنهي جلساته الحالية فوراً — سيدخل بالكلمة الجديدة.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>إلغاء</Button>
            <Button type="button" onClick={submitReset}>إعادة التعيين</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة تفعيل حساب الدخول — للموظف الذي أُنشئ بلا حساب دخول.
          عملية يدوية صريحة من المدير فقط: تُعين بيانات الدخول ولا تُفعّل أي حساب تلقائياً،
          ولا تتغير صلاحيات الموظف القائمة بأي شكل. */}
      <Dialog open={Boolean(activateTarget)} onOpenChange={(open) => { if (!open) { setActivateTarget(null); setActivateForm({ username: "", password: "" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundSearch className="h-5 w-5 text-sky-600" aria-hidden="true" />
              تفعيل حساب دخول «{activateTarget?.name}»
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-[11px] leading-relaxed text-sky-800">
              هذا الموظف لا يملك حساب دخول بعد (بلا اسم مستخدم وكلمة مرور). تعيين البيانات أدناه يجعله
              قادراً على تسجيل الدخول من واجهته على الموبايل. الصلاحيات الممنوحة له سابقاً تبقى كما هي
              دون أي تغيير، ولا يُفعّل أي حساب آخر تلقائياً.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المستخدم (حروف إنجليزية وأرقام، 3-32 خانة)</Label>
              <Input
                dir="ltr"
                className="text-start"
                value={activateForm.username}
                onChange={(e) => setActivateForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="rabea.alifba"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور الأولية (6 أحرف على الأقل)</Label>
              <Input
                dir="ltr"
                className="text-start"
                type="password"
                value={activateForm.password}
                onChange={(e) => setActivateForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
              />
              <p className="text-[11px] text-muted-foreground">
                يُسجل التحديث في سجل التدقيق (تفعيل حساب موظف) — ويمكنك بعدها تحديد صلاحياته من زر «الصلاحيات».
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setActivateTarget(null); setActivateForm({ username: "", password: "" }); }} disabled={activating}>
              إلغاء
            </Button>
            <Button type="button" onClick={submitActivate} disabled={activating} className="gap-2">
              {activating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              تفعيل الحساب الآن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف حساب «{deleteTarget?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف حساب الموظف نهائياً ولا يستطيع تسجيل الدخول. قيود سجل التدقيق المرتبطة به تبقى محفوظة.
              {deleteTarget?.hasHistory && " هذا الموظف لديه سجلات تاريخية — الحذف مرفوض من الخادم، عطّل الحساب بدلاً منه."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={submitDelete} className="bg-red-600 hover:bg-red-700">تأكيد الحذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* سجل التدقيق */}
      <AuditDialog open={auditOpen} onOpenChange={setAuditOpen} />
    </div>
  );
}
