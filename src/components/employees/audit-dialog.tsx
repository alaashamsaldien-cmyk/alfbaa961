"use client";

// ——— سجل التدقيق (Audit Log) — كل العمليات المهمة المسجلة على الخادم ———
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, History, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatFullDate, formatNumber, formatTime } from "@/lib/time";

interface AuditRow {
  id: string;
  actorType: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_EMPLOYEE: "إنشاء حساب موظف",
  UPDATE_EMPLOYEE: "تعديل بيانات موظف",
  DELETE_EMPLOYEE: "حذف حساب موظف",
  RESET_EMPLOYEE_PASSWORD: "إعادة تعيين كلمة مرور",
  SET_EMPLOYEE_STATUS: "تفعيل/تعطيل حساب",
  UPDATE_PERMISSIONS: "تحديث صلاحيات موظف",
  APPLY_TEMPLATE: "تطبيق قالب صلاحيات",
  CREATE_TEMPLATE: "إنشاء قالب صلاحيات",
  DELETE_TEMPLATE: "حذف قالب صلاحيات",
  EMPLOYEE_LOGIN: "دخول موظف",
  ADMIN_LOGIN: "دخول مدير النظام",
  EMPLOYEE_CHANGE_PASSWORD: "تغيير كلمة مرور موظف",
  REGISTER_VISIT: "تسجيل زيارة",
  EMPLOYEE_CREATE_SCHOOL: "إضافة مدرسة من موظف",
  EMPLOYEE_UPDATE_SCHOOL_LOCATION: "تحديث موقع مدرسة",
  COMPLETE_FOLLOWUP: "إنجاز مراجعة",
  CANCEL_FOLLOWUP: "إلغاء مراجعة",
  REOPEN_FOLLOWUP: "إعادة فتح مراجعة",
};

const ENTITY_LABELS: Record<string, string> = {
  USER: "حساب",
  SCHOOL_VISIT: "زيارة",
  SCHOOL: "مدرسة",
  PERMISSIONS: "صلاحيات",
  TEMPLATE: "قالب",
  SESSION: "جلسة",
  FOLLOWUP: "مراجعة",
};

function detailsSummary(row: AuditRow): string | null {
  if (!row.details) return null;
  const d = row.details as Record<string, unknown>;
  if (typeof d.employeeName === "string") return d.employeeName;
  if (typeof d.schoolName === "string") return d.schoolName;
  if (typeof d.name === "string") return d.name;
  if (typeof d.school === "string") return d.school;
  return null;
}

export function AuditDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/audit?period=${period}&page=${page}&pageSize=50`, { cache: "no-store" });
      const j = await res.json();
      if (res.ok) {
        setLogs(j.logs ?? []);
        setTotal(j.total ?? 0);
      }
    } catch {
      // تجاهل أخطاء الشبكة في العرض
    } finally {
      setLoading(false);
    }
  }, [period, page]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto nice-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-sky-600" aria-hidden="true" />
            سجل التدقيق — العمليات المهمة المسجلة
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => { setPeriod(v); setPage(1); }}>
            <SelectTrigger className="w-36" aria-label="فترة سجل التدقيق"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="week">آخر 7 أيام</SelectItem>
              <SelectItem value="month">آخر 30 يوماً</SelectItem>
              <SelectItem value="all">كل الفترات</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={load} aria-label="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted-foreground">{formatNumber(total)} قيد</span>
        </div>

        {logs.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">لا قيود مسجلة في هذه الفترة بعد.</p>
        )}

        <div className="space-y-1.5">
          {logs.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2">
              <Badge variant="outline" className={`text-[10px] ${row.actorType === "ADMIN" ? "bg-sky-50 text-sky-700 border-sky-200" : row.actorType === "EMPLOYEE" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600"}`}>
                {row.actorType === "ADMIN" ? "مدير النظام" : row.actorType === "EMPLOYEE" ? "موظف" : row.actorType === "COORDINATOR" ? "منسّق ميداني" : "النظام"}
              </Badge>
              <span className="text-xs font-bold text-foreground">{row.actorName}</span>
              <span className="text-xs text-muted-foreground">
                {ACTION_LABELS[row.action] ?? row.action}
                {detailsSummary(row) ? ` — ${detailsSummary(row)}` : ""}
              </span>
              <span className="ms-auto text-[10px] text-muted-foreground" suppressHydrationWarning>
                {formatFullDate(row.createdAt)} {formatTime(row.createdAt)}
              </span>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t pt-2">
            <p className="text-xs text-muted-foreground">صفحة {formatNumber(page)} من {formatNumber(totalPages)}</p>
            <div className="flex gap-1">
              <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="السابق">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="التالي">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
