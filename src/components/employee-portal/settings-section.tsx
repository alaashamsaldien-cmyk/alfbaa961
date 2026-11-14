"use client";

// ——— بوابة الموظف: الإعدادات — بيانات حسابي وتغيير كلمة المرور ———
import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { EmployeeMe } from "@/components/employee-portal/portal-view";
import { formatFullDate, formatTime } from "@/lib/time";

export function EmployeeSettingsSection({ me, onPasswordChanged }: { me: EmployeeMe; onPasswordChanged: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!current || next.length < 6) {
      toast({ title: "أدخل كلمة المرور الحالية والجديدة (6 أحرف على الأقل)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/employee/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر التغيير");
      toast({
        title: "حُدثت كلمة المرور",
        description: "سجّل الدخول بكلمة المرور الجديدة — عُدت لشاشة الدخول الآن.",
      });
      setTimeout(onPasswordChanged, 800);
    } catch (e) {
      toast({ title: "تعذر تغيير كلمة المرور", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-lg font-extrabold text-foreground">الإعدادات — حسابي</p>

      <Card className="p-0">
        <CardContent className="space-y-1.5 p-3">
          {[
            { label: "الاسم", value: me.employee.name },
            { label: "اسم المستخدم", value: me.employee.username, ltr: true },
            { label: "المسمى الوظيفي", value: me.employee.jobTitle ?? me.employee.roleLabel },
            { label: "الهاتف", value: me.employee.phone ?? "—", ltr: true },
            { label: "نطاق العمل", value: [me.employee.regionName, me.employee.governorate].filter(Boolean).join(" — ") || "كل المحافظات والمناطق" },
            { label: "آخر تسجيل دخول", value: me.employee.lastLoginAt ? `${formatFullDate(me.employee.lastLoginAt)} ${formatTime(me.employee.lastLoginAt)}` : "—" },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-lg border bg-white px-2.5 py-2">
              <span className="text-[10px] text-muted-foreground">{r.label}</span>
              <span className="text-[11px] font-semibold text-foreground" dir={r.ltr ? "ltr" : undefined}>{r.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <KeyRound className="h-4 w-4 text-sky-600" aria-hidden="true" />
            تغيير كلمة المرور
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">كلمة المرور الحالية</Label>
            <Input dir="ltr" type="password" className="text-start" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">كلمة المرور الجديدة (6 أحرف على الأقل)</Label>
            <Input dir="ltr" type="password" className="text-start" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </div>
          <Button type="button" className="w-full gap-2" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? "جارٍ الحفظ..." : "حفظ كلمة المرور الجديدة"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
