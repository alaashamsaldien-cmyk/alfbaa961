"use client";

// ——— الصفحة الرئيسية: نظام أقسام موحّد مع مصادقة فعلية ———
// الحالات:
//  - فحص الجلسة عند الإقلاع (تحميل قصير)
//  - غير مسجل دخول → شاشة تسجيل الدخول (أو التهيئة الأولى)
//  - منسقة ميدانية → بوابة الميدان فقط (مدارسها ومناطقها المخصصة حصراً)
//  - مدير → لوحة الإدارة الكاملة بالقائمة الجانبية كما هي دون أي تغيير
// التنقل عبر القائمة الجانبية مع مزامنة مع hash الرابط داخل المعاينة.

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, LogOut, MapPin } from "lucide-react";
import { DesktopSidebar, MobileSidebar } from "@/components/dashboard/sidebar";
import { TopBar, type TopBarUser } from "@/components/dashboard/topbar";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { SchoolsView } from "@/components/schools/schools-view";
import { CoordinatorsView } from "@/components/coordinators/coordinators-view";
import { CoordinatorPortalView } from "@/components/coordinator-portal/portal-view";
import { RegionsView } from "@/components/regions/regions-view";
import { DistributionView } from "@/components/distribution/distribution-view";
import { VisitsView } from "@/components/visits/visits-view";
import { ReviewsView } from "@/components/reviews/reviews-view";
import { ReportsView } from "@/components/reports/reports-view";
import { SettingsView } from "@/components/settings/settings-view";
import { EmployeesView } from "@/components/employees/employees-view";
import { EmployeePortalView } from "@/components/employee-portal/portal-view";
import { LoginScreen } from "@/components/auth/login-screen";
import { formatFullDate } from "@/lib/time";

type Section =
  | "dashboard"
  | "schools"
  | "regions"
  | "coordinators"
  | "employees"
  | "distribution"
  | "visits"
  | "reviews"
  | "reports"
  | "settings"
  | "portal";

const SECTION_META: Record<Section, { name: string; subtitle: string }> = {
  dashboard: {
    name: "لوحة إدارة المدارس",
    subtitle: "منصة ألف باء — نظرة عامة على المدارس والزيارات والمتابعات",
  },
  schools: {
    name: "المدارس",
    subtitle: "منصة ألف باء — إدارة المدارس واكتشاف المؤسسات التعليمية واستيراد Excel",
  },
  regions: {
    name: "المناطق",
    subtitle: "منصة ألف باء — مناطق العمل التعليمية وعدد مدارس كل منطقة",
  },
  coordinators: {
    name: "المنسقات الميدانيات",
    subtitle: "منصة ألف باء — إدارة حسابات المنسقات الميدانية وتخصيص المدارس",
  },
  employees: {
    name: "إدارة الموظفين والحسابات",
    subtitle: "منصة ألف باء — حسابات الموظفين وتخصيص الواجهة والصلاحيات التفصيلية",
  },
  distribution: {
    name: "توزيع المدارس والمناطق",
    subtitle: "منصة ألف باء — تحليل تخصيص المدارس للمنسقات وتغطية المناطق",
  },
  visits: {
    name: "الزيارات والتواصل",
    subtitle: "منصة ألف باء — سجل الزيارات والاتصالات والنشاطات الميدانية",
  },
  reviews: {
    name: "المراجعات اليومية",
    subtitle: "منصة ألف باء — المراجعات والمتابعات المبرمجة وأعمال اليوم",
  },
  reports: {
    name: "التقارير والإحصائيات",
    subtitle: "منصة ألف باء — إحصائيات حقيقية محسوبة من قاعدة البيانات",
  },
  settings: {
    name: "الإعدادات والصلاحيات",
    subtitle: "منصة ألف باء — حسابات المستخدمين وحسابات المنسقات وإعدادات النظام",
  },
  portal: {
    name: "بوابة المنسقة الميدانية",
    subtitle: "منصة ألف باء — متابعة المدارس المخصصة وتحديث المعلومات الميدانية",
  },
};

const VALID_SECTIONS: Section[] = [
  "dashboard",
  "schools",
  "regions",
  "coordinators",
  "employees",
  "distribution",
  "visits",
  "reviews",
  "reports",
  "settings",
  "portal",
];

