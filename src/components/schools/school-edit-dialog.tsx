"use client";

// ——— نافذة تعديل بيانات مدرسة من الإدارة + عرض توثيق كل حقل وحالته ———

import { useEffect, useState } from "react";
import { ShieldCheck, Info } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  DISCOVERY_STATUS_BADGE,
  DISCOVERY_STATUS_LABELS,
  FIELD_LABELS_UI,
  SECTOR_LABELS_UI,
  type SchoolDTO,
} from "@/lib/types";
import { CONTRACT_LABELS, AVAILABILITY_LABELS } from "@/lib/labels";
import type { FieldMeta, VerificationStatus } from "@/lib/types";

interface Props {
  school: SchoolDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  regions: { id: string; name: string; governorate: string }[];
  onSaved: () => void;
}

export function SchoolEditDialog({ school, open, onOpenChange, regions, onSaved }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    principalName: "",
    phone: "",
    studentCount: "",
    stages: "",
    sector: "none",
    institutionType: "",
    address: "",
    website: "",
    facebookUrl: "",
    instagramUrl: "",
    availabilityStatus: "AVAILABLE",
    contractStatus: "NOT_CONTRACTED",
    discoveryStatus: "DISCOVERED",
    regionId: "none",
    notes: "",
    lat: "",
    lng: "",
  });
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<FieldMeta | null>(null);

  useEffect(() => {
    if (school) {
      setForm({
        principalName: school.principalName ?? "",
        phone: school.phone ?? "",
        studentCount: school.studentCount !== null ? String(school.studentCount) : "",
        stages: school.stages ?? "",
        sector: school.sector ?? "none",
        institutionType: school.institutionType ?? "",
        address: school.address ?? "",
        website: school.website ?? "",
        facebookUrl: school.facebookUrl ?? "",
        instagramUrl: school.instagramUrl ?? "",
        availabilityStatus: school.availabilityStatus,
        contractStatus: school.contractStatus,
        discoveryStatus: school.discoveryStatus,
        regionId: school.regionId ?? "none",
        notes: school.notes ?? "",
        lat: school.lat !== null ? String(school.lat) : "",
        lng: school.lng !== null ? String(school.lng) : "",
      });
      setMeta(school.fieldMeta);
    }
  }, [school]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!school) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        principalName: form.principalName.trim() || null,
        phone: form.phone.trim() || null,
        studentCount: form.studentCount.trim() === "" ? null : Number(form.studentCount),
        stages: form.stages.trim() || null,
        sector: form.sector === "none" ? null : form.sector,
        institutionType: form.institutionType.trim() || null,
        address: form.address.trim() || null,
        website: form.website.trim() || null,
        facebookUrl: form.facebookUrl.trim() || null,
        instagramUrl: form.instagramUrl.trim() || null,
        availabilityStatus: form.availabilityStatus,
        contractStatus: form.contractStatus,
        discoveryStatus: form.discoveryStatus,
        regionId: form.regionId === "none" ? null : form.regionId,
        notes: form.notes.trim() || null,
        lat: form.lat.trim() === "" ? null : Number(form.lat),
        lng: form.lng.trim() === "" ? null : Number(form.lng),
      };
      const res = await fetch(`/api/schools/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "تعذر الحفظ");
      }
      toast({ title: "تم حفظ التعديلات", description: "حدّثت بيانات المدرسة وسُجل مصدر كل حقل معدل." });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: "تعذر الحفظ", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            تعديل بيانات المدرسة
            {school && (
              <Badge variant="outline" className={`text-[11px] ${DISCOVERY_STATUS_BADGE[school.discoveryStatus] ?? ""}`}>
                {DISCOVERY_STATUS_LABELS[school.discoveryStatus] ?? school.discoveryStatus}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="truncate">{school?.name}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pe-3">
          <div className="space-y-4">
            {/* توثيق كل حقل — المصدر والتاريخ والحالة */}
            {meta && Object.keys(meta).length > 0 && (
              <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-sky-800">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  توثيق المعلومات — مصدر كل حقل وتاريخ جمعه وحالة التحقق
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {Object.entries(meta).map(([key, m]) => (
                    <div key={key} className="rounded-md border bg-white px-2.5 py-1.5 text-[11px]">
                      <p className="font-semibold text-foreground">{FIELD_LABELS_UI[key] ?? key}</p>
                      <p className="text-muted-foreground">المصدر: {m.sourceLabel}</p>
                      <p className="text-muted-foreground">
                        التاريخ: {new Date(m.collectedAt).toLocaleDateString("ar")} · الموثوقية: {Math.round(m.reliability * 100)}%
                      </p>
                      <p className="text-sky-700">
                        الحالة: {DISCOVERY_STATUS_LABELS[m.verificationStatus as VerificationStatus] ?? m.verificationStatus}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">اسم المدير أو المديرة</Label>
                <Input value={form.principalName} onChange={(e) => set("principalName", e.target.value)} placeholder="يُترك فارغاً إن لم يتوفر" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">رقم التواصل</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">عدد الطلاب</Label>
                <Input value={form.studentCount} onChange={(e) => set("studentCount", e.target.value)} inputMode="numeric" placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">المراحل الدراسية</Label>
                <Input value={form.stages} onChange={(e) => set("stages", e.target.value)} placeholder="مثال: ابتدائية ومتوسطة" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">القطاع</Label>
                <Select value={form.sector} onValueChange={(v) => set("sector", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">غير محدد</SelectItem>
                    <SelectItem value="GOVERNMENT">حكومية</SelectItem>
                    <SelectItem value="PRIVATE">أهلية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">نوع المؤسسة</Label>
                <Input value={form.institutionType} onChange={(e) => set("institutionType", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">العنوان التفصيلي</Label>
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">الموقع الإلكتروني</Label>
                <Input value={form.website} onChange={(e) => set("website", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">المنطقة</Label>
                <Select value={form.regionId} onValueChange={(v) => set("regionId", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">غير محددة</SelectItem>
                    {regions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name} — {r.governorate}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">صفحة فيسبوك</Label>
                <Input value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">انستغرام</Label>
                <Input value={form.instagramUrl} onChange={(e) => set("instagramUrl", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">حالة التوفر</Label>
                <Select value={form.availabilityStatus} onValueChange={(v) => set("availabilityStatus", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AVAILABILITY_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">حالة التعاقد</Label>
                <Select value={form.contractStatus} onValueChange={(v) => set("contractStatus", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTRACT_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">حالة توثيق البيانات</Label>
                <Select value={form.discoveryStatus} onValueChange={(v) => set("discoveryStatus", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DISCOVERY_STATUS_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">خط العرض Latitude</Label>
                <Input value={form.lat} onChange={(e) => set("lat", e.target.value)} dir="ltr" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">خط الطول Longitude</Label>
                <Input value={form.lng} onChange={(e) => set("lng", e.target.value)} dir="ltr" inputMode="decimal" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="school-research-notes" className="text-xs">بحث الإدارة وملاحظاتها</Label>
                <Textarea id="school-research-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3}
                  placeholder="العروض والأسعار، رابط المنشور أو مصدر المعلومة وتاريخ التحقق" />
              </div>
            </div>

            <Separator />

            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              أي تعديل يُسجل مصدره «إدخال يدوي من الإدارة» وتاريخه، ولا يحذف سجلات الزيارات السابقة لهذه المدرسة أبداً.
            </p>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
