"use client";

// ——— قسم الإعدادات والصلاحيات ———
// تبويبات: حسابات المستخدمين | حسابات المنسقات | جودة بيانات الدخول (كلمة مروري) | معلومات النظام
// كل ما يظهر هنا حقيقي: حسابات فعلية من القاعدة، حالة مزودات الاكتشاف، وأعداد قاعدة البيانات

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, KeyRound, ShieldOff, LogOut, Database, ShieldCheck, UserRoundCog, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmployeesView } from "@/components/employees/employees-view";
import { CoordinatorsView } from "@/components/coordinators/coordinators-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, formatShortDate } from "@/lib/time";

interface UserItem {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  role: string;
  isActive: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  hasActiveSession: boolean;
  createdAt: string;
}

interface SystemInfo {
  googlePlacesEnabled: boolean;
  basemapTiles: string;
  counts: { schools: number; regions: number; coordinators: number; activities: number; users: number };
  currentUser: { name: string; email: string; role: string };
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "مدير النظام",
  MANAGER: "مدير إداري",
  STAFF: "موظف إداري",
};

export function SettingsView({ onLogout }: { onLogout?: () => void }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "" });
  const [pwTarget, setPwTarget] = useState<UserItem | null>(null);
  const [pwForm, setPwForm] = useState({ password: "" });
  // كلمة مروري
  const [myPwForm, setMyPwForm] = useState({ current: "", next: "", confirm: "" });
  const [myPwBusy, setMyPwBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [uRes, cfgRes] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/settings/system", { cache: "no-store" }),
      ]);
      const u = await uRes.json();
      const cfg = await cfgRes.json();
      if (!uRes.ok) throw new Error(u?.error);
      setUsers((u.users as UserItem[]).filter((user) => user.role === "ADMIN"));
      if (cfgRes.ok) setSystem(cfg);
    } catch {
      setUsers([]);
      toast({ title: "تعذر تحميل بيانات الإعدادات", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const addUser = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.username.trim() || form.password.length < 6) {
      toast({
        title: "أكمل الحقول",
        description: "الاسم والبريد واسم المستخدم وكلمة مرور (6+ أحرف) مطلوبة.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "ADMIN" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الإنشاء");
      toast({ title: "أُنشئ الحساب", description: "يمكن للمستخدم تسجيل الدخول باسم المستخدم وكلمة المرور." });
      setAddOpen(false);
      setForm({ name: "", email: "", username: "", password: "" });
      load();
    } catch (e) {
      toast({ title: "تعذر الإنشاء", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: UserItem) => {
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر التنفيذ");
      toast({ title: u.isActive ? "عُطّل الحساب" : "فُعّل الحساب" });
      load();
    } catch (e) {
      toast({ title: "تعذر التنفيذ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const resetPassword = async () => {
    if (!pwTarget || pwForm.password.length < 6) {
      toast({ title: "كلمة المرور قصيرة", description: "6 أحرف على الأقل.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${pwTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwForm.password }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
      toast({ title: "أُعيد تعيين كلمة المرور", description: "أُنهيت جلسات المستخدم لتدخل بالبيانات الجديدة." });
      setPwTarget(null);
      setPwForm({ password: "" });
      load();
    } catch (e) {
      toast({ title: "تعذر الحفظ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (u: UserItem) => {
    if (!window.confirm(`حذف حساب «${u.name ?? u.email}» نهائياً؟ لا يُسترد الحذف.`)) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error);
      toast({ title: "حُذف الحساب" });
      load();
    } catch (e) {
      toast({ title: "تعذر الحذف", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const changeMyPassword = async () => {
    if (myPwForm.next.length < 6) {
      toast({ title: "كلمة المرور الجديدة قصيرة", description: "6 أحرف على الأقل.", variant: "destructive" });
      return;
    }
    if (myPwForm.next !== myPwForm.confirm) {
      toast({ title: "التأكيد غير مطابق", variant: "destructive" });
      return;
    }
    setMyPwBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: myPwForm.current, newPassword: myPwForm.next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر التغيير");
      toast({ title: "حُدّثت كلمة مرورك", description: "بقيت جلستك الحالية نشطة وأُنهيت بقية الجلسات." });
      setMyPwForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast({ title: "تعذر التغيير", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setMyPwBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">الإعدادات والصلاحيات</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            إدارة حسابات الموبايل وحسابات الإدارة وكلمات المرور ومعلومات النظام.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          تحديث
        </Button>
      </div>

      <Tabs defaultValue="mobile" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="mobile" className="gap-1.5"><Smartphone className="h-4 w-4" aria-hidden="true" />موبايل</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><UserRoundCog className="h-4 w-4" aria-hidden="true" />حسابات الإدارة</TabsTrigger>
          <TabsTrigger value="password" className="gap-1.5"><KeyRound className="h-4 w-4" aria-hidden="true" />كلمة مروري</TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5"><Database className="h-4 w-4" aria-hidden="true" />معلومات النظام</TabsTrigger>
        </TabsList>

        {/* —— حسابات المستخدمين —— */}
        <TabsContent value="users" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              حسابات دخول لوحة الإدارة — كل حساب له دور محدد، والحماية مطبقة في الخادم على كل واجهة.
            </p>
            <Button type="button" onClick={() => setAddOpen(true)} className="gap-2" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              حساب مدير جديد
            </Button>
          </div>

          {!users && <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>}
          {users && users.length === 0 && (
            <EmptyState icon={ShieldCheck} title="لا حسابات" description="أنشئ حساب مستخدم جديد." />
          )}
          {users && users.length > 0 && (
            <div className="overflow-hidden rounded-xl border bg-white">
              <div className="overflow-x-auto nice-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-start font-semibold">الحساب</th>
                      <th className="px-4 py-2.5 text-start font-semibold">اسم الدخول</th>
                      <th className="px-4 py-2.5 text-start font-semibold">الدور</th>
                      <th className="px-4 py-2.5 text-start font-semibold">آخر دخول</th>
                      <th className="px-4 py-2.5 text-start font-semibold">الحالة</th>
                      <th className="px-4 py-2.5 text-center font-semibold">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <p className="font-bold text-foreground">{u.name ?? "—"}</p>
                          <p dir="ltr" className="text-[11px] text-muted-foreground">{u.email}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          {u.username ? (
                            <span dir="ltr" className="font-mono text-xs">{u.username}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {ROLE_LABELS[u.role]}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground" suppressHydrationWarning>
                          {u.lastLoginAt ? formatShortDate(u.lastLoginAt) : "لم يسجل بعد"}
                        </td>
                        <td className="px-4 py-2.5">
                          {u.isActive ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                              فعّال{u.hasActiveSession ? " · متصل" : ""}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">معطل</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs"
                              onClick={() => {
                                setPwTarget(u);
                                setPwForm({ password: "" });
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                              كلمة المرور
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleActive(u)}>
                              {u.isActive ? "تعطيل" : "تفعيل"}
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-600"
                              aria-label={`حذف حساب ${u.name ?? u.email}`}
                              onClick={() => removeUser(u)}
                            >
                              <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
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
        </TabsContent>

        <TabsContent value="mobile" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            أنشئ حسابات الموظفين والمنسّقين واضبط صلاحياتهم هنا. بعد تسجيل الدخول من الموبايل، تظهر لكل حساب أقسامه المسموحة في نفس الواجهة.
          </p>
          <Tabs defaultValue="employees" className="space-y-3">
            <TabsList aria-label="حسابات الموبايل" className="h-auto flex-wrap">
              <TabsTrigger value="employees">الموظفون والصلاحيات</TabsTrigger>
              <TabsTrigger value="coordinators">حسابات المنسّقين</TabsTrigger>
            </TabsList>
            <TabsContent value="employees"><EmployeesView /></TabsContent>
            <TabsContent value="coordinators"><CoordinatorsView /></TabsContent>
          </Tabs>
        </TabsContent>

        {/* —— كلمة مروري —— */}
        <TabsContent value="password" className="space-y-3">
          <Card className="p-0">
            <CardContent className="max-w-md space-y-3 p-4">
              <p className="text-sm font-bold">تغيير كلمة مرورك الحالية</p>
              <div className="space-y-1.5">
                <Label className="text-xs">كلمة المرور الحالية</Label>
                <Input
                  dir="ltr"
                  type="password"
                  autoComplete="current-password"
                  className="text-start"
                  value={myPwForm.current}
                  onChange={(e) => setMyPwForm((f) => ({ ...f, current: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">كلمة المرور الجديدة (6 أحرف على الأقل)</Label>
                <Input
                  dir="ltr"
                  type="password"
                  autoComplete="new-password"
                  className="text-start"
                  value={myPwForm.next}
                  onChange={(e) => setMyPwForm((f) => ({ ...f, next: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">تأكيد كلمة المرور الجديدة</Label>
                <Input
                  dir="ltr"
                  type="password"
                  autoComplete="new-password"
                  className="text-start"
                  value={myPwForm.confirm}
                  onChange={(e) => setMyPwForm((f) => ({ ...f, confirm: e.target.value }))}
                />
              </div>
              <Button type="button" onClick={changeMyPassword} disabled={myPwBusy} className="gap-2">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {myPwBusy ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
              </Button>
            </CardContent>
          </Card>

          <Card className="p-0">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-bold">تسجيل الخروج من هذه الجلسة</p>
                <p className="mt-0.5 text-xs text-muted-foreground">تنتهي جلستك فوراً وتُسحب صلاحيات الوصول للوحة.</p>
              </div>
              {onLogout && (
                <Button type="button" variant="outline" onClick={onLogout} className="gap-2">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  تسجيل الخروج
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* —— معلومات النظام —— */}
        <TabsContent value="system" className="space-y-3">
          {!system && <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>}
          {system && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "المدارس", value: system.counts.schools },
                  { label: "المناطق", value: system.counts.regions },
                  { label: "المنسقات", value: system.counts.coordinators },
                  { label: "النشاطات", value: system.counts.activities },
                  { label: "حسابات الإدارة", value: system.counts.users },
                ].map((c) => (
                  <Card key={c.label} className="p-0">
                    <CardContent className="p-3 text-center">
                      <p className="text-xl font-extrabold text-primary">{formatNumber(c.value)}</p>
                      <p className="text-[11px] text-muted-foreground">{c.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="p-0">
                <CardContent className="space-y-2 p-4 text-xs leading-relaxed text-muted-foreground">
                  <p><b className="text-foreground">قاعدة البيانات:</b> مركزية واحدة (SQLite عبر Prisma) — المدارس والمناطق والنشاطات والجلسات كلها في القاعدة نفسها.</p>
                  <p><b className="text-foreground">مزود الاكتشاف (Google Places API):</b>{" "}
                    {system.googlePlacesEnabled ? (
                      <Badge variant="outline" className="ms-1 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">مفعّل — المفتاح في متغير بيئة خادمي فقط</Badge>
                    ) : (
                      <Badge variant="outline" className="ms-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200">غير مفعّل — يعمل النظام بمزود OpenStreetMap المجاني دون مفتاح</Badge>
                    )}
                  </p>
                  <p><b className="text-foreground">بلاطات الخريطة:</b> {system.basemapTiles === "OSM" ? "OpenStreetMap مجانية دون مفتاح API" : system.basemapTiles}</p>
                  <p><b className="text-foreground">المستخدم الحالي:</b> {system.currentUser.name} — {system.currentUser.email} ({ROLE_LABELS[system.currentUser.role] ?? system.currentUser.role})</p>
                  <p><b className="text-foreground">حماية الجلسات:</b> كوكي HttpOnly مرتبط بسجل جلسة في القاعدة — تسجيل الخروج يحذف السجل فوراً.</p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* حساب مستخدم جديد */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>حساب مستخدم إداري جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">البريد الإلكتروني *</Label>
              <Input dir="ltr" className="text-start" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المستخدم * (إنجليزي)</Label>
              <Input dir="ltr" className="text-start" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="user.name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة المرور * (6 أحرف على الأقل)</Label>
              <Input dir="ltr" type="password" autoComplete="new-password" className="text-start" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={addUser} disabled={saving}>{saving ? "جارٍ الإنشاء..." : "إنشاء الحساب"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إعادة تعيين كلمة مرور مستخدم */}
      <Dialog open={Boolean(pwTarget)} onOpenChange={(o) => !o && setPwTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
          </DialogHeader>
          <p className="truncate text-xs text-muted-foreground">{pwTarget?.name ?? pwTarget?.email}</p>
          <div className="space-y-1.5">
            <Label className="text-xs">كلمة المرور الجديدة (6 أحرف على الأقل)</Label>
            <Input dir="ltr" type="password" autoComplete="new-password" className="text-start" value={pwForm.password} onChange={(e) => setPwForm({ password: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPwTarget(null)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={resetPassword} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
