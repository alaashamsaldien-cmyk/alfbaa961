"use client";

import {
  LayoutDashboard,
  School,
  MapPin,
  Network,
  PhoneCall,
  ClipboardCheck,
  ChartColumn,
  Settings,
  GraduationCap,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** القسم الوحيد المنفذ فعلياً في هذه المرحلة */
  implemented: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "لوحة التحكم الرئيسية", icon: LayoutDashboard, implemented: true },
  { key: "schools", label: "المدارس", icon: School, implemented: true },
  { key: "regions", label: "المناطق", icon: MapPin, implemented: true },
  { key: "distribution", label: "توزيع المدارس والمناطق", icon: Network, implemented: true },
  { key: "visits", label: "الزيارات والتواصل", icon: PhoneCall, implemented: true },
  { key: "reviews", label: "المراجعات اليومية", icon: ClipboardCheck, implemented: true },
  { key: "reports", label: "التقارير والإحصائيات", icon: ChartColumn, implemented: true },
  { key: "settings", label: "الإعدادات والصلاحيات", icon: Settings, implemented: true },
];

const DEFAULT_ACTIVE = "dashboard";

interface SidebarNavProps {
  activeKey?: string;
  onSelect?: (key: string) => void;
}

function SidebarNav({ activeKey, onSelect, onNavigate }: SidebarNavProps & { onNavigate?: () => void }) {
  const { toast } = useToast();

  const handleClick = (item: NavItem) => {
    if (item.implemented) {
      onSelect?.(item.key);
      onNavigate?.();
      return;
    }
    toast({
      title: `قسم «${item.label}» قيد الإعداد`,
      description: "سيتم تفعيل هذا القسم عند استلام تعليمات تنفيذه في مرحلة لاحقة.",
    });
  };

  return (
    <nav aria-label="القائمة الرئيسية" className="flex-1 space-y-1 overflow-y-auto px-3 py-4 nice-scroll">
      {NAV_ITEMS.map((item) => {
        const active = item.key === (activeKey ?? DEFAULT_ACTIVE);
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => handleClick(item)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-start",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-s-4 border-s-sky-400 ps-2.5"
                : "text-sidebar-foreground/90 hover:bg-sidebar-accent/60 hover:text-white border-s-4 border-s-transparent"
            )}
          >
            <Icon className={cn("h-5 w-5 shrink-0", active ? "text-sky-400" : "text-sidebar-foreground/70")} aria-hidden="true" />
            <span className="flex-1">{item.label}</span>
            {!item.implemented && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-sidebar-foreground/70">
                قريباً
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-sidebar-border px-4 py-4">
      <div className="rounded-lg bg-white/5 p-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-green-400" aria-hidden="true" />
          <p className="text-xs font-semibold text-white">قاعدة البيانات جاهزة</p>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-sidebar-foreground/70">
          قاعدة بيانات مركزية واحدة للمدارس: اكتشاف ميداني من المصادر العامة، استيراد Excel، وتخصيص للمنسقات.
        </p>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/30">
        <GraduationCap className="h-6 w-6 text-sky-400" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-bold text-white">منصة ألف باء</p>
        <p className="truncate text-xs text-sidebar-foreground/70">لوحة إدارة المدارس</p>
      </div>
    </div>
  );
}

/** القائمة الجانبية الثابتة على يمين الشاشة (شاشات كبيرة) */
export function DesktopSidebar({ activeKey, onSelect }: { activeKey?: string; onSelect?: (key: string) => void }) {
  return (
    <aside
      className="fixed inset-y-0 start-0 z-50 hidden w-64 flex-col bg-sidebar lg:flex"
      aria-label="القائمة الجانبية الرئيسية"
    >
      <Brand />
      <SidebarNav activeKey={activeKey} onSelect={onSelect} />
      <SidebarFooter />
    </aside>
  );
}

/** نسخة الجوال: تُفتح من زر القائمة في الشريط العلوي */
export function MobileSidebar({
  open,
  onOpenChange,
  activeKey,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeKey?: string;
  onSelect?: (key: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 bg-sidebar p-0 text-white [&>button]:text-white">
        <SheetHeader className="p-0 pb-1">
          <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
          <SheetDescription className="sr-only">
            التنقل بين أقسام لوحة إدارة المدارس – منصة ألف باء
          </SheetDescription>
        </SheetHeader>
        <Brand />
        <SidebarNav activeKey={activeKey} onSelect={onSelect} onNavigate={() => onOpenChange(false)} />
        <SidebarFooter />
      </SheetContent>
    </Sheet>
  );
}
