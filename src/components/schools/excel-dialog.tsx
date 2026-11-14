"use client";

// ——— نافذة Excel: تنزيل النموذج الرسمي، استيراد بمعاينة، تصدير ———
// الاستيراد لا يحذف ولا يستبدل بيانات موجودة إلا بموافقة صريحة عبر خيار التحديث.

import { useCallback, useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { ImportPreview } from "@/lib/excel-schools";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  exportQuery: string; // سلسلة فلاتر القائمة الحالية لإعادة استخدامها في التصدير
  onImported: () => void;
}

interface ImportCommitResult {
  importLogId: string;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  details: string[];
}

export function ExcelDialog({ open, onOpenChange, exportQuery, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [allowUpdate, setAllowUpdate] = useState(false);
  const [forceAddSimilar, setForceAddSimilar] = useState(false);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const pickFile = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    if (f) doPreview(f);
  };

  const doPreview = useCallback(async (f: File) => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/schools/excel/import/preview", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر قراءة الملف");
      setPreview(j as ImportPreview);
    } catch (e) {
      toast({ title: "تعذر المعاينة", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const commit = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("allowUpdate", String(allowUpdate));
      fd.append("forceAddSimilar", String(forceAddSimilar));
      const res = await fetch("/api/schools/excel/import/commit", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "تعذر تنفيذ الاستيراد");
      setResult(j as ImportCommitResult);
      toast({
        title: "تم تنفيذ الاستيراد",
        description: `إضافة ${j.added} · استكمال ${j.updated} · تجاهل ${j.skipped} · أخطاء ${j.errors}`,
      });
      onImported();
    } catch (e) {
      toast({ title: "فشل الاستيراد", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "VALID": return <Badge className="gap-1 bg-green-100 text-green-800 border-green-300"><CheckCircle2 className="h-3 w-3" />صالح للإضافة</Badge>;
      case "DUPLICATE": return <Badge className="gap-1 bg-slate-100 text-slate-700 border-slate-200"><XCircle className="h-3 w-3" />مكرر</Badge>;
      case "SIMILAR": return <Badge className="gap-1 bg-amber-50 text-amber-700 border-amber-200"><HelpCircle className="h-3 w-3" />مشابه — يحتاج مراجعة</Badge>;
      default: return <Badge className="gap-1 bg-red-50 text-red-700 border-red-200"><AlertTriangle className="h-3 w-3" />خطأ</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-sky-600" aria-hidden="true" />
            ملفات Excel — النموذج الرسمي والاستيراد والتصدير
          </DialogTitle>
          <DialogDescription>
            قاعدة العمل: الاستيراد يضيف سجلات جديدة فقط، ولا يحذف أو يستبدل أي بيانات موجودة دون موافقة صريحة.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] pe-3">
          <div className="space-y-4">
            {/* النموذج الرسمي */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-sky-50/50 p-3">
              <div>
                <p className="text-sm font-bold">نموذج Excel الرسمي</p>
                <p className="text-xs text-muted-foreground">املأ ورقة «المدارس» داخل النموذج ثم استورده هنا.</p>
              </div>
              <a href="/api/schools/excel/template" download>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  تنزيل النموذج
                </Button>
              </a>
            </div>

            <Separator />

            {/* الاستيراد */}
            <div className="space-y-3">
              <p className="text-sm font-bold">استيراد المدارس من Excel</p>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="max-w-sm"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  aria-label="اختر ملف Excel للاستيراد"
                />
                <a href={`/api/schools/excel/export?${exportQuery}`} download>
                  <Button type="button" variant="outline" size="sm" className="gap-2">
                    <Download className="h-4 w-4" aria-hidden="true" />
                    تصدير المدارس الحالية (بالفلاتر المطبقة)
                  </Button>
                </a>
              </div>

              {loading && <p className="text-xs text-sky-700">جارٍ المعالجة...</p>}

              {preview && !preview.columnMapping && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{preview.mappingNote}</p>
              )}

              {preview && preview.columnMapping && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">إجمالي الصفوف: {preview.totalRows}</Badge>
                    <Badge className="bg-green-100 text-green-800 border-green-300">صالح: {preview.validCount}</Badge>
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200">مكرر: {preview.duplicateCount}</Badge>
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200">مشابه: {preview.similarCount}</Badge>
                    <Badge className="bg-red-50 text-red-700 border-red-200">خطأ: {preview.errorCount}</Badge>
                  </div>

                  <div className="overflow-hidden rounded-lg border">
                    <div className="max-h-64 overflow-y-auto nice-scroll">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            <th className="p-2 text-start">الصف</th>
                            <th className="p-2 text-start">الاسم</th>
                            <th className="p-2 text-start">الحالة</th>
                            <th className="p-2 text-start">الملاحظات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rows.slice(0, 100).map((r) => (
                            <tr key={r.rowNumber} className="border-t">
                              <td className="p-2">{r.rowNumber}</td>
                              <td className="max-w-[180px] truncate p-2">{String(r.data.name ?? "—")}</td>
                              <td className="p-2">{statusBadge(r.status)}</td>
                              <td className="p-2 text-muted-foreground">
                                {r.issues.join(" ")}
                                {r.duplicate && ` — يشابه «${r.duplicate.schoolName}»`}
                                {r.missingFields.length > 0 && ` — حقول ناقصة: ${r.missingFields.length}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      خيارات حساسة — إفتراضياً كلها معطلة
                    </p>
                    <div className="flex items-center gap-2">
                      <Switch id="allow-update" checked={allowUpdate} onCheckedChange={setAllowUpdate} />
                      <Label htmlFor="allow-update" className="text-xs">
                        الموافقة الصريحة: استكمال الحقول الناقصة في السجلات المطابقة (لا يحدث استبدال لقيمة موجودة)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id="force-similar" checked={forceAddSimilar} onCheckedChange={setForceAddSimilar} />
                      <Label htmlFor="force-similar" className="text-xs">
                        إضافة السجلات المتشابهة كسجلات جديدة مستقلة (بعد مراجعتي)
                      </Label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {result && (
              <div className="rounded-lg border bg-white p-3">
                <p className="mb-1.5 text-sm font-bold">نتيجة الاستيراد الأخير</p>
                <p className="text-xs text-muted-foreground">
                  إضافة {result.added} · استكمال {result.updated} · تجاهل {result.skipped} · أخطاء {result.errors}
                </p>
                {result.details.length > 0 && (
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto nice-scroll text-[11px] text-muted-foreground">
                    {result.details.slice(0, 30).map((d, i) => (
                      <li key={i}>• {d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button
            type="button"
            onClick={commit}
            disabled={!preview || loading || (preview?.validCount ?? 0) + (preview?.similarCount ?? 0) === 0 || (!allowUpdate && (preview?.duplicateCount ?? 0) > 0 && false)}
          >
            <Upload className="me-1.5 h-4 w-4" aria-hidden="true" />
            تنفيذ الاستيراد ({preview?.validCount ?? 0} + {preview?.similarCount ?? 0} مشابه)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
