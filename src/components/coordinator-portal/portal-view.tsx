"use client";

// ——— بوابة المنسقة الميدانية ———
// وضعان:
//  - جلسة حقيقية (mode="session"): تظهر لكل منسقة عند تسجيل دخولها — مدارسها ومناطقها المخصصة
//    حصراً، مع أدوات الزيارة والاتصال وتحديث البيانات الميدانية ومراجعاتها، وكل نشاط يُحفظ
//    في قاعدة البيانات المركزية ويظهر في لوحة الإدارة فوراً.
//  - معاينة إدارية (mode="preview"): من لوحة الإدارة لرؤية ما ستراه المنسقة قبل إضافة الحسابات الفعلية.

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Save, Footprints, PhoneCall, RefreshCw, Landmark, ClipboardList, History, LogOut } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/hooks/use-toast";
import { CONTRACT_LABELS, FOLLOW_UP_TYPE_LABELS, activityTypeMeta } from "@/lib/labels";
import { formatShortDate, formatTime, formatNumber } from "@/lib/time";
import {
  DISCOVERY_STATUS_BADGE,
  DISCOVERY_STATUS_LABELS,
  type SchoolDTO,
  type CoordinatorDTO,
} from "@/lib/types";

const BaseMap = dynamic(() => import("@/components/schools/base-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">جارٍ تحميل الخريطة...</div>,
});

interface PortalActivityItem {
  id: string;
  type: string;
  occurredAt: string;
  schoolName: string;
  result: string | null;
  notes: string | null;
}

interface PortalFollowUpItem {
  id: string;
  title: string | null;
  type: string;
  schoolName: string;
  dueDate: string;
  overdue: boolean;
}

interface PortalRegionItem {
  id: string;
  name: string;
  governorate: string;
  schoolCount: number;
}

interface PortalResponse {
  preview: boolean;
  coordinator: { id: string; name: string; phone: string | null };
  schools: SchoolDTO[];
  regions: PortalRegionItem[];
  recentActivities: PortalActivityItem[];
  followUps: PortalFollowUpItem[];
  summary: {
    total: number;
    withCoords: number;
    contracted: number;
    visited: number;
    regionsCount: number;
    pendingFollowUps: number;
    overdueFollowUps: number;
    activitiesLast7Days: number;
  };
}

