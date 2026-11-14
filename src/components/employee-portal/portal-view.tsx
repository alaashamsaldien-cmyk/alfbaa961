"use client";

// ——— بوابة الموظف على الموبايل — Mobile First حقيقية (ليست تصغيراً للوحة الكمبيوتر) ———
// تظهر فقط الأيقونات التي سمح المدير بها لكل موظف، مع تنقل سفلي مناسب للإبهام،
// وواجهة عربية RTL كاملة، وإحصائيات ومهام مرتبطة بنطاق عمل الموظف.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  SECTION_KEYS,
  SECTION_META_AR,
  CORE_SECTIONS,
  COMING_SOON_SECTIONS,
  type SectionKey,
  type SectionPerms,
} from "@/lib/sections-catalog";
import { SECTION_ICONS } from "@/components/employees/section-icons";
import { formatFullDate, formatNumber } from "@/lib/time";
import { EmployeeSchoolsSection } from "@/components/employee-portal/schools-section";
import { VisitWizard } from "@/components/employee-portal/visit-wizard";
import { EmployeeVisitsSection } from "@/components/employee-portal/visits-section";
import { EmployeeSimpleSections } from "@/components/employee-portal/simple-sections";
import { EmployeeSettingsSection } from "@/components/employee-portal/settings-section";

export interface EmployeeMe {
  employee: {
    id: string;
    name: string;
    username: string;
    role: string;
    roleLabel: string;
    phone: string | null;
    jobTitle: string | null;
    governorate: string | null;
    regionId: string | null;
    regionName: string | null;
    lastLoginAt: string | null;
  };
  permissions: Record<SectionKey, SectionPerms>;
  stats: {
    schoolsCount: number;
    visitsToday: number;
    visitsWeek: number;
    visitsTotal: number;
    pendingFollowups: number;
  };
  serverTime: string;
}

interface PortalViewProps {
  onLogout: () => void;
}

/** الأقسام الظاهرة في الشبكة الرئيسية والتنقل السفلي — بالترتيب المنطقي للميدان */
const GRID_ORDER: SectionKey[] = [
  "visit_register",
  "schools",
  "visits",
  "reviews",
  "discovery",
  "regions",
  "distribution",
  "reports",
  "employees",
  "expenses",
  "settings",
];

