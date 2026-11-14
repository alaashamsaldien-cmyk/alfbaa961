"use client";

// ——— شريط فلاتر المدارس الشامل — يُحدّث النتائج تلقائياً عند التغيير ———

import { useState } from "react";
import { SlidersHorizontal, RotateCcw, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SchoolsListResponse } from "@/lib/types";

export interface FiltersState {
  q: string;
  governorate: string;
  regionId: string;
  institutionType: string;
  sector: string;
  visitStatus: string;
  contractStatus: string;
  availabilityStatus: string;
  hasPhone: string;
  hasPrincipal: string;
  hasLocation: string;
  verificationStatus: string;
  dataSource: string;
}

export const EMPTY_FILTERS: FiltersState = {
  q: "",
  governorate: "all",
  regionId: "all",
  institutionType: "all",
  sector: "all",
  visitStatus: "all",
  contractStatus: "all",
  availabilityStatus: "all",
  hasPhone: "all",
  hasPrincipal: "all",
  hasLocation: "all",
  verificationStatus: "all",
  dataSource: "all",
};

const BOOL_OPTIONS = [
  { value: "all", label: "الكل" },
  { value: "1", label: "متوفر" },
  { value: "0", label: "غير متوفر" },
];

interface Props {
  filters: FiltersState;
  onChange: (f: FiltersState) => void;
  options: NonNullable<SchoolsListResponse["options"]> | null;
  resultCount: number;
}

export function SchoolsFilters({ filters, onChange, options, resultCount }: Props) {
  const [open, setOpen] = useState(false);
  const set = (k: keyof FiltersState, v: string) => onChange({ ...filters, [k]: v });
  const activeCount = Object.entries(filters).filter(([k, v]) => (k === "q" ? v.trim() !== "" : v !== "all")).length;

  const regionOptions = options
    ? options.regions.filter((r) => filters.governorate === "all" || r.governorate === filters.governorate || !filters.governorate)
    : [];

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Button
          type="button"
          variant={open || activeCount > 0 ? "default" : "outline"}
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="gap-2"
          aria-expanded={open}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          الفلاتر {activeCount > 0 && <span className="rounded-full bg-white/25 px-2 text-xs">{activeCount}</span>}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </Button>

        <Input
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="بحث بالاسم أو العنوان أو المنطقة..."
          className="h-9 min-w-[220px] flex-1 sm:max-w-sm"
          aria-label="بحث نصي في المدارس"
        />

        <p className="ms-auto text-xs font-medium text-muted-foreground">
          {resultCount} {resultCount === 1 ? "مدرسة" : "مدرسة"} مطابقة
        </p>

        {activeCount > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            تصفير
          </Button>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">المحافظة</Label>
            <Select value={filters.governorate} onValueChange={(v) => set("governorate", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المحافظات</SelectItem>
                {(options?.governorates ?? []).map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">المنطقة</Label>
            <Select value={filters.regionId} onValueChange={(v) => set("regionId", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المناطق</SelectItem>
                {regionOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">نوع المؤسسة</Label>
            <Select value={filters.institutionType} onValueChange={(v) => set("institutionType", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {(options?.institutionTypes ?? []).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">أهلية أو حكومية</Label>
            <Select value={filters.sector} onValueChange={(v) => set("sector", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل / غير محدد</SelectItem>
                <SelectItem value="GOVERNMENT">حكومية</SelectItem>
                <SelectItem value="PRIVATE">أهلية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">حالة الزيارة</Label>
            <Select value={filters.visitStatus} onValueChange={(v) => set("visitStatus", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="VISITED">تمت زيارتها</SelectItem>
                <SelectItem value="NOT_VISITED">لم تُزر بعد</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">حالة التعاقد</Label>
            <Select value={filters.contractStatus} onValueChange={(v) => set("contractStatus", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="CONTRACTED">متعاقدة</SelectItem>
                <SelectItem value="NOT_CONTRACTED">غير متعاقدة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">حالة التوفر</Label>
            <Select value={filters.availabilityStatus} onValueChange={(v) => set("availabilityStatus", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="AVAILABLE">متاحة</SelectItem>
                <SelectItem value="UNAVAILABLE">غير متاحة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">حالة توثيق البيانات</Label>
            <Select value={filters.verificationStatus} onValueChange={(v) => set("verificationStatus", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="DISCOVERED">مكتشفة</SelectItem>
                <SelectItem value="NEEDS_VERIFICATION">تحتاج إلى تحقق</SelectItem>
                <SelectItem value="OFFICIALLY_DOCUMENTED">موثقة من مصدر رسمي</SelectItem>
                <SelectItem value="FIELD_CONFIRMED">مؤكدة ميدانياً</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">مصدر السجل</Label>
            <Select value={filters.dataSource} onValueChange={(v) => set("dataSource", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المصادر</SelectItem>
                <SelectItem value="GOOGLE_PLACES">Google Places</SelectItem>
                <SelectItem value="OSM_NOMINATIM">OpenStreetMap (Nominatim)</SelectItem>
                <SelectItem value="OSM_OVERPASS">OpenStreetMap (Overpass)</SelectItem>
                <SelectItem value="EXCEL_IMPORT">استيراد Excel</SelectItem>
                <SelectItem value="CLIENT_KML">خريطة ألف باء الأصلية (KML)</SelectItem>
                <SelectItem value="MANUAL_ENTRY">إدخال يدوي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">وجود رقم هاتف</Label>
            <Select value={filters.hasPhone} onValueChange={(v) => set("hasPhone", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BOOL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">وجود اسم مدير</Label>
            <Select value={filters.hasPrincipal} onValueChange={(v) => set("hasPrincipal", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BOOL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">وجود موقع جغرافي</Label>
            <Select value={filters.hasLocation} onValueChange={(v) => set("hasLocation", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BOOL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
              <Switch
                id="only-missing"
                checked={filters.dataSource === "__missing"}
                onCheckedChange={(c) => set("dataSource", c ? "__missing" : "all")}
                aria-label="إظهار السجلات ذات البيانات الناقصة فقط"
              />
              <Label htmlFor="only-missing" className="cursor-pointer text-xs font-medium">
                السجلات الناقصة فقط
              </Label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
