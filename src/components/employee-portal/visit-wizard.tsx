"use client";

// ——— نموذج تسجيل زيارة مدرسة — 7 خطوات مريحة للموبايل ———
// الخطوة 1: المدرسة والموقع (GPS / خريطة / تأكيد محفوظ) — إلزامية قبل الانتقال
// الخطوة 2: نوع التواصل (راديو) | الخطوة 3: النتيجة (راديو + «أخرى» نصية + «رفض» خطوة سبب إلزامية)
// الخطوة 4: معلومات الشخص المتواصل معه | الخطوة 5: الاحتياجات (متعدد + «أخرى» إلزامية)
// الخطوة 6: معلومات المتابعة | الخطوة 7: ملاحظات + ملخص + إرسال
// الأمان: dedupeKey UUID يمنع التسجيل المكرر عند إعادة الإرسال، وحفظ محلي عند انقطاع الشبكة مع إعادة محاولة تلقائية.
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/schools/base-map";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { SectionPerms } from "@/lib/sections-catalog";
import {
  enqueuePendingVisit,
  readPendingVisits,
  retryAllPendingVisits,
  type PendingVisitItem,
} from "@/lib/pending-visits";
const BaseMap = dynamic(() => import("@/components/schools/base-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">جارٍ تحميل الخريطة...</div>,
});
import { formatNumber } from "@/lib/time";



interface SchoolRow {
  id: string;
  name: string;
  governorate: string | null;
  regionName: string | null;
  institutionType: string | null;
  principalName: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  studentCount: number | null;
  hasCoords: boolean;
}

interface LocationState {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: "GPS" | "MAP" | "SAVED";
  confirmed: boolean;
}

const CONTACT_TYPES = [
  { value: "FIELD_VISIT", label: "زيارة ميدانية" },
  { value: "PHONE", label: "اتصال هاتفي" },
  { value: "WHATSAPP", label: "واتساب" },
  { value: "SMS", label: "رسالة SMS" },
  { value: "MEETING", label: "اجتماع متابعة" },
];

const RESULTS = [
  { value: "INITIAL_APPROVAL", label: "موافقة أولية" },
  { value: "APPROVED", label: "موافقة" },
  { value: "NEEDS_ANOTHER_VISIT", label: "يحتاج زيارة أخرى" },
  { value: "CONTRACTED", label: "تم التعاقد" },
  { value: "REJECTED", label: "رفض" },
  { value: "SCHOOL_NOT_FOUND", label: "المدرسة غير موجودة" },
  { value: "OTHER", label: "أخرى" },
];

const NEEDS_OPTIONS = [
  { value: "PAINT", label: "طلاء" },
  { value: "SEATS", label: "مقاعد" },
  { value: "SMART_SCREEN", label: "شاشة ذكية" },
  { value: "AC", label: "تكييف" },
  { value: "NONE", label: "لا تحتاج إلى شيء" },
  { value: "OTHER", label: "أخرى" },
];

const RESULT_LABELS: Record<string, string> = Object.fromEntries(RESULTS.map((r) => [r.value, r.label]));
const CONTACT_LABELS: Record<string, string> = Object.fromEntries(CONTACT_TYPES.map((c) => [c.value, c.label]));
const NEEDS_LABELS: Record<string, string> = Object.fromEntries(NEEDS_OPTIONS.map((n) => [n.value, n.label]));

