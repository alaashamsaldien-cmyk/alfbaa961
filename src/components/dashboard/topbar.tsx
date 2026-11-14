"use client";

import { useEffect, useState } from "react";
import { Menu, MapPin, LogOut } from "lucide-react";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { formatFullDate } from "@/lib/time";

export interface TopBarUser {
  name: string;
  roleLabel: string;
}

/** الشريط العلوي: اسم الصفحة، المستخدم المسجل دخول، جرس الإشعارات، التاريخ الحالي، تسجيل الخروج */
export function TopBar({
  user,
  onOpenMobileNav,
  pageName = "لوحة إدارة المدارس",
  pageSubtitle = "منصة ألف باء — نظرة عامة على المدارس والزيارات والمتابعات",
  onLogout,
}: {
  user: TopBarUser | null;
  onOpenMobileNav: () => void;
  pageName?: string;
  pageSubtitle?: string;
  onLogout?: () => void;
}) {
  // يُحسب في العميل فقط لتفادي اختلاف التوقيت بين الخادم والمتصفح
  const [today, setToday] = useState("");

  useEffect(() => {
    const update = () => setToday(formatFullDate(new Date()));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          onClick={onOpenMobileNav}
          aria-label="فتح القائمة الرئيسية"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-primary lg:text-lg">
            {pageName}
          </h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {pageSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 lg:gap-3">
          {today && (
            <div
              className="hidden items-center gap-2 rounded-lg border bg-slate-50 px-3 py-1.5 md:flex"
              suppressHydrationWarning
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <time className="text-xs font-medium text-slate-600">{today}</time>
            </div>
          )}

          <div className="h-8 w-px bg-border" aria-hidden="true" />

          {/* بيانات المستخدم المسجل دخول — عرض فقط، وإدارة الملف الشخصي داخل الإعدادات لاحقاً */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {user ? user.name.trim().charAt(0) : "—"}
            </div>
            <div className="hidden min-w-0 leading-tight sm:block">
              <p className="max-w-[160px] truncate text-sm font-semibold text-foreground">
                {user ? user.name : "..."}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {user ? user.roleLabel : ""}
              </p>
            </div>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              aria-label="تسجيل الخروج"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          )}

          <div className="h-8 w-px bg-border" aria-hidden="true" />

          <NotificationsBell />
        </div>
      </div>
    </header>
  );
}
