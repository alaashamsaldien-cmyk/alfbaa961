"use client";

// ——— قسم توزيع المدارس والمناطق ———
// تحليل التخصيص الفعلي: كل منسقة ومدارسها، وكل منطقة وما هي مخصص وغير مخصص
// مع توزيع سريع لمدارس منطقة غير مخصصة عبر نفس واجهة التخصيص المركزية

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, UsersRound, Network, UserRoundX, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { formatNumber, formatShortDate } from "@/lib/time";

interface CoordinatorStat {
  id: string;
  name: string;
  phone: string | null;
  hasAccount: boolean;
  hasActiveSession: boolean;
  schoolCount: number;
  contractedCount: number;
  visitedCount: number;
  lastVisitAt: string | null;
  regionsCovered: { name: string; count: number }[];
}

interface RegionCoverage {
  regionId: string | null;
  regionName: string;
  governorate: string;
  total: number;
  assigned: number;
  unassigned: number;
}

interface DistributionData {
  totalSchools: number;
  assignedTotal: number;
  unassignedTotal: number;
  coordinatorsCount: number;
  coveredRegions: number;
  coordinators: CoordinatorStat[];
  regionCoverage: RegionCoverage[];
  unassignedByRegion: RegionCoverage[];
}

export function DistributionView() {
  const { toast } = useToast();
  const [data, setData] = useState<DistributionData | null>(null);
  const [coordinators, setCoordinators] = useState<{ id: string; name: string }[]>([]);
  const [assignTarget, setAssignTarget] = useState<RegionCoverage | null>(null);
  const [assignCoordinator, setAssignCoordinator] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dRes, cRes] = await Promise.all([
        fetch("/api/distribution", { cache: "no-store" }),
        fetch("/api/coordinators", { cache: "no-store" }),
      ]);
      const d = await dRes.json();
      const c = await cRes.json();
      if (!dRes.ok) throw new Error(d?.error);
      setData(d as DistributionData);
      setCoordinators(c?.coordinators ?? []);
    } catch {
      setData(null);
      toast({ title: "تعذر تحميل تحليل التوزيع", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const quickAssign = async () => {
    if (!assignTarget || !assignCoordinator) return;
    setAssignBusy(true);
    try {
      // جلب معرفات المدارس غير المخصصة في هذه المنطقة ثم تخصيصها دفعة واحدة
      const params = new URLSearchParams({ limit: "500" });
      if (assignTarget.regionId) params.set("regionId", assignTarget.regionId);
      const res = await fetch(`/api/schools?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر جلب مدارس المنطقة");
      const ids: string[] = (j.schools ?? [])
        .filter((s: { regionId?: string | null; coordinatorId?: string | null }) =>
          (s.regionId ?? null) === assignTarget.regionId && !s.coordinatorId
        )
        .map((s: { id: string }) => s.id);

      if (ids.length === 0) {
        toast({ title: "لا مدارس غير مخصصة في هذه المنطقة" });
        setAssignTarget(null);
        return;
      }

      const res2 = await fetch("/api/coordinators/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", coordinatorId: assignCoordinator, schoolIds: ids }),
      });
      const j2 = await res2.json();
      if (!res2.ok) throw new Error(j2?.error ?? "تعذر التخصيص");
      toast({
        title: `خُصصت ${j2.affected} مدرسة`,
        description: "ستظهر فوراً في حساب المنسقة وبوابتها الميدانية.",
      });
      setAssignTarget(null);
      load();
    } catch (e) {
      toast({ title: "تعذر التخصيص", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setAssignBusy(false);
    }
  };

  const statCards = data
    ? [
        { label: "إجمالي المدارس", value: data.totalSchools, icon: Network },
        { label: "مخصصة لمنسقات", value: data.assignedTotal, icon: UsersRound },
        { label: "بلا تخصيص", value: data.unassignedTotal, icon: UserRoundX },
        { label: "مناطق مغطاة", value: data.coveredRegions, icon: Network },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">توزيع المدارس والمناطق</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            تحليل التخصيص الفعلي من قاعدة البيانات — التخصيص يجعل المدارس تظهر فوراً في بوابة المنسقة.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          تحديث
        </Button>
      </div>

      {!data && (
        <div className="rounded-xl border bg-white p-6">
          <p className="text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map((s) => (
              <Card key={s.label} className="p-0">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50">
                    <s.icon className="h-4.5 w-4.5 text-sky-600" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-primary">{formatNumber(s.value)}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* المنسقات وتغطيتها */}
          {data.coordinators.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="لا منسقات نشطات بعد"
              description="أضف منسقات من قسم المنسقات الميدانيات ثم خصص لها مدارس — سيظهر توزيعها هنا فوراً."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.coordinators.map((c) => {
                const pct = data.assignedTotal > 0 ? Math.round((c.schoolCount / data.assignedTotal) * 100) : 0;
                return (
                  <Card key={c.id} className="p-0">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{c.name}</p>
                          <p dir="ltr" className="text-xs text-muted-foreground">{c.phone ?? "—"}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">
                            {formatNumber(c.schoolCount)} مدرسة
                          </Badge>
                          {c.hasAccount ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                              لها حساب دخول{c.hasActiveSession ? " · متصلة" : ""}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">
                              بلا حساب دخول
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>نصيبها من المدارس المخصصة</span>
                          <span className="font-bold text-foreground">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>

                      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-muted/60 px-2 py-1.5">
                          <dt className="text-muted-foreground">متعاقدة</dt>
                          <dd className="font-bold text-foreground">{formatNumber(c.contractedCount)}</dd>
                        </div>
                        <div className="rounded-lg bg-muted/60 px-2 py-1.5">
                          <dt className="text-muted-foreground">مزارتة</dt>
                          <dd className="font-bold text-foreground">{formatNumber(c.visitedCount)}</dd>
                        </div>
                        <div className="rounded-lg bg-muted/60 px-2 py-1.5">
                          <dt className="text-muted-foreground">آخر زيارة</dt>
                          <dd className="font-bold text-foreground">
                            {c.lastVisitAt ? formatShortDate(c.lastVisitAt) : "—"}
                          </dd>
                        </div>
                      </dl>

                      {c.regionsCovered.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">المناطق المخصصة لها:</p>
                          <div className="flex flex-wrap gap-1">
                            {c.regionsCovered.slice(0, 6).map((r) => (
                              <Badge key={r.name} variant="outline" className="text-[10px] font-normal">
                                {r.name} ({formatNumber(r.count)})
                              </Badge>
                            ))}
                            {c.regionsCovered.length > 6 && (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                +{formatNumber(c.regionsCovered.length - 6)} أخرى
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* تغطية المناطق + توزيع سريع */}
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-bold">تغطية المناطق</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                لكل منطقة: إجمالي مدارسها ومخصص منها وغير مخصص — مع إمكانية توزيع سريع للمدارس غير المخصصة.
              </p>
            </div>
            {data.regionCoverage.length === 0 ? (
              <div className="p-6">
                <EmptyState title="لا مدارس بعد" description="عند إضافة مدارس للنظام ستظهر تغطية المناطق هنا." />
              </div>
            ) : (
              <div className="overflow-x-auto nice-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 text-start font-semibold">المنطقة</th>
                      <th className="px-4 py-2.5 text-start font-semibold">المحافظة</th>
                      <th className="px-4 py-2.5 text-center font-semibold">الإجمالي</th>
                      <th className="px-4 py-2.5 text-center font-semibold">مخصصة</th>
                      <th className="px-4 py-2.5 text-center font-semibold">بلا تخصيص</th>
                      <th className="px-4 py-2.5 text-center font-semibold">توزيع سريع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.regionCoverage.map((r) => (
                      <tr key={`${r.regionName}-${r.regionId ?? "none"}`} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-bold text-foreground">{r.regionName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.governorate}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-primary">{formatNumber(r.total)}</td>
                        <td className="px-4 py-2.5 text-center">{formatNumber(r.assigned)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {r.unassigned > 0 ? (
                            <span className="font-semibold text-amber-600">{formatNumber(r.unassigned)}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {r.unassigned > 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs"
                              onClick={() => {
                                setAssignTarget(r);
                                setAssignCoordinator("");
                              }}
                            >
                              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                              تخصيص
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* توزيع سريع: تخصيص مدارس منطقة لمنسقة */}
      <Dialog open={Boolean(assignTarget)} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>توزيع مدارس المنطقة</DialogTitle>
          </DialogHeader>
          <p className="truncate text-xs text-muted-foreground">
            {assignTarget
              ? `${assignTarget.regionName} — ${assignTarget.unassigned} مدرسة بلا تخصيص ستخصص للمنسقة المختارة.`
              : ""}
          </p>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">المنسقة المخصصة لها</p>
            <Select value={assignCoordinator} onValueChange={setAssignCoordinator}>
              <SelectTrigger>
                <SelectValue placeholder="اختر منسقة" />
              </SelectTrigger>
              <SelectContent>
                {coordinators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              لا تتأثر المدارس المخصصة مسبقاً — التخصيص يشمل المدارس غير المخصصة فقط في هذه المنطقة.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignTarget(null)} disabled={assignBusy}>إلغاء</Button>
            <Button type="button" onClick={quickAssign} disabled={assignBusy || !assignCoordinator}>
              {assignBusy ? "جارٍ التخصيص..." : "تخصيص المدارس"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
