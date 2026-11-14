"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, CircleCheck, AlertTriangle, Info, CircleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TYPE_META } from "@/lib/labels";
import { formatFullDate, formatTime } from "@/lib/time";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

function typeIcon(type: string) {
  switch (type) {
    case "SUCCESS":
      return CircleCheck;
    case "WARNING":
      return AlertTriangle;
    case "ERROR":
      return CircleAlert;
    default:
      return Info;
  }
}

/** جرس الإشعارات — مرتبط فعلياً بجدول الإشعارات في قاعدة البيانات */
export function NotificationsBell() {
  const { toast } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // إشعار صامت — لا نزعج المستخدم بخطأ شبكة مؤقت
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const markRead = async (id?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { markAllRead: true }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUnreadCount(data.unreadCount ?? 0);
      if (id) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      } else {
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        toast({ title: "تم تحديد جميع الإشعارات كمقروءة" });
      }
    } catch {
      toast({
        title: "تعذر تحديث الإشعار",
        description: "حدث خطأ أثناء الاتصال بالخادم، حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          aria-label={`الإشعارات${unreadCount > 0 ? `، ${unreadCount} غير مقروءة` : ""}`}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -start-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "+9" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0" dir="rtl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-bold text-foreground">
            الإشعارات
            {unreadCount > 0 && (
              <span className="ms-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                {unreadCount} جديدة
              </span>
            )}
          </p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-sky-700 hover:text-sky-800"
              disabled={loading}
              onClick={() => markRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
        <div className="nice-scroll max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">لا توجد إشعارات حالياً</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const Icon = typeIcon(n.type);
                const meta = NOTIFICATION_TYPE_META[n.type] ?? NOTIFICATION_TYPE_META.INFO;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => { if (!n.isRead) markRead(n.id); }}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-slate-50",
                        !n.isRead && "bg-sky-50/60"
                      )}
                    >
                      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-border")}>
                        <Icon className={cn("h-4 w-4", meta.text)} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("truncate text-sm", n.isRead ? "font-medium text-foreground" : "font-bold text-foreground")}>
                            {n.title}
                          </span>
                          {!n.isRead && <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} aria-label="غير مقروء" />}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                          {n.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/70" title={formatFullDate(n.createdAt)}>
                          {formatFullDate(n.createdAt)} — {formatTime(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