export function CoordinatorPortalView({
  mode = "preview",
  onLogout,
}: {
  mode?: "session" | "preview";
  onLogout?: () => void;
}) {
  const { toast } = useToast();
  const isSession = mode === "session";
  const [coordinators, setCoordinators] = useState<CoordinatorDTO[]>([]);
  const [coordinatorId, setCoordinatorId] = useState<string>("");
  const [data, setData] = useState<PortalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<SchoolDTO | null>(null);
  const [form, setForm] = useState({ principalName: "", phone: "", studentCount: "", stages: "", sector: "none", notes: "" });
  const [saving, setSaving] = useState(false);
  const [visitTarget, setVisitTarget] = useState<SchoolDTO | null>(null);
  const [visitForm, setVisitForm] = useState({ type: "VISIT", result: "", notes: "" });
  const [completing, setCompleting] = useState<PortalFollowUpItem | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");

  // تحميل قائمة المنسقات في وضع المعاينة الإدارية فقط
  useEffect(() => {
    if (isSession) return;
    fetch("/api/coordinators", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCoordinators(j?.coordinators ?? []))
      .catch(() => setCoordinators([]));
  }, [isSession]);

  const buildUrl = useCallback(
    (id: string) =>
      isSession ? "/api/coordinator-portal/schools" : `/api/coordinator-portal/schools?coordinatorId=${encodeURIComponent(id)}`,
    [isSession]
  );

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const res = await fetch(buildUrl(id), { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error);
        setData(j as PortalResponse);
      } catch {
        setData(null);
        toast({ title: "تعذر تحميل مدارس المنسقة", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [buildUrl, toast]
  );

  useEffect(() => {
    if (isSession) {
      load("session");
    } else if (coordinatorId) {
      load(coordinatorId);
    }
  }, [coordinatorId, isSession, load]);

  const markers = useMemo(() => {
    return (data?.schools ?? [])
      .filter((s) => s.hasCoords)
      .map((s) => {
        const esc = (t: string | null | undefined) => (t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const popup = `<div style="direction:rtl;text-align:right;min-width:200px">
          <p style="margin:0 0 4px;font-weight:800;font-size:13px">${esc(s.name)}</p>
          <p style="margin:0;font-size:11px">المدير: ${esc(s.principalName ?? "غير متوفر")} · الهاتف: ${esc(s.phone ?? "غير متوفر")}</p>
          ${s.mapsUrl ? `<a href="${s.mapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#0284c7;font-size:11px">الوصول للموقع</a>` : ""}
        </div>`;
        return {
          id: s.id,
          lat: s.lat!,
          lng: s.lng!,
          color: (s.contractStatus === "CONTRACTED" ? "green" : "sky") as "green" | "sky",
          title: s.name,
          popupHtml: popup,
        };
      });
  }, [data]);

  const openEdit = (s: SchoolDTO) => {
    setEditing(s);
    setForm({
      principalName: s.principalName ?? "",
      phone: s.phone ?? "",
      studentCount: s.studentCount !== null ? String(s.studentCount) : "",
      stages: s.stages ?? "",
      sector: s.sector ?? "none",
      notes: s.notes ?? "",
    });
  };

  const saveFieldUpdate = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/coordinator-portal/schools/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coordinatorId: isSession ? undefined : coordinatorId,
          principalName: form.principalName.trim() || null,
          phone: form.phone.trim() || null,
          studentCount: form.studentCount.trim() === "" ? null : Number(form.studentCount),
          stages: form.stages.trim() || null,
          sector: form.sector === "none" ? null : form.sector,
          notes: form.notes.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
      toast({ title: "تم الحفظ في قاعدة البيانات المركزية", description: "سيظهر التحديث فوراً في لوحة الإدارة." });
      setEditing(null);
      load(isSession ? "session" : coordinatorId);
    } catch (e) {
      toast({ title: "تعذر الحفظ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submitActivity = async () => {
    if (!visitTarget) return;
    if (!visitForm.result.trim() && !visitForm.notes.trim()) {
      toast({ title: "سجّل نتيجة النشاط", description: "اكتب نتيجة الزيارة أو الاتصال قبل الحفظ.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/coordinator-portal/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: visitTarget.id,
          coordinatorId: isSession ? undefined : coordinatorId,
          type: visitForm.type,
          result: visitForm.result,
          notes: visitForm.notes,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر تسجيل النشاط");
      toast({
        title: visitForm.type === "VISIT" ? "سُجلت الزيارة" : "سُجل الاتصال",
        description: "حدّثت آخر زيارة في لوحة الإدارة تلقائياً وأُرسل إشعار للإدارة.",
      });
      setVisitTarget(null);
      setVisitForm({ type: "VISIT", result: "", notes: "" });
      load(isSession ? "session" : coordinatorId);
    } catch (e) {
      toast({ title: "تعذر تسجيل النشاط", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const completeFollowUp = async (action: "complete" | "cancel") => {
    if (!completing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/coordinator-portal/followups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: completing.id, action, notes: completeNotes }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر التحديث");
      toast({
        title: action === "complete" ? "أُنجزت المراجعة" : "أُلغيت المراجعة",
        description: "التحديث ظهر في قسم المراجعات اليومية بلوحة الإدارة.",
      });
      setCompleting(null);
      setCompleteNotes("");
      load(isSession ? "session" : coordinatorId);
    } catch (e) {
      toast({ title: "تعذر التحديث", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const summaryCards = data
    ? [
        { label: "المدارس المخصصة", value: data.summary.total },
        { label: "المناطق المخصصة", value: data.summary.regionsCount },
        { label: "لها موقع جغرافي", value: data.summary.withCoords },
        { label: "تمت زيارتها", value: data.summary.visited },
        { label: "نشاطات آخر 7 أيام", value: data.summary.activitiesLast7Days },
        { label: "مراجعات مستحقة", value: data.summary.pendingFollowUps },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-foreground">
            {isSession ? `مرحباً، ${data?.coordinator.name ?? "..."}` : "بوابة المنسقة الميدانية"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isSession
              ? "تعرض المدارس والمناطق المخصصة لك حصراً — أي تحديث يُحفظ مركزياً ويظهر للإدارة فوراً."
              : "تعرض فقط المدارس المخصصة للمنسقة المحددة — أي تعديل يُحفظ مركزياً ويظهر للإدارة."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isSession && (
            <Select value={coordinatorId} onValueChange={setCoordinatorId}>
              <SelectTrigger className="w-[240px]"><SelectValue placeholder="اختر حساب المنسقة" /></SelectTrigger>
              <SelectContent>
                {coordinators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => (isSession ? load("session") : coordinatorId && load(coordinatorId))}
            disabled={isSession ? loading : !coordinatorId}
            aria-label="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          {isSession && onLogout && (
            <Button type="button" variant="outline" className="gap-2" onClick={onLogout}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              تسجيل الخروج
            </Button>
          )}
        </div>
      </div>

      {!isSession && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          وضع المعاينة الإدارية: تظهر هنا نفس الشاشة التي ستراها المنسقة عند تسجيل دخولها. حماية البيانات مطبقة فعلياً في الخادم:
          أي محاولة تعديل مدرسة غير مخصصة للمنسقة ترفض بـ 403. عند إنشاء حساب دخول من قسم المنسقات تدخل المنسقة إلى هذه الشاشة مباشرة.
        </p>
      )}

      {isSession && !loading && data && (
        <div className="flex flex-wrap items-center gap-2">
          {data.regions.length > 0 ? (
            data.regions.map((r) => (
              <Badge key={r.id} variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {r.name} · {formatNumber(r.schoolCount)} {r.schoolCount === 1 ? "مدرسة" : "مدارس"}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">لا مناطق مخصصة بعد — التخصيص يتم من لوحة الإدارة.</span>
          )}
        </div>
      )}

      {!coordinatorId && !isSession && (
        <EmptyState icon={Landmark} title="اختر حساب المنسقة" description="حدد حساب المنسقة من القائمة أعلاه لعرض مدارسها المخصصة وخريطتها." />
      )}

      {((isSession && loading && !data) || (!isSession && coordinatorId && loading && !data)) && (
        <div className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">جارٍ تحميل المدارس المخصصة...</div>
      )}

      {data && (
        <Tabs defaultValue="schools" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="schools" className="gap-1.5"><Landmark className="h-4 w-4" aria-hidden="true" />مدارس المخصصة لي</TabsTrigger>
            <TabsTrigger value="activities" className="gap-1.5"><History className="h-4 w-4" aria-hidden="true" />نشاطاتي الأخيرة</TabsTrigger>
            <TabsTrigger value="followups" className="gap-1.5">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              مراجعاتي
              {data.summary.pendingFollowUps > 0 && (
                <span className="ms-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">{data.summary.pendingFollowUps}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* —— تبويب المدارس المخصصة —— */}
          <TabsContent value="schools" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {summaryCards.map((s) => (
                <Card key={s.label} className="p-0">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-extrabold text-primary">{formatNumber(s.value)}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {data.summary.withCoords > 0 && (
              <div className="h-[360px] overflow-hidden rounded-xl border bg-white" aria-label="خريطة مدارس المنسقة">
                <BaseMap
                  center={{ lat: markers[0]?.lat ?? 33.3152, lng: markers[0]?.lng ?? 44.3661 }}
                  zoom={12}
                  markers={markers}
                />
              </div>
            )}

            {data.schools.length === 0 ? (
              <EmptyState title="لا مدارس مخصصة" description="لم تخصص الإدارة أي مدرسة لك بعد. تخصيص المدارس يتم من صفحة المدارس في لوحة الإدارة." />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {data.schools.map((s) => (
                  <Card key={s.id} className="p-0">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{s.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {s.institutionType ?? "نوع غير متوفر"} · {s.regionName ?? s.regionText ?? "منطقة غير متوفرة"}
                          </p>
                        </div>
                        <Badge variant="outline" className={`shrink-0 text-[10px] ${DISCOVERY_STATUS_BADGE[s.discoveryStatus] ?? ""}`}>
                          {DISCOVERY_STATUS_LABELS[s.discoveryStatus] ?? s.discoveryStatus}
                        </Badge>
                      </div>

                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div><dt className="text-muted-foreground">المدير</dt><dd>{s.principalName ?? "غير متوفر"}</dd></div>
                        <div><dt className="text-muted-foreground">الهاتف</dt><dd dir="ltr">{s.phone ?? "غير متوفر"}</dd></div>
                        <div><dt className="text-muted-foreground">الطلاب</dt><dd>{s.studentCount ?? "غير متوفر"}</dd></div>
                        <div><dt className="text-muted-foreground">التعاقد</dt><dd>{CONTRACT_LABELS[s.contractStatus] ?? s.contractStatus}</dd></div>
                        <div><dt className="text-muted-foreground">آخر زيارة</dt><dd>{s.lastVisitAt ? formatShortDate(s.lastVisitAt) : "لا زيارة مسجلة"}</dd></div>
                      </dl>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => openEdit(s)}>
                          <Save className="h-3.5 w-3.5" aria-hidden="true" />
                          تحديث المعلومات الميدانية
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => {
                            setVisitTarget(s);
                            setVisitForm({ type: "VISIT", result: "", notes: "" });
                          }}
                        >
                          <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
                          تسجيل زيارة
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => {
                            setVisitTarget(s);
                            setVisitForm({ type: "CALL", result: "", notes: "" });
                          }}
                        >
                          <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                          تسجيل اتصال
                        </Button>
                        {s.mapsUrl && (
                          <a href={s.mapsUrl} target="_blank" rel="noopener noreferrer">
                            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                              <MapPin className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                              فتح الموقع والوصول إليه
                            </Button>
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* —— تبويب النشاطات —— */}
          <TabsContent value="activities" className="space-y-3">
            {data.recentActivities.length === 0 ? (
              <EmptyState icon={History} title="لا نشاطات مسجلة بعد" description="سجّل زيارة أو اتصالاً من تبويب المدارس لبدء سجل نشاطاتك الميداني." />
            ) : (
              data.recentActivities.map((a) => {
                const meta = activityTypeMeta(a.type);
                return (
                  <Card key={a.id} className="p-0">
                    <CardContent className="flex flex-wrap items-start justify-between gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${meta.badge}`}>{meta.label}</Badge>
                          <p className="truncate text-sm font-bold">{a.schoolName}</p>
                        </div>
                        {a.result && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.result}</p>}
                        {a.notes && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{a.notes}</p>}
                      </div>
                      <div className="text-end text-[11px] text-muted-foreground" suppressHydrationWarning>
                        <p className="font-semibold">{formatShortDate(a.occurredAt)}</p>
                        <p>{formatTime(a.occurredAt)}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* —— تبويب المراجعات —— */}
          <TabsContent value="followups" className="space-y-3">
            {data.followUps.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="لا مراجعات مخصصة لك"
                description="المراجعات والمتابعات المبرمجة تُخصص لك من قسم المراجعات اليومية بلوحة الإدارة وتظهر هنا فوراً."
              />
            ) : (
              <>
                {data.summary.overdueFollowUps > 0 && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    لديك {data.summary.overdueFollowUps} مراجعة متأخرة عن موعدها — أنجزها أو تواصل مع الإدارة لإعادة الجدولة.
                  </p>
                )}
                {data.followUps.map((f) => (
                  <Card key={f.id} className="p-0">
                    <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">
                            {FOLLOW_UP_TYPE_LABELS[f.type] ?? f.type}
                          </Badge>
                          <p className="truncate text-sm font-bold">{f.title ?? f.schoolName}</p>
                          {f.overdue && (
                            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">متأخرة</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          المدرسة: {f.schoolName} · الاستحقاق: {formatShortDate(f.dueDate)}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => {
                            setCompleting(f);
                            setCompleteNotes("");
                          }}
                        >
                          <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                          إنجاز
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* تحديث ميداني */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تحديث المعلومات الميدانية</DialogTitle>
          </DialogHeader>
          <p className="truncate text-xs text-muted-foreground">{editing?.name}</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المدير أو المديرة</Label>
              <Input value={form.principalName} onChange={(e) => setForm((f) => ({ ...f, principalName: e.target.value }))} placeholder="سجّل الاسم الفعلي من الميدان" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">رقم التواصل</Label>
              <Input dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">عدد الطلاب</Label>
              <Input inputMode="numeric" value={form.studentCount} onChange={(e) => setForm((f) => ({ ...f, studentCount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المراحل الدراسية</Label>
              <Input value={form.stages} onChange={(e) => setForm((f) => ({ ...f, stages: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">القطاع</Label>
              <Select value={form.sector} onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">غير محدد</SelectItem>
                  <SelectItem value="GOVERNMENT">حكومية</SelectItem>
                  <SelectItem value="PRIVATE">أهلية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات ميدانية</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={saveFieldUpdate} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ في القاعدة المركزية"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تسجيل زيارة أو اتصال */}
      <Dialog open={Boolean(visitTarget)} onOpenChange={(o) => !o && setVisitTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{visitForm.type === "VISIT" ? "تسجيل زيارة ميدانية" : "تسجيل اتصال تواصل"}</DialogTitle>
          </DialogHeader>
          <p className="truncate text-xs text-muted-foreground">{visitTarget?.name}</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">نوع النشاط</Label>
              <Select value={visitForm.type} onValueChange={(v) => setVisitForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VISIT">زيارة ميدانية</SelectItem>
                  <SelectItem value="CALL">اتصال هاتفي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نتيجة النشاط</Label>
              <Textarea rows={3} value={visitForm.result} onChange={(e) => setVisitForm((f) => ({ ...f, result: e.target.value }))} placeholder="مثال: التقت بإدارة المدرسة ووافقت على مبدئي" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات إضافية</Label>
              <Textarea rows={2} value={visitForm.notes} onChange={(e) => setVisitForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVisitTarget(null)} disabled={saving}>إلغاء</Button>
            <Button type="button" onClick={submitActivity} disabled={saving}>{saving ? "جارٍ التسجيل..." : "تسجيل النشاط"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إنجاز مراجعة */}
      <Dialog open={Boolean(completing)} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إنجاز المراجعة</DialogTitle>
          </DialogHeader>
          <p className="truncate text-xs text-muted-foreground">
            {completing ? `${completing.schoolName} — استحقاق ${formatShortDate(completing.dueDate)}` : ""}
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">ماذا تم خلال المراجعة؟</Label>
              <Textarea rows={3} value={completeNotes} onChange={(e) => setCompleteNotes(e.target.value)} placeholder="مثال: تمت المراجعة والتأكد من بيانات المدرسة ومعلومات مديرها" />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setCompleting(null)} disabled={saving}>إغلاق</Button>
            <Button type="button" variant="ghost" className="text-red-600" onClick={() => completeFollowUp("cancel")} disabled={saving}>إلغاء المراجعة</Button>
            <Button type="button" onClick={() => completeFollowUp("complete")} disabled={saving}>{saving ? "جارٍ الحفظ..." : "تأكيد الإنجاز"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
