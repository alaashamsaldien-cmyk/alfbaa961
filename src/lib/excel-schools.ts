// ——— طبقة Excel للمدارس: نموذج رسمي + تصدير + استيراد بمعاينة وكشف تكرار ———
// قواعد ثابتة:
//  - الاستيراد لا يحذف ولا يستبدل أي بيانات موجودة إلا بموافقة صريحة (خيار تحديث السجلات المطابقة).
//  - كل صف يُفحص: الحقول الناقصة + صحة الإحداثيات + التكرار (تطابق دقيق بالموقع أو معرف المصدر، ومشابهة بالاسم).
//  - أسماء الأعمدة بالعربية وتطابق النموذج الرسمي القابل للتنزيل.

import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { isInsideIraq } from "@/lib/geo/iraq";
import {
  computeDataQuality,
  nameSimilarity,
  normalizeArabic,
  googleMapsUrl,
  SOURCE_LABELS,
} from "@/lib/geo/normalize";
import { buildFieldEntry, type FieldMeta } from "@/lib/geo/normalize";

export const EXCEL_COLUMNS: { key: string; label: string; required?: boolean }[] = [
  { key: "name", label: "اسم المدرسة", required: true },
  { key: "governorate", label: "المحافظة" },
  { key: "region", label: "المنطقة" },
  { key: "institutionType", label: "نوع المؤسسة" },
  { key: "sector", label: "القطاع (حكومية/أهلية)" },
  { key: "stages", label: "المراحل الدراسية" },
  { key: "principalName", label: "اسم المدير" },
  { key: "phone", label: "رقم التواصل" },
  { key: "studentCount", label: "عدد الطلاب" },
  { key: "address", label: "العنوان التفصيلي" },
  { key: "lat", label: "خط العرض Latitude" },
  { key: "lng", label: "خط الطول Longitude" },
  { key: "website", label: "الموقع الإلكتروني" },
  { key: "facebookUrl", label: "صفحة فيسبوك" },
  { key: "instagramUrl", label: "انستغرام" },
  { key: "notes", label: "ملاحظات" },
];

const EXPORT_EXTRA_COLUMNS = [
  { key: "availabilityStatus", label: "حالة التوفر" },
  { key: "contractStatus", label: "حالة التعاقد" },
  { key: "lastVisit", label: "آخر زيارة" },
  { key: "coordinator", label: "المنسقة المسؤولة" },
  { key: "discoveryStatus", label: "حالة التوثيق" },
  { key: "dataSource", label: "مصدر السجل" },
  { key: "dataQuality", label: "درجة الاكتمال" },
  { key: "createdAt", label: "تاريخ الإضافة" },
];

function sectorFromLabel(v: string | null | undefined): string | null {
  const n = normalizeArabic(v);
  if (!n) return null;
  if (n.includes("حكوم") || n.includes("رسمي")) return "GOVERNMENT";
  if (n.includes("اهل") || n.includes("خاص")) return "PRIVATE";
  return null;
}

function sectorToLabel(s: string | null | undefined): string {
  if (s === "GOVERNMENT") return "حكومية";
  if (s === "PRIVATE") return "أهلية";
  return "";
}

function parseCoord(v: unknown): number | null | "INVALID" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,\-]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return "INVALID";
  return n;
}

// ——— النموذج الرسمي ———