export function EmployeePortalView({ onLogout }: PortalViewProps) {
  const { toast } = useToast();
  const [me, setMe] = useState<EmployeeMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<SectionKey>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/me", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.employee) {
        setMe(j as EmployeeMe);
      } else {
        // جلسة منتهية أو حساب معطل — عودة لشاشة الدخول فوراً
        toast({ title: "انتهت الجلسة", description: j?.error ?? "سجّل الدخول من جديد." });
        onLogout();
      }
    } catch {
      toast({ title: "تعذر الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  }, [onLogout, toast]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const enabledSections = useMemo(() => {
    if (!me) return new Set<SectionKey>();
    const s = new Set<SectionKey>();
    for (const key of SECTION_KEYS) {
      const p = me.permissions[key];
      if (me.employee.role === "COORDINATOR" && key === "schools" && !p?.view) continue;
      if (p?.visible || CORE_SECTIONS.includes(key)) s.add(key);
    }
    return s;
  }, [me]);

  const bottomNav: SectionKey[] = useMemo(() => {
    const picks: SectionKey[] = ["home"];
    if (enabledSections.has("visit_register")) picks.push("visit_register");
    if (enabledSections.has("visits")) picks.push("visits");
    if (enabledSections.has("schools")) picks.push("schools");
    return picks.slice(0, 4);
  }, [enabledSections]);

  const openSection = (key: SectionKey) => {
    setSection(key);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const refreshAll = useCallback(() => {
    setRefreshKey((k) => k + 1);
    loadMe();
  }, [loadMe]);

  if (loading && !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-sky-500" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">جارٍ تجهيز واجهتك...</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
        <p className="text-sm text-muted-foreground">تعذر تحميل بيانات حسابك — أعد المحاولة أو سجّل الدخول من جديد.</p>
      </div>
    );
  }

  const navSections = GRID_ORDER.filter((k) => enabledSections.has(k));

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background pb-20" dir="rtl">
      {/* الترويسة */}
      <header className="sticky top-0 z-40 border-b bg-sidebar">
        <div className="flex h-14 items-center gap-3 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/30">
            <GraduationCap className="h-5 w-5 text-sky-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{me.employee.name}</p>
            <p className="truncate text-[10px] text-sidebar-foreground/80">
              {me.employee.jobTitle ?? me.employee.roleLabel}
              {me.employee.regionName ? ` · ${me.employee.regionName}` : me.employee.governorate ? ` · ${me.employee.governorate}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border bg-white/5 text-sidebar-foreground"
            aria-label="القائمة"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-9 items-center gap-1 rounded-lg border border-sidebar-border bg-white/5 px-2.5 text-[11px] font-semibold text-sidebar-foreground"
            aria-label="تسجيل الخروج"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            خروج
          </button>
        </div>
      </header>

      <main className="space-y-4 p-4" aria-label="بوابة الموظف">
        {section === "home" && (
          <EmployeeHomeSection me={me} enabledSections={navSections} onOpen={openSection} />
        )}

        {section === "schools" && enabledSections.has("schools") && (
          <EmployeeSchoolsSection
            perms={me.permissions}
            canCreate={me.permissions.schools.create}
            onRegistered={refreshAll}
          />
        )}

        {section === "visit_register" && enabledSections.has("visit_register") && (
          <VisitWizard
            key={me.employee.id}
            perms={me.permissions}
            accountId={me.employee.id}
            onRegistered={refreshAll}
            onExit={() => openSection("home")}
          />
        )}

        {section === "visits" && enabledSections.has("visits") && (
          <EmployeeVisitsSection
            key={`visits-${refreshKey}`}
            canManage={me.permissions.visits.manage}
            canExport={me.permissions.visits.export}
          />
        )}

        {section === "reviews" && enabledSections.has("reviews") && (
          <EmployeeSimpleSections section="reviews" refreshKey={refreshKey} canEdit={me.permissions.reviews.edit} />
        )}
        {section === "regions" && enabledSections.has("regions") && (
          <EmployeeSimpleSections section="regions" refreshKey={refreshKey} />
        )}
        {section === "distribution" && enabledSections.has("distribution") && (
          <EmployeeSimpleSections section="distribution" refreshKey={refreshKey} />
        )}
        {section === "reports" && enabledSections.has("reports") && (
          <EmployeeSimpleSections section="reports" refreshKey={refreshKey} />
        )}
        {section === "employees" && enabledSections.has("employees") && (
          <EmployeeSimpleSections section="employees" refreshKey={refreshKey} />
        )}

        {section === "discovery" && enabledSections.has("discovery") && (
          <EmployeeSchoolsSection
            perms={me.permissions}
            canCreate={me.permissions.schools.create}
            onRegistered={refreshAll}
            defaultAddOpen
            title="اكتشاف وإضافة المدارس"
          />
        )}

        {section === "expenses" && enabledSections.has("expenses") && (
          <ComingSoonSection label={SECTION_META_AR.expenses.label} />
        )}

        {section === "settings" && enabledSections.has("settings") && (
          <EmployeeSettingsSection me={me} onPasswordChanged={onLogout} />
        )}
      </main>

      {/* التنقل السفلي — مناسب لليد الواحدة */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t bg-sidebar"
        aria-label="التنقل السفلي"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${bottomNav.length}, minmax(0, 1fr))` }}>
          {bottomNav.map((key) => {
            const Icon = SECTION_ICONS[key];
            const active = section === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => openSection(key)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 ${active ? "text-sky-400" : "text-sidebar-foreground/80"}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-[10px] font-semibold">
                  {key === "home" ? "الرئيسية" : SECTION_META_AR[key].label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* القائمة الكاملة */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-72 bg-sidebar p-0 text-white [&>button]:text-white">
          <SheetHeader className="p-4 pb-1">
            <SheetTitle className="sr-only">القائمة الكاملة</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-3">
            <p className="text-base font-bold text-white">{me.employee.name}</p>
            <p className="text-[11px] text-sidebar-foreground/80">{me.employee.jobTitle ?? me.employee.roleLabel}</p>
          </div>
          <nav className="space-y-1 overflow-y-auto px-3 pb-6 nice-scroll" aria-label="أقسامي">
            <button
              type="button"
              onClick={() => openSection("home")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${section === "home" ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/90"}`}
            >
              <SECTION_ICONS.home className="h-5 w-5" aria-hidden="true" />
              الرئيسية
            </button>
            {navSections.map((key) => {
              const Icon = SECTION_ICONS[key];
              const coming = COMING_SOON_SECTIONS.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => openSection(key)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${section === key ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/90"}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className="flex-1 text-start">{SECTION_META_AR[key].label}</span>
                  {coming && <Badge variant="outline" className="text-[9px] bg-white/10 text-white/80">قيد الإعداد</Badge>}
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ——— الصفحة الرئيسية للموظف ———
function EmployeeHomeSection({
  me,
  enabledSections,
  onOpen,
}: {
  me: EmployeeMe;
  enabledSections: SectionKey[];
  onOpen: (key: SectionKey) => void;
}) {
  const stats = me.stats;
  const isMorning = new Date().getHours() < 12;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-l from-sky-600 to-sky-500 p-4 text-white">
        <p className="text-sm font-bold">{isMorning ? "صباح الخير" : "مساء الخير"}، {me.employee.name}</p>
        <p className="mt-1 text-[11px] opacity-90">{formatFullDate(me.serverTime)}</p>
        <h2 className="mt-3 text-xs font-semibold">ملخص العمل الميداني</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="text-lg font-extrabold">{formatNumber(stats.visitsToday)}</p>
            <p className="text-[10px] opacity-90">زياراتي اليوم</p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="text-lg font-extrabold">{formatNumber(stats.visitsWeek)}</p>
            <p className="text-[10px] opacity-90">زياراتي هذا الأسبوع</p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="text-lg font-extrabold">{formatNumber(stats.visitsTotal)}</p>
            <p className="text-[10px] opacity-90">إجمالي زياراتي</p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="text-lg font-extrabold">{formatNumber(stats.schoolsCount)}</p>
            <p className="text-[10px] opacity-90">مدارس نطاقي</p>
          </div>
        </div>
        {stats.pendingFollowups > 0 && (
          <p className="mt-3 rounded-lg bg-amber-400/90 px-3 py-1.5 text-[11px] font-bold text-amber-950">
            متابعات في نطاقك: {formatNumber(stats.pendingFollowups)}
          </p>
        )}
      </div>

      {/* شبكة الأيقونات الكبيرة السهلة لللمس — الأقسام المسموحة فقط */}
      <div>
        <p className="mb-2 text-xs font-bold text-muted-foreground">أقسامك المسموحة</p>
        <div className="grid grid-cols-3 gap-2.5">
          {enabledSections.map((key) => {
            const Icon = SECTION_ICONS[key];
            const meta = SECTION_META_AR[key];
            const coming = COMING_SOON_SECTIONS.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onOpen(key)}
                className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-white p-2 text-center shadow-sm transition active:scale-95 active:bg-sky-50"
                aria-label={meta.label}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/12">
                  <Icon className="h-5 w-5 text-sky-600" aria-hidden="true" />
                </div>
                <span className="text-[10.5px] font-bold leading-tight text-foreground">{meta.label}</span>
                {coming && <span className="text-[8px] text-amber-600">قيد الإعداد</span>}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="p-0">
        <CardContent className="p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            هذه الواجهة مخصصة لك من مدير النظام — الأقسام الظاهرة فقط هي المسموح بها لحسابك.
            كل زيارة تسجلها تُحفظ فوراً في القاعدة المركزية وتظهر للإدارة مباشرة.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ——— قسم قيد الإعداد ———
function ComingSoonSection({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border bg-white p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
        <SECTION_ICONS.expenses className="h-6 w-6 text-amber-600" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-bold text-foreground">قسم «{label}»</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        هذا القسم قيد الإعداد — سيُفعّل لحسابك في مرحلة لاحقة دون أي إجراء منك.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4 gap-2"
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        تحديث
      </Button>
    </div>
  );
}
