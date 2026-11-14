"use client";

// ——— بوابة الموظف: الأقسام القرائية — المناطق، التوزيع، التقارير، المراجعات، دليل الموظفين ———
// كل قسم يجلب بياناته الحقيقية من نقطة /api/employee الخاصة به المطبقة على نطاق عمله.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/time";

const SECTION_TITLES: Record<string, string> = {
  reviews: "المراجعات اليومية",
  regions: "المناطق",
  distribution: "توزيع المدارس والمناطق",
  reports: "التقارير والإحصائيات",
  employees: "دليل الموظفين",
};

const RESULT_LABELS: Record<string, string> = {
  INITIAL_APPROVAL: "موافقة أولية",
  APPROVED: "موافقة",
  NEEDS_ANOTHER_VISIT: "يحتاج زيارة أخرى",
  CONTRACTED: "تم التعاقد",
  REJECTED: "رفض",
  SCHOOL_NOT_FOUND: "المدرسة غير موجودة",
  OTHER: "أخرى",
};

const CONTACT_LABELS: Record<string, string> = {
  FIELD_VISIT: "زيارة ميدانية",
  PHONE: "اتصال هاتفي",
  WHATSAPP: "واتساب",
  SMS: "رسالة SMS",
  MEETING: "اجتماع متابعة",
};

const FOLLOWUP_STATUS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: "معلقة", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  DONE: { label: "منجزة", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CANCELLED: { label: "ملغاة", badge: "bg-gray-100 text-gray-600 border-gray-200" },
};