export function buildTemplateWorkbook(): Buffer {
  const rows = EXCEL_COLUMNS.map((c) => ({ العمود: c.label, مطلوب: c.required ? "نعم" : "اختياري", توضيح: hintFor(c.key) }));
  const example = {
    "اسم المدرسة": "ثانوية المتميزين في الحارثية للبنين",
    "المحافظة": "بغداد",
    "المنطقة": "الحارثية",
    "نوع المؤسسة": "مدرسة",
    "القطاع (حكومية/أهلية)": "حكومية",
    "المراحل الدراسية": "ثانوية",
    "اسم المدير": "",
    "رقم التواصل": "",
    "عدد الطلاب": "",
    "العنوان التفصيلي": "",
    "خط العرض Latitude": 33.3182,
    "خط الطول Longitude": 44.4475,
    "الموقع الإلكتروني": "",
    "صفحة فيسبوك": "",
    "انستغرام": "",
    "ملاحظات": "",
  };
  const ws = XLSX.utils.json_to_sheet(rows, { header: ["العمود", "مطلوب", "توضيح"] });
  const wsData = XLSX.utils.json_to_sheet([example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تعليمات");
  XLSX.utils.book_append_sheet(wb, wsData, "المدارس");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function hintFor(key: string): string {
  const hints: Record<string, string> = {
    name: "اسم المؤسسة التعليمية كما هو معروف رسمياً — الحقل الوحيد الإجباري",
    governorate: "من محافظات العراق الثمان عشرة",
    region: "المنطقة أو الحي",
    institutionType: "مدرسة / روضة أطفال / كلية أو معهد / جامعة / مركز دورات وتدريب / مركز لغات",
    sector: "اكتب: حكومية أو أهلية — اتركه فارغاً إذا لم يتأكد",
    stages: "مثال: ابتدائية ومتوسطة",
    principalName: "لا تكتب اسمًا غير مؤكد — اتركه فارغاً إن لم يتوفر",
    phone: "رقم هاتف فعلي فقط",
    studentCount: "رقم صحيح — لا تكتب تقديرات",
    address: "العنوان التفصيلي",
    lat: "رقم عشري مثل 33.3182 — يجب أن يكون ضمن العراق",
    lng: "رقم عشري مثل 44.4475 — يجب أن يكون ضمن العراق",
    website: "الرابط الكامل",
    facebookUrl: "رابط الصفحة الرسمية",
    instagramUrl: "رابط الحساب الرسمي",
    notes: "أي ملاحظات إضافية",
  };
  return hints[key] ?? "";
}

// ——— التصدير ———

export async function buildExportWorkbook(filtersWhere: Record<string, unknown>): Promise<Buffer> {
  const schools = await db.school.findMany({
    where: filtersWhere as never,
    include: { region: true, coordinator: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 5000,
  });
  const rows = schools.map((s) => {
    const base: Record<string, string | number | null> = {};
    for (const c of EXCEL_COLUMNS) {
      switch (c.key) {
        case "name": base[c.label] = s.name; break;
        case "governorate": base[c.label] = s.governorate; break;
        case "region": base[c.label] = s.region?.name ?? s.regionText ?? null; break;
        case "institutionType": base[c.label] = s.institutionType; break;
        case "sector": base[c.label] = sectorToLabel(s.sector); break;
        case "stages": base[c.label] = s.stages; break;
        case "principalName": base[c.label] = s.principalName; break;
        case "phone": base[c.label] = s.phone; break;
        case "studentCount": base[c.label] = s.studentCount; break;
        case "address": base[c.label] = s.address; break;
        case "lat": base[c.label] = s.lat; break;
        case "lng": base[c.label] = s.lng; break;
        case "website": base[c.label] = s.website; break;
        case "facebookUrl": base[c.label] = s.facebookUrl; break;
        case "instagramUrl": base[c.label] = s.instagramUrl; break;
        case "notes": base[c.label] = s.notes; break;
      }
    }
    for (const c of EXPORT_EXTRA_COLUMNS) {
      switch (c.key) {
        case "availabilityStatus": base[c.label] = s.availabilityStatus === "AVAILABLE" ? "متاحة" : "غير متاحة"; break;
        case "contractStatus": base[c.label] = s.contractStatus === "CONTRACTED" ? "متعاقدة" : "غير متعاقدة"; break;
        case "lastVisit": base[c.label] = s.lastVisitAt ? s.lastVisitAt.toISOString().slice(0, 10) : null; break;
        case "coordinator": base[c.label] = s.coordinator?.name ?? null; break;
        case "discoveryStatus": base[c.label] = s.discoveryStatus; break;
        case "dataSource": base[c.label] = s.dataSource; break;
        case "dataQuality": base[c.label] = s.dataQuality; break;
        case "createdAt": base[c.label] = s.createdAt.toISOString().slice(0, 10); break;
      }
    }
    return base;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "المدارس");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ——— قراءة ملف الاستيراد ———

export interface ImportRowPreview {
  rowNumber: number;
  data: Record<string, string | number | null>;
  issues: string[];
  missingFields: string[];
  duplicate?: { type: "EXACT" | "SIMILAR"; schoolId: string; schoolName: string; similarity?: number; distanceM?: number | null };
  status: "VALID" | "DUPLICATE" | "SIMILAR" | "ERROR";
}

export interface ImportPreview {
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  similarCount: number;
  errorCount: number;
  rows: ImportRowPreview[];
  columnMapping: Record<string, string> | null;
  mappingNote?: string;
}

function mapColumns(headers: string[]): Record<string, string> | null {
  // مطابقة عناوين الملف بأعمدة النموذج (تطبيع عربي)
  const mapping: Record<string, string> = {};
  for (const c of EXCEL_COLUMNS) {
    const norm = normalizeArabic(c.label);
    const hit = headers.find((h) => {
      const hn = normalizeArabic(h);
      return hn === norm || hn.includes(norm) || norm.includes(hn);
    });
    if (hit) mapping[c.key] = hit;
  }
  if (!mapping.name) return null; // العمود الإجباري غير موجود
  return mapping;
}

export async function previewImport(fileName: string, buffer: Buffer): Promise<ImportPreview> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  // اختر الورقة التي تحتوي عمود اسم المدرسة
  let sheetName = wb.SheetNames[0];
  let headers: string[] = [];
  let json: Record<string, unknown>[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    if (rows.length === 0) continue;
    const hs = Object.keys(rows[0]);
    if (hs.some((h) => normalizeArabic(h).includes("اسم المدرسه") || normalizeArabic(h).includes("اسم المدرسة"))) {
      sheetName = name;
      headers = hs;
      json = rows;
      break;
    }
  }
  if (headers.length === 0) {
    const ws = wb.Sheets[sheetName];
    json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    if (json.length > 0) headers = Object.keys(json[0]);
  }
  const mapping = mapColumns(headers);
  if (!mapping) {
    return {
      totalRows: 0,
      validCount: 0,
      duplicateCount: 0,
      similarCount: 0,
      errorCount: 0,
      rows: [],
      columnMapping: null,
      mappingNote: "لم يُعثر على عمود «اسم المدرسة». استخدم النموذج الرسمي أو تأكد من العناوين.",
    };
  }

  // كل المدارس الحالية لفحص التكرار
  const existing = await db.school.findMany({
    select: { id: true, name: true, lat: true, lng: true, placeId: true, osmType: true, osmId: true },
    take: 5000,
  });

  const rows: ImportRowPreview[] = [];
  let valid = 0;
  let dup = 0;
  let sim = 0;
  let err = 0;

  for (let i = 0; i < json.length; i++) {
    const rowNumber = i + 2; // الصف 1 للعناوين
    const r = json[i];
    const get = (key: string) => {
      const col = mapping[key];
      if (!col) return null;
      const v = r[col];
      if (v === null || v === undefined) return null;
      return typeof v === "string" ? v.trim() : v;
    };

    const data: Record<string, string | number | null> = {};
    for (const c of EXCEL_COLUMNS) {
      const v = get(c.key);
      data[c.key] = v === undefined ? null : (v as string | number | null);
    }

    const issues: string[] = [];
    const missingFields: string[] = [];

    const name = data.name ? String(data.name) : null;
    if (!name) {
      issues.push("اسم المدرسة مفقود — الصف مرفوض.");
      err++;
      rows.push({ rowNumber, data, issues, missingFields: ["name"], status: "ERROR" });
      continue;
    }

    for (const c of EXCEL_COLUMNS) {
      if (data[c.key] === null || data[c.key] === "") missingFields.push(c.key);
    }

    // فحص الإحداثيات
    const lat = parseCoord(data.lat);
    const lng = parseCoord(data.lng);
    if (lat === "INVALID") issues.push("قيمة خط العرض غير صحيحة (يجب أن تكون رقماً عشرياً).");
    if (lng === "INVALID") issues.push("قيمة خط الطول غير صحيحة (يجب أن تكون رقماً عشرياً).");
    const validCoords = typeof lat === "number" && typeof lng === "number";
    if (validCoords && !isInsideIraq(lat, lng)) {
      issues.push("الإحداثيات خارج حدود العراق — يُرفض الحفظ.");
      err++;
      rows.push({ rowNumber, data, issues, missingFields, status: "ERROR" });
      continue;
    }
    if (lat === null || lng === null) issues.push("الإحداثيات ناقصة — لن تظهر المدرسة على الخريطة.");

    if (data.phone) {
      const p = String(data.phone);
      if (!/^[\d\s+\-()]+$/.test(p)) issues.push("رقم التواصل يحتوي رموزاً غير رقمية.");
    }

    // فحص التكرار
    let duplicate: ImportRowPreview["duplicate"] | undefined;
    // 1) تطابق دقيق بالإحداثيات (أقل من 60 متراً) أو بالمعرفات
    for (const s of existing) {
      if (s.lat !== null && s.lng !== null && validCoords) {
        const R = 6371000;
        const toRad = (v: number) => (v * Math.PI) / 180;
        const dLat = toRad(s.lat - lat as number);
        const dLng = toRad(s.lng - lng as number);
        const ds = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat)) * Math.sin(dLng / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.sqrt(ds));
        if (dist <= 60) {
          duplicate = { type: "EXACT", schoolId: s.id, schoolName: s.name, distanceM: Math.round(dist) };
          break;
        }
      }
      const simName = nameSimilarity(name, s.name);
      if (simName >= 0.9) {
        duplicate = { type: "SIMILAR", schoolId: s.id, schoolName: s.name, similarity: simName };
        break;
      }
    }

    let status: ImportRowPreview["status"] = "VALID";
    if (issues.some((x) => x.includes("يُرفض"))) status = "ERROR";
    else if (duplicate) {
      status = duplicate.type === "EXACT" ? "DUPLICATE" : "SIMILAR";
      if (status === "DUPLICATE") dup++;
      else sim++;
    } else valid++;

    if (status === "VALID" && issues.length > 0) {
      // تحذيرات لا تمنع الإضافة
    }

    rows.push({ rowNumber, data, issues, missingFields, duplicate, status });
  }

  return {
    totalRows: json.length,
    validCount: valid,
    duplicateCount: dup,
    similarCount: sim,
    errorCount: err,
    rows,
    columnMapping: mapping,
  };
}

// ——— التنفيذ الفعلي للاستيراد ———

export interface ImportCommitOptions {
  fileName: string;
  buffer: Buffer;
  /** تحديث السجلات المطابقة — يتطلب موافقة صريحة من الواجهة */
  allowUpdate: boolean;
  /** تجاهل المشابهة وإضافتها كسجلات جديدة */
  forceAddSimilar: boolean;
  userId: string;
}

export interface ImportCommitResult {
  importLogId: string;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  details: string[];
}

export async function commitImport(opts: ImportCommitOptions): Promise<ImportCommitResult> {
  const preview = await previewImport(opts.fileName, opts.buffer);
  const details: string[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of preview.rows) {
    if (row.status === "ERROR") {
      errors++;
      details.push(`الصف ${row.rowNumber}: ${row.issues.join(" ")}`);
      continue;
    }
    if (row.status === "DUPLICATE") {
      if (!opts.allowUpdate) {
        skipped++;
        details.push(`الصف ${row.rowNumber}: مكرر مع «${row.duplicate?.schoolName}» — تم تجاهله (التحديث غير مصرح به).`);
        continue;
      }
      // تحديث السجل الموجود بالبيانات الناقصة فقط — لا نستبدل قيمة موجودة بقيمة فارغة
      const d = row.data;
      const upd: Record<string, unknown> = {};
      const school = await db.school.findUnique({ where: { id: row.duplicate!.schoolId } });
      if (!school) continue;
      const pairs: [string, unknown, unknown][] = [
        ["phone", d.phone, school.phone],
        ["principalName", d.principalName, school.principalName],
        ["address", d.address, school.address],
        ["stages", d.stages, school.stages],
        ["website", d.website, school.website],
        ["facebookUrl", d.facebookUrl, school.facebookUrl],
        ["instagramUrl", d.instagramUrl, school.instagramUrl],
        ["studentCount", d.studentCount !== null && d.studentCount !== "" ? Number(d.studentCount) : null, school.studentCount],
        ["sector", sectorFromLabel(d.sector ? String(d.sector) : null), school.sector],
      ];
      const changed: string[] = [];
      for (const [key, incoming, current] of pairs) {
        if (incoming !== null && incoming !== "" && (current === null || current === undefined || current === "")) {
          upd[key] = incoming;
          changed.push(key);
        }
      }
      if (Object.keys(upd).length > 0) {
        const old: FieldMeta = school.fieldMeta ? JSON.parse(school.fieldMeta) : {};
        const metaUpdates: FieldMeta = {};
        for (const f of changed) {
          metaUpdates[f] = buildFieldEntry({ source: "EXCEL_IMPORT", reliability: 0.6, verificationStatus: "NEEDS_VERIFICATION" });
        }
        upd.fieldMeta = JSON.stringify(mergeFieldMeta(old, metaUpdates));
        await db.school.update({ where: { id: school.id }, data: upd as never });
        updated++;
        details.push(`الصف ${row.rowNumber}: تم استكمال حقول ناقصة في «${school.name}»: ${changed.join("، ")}.`);
      } else {
        skipped++;
        details.push(`الصف ${row.rowNumber}: لا توجد حقول جديدة لاستكمالها في «${school.name}».`);
      }
      continue;
    }
    if (row.status === "SIMILAR" && !opts.forceAddSimilar) {
      skipped++;
      details.push(`الصف ${row.rowNumber}: مشابه لـ «${row.duplicate?.schoolName}» — يحتاج مراجعة يدوية ولم يُضف.`);
      continue;
    }

    // إضافة سجل جديد
    const d = row.data;
    const lat = parseCoord(d.lat);
    const lng = parseCoord(d.lng);
    const gov = d.governorate ? String(d.governorate).trim() : "بغداد";
    const regionName = d.region ? String(d.region).trim() : null;
    let regionId: string | null = null;
    if (regionName) {
      const region = await db.region.findFirst({ where: { name: regionName, governorate: gov } });
      regionId = region?.id ?? (await db.region.create({ data: { name: regionName, governorate: gov } })).id;
    }
    const latNum = typeof lat === "number" ? lat : null;
    const lngNum = typeof lng === "number" ? lng : null;
    const studentCount = d.studentCount !== null && d.studentCount !== "" ? Number(d.studentCount) : null;
    const typeLabel = d.institutionType ? String(d.institutionType).trim() : "مدرسة";

    const meta: FieldMeta = {};
    for (const c of EXCEL_COLUMNS) {
      const v = d[c.key];
      if (v !== null && v !== "") {
        meta[c.key] = buildFieldEntry({ source: "EXCEL_IMPORT", reliability: 0.6, verificationStatus: "NEEDS_VERIFICATION" });
      }
    }

    const created = await db.school.create({
      data: {
        name: String(d.name),
        governorate: gov,
        regionId,
        regionText: regionName,
        institutionType: typeLabel,
        stage: d.stages ? String(d.stages) : null,
        principalName: d.principalName ? String(d.principalName) : null,
        phone: d.phone ? String(d.phone) : null,
        address: d.address ? String(d.address) : null,
        studentCount: studentCount !== null && Number.isFinite(studentCount) ? studentCount : null,
        sector: sectorFromLabel(d.sector ? String(d.sector) : null),
        website: d.website ? String(d.website) : null,
        facebookUrl: d.facebookUrl ? String(d.facebookUrl) : null,
        instagramUrl: d.instagramUrl ? String(d.instagramUrl) : null,
        notes: d.notes ? String(d.notes) : null,
        lat: latNum,
        lng: lngNum,
        locationUrl: latNum !== null && lngNum !== null ? googleMapsUrl(latNum, lngNum) : null,
        dataSource: "EXCEL_IMPORT",
        discoveryStatus: "NEEDS_VERIFICATION",
        fieldMeta: JSON.stringify(meta),
        dataQuality: computeDataQuality({
          phone: d.phone ? String(d.phone) : null,
          principalName: d.principalName ? String(d.principalName) : null,
          lat: latNum,
          lng: lngNum,
          institutionType: typeLabel,
          sector: sectorFromLabel(d.sector ? String(d.sector) : null),
          regionText: regionName,
          studentCount: studentCount,
          stages: d.stages ? String(d.stages) : null,
          website: d.website ? String(d.website) : null,
          address: d.address ? String(d.address) : null,
          facebookUrl: d.facebookUrl ? String(d.facebookUrl) : null,
          instagramUrl: d.instagramUrl ? String(d.instagramUrl) : null,
        }),
      },
    });
    added++;
  }

  const log = await db.importLog.create({
    data: {
      fileName: opts.fileName,
      fileType: "XLSX",
      uploadedById: opts.userId,
      totalRows: preview.totalRows,
      addedCount: added,
      skippedCount: skipped,
      errorCount: errors,
      status: errors === 0 ? (added > 0 || updated > 0 ? "COMPLETED" : "FAILED") : "PARTIAL",
      details: JSON.stringify(details),
    },
  });

  if (added > 0 || updated > 0) {
    await db.notification.create({
      data: {
        title: "استيراد مدارس من Excel",
        message: `تم استيراد «${opts.fileName}»: إضافة ${added} مدرسة، استكمال ${updated} سجل، تجاهل ${skipped} صف، أخطاء ${errors}.`,
        type: added > 0 ? "SUCCESS" : "INFO",
      },
    });
  }

  return { importLogId: log.id, added, updated, skipped, errors, details };
}

import { mergeFieldMeta } from "@/lib/geo/normalize";
export { SOURCE_LABELS };