export function VisitWizard({
  perms,
  accountId,
  onRegistered,
  onExit,
}: {
  perms: Record<string, SectionPerms>;
  accountId: string;
  onRegistered: () => void;
  onExit: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<SchoolRow | null>(null);
  const [location, setLocation] = useState<LocationState | null>(null);
  const [locating, setLocating] = useState(false);
  const [addSchoolOpen, setAddSchoolOpen] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [schoolForm, setSchoolForm] = useState({ name: "", regionText: "", address: "", phone: "", lat: "", lng: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<"registered" | "queued" | null>(null);
  // طابور الزيارات غير المتصلة — عدد الزيارات المحفوظة محلياً بانتظار الإرسال
  const [pendingQueue, setPendingQueue] = useState<PendingVisitItem[]>([]);
  const [retryingQueue, setRetryingQueue] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState(false);

  // بيانات الخطوات
  const [contactType, setContactType] = useState("");
  const [contactOther, setContactOther] = useState("");
  const [showOtherContact, setShowOtherContact] = useState(false);
  const [result, setResult] = useState("");
  const [resultOther, setResultOther] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [contactPerson, setContactPerson] = useState({ name: "", title: "", principal: "", phone: "", students: "" });
  const [needs, setNeeds] = useState<string[]>([]);
  const [needsOther, setNeedsOther] = useState("");
  const [followUp, setFollowUp] = useState({ subscribers: "", nextDate: "" });
  const [notes, setNotes] = useState("");

  const dedupeRef = useRef<string>("");
  const validationToast = useRef<ReturnType<typeof toast> | null>(null);
  const canCreateSchools = Boolean(perms.schools?.create);

  // قائمة المدارس — ضمن نطاق الموظف من الخادم
  const loadSchools = useCallback(async (query: string) => {
    setLoadingSchools(true);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/employee/schools?${params.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (res.ok) setSchools(j.schools ?? []);
    } finally {
      setLoadingSchools(false);
    }
  }, []);

  useEffect(() => {
    loadSchools("");
  }, [loadSchools]);

  useEffect(() => {
    const t = setTimeout(() => loadSchools(q), 350);
    return () => clearTimeout(t);
  }, [q, loadSchools]);

  // ——— طابور الزيارات غير المتصلة: عدة زيارات متتالية بلا فقدان ولا تكرار ———
  const refreshQueue = useCallback(() => {
    setPendingQueue(readPendingVisits(accountId));
  }, [accountId]);

  const postQueuedVisit = useCallback(async (body: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/employee/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && (j?.visit || j?.duplicate)) return { ok: true };
      return { ok: false, error: (j?.error as string) ?? "تعذر الإرسال" };
    } catch {
      return { ok: false, error: "انقطاع الاتصال" };
    }
  }, []);

  // إعادة إرسال الطابور كله بالترتيب — كل عنصر يُحذف فور نجاحه حصراً
  const retryPending = useCallback(async () => {
    if (retryingQueue) return;
    const queue = readPendingVisits(accountId);
    if (queue.length === 0) return;
    setRetryingQueue(true);
    try {
      const { sent, remaining } = await retryAllPendingVisits(postQueuedVisit, accountId);
      refreshQueue();
      if (sent > 0) {
        toast({
          title: remaining === 0 ? "أُرسلت كل الزيارات المحفوظة" : `أُرسلت ${sent} من ${sent + remaining} زيارة محفوظة`,
          description:
            remaining === 0
              ? "سُجلت كل الزيارات التي كانت محفوظة على جهازك — دون أي تكرار."
              : "بقي جزء لم يُرسل بعد — سيُعاد تلقائياً عند عودة الاتصال.",
        });
        onRegistered();
      }
    } finally {
      setRetryingQueue(false);
    }
  }, [accountId, onRegistered, postQueuedVisit, refreshQueue, retryingQueue, toast]);

  useEffect(() => {
    // ترحيل الزيارة القديمة (المفتاح الفردي) إلى الطابور الجديد ثم عرض العدد
    const queue = readPendingVisits(accountId);
    setPendingQueue(queue);
    // عودة الاتصال → إعادة إرسال تلقائية للطابور كله
    const onOnline = () => {
      retryPending();
    };
    window.addEventListener("online", onOnline);
    // فتح النموذج والاتصال متاح وتوجد زيارات معلقة → إعادة إرسال فورية
    if (queue.length > 0 && navigator.onLine) {
      const t = setTimeout(() => retryPending(), 1200);
      return () => {
        window.removeEventListener("online", onOnline);
        clearTimeout(t);
      };
    }
    return () => window.removeEventListener("online", onOnline);
  }, [accountId, retryPending]);

  // ——— الخطوة 1: تحديد الموقع ———
  const useGps = () => {
    if (!navigator.geolocation) {
      toast({ title: "جهازك لا يدعم تحديد الموقع", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: "GPS",
          confirmed: false,
        });
        setLocating(false);
        toast({ title: "تم تحديد موقعك", description: `دقة التحديد ${Math.round(pos.coords.accuracy)} متر — راجع العلامة على الخريطة ثم أكّد.` });
      },
      () => {
        setLocating(false);
        toast({ title: "تعذر تحديد الموقع", description: "فعّل GPS وحاول مجدداً، أو حدد الموقع يدوياً على الخريطة.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  const saveLocationToSchool = async (loc: { lat: number; lng: number; accuracy: number | null; source: "GPS" | "MAP" | "SAVED" }) => {
    if (!selected) return;
    setUpdatingLocation(true);
    try {
      const res = await fetch(`/api/employee/schools/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, source: loc.source }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "تعذر الحفظ");
      setLocation({ ...loc, confirmed: true });
      setSelected((s) => (s ? { ...s, lat: loc.lat, lng: loc.lng, hasCoords: true } : s));
      toast({
        title: "حُفظ موقع المدرسة",
        description: j?.schoolFieldsUpdated
          ? "حُدثت إحداثيات المدرسة المحفوظة وسُجل التحديث في سجل التغييرات."
          : "سُجلت إحداثيات المدرسة في النظام.",
      });
    } catch (e) {
      toast({ title: "تعذر حفظ الموقع", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setUpdatingLocation(false);
    }
  };

  const confirmSavedLocation = () => {
    if (selected?.hasCoords && selected.lat !== null && selected.lng !== null) {
      setLocation({ lat: selected.lat, lng: selected.lng, accuracy: null, source: "SAVED", confirmed: true });
      toast({ title: "أكّدت الموقع المحفوظ", description: "الإحداثيات المحفوظة في النظام سترتبط بهذه الزيارة." });
    }
  };

  // ——— خطوات بمفاتيح ديناميكية: سبب الرفض يظهر فقط عند اختيار «رفض» ———
  // المفاتيح تضمن تطابق فهرسة الخطوة مع محتواها في كل الحالات (رفض أو غيره)
  const STEP_TITLES: Record<string, string> = {
    school: "المدرسة والموقع",
    contact: "نوع التواصل",
    result: "نتيجة الزيارة",
    rejection: "سبب الرفض",
    person: "معلومات التواصل",
    needs: "احتياجات المدرسة",
    followup: "المتابعة",
    review: "المراجعة والإرسال",
  };

  const stepKeys = useMemo(() => {
    const keys = ["school", "contact", "result"];
    if (result === "REJECTED") keys.push("rejection");
    keys.push("person", "needs", "followup", "review");
    return keys;
  }, [result]);

  const steps = useMemo(() => stepKeys.map((k) => STEP_TITLES[k]), [stepKeys]);
  const currentStep = stepKeys[Math.min(step, stepKeys.length - 1)];

  const validateCurrentStep = (): string | null => {
    switch (currentStep) {
      case "school":
        if (!selected) return "اختر المدرسة أولاً";
        if (!location?.confirmed) return "حدد موقع المدرسة أو أكّد الموقع المحفوظ قبل الانتقال";
        return null;
      case "contact":
        if (!contactType) return "اختر نوع التواصل";
        if (contactType === "OTHER" && !contactOther.trim()) return "اكتب نوع التواصل عند اختيار «أخرى»";
        return null;
      case "result":
        if (!result) return "اختر نتيجة الزيارة";
        if (result === "OTHER" && !resultOther.trim()) return "اكتب نص النتيجة عند اختيار «أخرى»";
        return null;
      case "rejection":
        if (!rejectionReason.trim()) return "سبب الرفض إلزامي — اكتب السبب";
        return null;
      case "person":
        return null; // معلومات التواصل اختيارية
      case "needs":
        if (needs.includes("OTHER") && !needsOther.trim()) return "شرح الاحتياج الآخر إلزامي عند اختيار «أخرى»";
        return null;
      default:
        return null;
    }
  };

  const next = () => {
    const err = validateCurrentStep();
    if (err) {
      validationToast.current = toast({ title: err, variant: "destructive" });
      return;
    }
    validationToast.current?.dismiss();
    setStep((s) => Math.min(s + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const prev = () => {
    validationToast.current?.dismiss();
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!selected || !location) return;
    if (!dedupeRef.current) {
      // مفتاح فريد لكل محاولة إرسال — إعادة الإرسال بنفس المفتاح تعيد السجل نفسه دون تكرار
      dedupeRef.current = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const body = {
      dedupeKey: dedupeRef.current,
      schoolId: selected.id,
      accountId,
      contactType,
      contactOther: contactType === "OTHER" ? contactOther.trim() : undefined,
      result,
      resultOther: result === "OTHER" ? resultOther.trim() : undefined,
      rejectionReason: result === "REJECTED" ? rejectionReason.trim() : undefined,
      contactPersonName: contactPerson.name.trim() || undefined,
      contactPersonTitle: contactPerson.title.trim() || undefined,
      principalName: contactPerson.principal.trim() || undefined,
      schoolPhone: contactPerson.phone.trim() || undefined,
      studentCount: contactPerson.students ? Number(contactPerson.students) : undefined,
      needs,
      needsOther: needs.includes("OTHER") ? needsOther.trim() : undefined,
      subscribersCount: followUp.subscribers ? Number(followUp.subscribers) : undefined,
      nextFollowUpAt: followUp.nextDate || undefined,
      notes: notes.trim() || undefined,
      lat: location.lat,
      lng: location.lng,
      locationAccuracy: location.accuracy ?? undefined,
      locationSource: location.source,
    };

    setSending(true);
    try {
      const res = await fetch("/api/employee/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (res.status >= 500 || !j) throw new Error("تعذر الاتصال بالخادم");
      if (!res.ok) {
        toast({ title: "تعذر تسجيل الزيارة", description: j.error, variant: "destructive" });
        return;
      }
      // نجاح الزيارة الجديدة — الطابور المعلق يبقى محفوظاً كما هو (لا فقدان بيانات)
      refreshQueue();
      setDone("registered");
      window.scrollTo({ top: 0 });
      onRegistered();
      // رسالة النجاح المطلوبة حرفياً — تظهر في شاشة النجاح أسفل الشعار
    } catch (e) {
      // انقطاع الشبكة: إضافة الزيارة إلى طابور الإرسال المحلي (تتراكم عدة زيارات) ثم
      // إعادة إرسال تلقائية بالترتيب عند عودة الاتصال — لا تُستبدل زيارة بأخرى أبداً
      const count = enqueuePendingVisit({
        body,
        schoolName: selected.name,
        savedAt: new Date().toISOString(),
      }, accountId);
      refreshQueue();
      setDone("queued");
      toast({
        title: "انقطع الاتصال — الزيارة محفوظة على جهازك",
        description:
          e instanceof Error && !e.message.includes("تعذر")
            ? `${e.message}.`
            : `محفوظة في طابور الإرسال (${count} ${count === 1 ? "زيارة معلقة" : "زيارات معلقة"}) — ستعاد تلقائياً عند عودة الاتصال دون تكرار.`,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  // ——— شاشة النجاح ———
  if (done) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-2 text-center" dir="rtl">
        <div className={`flex size-16 items-center justify-center rounded-full ${done === "registered" ? "bg-emerald-100" : "bg-amber-100"}`}>
          {done === "registered"
            ? <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden="true" />
            : <CloudOff className="h-9 w-9 text-amber-600" aria-hidden="true" />}
        </div>
        <p className="text-lg font-extrabold text-foreground">
          {done === "registered" ? "تم تسجيل زيارتك للمدرسة بنجاح" : "حُفظت الزيارة على جهازك بانتظار الإرسال"}
        </p>
        {done === "registered" && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            سُجّلت الزيارة في قاعدة البيانات المركزية باسمك وارتبطت بالمدرسة والتاريخ والوقت والإحداثيات — وظهرت فوراً في لوحة الإدارة.
          </p>
        )}
        <Button
          type="button"
          className="mt-3 gap-2"
          onClick={() => {
            window.scrollTo({ top: 0 });
            setDone(null);
            setStep(0);
            setSelected(null);
            setLocation(null);
            setContactType("");
            setContactOther("");
            setShowOtherContact(false);
            setResult("");
            setResultOther("");
            setRejectionReason("");
            setContactPerson({ name: "", title: "", principal: "", phone: "", students: "" });
            setNeeds([]);
            setNeedsOther("");
            setFollowUp({ subscribers: "", nextDate: "" });
            setNotes("");
            dedupeRef.current = "";
            refreshQueue();
            loadSchools(q);
          }}
        >
          تسجيل زيارة جديدة
        </Button>
        {done !== "registered" && <Button type="button" variant="outline" onClick={onExit}>العودة للرئيسية</Button>}
        {pendingQueue.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-700">
            لديك {formatNumber(pendingQueue.length)} {pendingQueue.length === 1 ? "زيارة" : "زيارات"} محفوظة على الجهاز بانتظار عودة الاتصال — سيتم إرسالها تلقائياً دون تكرار.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold text-foreground">تسجيل زيارة للمدرسة</h1>
        <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
          خطوة {formatNumber(step + 1)} من {formatNumber(steps.length)}
        </span>
      </div>

      {/* شريط التقدم */}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[#00a8ee] transition-all"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          aria-hidden="true"
        />
      </div>

      {pendingQueue.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <CloudOff className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-[11px] font-bold text-amber-800">
                لديك {formatNumber(pendingQueue.length)} {pendingQueue.length === 1 ? "زيارة محفوظة محلياً لم تُرسل بعد" : "زيارات محفوظة محلياً لم تُرسل بعد"}
              </p>
              <p className="text-[10px] text-amber-700">
                تُرسل بالترتيب تلقائياً عند عودة الاتصال — كل زيارة تُسجل مرة واحدة فقط ولا تُفقد أبداً.
              </p>
              {pendingQueue.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {pendingQueue.slice(0, 5).map((it) => (
                    <li key={String(it.body.dedupeKey)} className="text-[10px] text-amber-700">
                      • {it.schoolName || "زيارة"} — حُفظت {new Date(it.savedAt).toLocaleDateString("ar-iq")}
                      {it.attempts > 0 ? ` · محاولات إرسال: ${formatNumber(it.attempts)}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button type="button" size="sm" variant="outline" disabled={retryingQueue} onClick={retryPending}>
              {retryingQueue ? "جارٍ الإرسال..." : "إرسال الكل الآن"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        {/* ——— الخطوة 1: المدرسة والموقع ——— */}
        {currentStep === "school" && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">اختر المدرسة وحدد موقعها</p>

            {!selected ? (
              <>
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    className="h-11 ps-9"
                    placeholder="ابحث باسم المدرسة..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="بحث عن مدرسة"
                  />
                </div>
                <div className="max-h-56 space-y-1.5 overflow-y-auto nice-scroll">
                  {loadingSchools ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">جارٍ التحميل...</p>
                  ) : schools.length === 0 ? (
                    <div className="py-3 text-center">
                      <p className="text-xs text-muted-foreground">لا مدارس مطابقة في نطاقك</p>
                    </div>
                  ) : (
                    schools.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelected(s)}
                        className="flex min-h-[52px] w-full items-center gap-2 rounded-[14px] border bg-white p-2.5 text-start active:bg-sky-50"
                      >
                        <MapPin className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-foreground">{s.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{[s.regionName, s.governorate].filter(Boolean).join(" — ") || "—"}</p>
                        </div>
                        {s.hasCoords && <span className="shrink-0 text-[9px] text-emerald-600">موقع محفوظ</span>}
                      </button>
                    ))
                  )}
                </div>
                {canCreateSchools && (
                  <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setAddSchoolOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    إضافة مدرسة جديدة يدوياً
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold text-foreground">{selected.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[selected.regionName, selected.governorate].filter(Boolean).join(" — ") || "—"}
                      </p>
                      {selected.address && <p className="text-[11px] text-muted-foreground">{selected.address}</p>}
                      {selected.principalName && <p className="text-[11px] text-muted-foreground">المدير: {selected.principalName}</p>}
                      {selected.phone && <p className="text-[11px] text-muted-foreground" dir="ltr">هاتف: {selected.phone}</p>}
                      {selected.studentCount !== null && <p className="text-[11px] text-muted-foreground">الطلاب: {formatNumber(selected.studentCount)}</p>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 text-[11px]" disabled={locating || updatingLocation} onClick={() => { setSelected(null); setLocation(null); }}>
                      تغيير
                    </Button>
                  </div>
                </div>

                {/* تحديد الموقع */}
                <div className="space-y-2">
                  {selected.hasCoords && !location && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                      <p className="text-[11px] font-bold text-emerald-800">هذه المدرسة لديها موقع محفوظ مسبقاً</p>
                      <p className="mt-0.5 text-[10px] text-emerald-700" dir="ltr">
                        {selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="flex-1 gap-1.5" onClick={confirmSavedLocation}>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          تأكيد الموقع المحفوظ
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="flex-1 gap-1.5" onClick={useGps} disabled={locating}>
                          <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                          {locating ? "جارٍ التحديد..." : "تحديث من GPS"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="h-52 overflow-hidden rounded-xl border">
                    <BaseMap
                      center={{
                        lat: location?.lat ?? (selected.hasCoords ? selected.lat ?? 33.3152 : 33.3152),
                        lng: location?.lng ?? (selected.hasCoords ? selected.lng ?? 44.3661 : 44.3661),
                      }}
                      zoom={location || selected.hasCoords ? 16 : 10}
                      markers={
                        location
                          ? [{
                              id: "picked",
                              lat: location.lat,
                              lng: location.lng,
                              color: location.confirmed ? "green" : "sky",
                              draggable: true,
                              title: "موقع المدرسة",
                            } satisfies MapMarker]
                          : selected.hasCoords
                            ? [{
                                id: "saved",
                                lat: selected.lat ?? 0,
                                lng: selected.lng ?? 0,
                                color: "sky",
                                title: "الموقع المحفوظ",
                              } satisfies MapMarker]
                            : []
                      }
                      onMapClick={(pos) => setLocation({ lat: pos.lat, lng: pos.lng, accuracy: null, source: "MAP", confirmed: false })}
                      onCenterDrag={(pos) => setLocation((l) => ({ lat: pos.lat, lng: pos.lng, accuracy: l?.accuracy ?? null, source: "MAP", confirmed: false }))}
                      ariaLabel="خريطة تحديد موقع المدرسة"
                    />
                  </div>
                  <p className="text-center text-[10px] text-muted-foreground">
                    انقر على الخريطة أو اسحب العلامة لتحديد الموقع بدقة — أو استخدم GPS
                  </p>

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1 gap-1.5" onClick={useGps} disabled={locating}>
                      <Navigation className="h-4 w-4" aria-hidden="true" />
                      {locating ? "جارٍ التحديد..." : "تحديد بـ GPS"}
                    </Button>
                    {location && !location.confirmed && (
                      <Button
                        type="button"
                        className="flex-1 gap-1.5"
                        disabled={updatingLocation}
                        onClick={() => saveLocationToSchool({ lat: location.lat, lng: location.lng, accuracy: location.accuracy, source: location.source })}
                      >
                        {updatingLocation && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        حفظ وتأكيد الموقع
                      </Button>
                    )}
                  </div>

                  {location && (
                    <div className={`rounded-lg p-2.5 text-[11px] ${location.confirmed ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-amber-200 bg-amber-50 text-amber-800"}`}>
                      {location.confirmed ? (
                        <>
                          <Check className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
                          الموقع مؤكد وسيسجل مع الزيارة: <span dir="ltr">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</span>
                          {" — "}
                          {location.source === "SAVED" ? "الموقع المحفوظ" : location.source === "GPS" ? "GPS الهاتف" : "تحديد من الخريطة"}
                        </>
                      ) : (
                        <>
                          الموقع محدد مبدئياً — اضغط «حفظ وتأكيد الموقع» لربطه بالمدرسة والزيارة
                          {location.accuracy ? ` (دقة GPS: ${Math.round(location.accuracy)} م)` : ""}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ——— الخطوة 2: نوع التواصل ——— */}
        {currentStep === "contact" && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">نوع التواصل — اختر نوعاً واحداً</p>
            <RadioGroup value={contactType} onValueChange={setContactType} className="gap-2">
              {(showOtherContact ? [...CONTACT_TYPES, { value: "OTHER", label: "أخرى" }] : CONTACT_TYPES).map((c) => (
                <label key={c.value} className="flex min-h-[52px] cursor-pointer flex-row-reverse items-center gap-3 rounded-[14px] border px-4 py-3 text-sm has-[[data-state=checked]]:border-sky-400 has-[[data-state=checked]]:bg-sky-50">
                  <RadioGroupItem value={c.value} aria-label={c.label} />
                  {c.label}
                </label>
              ))}
            </RadioGroup>
            {contactType === "OTHER" && (
              <Input aria-label="نوع التواصل الآخر" value={contactOther}
                onChange={(e) => setContactOther(e.target.value)} placeholder="اكتب نوع التواصل" />
            )}
          </div>
        )}

        {/* ——— الخطوة 3: النتيجة ——— */}
        {currentStep === "result" && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">نتيجة الزيارة أو التواصل — اختر نتيجة واحدة</p>
            <RadioGroup
              value={result}
              onValueChange={(v) => { setResult(v); if (v !== "OTHER") setResultOther(""); }}
              className="gap-2"
            >
              {RESULTS.map((r) => (
                <label key={r.value} className="flex min-h-[52px] cursor-pointer flex-row-reverse items-center gap-3 rounded-[14px] border px-4 py-3 text-sm has-[[data-state=checked]]:border-sky-400 has-[[data-state=checked]]:bg-sky-50">
                  <RadioGroupItem value={r.value} aria-label={r.label} />
                  {r.label}
                </label>
              ))}
            </RadioGroup>
            {result === "OTHER" && (
              <div className="space-y-1.5">
                <Label className="text-xs">اكتب النتيجة بنفسك (إلزامي)</Label>
                <Textarea rows={2} value={resultOther} onChange={(e) => setResultOther(e.target.value)} placeholder="اكتب نتيجة التواصل..." />
              </div>
            )}
          </div>
        )}

        {/* ——— خطوة سبب الرفض (ديناميكية) ——— */}
        {currentStep === "rejection" && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">سبب الرفض — إلزامي</p>
            <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">
              «{selected?.name}» رفضت — وثّق سبب الرفض بدقة فهو يظهر في لوحة الإدارة مع الزيارة.
            </p>
            <Textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="اكتب سبب الرفض بالتفصيل..."
              aria-label="سبب الرفض"
            />
          </div>
        )}

        {/* ——— الخطوة 4: معلومات الشخص المتواصل معه ——— */}
        {currentStep === "person" && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">معلومات الشخص الذي تم التواصل معه</p>
            <p className="text-[11px] text-muted-foreground">
              تُحفظ كما أدخلتها بالضبط مع الزيارة، وتحديث بيانات المدرسة الأصلية يُسجل في سجل التغييرات تلقائياً.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">اسم الشخص الذي التقيت به</Label>
              <Input value={contactPerson.name} onChange={(e) => setContactPerson((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">منصبه الوظيفي</Label>
              <Input value={contactPerson.title} onChange={(e) => setContactPerson((f) => ({ ...f, title: e.target.value }))} placeholder="مثال: معاون المدير" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">اسم مدير المدرسة</Label>
              <Input value={contactPerson.principal} onChange={(e) => setContactPerson((f) => ({ ...f, principal: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">رقم هاتف المدرسة</Label>
              <Input dir="ltr" inputMode="tel" className="text-start" value={contactPerson.phone} onChange={(e) => setContactPerson((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">عدد طلاب المدرسة</Label>
              <Input
                dir="ltr"
                inputMode="numeric"
                className="text-start"
                value={contactPerson.students}
                onChange={(e) => setContactPerson((f) => ({ ...f, students: e.target.value.replace(/[^0-9]/g, "") }))}
              />
            </div>
          </div>
        )}

        {/* ——— الخطوة 5: الاحتياجات ——— */}
        {currentStep === "needs" && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">احتياجات المدرسة — اختر كل ما ينطبق</p>
            <div className="space-y-2">
              {NEEDS_OPTIONS.map((n) => (
                <label
                  key={n.value}
                  className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 text-sm"
                >
                  <Checkbox
                    checked={needs.includes(n.value)}
                    onCheckedChange={(v) => {
                      setNeeds((prev) => {
                        if (v === true) {
                          // «لا تحتاج إلى شيء» تتعارض مع بقية الخيارات
                          return n.value === "NONE" ? ["NONE"] : prev.filter((x) => x !== "NONE").concat(n.value);
                        }
                        return prev.filter((x) => x !== n.value);
                      });
                    }}
                    aria-label={n.label}
                  />
                  {n.label}
                </label>
              ))}
            </div>
            {needs.includes("OTHER") && (
              <div className="space-y-1.5">
                <Label className="text-xs">اشرح الاحتياج الآخر (إلزامي)</Label>
                <Textarea rows={2} value={needsOther} onChange={(e) => setNeedsOther(e.target.value)} placeholder="اكتب الاحتياج بوضوح..." />
              </div>
            )}
          </div>
        )}

        {/* ——— الخطوة 6: معلومات المتابعة ——— */}
        {currentStep === "followup" && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">معلومات المتابعة</p>
            <div className="space-y-1.5">
              <Label className="text-xs">عدد الطلاب المشتركين بالمنصة</Label>
              <Input
                dir="ltr"
                inputMode="numeric"
                className="text-start"
                value={followUp.subscribers}
                onChange={(e) => setFollowUp((f) => ({ ...f, subscribers: e.target.value.replace(/[^0-9]/g, "") }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visit-follow-up" className="text-xs">موعد المتابعة القادم</Label>
              <Input id="visit-follow-up"
                type="date"
                dir="ltr"
                className="text-start"
                value={followUp.nextDate}
                onChange={(e) => setFollowUp((f) => ({ ...f, nextDate: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* ——— الخطوة 7: الملاحظات والمراجعة والإرسال ——— */}
        {currentStep === "review" && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-foreground">ملاحظات إضافية</p>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات تريد توثيقها مع الزيارة..." />
            <p className="text-sm font-bold text-foreground">ملخص الزيارة قبل الإرسال</p>
            <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3 text-xs">
              <SummaryRow label="المدرسة" value={selected?.name ?? "—"} />
              {selected?.address && <SummaryRow label="العنوان" value={selected.address} />}
              <SummaryRow label="الموقع" value={`${location?.lat.toFixed(5)}, ${location?.lng.toFixed(5)}`} ltr />
              <SummaryRow label="نوع التواصل" value={contactType === "OTHER" ? contactOther : CONTACT_LABELS[contactType] ?? "—"} />
              <SummaryRow label="النتيجة" value={result === "OTHER" && resultOther ? `أخرى — ${resultOther}` : RESULT_LABELS[result] ?? "—"} />
              {result === "REJECTED" && <SummaryRow label="سبب الرفض" value={rejectionReason} />}
              {contactPerson.name && <SummaryRow label="الشخص المتواصل معه" value={`${contactPerson.name}${contactPerson.title ? ` (${contactPerson.title})` : ""}`} />}
              {contactPerson.principal && <SummaryRow label="مدير المدرسة" value={contactPerson.principal} />}
              {contactPerson.phone && <SummaryRow label="هاتف المدرسة" value={contactPerson.phone} ltr />}
              {contactPerson.students && <SummaryRow label="عدد الطلاب" value={contactPerson.students} />}
              {needs.length > 0 && <SummaryRow label="الاحتياجات" value={needs.map((n) => NEEDS_LABELS[n]).join("، ") + (needs.includes("OTHER") && needsOther ? ` — ${needsOther}` : "")} />}
              {followUp.subscribers && <SummaryRow label="المشتركون بالمنصة" value={followUp.subscribers} />}
              {followUp.nextDate && <SummaryRow label="المتابعة القادمة" value={followUp.nextDate} />}
              {notes && <SummaryRow label="ملاحظات" value={notes} />}
            </div>
            {pendingQueue.length > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-bold text-amber-800">
                لديك {formatNumber(pendingQueue.length)} {pendingQueue.length === 1 ? "زيارة" : "زيارات"} محفوظة على جهازك بانتظار الاتصال — وستُرسل تلقائياً دون تكرار.
              </p>
            )}
          </div>
        )}

        {/* أزرار التنقل */}
        <div className="mt-4 flex items-stretch gap-2">
          {step > 0 && (
            <Button type="button" variant="outline" className="flex-1 gap-1.5" onClick={prev} disabled={sending}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              السابق
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button type="button" className="flex-1 gap-1.5" onClick={next}>
              التالي
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" className="h-auto min-h-9 flex-[1.12] gap-1.5 px-2 whitespace-normal has-[>svg]:px-2" onClick={submit} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {sending ? "جارٍ الإرسال..." : "إرسال وتسجيل الزيارة"}
            </Button>
          )}
        </div>
      </div>

      {currentStep === "contact" && !showOtherContact && (
        <button type="button" className="min-h-9 text-xs font-semibold text-sky-700" onClick={() => setShowOtherContact(true)}>
          إضافة نوع تواصل آخر
        </button>
      )}

      {/* إضافة مدرسة جديدة يدوياً من داخل النموذج */}
      <Dialog open={addSchoolOpen} onOpenChange={setAddSchoolOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto nice-scroll">
          <DialogHeader>
            <DialogTitle>إضافة مدرسة جديدة</DialogTitle>
            <p className="text-xs text-muted-foreground">تُحفظ في القاعدة المركزية فوراً ثم تُختار للزيارة تلقائياً.</p>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم المدرسة *</Label>
              <Input value={schoolForm.name} onChange={(e) => setSchoolForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">المنطقة</Label>
              <Input value={schoolForm.regionText} onChange={(e) => setSchoolForm((f) => ({ ...f, regionText: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-school-address">عنوان المدرسة</Label>
              <Input id="new-school-address" value={schoolForm.address}
                onChange={(e) => setSchoolForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">هاتف المدرسة</Label>
              <Input dir="ltr" className="text-start" value={schoolForm.phone} onChange={(e) => setSchoolForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Latitude</Label>
                <Input dir="ltr" inputMode="decimal" className="text-start" value={schoolForm.lat} onChange={(e) => setSchoolForm((f) => ({ ...f, lat: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Longitude</Label>
                <Input dir="ltr" inputMode="decimal" className="text-start" value={schoolForm.lng} onChange={(e) => setSchoolForm((f) => ({ ...f, lng: e.target.value }))} />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                navigator.geolocation?.getCurrentPosition(
                  (pos) => setSchoolForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })),
                  () => toast({ title: "تعذر تحديد الموقع", variant: "destructive" })
                );
              }}
            >
              <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
              إلحاق موقعي الحالي (GPS)
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddSchoolOpen(false)} disabled={savingSchool}>إلغاء</Button>
            <Button
              type="button"
              disabled={savingSchool || !schoolForm.name.trim()}
              className="gap-2"
              onClick={async () => {
                setSavingSchool(true);
                try {
                  const body: Record<string, unknown> = {
                    name: schoolForm.name.trim(),
                    regionText: schoolForm.regionText.trim() || undefined,
                    address: schoolForm.address.trim() || undefined,
                    phone: schoolForm.phone.trim() || undefined,
                  };
                  if (schoolForm.lat && schoolForm.lng) {
                    body.lat = Number(schoolForm.lat);
                    body.lng = Number(schoolForm.lng);
                  }
                  const res = await fetch("/api/employee/schools", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  const j = await res.json().catch(() => null);
                  if (!res.ok) throw new Error(j?.error ?? "تعذر الإضافة");
                  setAddSchoolOpen(false);
                  await loadSchools("");
                  const found: SchoolRow | undefined = j?.school;
                  if (found) {
                    setSelected(found);
                    setLocation(null);
                  }
                  toast({ title: "أُضيفت المدرسة", description: "أكمل الآن تحديد موقعها للتأكيد." });
                  setSchoolForm({ name: "", regionText: "", address: "", phone: "", lat: "", lng: "" });
                  onRegistered();
                } catch (e) {
                  toast({ title: "تعذر إضافة المدرسة", description: e instanceof Error ? e.message : "", variant: "destructive" });
                } finally {
                  setSavingSchool(false);
                }
              }}
            >
              {savingSchool && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              حفظ واختيار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="text-end text-[11px] font-bold text-foreground" dir={ltr ? "ltr" : undefined} style={ltr ? { textAlign: "end" } : undefined}>
        {value}
      </span>
    </div>
  );
}