function sectionFromHash(): Section {
  if (typeof window === "undefined") return "dashboard";
  const h = window.location.hash.replace(/^#\/?/, "");
  return VALID_SECTIONS.includes(h as Section) ? (h as Section) : "dashboard";
}

interface Principal {
  type: "ADMIN" | "COORDINATOR";
  name: string;
}

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated"; needsSetup: boolean }
  | { status: "admin"; user: TopBarUser }
  | { status: "employee"; name: string }
  | { status: "coordinator"; name: string };

export default function DashboardPage() {
  const [section, setSection] = useState<Section>("dashboard");
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // فحص الجلسة الفعلية
  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) {
        setAuth({ status: "unauthenticated", needsSetup: false });
        return;
      }
      if (j.authenticated) {
        if (j.principal?.type === "COORDINATOR") {
          setAuth({ status: "coordinator", name: j.principal.name });
        } else if (j.principal?.role && j.principal.role !== "ADMIN") {
          // موظف (STAFF/MANAGER) — بوابة الموظف على الموبايل حسب صلاحياته
          setAuth({ status: "employee", name: j.principal.name });
        } else {
          setAuth({
            status: "admin",
            user: { name: j.principal.name, roleLabel: "مدير النظام" },
          });
        }
      } else {
        setAuth({ status: "unauthenticated", needsSetup: Boolean(j.needsSetup) });
      }
    } catch {
      setAuth({ status: "unauthenticated", needsSetup: false });
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // مزامنة القسم مع hash الرابط (يمكن إرسال رابط مباشر لقسم معين)
  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    // تطبيق hash الحالي بعد أول إطار لتجنب setState المتزامن داخل التأثير
    const t = setTimeout(() => setSection(sectionFromHash()), 0);
    return () => {
      window.removeEventListener("hashchange", onHash);
      clearTimeout(t);
    };
  }, []);

  const navigate = useCallback((key: string) => {
    setSection(key as Section);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#/${key}`);
    }
    window.scrollTo({ top: 0 });
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // حتى لو فشل الاتصال، أعد الواجهة لشاشة الدخول
    }
    setAuth({ status: "unauthenticated", needsSetup: false });
    setSection("dashboard");
    window.history.replaceState(null, "", "#/dashboard");
  }, []);

  // —— شاشة التحميل أثناء فحص الجلسة ——
  if (auth.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/30">
            <GraduationCap className="h-7 w-7 text-sky-500" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-foreground">منصة ألف باء</p>
          <p className="text-xs text-muted-foreground">جارٍ التحقق من جلسة الدخول...</p>
        </div>
      </div>
    );
  }

  // —— غير مسجل دخول: شاشة الدخول/التهيئة ——
  if (auth.status === "unauthenticated") {
    return <LoginScreen needsSetup={auth.needsSetup} onAuthenticated={refreshAuth} />;
  }

  // —— بوابة المنسقة الميدانية: واجهة خاصة كاملة عند تسجيل دخولها ——
  if (auth.status === "coordinator") {
    const today = formatFullDate(new Date());
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <header className="sticky top-0 z-40 border-b bg-sidebar">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 lg:px-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/30">
              <GraduationCap className="h-6 w-6 text-sky-400" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold text-white">بوابة المنسقة الميدانية</h1>
              <p className="truncate text-xs text-sidebar-foreground/80">منصة ألف باء — مدارسك ومناطقك المخصصة</p>
            </div>
            <div
              className="hidden items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 md:flex"
              suppressHydrationWarning
            >
              <MapPin className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span className="text-xs font-medium text-sidebar-foreground">{today}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white">
                {auth.name.trim().charAt(0)}
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="max-w-[140px] truncate text-sm font-semibold text-white">{auth.name}</p>
                <p className="text-[11px] text-sidebar-foreground/80">منسقة ميدانية</p>
              </div>
            </div>
            <NotificationsBell />
            <button
              type="button"
              onClick={logout}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-sidebar-border bg-white/5 px-3 text-xs font-semibold text-sidebar-foreground hover:bg-white/10"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              خروج
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6" aria-label="بوابة المنسقة">
          <CoordinatorPortalView mode="session" onLogout={logout} />
          <footer className="pb-4 text-center text-xs text-sidebar-foreground/60">
            منصة ألف باء · بوابة المنسقة الميدانية
          </footer>
        </main>
      </div>
    );
  }

  // —— بوابة الموظف: واجهة موبايل مخصصة حسب صلاحياته من المدير ——
  if (auth.status === "employee") {
    return <EmployeePortalView employeeName={auth.name} onLogout={logout} />;
  }

  // —— لوحة الإدارة الكاملة (كما هي دون أي تغيير في التصميم) ——
  const meta = SECTION_META[section];

  return (
    <div className="min-h-screen bg-background">
      <DesktopSidebar activeKey={section === "portal" ? "coordinators" : section} onSelect={navigate} />
      <MobileSidebar open={mobileNavOpen} onOpenChange={setMobileNavOpen} activeKey={section === "portal" ? "coordinators" : section} onSelect={navigate} />

      <div className="lg:ms-64">
        <TopBar user={auth.user} onOpenMobileNav={() => setMobileNavOpen(true)} pageName={meta.name} pageSubtitle={meta.subtitle} onLogout={logout} />

        <main className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6" aria-label="محتوى النظام">
          {section === "dashboard" && <DashboardSection />}
          {section === "schools" && <SchoolsView />}
          {section === "regions" && <RegionsView />}
          {section === "coordinators" && <CoordinatorsView onOpenPortal={() => navigate("portal")} />}
          {section === "employees" && <EmployeesView />}
          {section === "distribution" && <DistributionView />}
          {section === "visits" && <VisitsView />}
          {section === "reviews" && <ReviewsView />}
          {section === "reports" && <ReportsView />}
          {section === "settings" && <SettingsView onLogout={logout} />}
          {section === "portal" && <CoordinatorPortalView />}
        </main>
      </div>
    </div>
  );
}
