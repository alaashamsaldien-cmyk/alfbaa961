"use client";

// ——— جدول المدارس — يعرض كل المدارس المسجلة افتراضياً ———

import { MapPin, Pencil, UserRoundPlus, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CONTRACT_LABELS, AVAILABILITY_LABELS } from "@/lib/labels";
import {
  DISCOVERY_STATUS_BADGE,
  DISCOVERY_STATUS_LABELS,
  DATA_SOURCE_LABELS,
  SECTOR_LABELS_UI,
  type SchoolDTO,
} from "@/lib/types";

interface Props {
  schools: SchoolDTO[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onEdit: (s: SchoolDTO) => void;
  onLocate: (s: SchoolDTO) => void;
  onAssign: (s: SchoolDTO) => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function SchoolsTable({ schools, loading, selectedIds, onToggleSelect, onToggleAll, onEdit, onLocate, onAssign }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border bg-white p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (schools.length === 0) {
    return (
      <EmptyState
        title="لا توجد مدارس مطابقة"
        description={
          "قاعدة المدارس فارغة أو لا يوجد سجل مطابق للفلاتر المحددة. استخدم زر «اكتشاف المدارس» لإضافة مدارس حقيقية من مصادر البيانات العامة."
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto nice-scroll">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-10">
                <Checkbox
                  aria-label="تحديد كل الصفوف"
                  checked={selectedIds.size > 0 && selectedIds.size === schools.length}
                  onCheckedChange={(c) => onToggleAll(Boolean(c))}
                />
              </TableHead>
              <TableHead>اسم المدرسة</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>القطاع</TableHead>
              <TableHead>المنطقة</TableHead>
              <TableHead>المدير</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>الطلاب</TableHead>
              <TableHead>التوثيق</TableHead>
              <TableHead>التعاقد</TableHead>
              <TableHead>الزيارة</TableHead>
              <TableHead>المنسقة</TableHead>
              <TableHead className="text-center">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schools.map((s) => (
              <TableRow key={s.id} className="hover:bg-slate-50/70">
                <TableCell>
                  <Checkbox
                    aria-label={`تحديد ${s.name}`}
                    checked={selectedIds.has(s.id)}
                    onCheckedChange={() => onToggleSelect(s.id)}
                  />
                </TableCell>
                <TableCell className="max-w-[240px]">
                  <p className="truncate font-semibold text-foreground" title={s.name}>{s.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground" title={s.address ?? ""}>
                    {s.governorate ?? "—"}
                    {s.dataSource ? ` · ${DATA_SOURCE_LABELS[s.dataSource] ?? s.dataSource}` : ""}
                  </p>
                </TableCell>
                <TableCell className="text-sm">{s.institutionType ?? <span className="text-muted-foreground">غير متوفرة</span>}</TableCell>
                <TableCell className="text-sm">{s.sector ? SECTOR_LABELS_UI[s.sector] : <span className="text-muted-foreground">غير محدد</span>}</TableCell>
                <TableCell className="text-sm">{s.regionName ?? <span className="text-muted-foreground">غير متوفرة</span>}</TableCell>
                <TableCell className="text-sm">{s.principalName ?? <span className="text-muted-foreground">غير متوفرة</span>}</TableCell>
                <TableCell className="text-sm" dir="ltr">{s.phone ?? <span className="text-muted-foreground">غير متوفرة</span>}</TableCell>
                <TableCell className="text-sm">{s.studentCount !== null ? s.studentCount.toLocaleString("ar") : <span className="text-muted-foreground">غير متوفرة</span>}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[11px] ${DISCOVERY_STATUS_BADGE[s.discoveryStatus] ?? ""}`}>
                    {DISCOVERY_STATUS_LABELS[s.discoveryStatus] ?? s.discoveryStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[11px] ${s.contractStatus === "CONTRACTED" ? "bg-green-100 text-green-800 border-green-300" : "bg-slate-100 text-slate-600 border-slate-200"}`}
                  >
                    {CONTRACT_LABELS[s.contractStatus] ?? s.contractStatus}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{s.lastVisitAt ? (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-emerald-700">✓ تمت الزيارة</p>
                    {s.lastVisitorName && <p>{s.lastVisitorName}</p>}
                    <p className="text-muted-foreground">{fmtDate(s.lastVisitAt)}</p>
                  </div>
                ) : <span className="text-muted-foreground">لم تُزر</span>}</TableCell>
                <TableCell className="text-sm">{s.coordinator?.name ?? <span className="text-muted-foreground">غير مخصصة</span>}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onLocate(s)}
                      title={s.hasCoords ? "إظهار الموقع على خريطة النظام" : "لا يوجد موقع جغرافي محفوظ"}
                      disabled={!s.hasCoords}
                    >
                      <MapPin className={`h-4 w-4 ${s.hasCoords ? "text-sky-600" : "text-slate-300"}`} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onEdit(s)}
                      title="تعديل البيانات وتوثيقها"
                    >
                      <Pencil className="h-4 w-4 text-slate-600" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onAssign(s)}
                      title="تخصيص لمنسقة"
                    >
                      <UserRoundPlus className="h-4 w-4 text-slate-600" aria-hidden="true" />
                    </Button>
                    {s.mapsUrl && (
                      <a
                        href={s.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="فتح الموقع على Google Maps"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100"
                      >
                        <ExternalLink className="h-4 w-4 text-slate-600" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
