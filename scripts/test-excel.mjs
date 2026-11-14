// ——— اختبار عملي شامل لطبقة Excel ———
// بيانات حقيقية: مدرسة جديدة من نتائج Nominatim الفعلية + تكرار عمداً + إحداثيات خاطئة.
import * as XLSX from "xlsx";
import { EXCEL_COLUMNS } from "../src/lib/excel-schools";

const BASE = "http://localhost:3000";
let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { failed++; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

async function main() {
  // 1) جلب نتائج اكتشاف حقيقية لاختيار مدرسة جديدة غير مضافة
  const searchRes = await fetch(BASE + "/api/schools/discovery/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "OSM", mode: "AREA", governorate: "بغداد", areaName: "الكاظمية", bounds: { west: 44.32, south: 33.36, east: 44.37, north: 33.41 } }),
  });
  const search = await searchRes.json();
  const fresh = (search.items ?? []).find(i => !i.inSystem && i.similarCandidates.length === 0);
  check("نتيجة حقيقية جديدة من الكاظمية متاحة للاختبار", Boolean(fresh), fresh?.place?.name ?? "");

  const listRes = await fetch(BASE + "/api/schools?pageSize=1");
  const list = await listRes.json();

  // 2) بناء ملف استيراد حقيقي
  const rows = [];
  if (fresh) {
    rows.push({
      "اسم المدرسة": fresh.place.name,
      "المحافظة": "بغداد",
      "المنطقة": fresh.place.regionText ?? "الكاظمية",
      "نوع المؤسسة": "مدرسة",
      "القطاع (حكومية/أهلية)": "",
      "المراحل الدراسية": fresh.place.stages ?? "",
      "اسم المدير": "",
      "رقم التواصل": fresh.place.phone ?? "",
      "عدد الطلاب": "",
      "العنوان التفصيلي": fresh.place.address ?? "",
      "خط العرض Latitude": fresh.place.lat,
      "خط الطول Longitude": fresh.place.lng,
      "الموقع الإلكتروني": fresh.place.website ?? "",
      "صفحة فيسبوك": fresh.place.facebook ?? "",
      "انستغرام": "",
      "ملاحظات": "سجل حقيقي من OpenStreetMap لاختبار الاستيراد",
    });
  }
  // صف مكرر عمداً: مدرسة موجودة في النظام بإحداثياتها الحقيقية نفسها
  const existing = list.schools?.[0];
  if (existing) {
    rows.push({
      "اسم المدرسة": existing.name,
      "المحافظة": "بغداد",
      "المنطقة": "",
      "نوع المؤسسة": "مدرسة",
      "القطاع (حكومية/أهلية)": "",
      "المراحل الدراسية": "",
      "اسم المدير": "",
      "رقم التواصل": "",
      "عدد الطلاب": "",
      "العنوان التفصيلي": "",
      "خط العرض Latitude": existing.lat,
      "خط الطول Longitude": existing.lng,
      "الموقع الإلكتروني": "",
      "صفحة فيسبوك": "",
      "انستغرام": "",
      "ملاحظات": "",
    });
  }
  // صف بإحداثيات خاطئة (خارج العراق) — يجب رفضه
  rows.push({
    "اسم المدرسة": "مدرسة إحداثيات خاطئة (اختبار تحقق)",
    "المحافظة": "بغداد",
    "المنطقة": "",
    "نوع المؤسسة": "مدرسة",
    "القطاع (حكومية/أهلية)": "",
    "المراحل الدراسية": "",
    "اسم المدير": "",
    "رقم التواصل": "",
    "عدد الطلاب": "",
    "العنوان التفصيلي": "",
    "خط العرض Latitude": 33.3,
    "خط الطول Longitude": 99.9,
    "الموقع الإلكتروني": "",
    "صفحة فيسبوك": "",
    "انستغرام": "",
    "ملاحظات": "",
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "المدارس");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const file = new File([buf], "اختبار_الاستيراد.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  // 3) النموذج الرسمي
  const tplRes = await fetch(BASE + "/api/schools/excel/template");
  const tplBuf = Buffer.from(await tplRes.arrayBuffer());
  const tplWb = XLSX.read(tplBuf, { type: "buffer" });
  check("تنزيل النموذج الرسمي (xlsx سليم)", tplRes.ok && tplWb.SheetNames.includes("المدارس"), `أوراق: ${tplWb.SheetNames.join(", ")}`);
  const tplCols = XLSX.utils.sheet_to_json(tplWb.Sheets["المدارس"], { header: 1 })[0];
  check("أعمدة النموذج مطابقة لحقول النظام", tplCols?.includes("اسم المدرسة") && tplCols?.includes("خط العرض Latitude"), `${tplCols?.length} عمود`);

  // 4) معاينة الاستيراد — كشف التكرار والتحقق من الإحداثيات والحقول الناقصة
  const fd1 = new FormData();
  fd1.append("file", file);
  const prevRes = await fetch(BASE + "/api/schools/excel/import/preview", { method: "POST", body: fd1 });
  const prev = await prevRes.json();
  check("معاينة الاستيراد تعمل", prevRes.ok, `إجمالي ${prev.totalRows} صف`);
  check("كشف التكرار (الصف المكرر عمداً)", prev.rows?.some(r => r.status === "DUPLICATE"), prev.rows?.find(r => r.status === "DUPLICATE")?.duplicate?.schoolName ?? "");
  check("رفض الإحداثيات خارج العراق", prev.rows?.some(r => r.status === "ERROR"), "");
  check("تقرير الحقول الناقصة لكل صف", prev.rows?.every(r => Array.isArray(r.missingFields)), "");
  const before = (await (await fetch(BASE + "/api/schools?pageSize=1")).json()).total;

  // 5) تنفيذ الاستيراد دون أي موافقة على التحديث — المكرر يُتجاهل
  const fd2 = new FormData();
  fd2.append("file", file);
  fd2.append("allowUpdate", "false");
  fd2.append("forceAddSimilar", "false");
  const commitRes = await fetch(BASE + "/api/schools/excel/import/commit", { method: "POST", body: fd2 });
  const commit = await commitRes.json();
  check("تنفيذ الاستيراد (إضافة الصف الصالح فقط)", commitRes.ok && commit.added === (fresh ? 1 : 0), `أضاف ${commit.added} · تجاهل ${commit.skipped} · أخطاء ${commit.errors}`);
  const after = (await (await fetch(BASE + "/api/schools?pageSize=1")).json()).total;
  check("العدد في النظام زاد بمقدار الصف الصالح فقط", after === before + (fresh ? 1 : 0), `${before} → ${after}`);

  // 6) التصدير — ملف سليم يحوي المدارس
  const expRes = await fetch(BASE + "/api/schools/excel/export");
  const expBuf = Buffer.from(await expRes.arrayBuffer());
  const expWb = XLSX.read(expBuf, { type: "buffer" });
  const expRows = XLSX.utils.sheet_to_json(expWb.Sheets["المدارس"]);
  check("تصدير المدارس إلى Excel", expRes.ok && expRows.length === after, `${expRows.length} صف`);

  // 7) سجل الاستيراد محفوظ
  check("سجل عملية الاستيراد (ImportLog)", Boolean(commit.importLogId), commit.importLogId?.slice(0, 10));

  console.log(`\n========== النتيجة: ${passed} نجاح، ${failed} فشل ==========`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("خطأ:", e); process.exit(1); });
