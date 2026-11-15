"use client";

// ——— شاشة تسجيل الدخول / التهيئة الأولى ———
// تصميم موحّد مع هوية المنصة: خلفية فاتحة، بطاقة بيضاء، ترويسة باللون الكحلي للقائمة الجانبية.
// وضعان:
//  - التهيئة الأولى: عندما يكون حساب مدير النظام بلا كلمة مرور بعد (لا بيانات وهمية ولا كلمات افتراضية)
//  - تسجيل الدخول العادي: مدير النظام أو منسقة ميدانية بحساب أُنشئ من قسم المنسقات

import { useState } from "react";
import { GraduationCap, LogIn, ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginScreenProps {
  /** يحتاج النظام تهيئة أولى؟ (تعيين كلمة مرور مدير النظام) */
  needsSetup: boolean;
  /** يُستدعى بعد نجاح الدخول أو التهيئة لإعادة فحص الجلسة */
  onAuthenticated: () => void;
}

export function LoginScreen({ needsSetup, onAuthenticated }: LoginScreenProps) {
  const [name, setName] = useState("مدير النظام");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (needsSetup) {
      if (password.length < 6) {
        setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
        return;
      }
      if (password !== confirm) {
        setError("كلمتا المرور غير متطابقتين.");
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsSetup ? { name, username, password } : { username, password }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? "تعذر إتمام العملية، حاول مرة أخرى.");
        return;
      }
      onAuthenticated();
    } catch {
      setError("تعذر الاتصال بالخادم، تحقق من الاتصال وحاول مجدداً.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f3f4f6] p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* الترويسة بهوية القائمة الجانبية */}
        <div className="overflow-hidden rounded-t-2xl bg-sidebar px-6 py-7 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sky-500/15 ring-1 ring-sky-400/30">
            <GraduationCap className="h-8 w-8 text-sky-400" aria-hidden="true" />
          </div>
          <p className="mt-3 text-lg font-extrabold text-white">منصة ألف باء</p>
          <p className="mt-1 text-xs text-sidebar-foreground/80">لوحة إدارة المدارس</p>
        </div>

        <div className="rounded-b-2xl border border-t-0 bg-white px-6 py-6 shadow-sm">
          {needsSetup ? (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-sky-800">
                  التهيئة الأولى: عيّن اسم المستخدم وكلمة مرور مدير النظام لتأمين النظام قبل البدء.
                </p>
              </div>
              <form onSubmit={submit} className="space-y-4" aria-label="تهيئة حساب مدير النظام">
                <div className="space-y-1.5">
                  <Label htmlFor="setup-name" className="text-xs">الاسم المعروض</Label>
                  <Input id="setup-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-username" className="text-xs">اسم المستخدم (إنجليزي)</Label>
                  <Input
                    id="setup-username"
                    dir="ltr"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    className="text-start"
                  />
                  <p className="text-[11px] text-muted-foreground">حروف إنجليزية وأرقام فقط، 3-32 خانة.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-password" className="text-xs">كلمة المرور</Label>
                  <div className="relative">
                    <Input
                      id="setup-password"
                      dir="ltr"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="text-start pe-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-confirm" className="text-xs">تأكيد كلمة المرور</Label>
                  <Input
                    id="setup-confirm"
                    dir="ltr"
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="text-start"
                  />
                </div>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full gap-2" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                  {busy ? "جارٍ التنفيذ..." : "تأمين النظام والدخول"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-4 text-center">
                <h1 className="text-base font-extrabold text-foreground">تسجيل الدخول</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  حساب مدير النظام أو حساب موظف أو منسقة ميدانية مُنشأ من الإدارة.
                </p>
              </div>
              <form onSubmit={submit} className="space-y-4" aria-label="تسجيل الدخول">
                <div className="space-y-1.5">
                  <Label htmlFor="login-username" className="text-xs">اسم المستخدم أو البريد الإلكتروني</Label>
                  <Input
                    id="login-username"
                    dir="ltr"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    className="text-start text-base"
                    placeholder="admin"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-xs">كلمة المرور</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      dir="ltr"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="text-start ps-9 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-0 top-1/2 grid size-9 -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full gap-2" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
                  {busy ? "جارٍ تسجيل الدخول..." : "دخول"}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          حسابات الموظفين والمنسقات الميدانيات تُنشأ وتُدار من لوحة الإدارة — يرى كل مستخدم فقط ما سمح له المدير به.
        </p>
      </div>
    </div>
  );
}