export function EmployeeSimpleSections({
  section,
  refreshKey,
  canEdit,
}: {
  section: "reviews" | "regions" | "distribution" | "reports" | "employees";
  refreshKey: number;
  canEdit?: boolean;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = {
        reviews: "/api/employee/followups",
        regions: "/api/employee/regions",
        distribution: "/api/employee/distribution",
        reports: "/api/employee/reports",
        employees: "/api/employee/employees",
      }[section];
      const res = await fetch(endpoint, { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setData(j);
      else toast({ title: "تعذر جلب البيانات", description: j?.error, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [section, toast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const completeFollowup = async (id: string, status: "DONE" | "CANCELLED") => {
    try {
      const res = await fetch(`/api/employee/followups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر التنفيذ");
      toast({ title: status === "DONE" ? "أُنجزت المراجعة" : "أُلغيت المراجعة" });
      load();
    } catch (e) {
      toast({ title: "تعذر التنفيذ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <p className="text-lg font-extrabold text-foreground">{SECTION_TITLES[section]}</p>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={load} aria-label="تحديث">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center rounded-xl border bg-white p-6 text-muted-foreground">
          <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" /> جارٍ التحميل...
        </div>
      ) : !data ? (
        <p className="rounded-xl border bg-white p-6 text-center text-xs text-muted-foreground">لا بيانات متاحة.</p>
      ) : (
        <>
          {/* ——— المراجعات ——— */}
          {section === "reviews" && (
            <div className="space-y-2">
              {(() => {
                const list = (data.followups ?? []) as { id: string; title: string | null; type: string; status: string; dueDate: string; overdue: boolean; schoolName: string; schoolId: string }[];
                if (list.length === 0) return <p className="rounded-xl border bg-white p-6 text-center text-xs text-muted-foreground">لا مراجعات في نطاقك.</p>;
                return list.map((f) => {
                  const st = FOLLOWUP_STATUS[f.status] ?? FOLLOWUP_STATUS.PENDING;
                  return (
                    <Card key={f.id} className="p-0">
                      <CardContent className="space-y-1.5 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-foreground">{f.title ?? "مراجعة"}</p>
                          <Badge variant="outline" className={`text-[9px] ${st.badge}`}>{st.label}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{f.schoolName}</p>
                        <p className={`text-[10px] ${f.overdue ? "font-bold text-red-600" : "text-muted-foreground"}`} suppressHydrationWarning>
                          الاستحقاق: {new Date(f.dueDate).toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" })}
                          {f.overdue ? " — متأخرة" : ""}
                        </p>
                        {canEdit && f.status === "PENDING" && (
                          <div className="flex gap-2 pt-1">
                            <Button type="button" size="sm" className="h-7 flex-1 gap-1 text-[11px]" onClick={() => completeFollowup(f.id, "DONE")}>
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              إنجاز
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => completeFollowup(f.id, "CANCELLED")}>
                              إلغاء
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                });
              })()}
            </div>
          )}

          {/* ——— المناطق ——— */}
          {section === "regions" && (
            <div className="space-y-2">
              {(() => {
                const list = (data.regions ?? []) as { id: string; name: string; governorate: string; schoolsCount: number }[];
                if (list.length === 0) return <p className="rounded-xl border bg-white p-6 text-center text-xs text-muted-foreground">لا مناطق في نطاقك.</p>;
                return list.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border bg-white p-3">
                    <div>
                      <p className="text-sm font-bold text-foreground">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">{r.governorate}</p>
                    </div>
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{formatNumber(r.schoolsCount)} مدرسة</span>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* ——— التوزيع ——— */}
          {section === "distribution" && (
            <div className="space-y-2">
              {(() => {
                const list = (data.regions ?? []) as { id: string; name: string; schoolsCount: number; contractedCount: number; assignedCount: number }[];
                if (list.length === 0) return <p className="rounded-xl border bg-white p-6 text-center text-xs text-muted-foreground">لا بيانات توزيع في نطاقك.</p>;
                return list.map((r) => (
                  <Card key={r.id} className="p-0">
                    <CardContent className="p-3">
                      <p className="text-sm font-bold text-foreground">{r.name}</p>
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                        <div className="rounded-lg bg-muted/50 p-1.5">
                          <p className="text-sm font-extrabold">{formatNumber(r.schoolsCount)}</p>
                          <p className="text-[9px] text-muted-foreground">مدارس</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-1.5">
                          <p className="text-sm font-extrabold text-emerald-700">{formatNumber(r.contractedCount)}</p>
                          <p className="text-[9px] text-emerald-700/80">متعاقدة</p>
                        </div>
                        <div className="rounded-lg bg-sky-50 p-1.5">
                          <p className="text-sm font-extrabold text-sky-700">{formatNumber(r.assignedCount)}</p>
                          <p className="text-[9px] text-sky-700/80">مخصصة لمنسقات</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ));
              })()}
            </div>
          )}

          {/* ——— التقارير ——— */}
          {section === "reports" && (
            <div className="space-y-3">
              {(() => {
                const schools = (data.schools ?? {}) as { total: number; contracted: number; available: number; visited: number };
                const visits = (data.visits ?? {}) as { today: number; last30Days: number; byContactType: { contactType: string; count: number }[]; byResult: { result: string; count: number }[] };
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <StatBox label="مدارس نطاقي" value={schools.total} />
                      <StatBox label="متعاقدة" value={schools.contracted} accent />
                      <StatBox label="زُورنت ميدانياً" value={schools.visited} />
                      <StatBox label="زيارات آخر 30 يوماً" value={visits.last30Days} accent />
                    </div>
                    {(visits.byResult ?? []).length > 0 && (
                      <Card className="p-0">
                        <CardContent className="p-3">
                          <p className="mb-2 text-xs font-bold text-foreground">النتائج حسب النوع</p>
                          <div className="space-y-1">
                            {visits.byResult.map((r) => (
                              <div key={r.result} className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">{RESULT_LABELS[r.result] ?? r.result}</span>
                                <span className="font-bold">{formatNumber(r.count)}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {(visits.byContactType ?? []).length > 0 && (
                      <Card className="p-0">
                        <CardContent className="p-3">
                          <p className="mb-2 text-xs font-bold text-foreground">حسب نوع التواصل</p>
                          <div className="space-y-1">
                            {visits.byContactType.map((r) => (
                              <div key={r.contactType} className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">{CONTACT_LABELS[r.contactType] ?? r.contactType}</span>
                                <span className="font-bold">{formatNumber(r.count)}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ——— دليل الموظفين ——— */}
          {section === "employees" && (
            <div className="space-y-2">
              {(() => {
                const list = (data.employees ?? []) as { name: string; jobTitle: string | null; phone: string | null; governorate: string | null; regionName: string | null; visitsCount: number }[];
                if (list.length === 0) return <p className="rounded-xl border bg-white p-6 text-center text-xs text-muted-foreground">لا موظفين مسجلين بعد.</p>;
                return list.map((e, i) => (
                  <div key={`${e.name}-${i}`} className="rounded-xl border bg-white p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground">{e.name}</p>
                      <span className="text-[10px] text-muted-foreground">{formatNumber(e.visitsCount)} زيارة</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {e.jobTitle ?? "—"}{e.regionName ? ` · ${e.regionName}` : e.governorate ? ` · ${e.governorate}` : ""}
                    </p>
                    {e.phone && <p className="mt-0.5 text-[10px] text-muted-foreground" dir="ltr">{e.phone}</p>}
                  </div>
                ));
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${accent ? "border-sky-200 bg-sky-50/50" : "bg-white"}`}>
      <p className="text-xl font-extrabold text-foreground">{formatNumber(value)}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
