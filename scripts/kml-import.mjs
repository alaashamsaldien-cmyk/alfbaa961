#!/usr/bin/env node
/**
 * استيراد مدارس خريطة ألف باء الأصلية (KML) إلى قاعدة البيانات المركزية.
 * المبادئ الملتزَم بها:
 *  - لا تخمين ولا بيانات وهمية: الحقول غير المتوفرة تبقى فارغة، والمدارس بلا إحداثيات
 *    تُستورد بلا إحداثيات وتُعلّم للتحقق الميداني.
 *  - لا تعديل ولا حذف لبيانات موجودة: السجلات المطابقة لأسماء موجودة تُتخطى وتُدرج
 *    في تقرير المراجعة اليدوية (لا دمج تلقائي).
 *  - توثيق كل حقل بمصدره وتاريخه ومستوى تحققه (fieldMeta) ودرجة اكتمال فعلية (dataQuality).
 *  - تسجيل العملية في ImportLog وإشعار للإدارة.
 */
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const schools = JSON.parse(fs.readFileSync("/tmp/kml-schools-geo.json", "utf-8"));
const NOW = new Date();
const NOW_ISO = NOW.toISOString();
const MAP_FILE = "خريطة مدارس بغداد الأهلية – ألف باء.kml";

// ——— أدوات التطبيع والمقارنة (نسخة مطابقة لمنطق المنصة في normalize.ts) ———
function normalizeArabic(input) {
  if (!input) return "";
  let s = input.trim().toLowerCase();
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
  s = s.replace(/[أإآٱ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
  s = s.replace(/ة/g, "ه").replace(/ى/g, "ي");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
function stripArticle(s) {
  return s.split(" ").map((w) => (w.startsWith("ال") && w.length > 3 ? w.slice(2) : w)).join(" ");
}
function trigrams(s) {
  const set = new Set();
  const t = s.replace(/\s/g, "");
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}
function nameSimilarity(a, b) {
  const na = stripArticle(normalizeArabic(a));
  const nb = stripArticle(normalizeArabic(b));
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = trigrams(na), gb = trigrams(nb);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}
function inferStageFromName(name) {
  const n = normalizeArabic(name);
  const pairs = [
    [/روضه|رياض اطفال/, "رياض أطفال"],
    [/ابتدائيه/, "ابتدائية"],
    [/متوسطه/, "متوسطة"],
    [/ثانويه|متميزين/, "ثانوية"],
    [/معهد/, "معهد"],
    [/كليه/, "كلية"],
    [/جامعه/, "جامعة"],
  ];
  for (const [re, stage] of pairs) if (re.test(n)) return stage;
  return null;
}
function computeDataQuality(f) {
  const W = { phone: 18, principalName: 18, lat: 12, institutionType: 10, sector: 8, regionText: 8, studentCount: 10, stages: 6, website: 5, address: 8, facebookUrl: 3, instagramUrl: 2 };
  let s = 0;
  if (f.phone) s += W.phone;
  if (f.principalName) s += W.principalName;
  if (f.lat !== null && f.lat !== undefined && f.lng !== null && f.lng !== undefined) s += W.lat;
  if (f.institutionType) s += W.institutionType;
  if (f.sector) s += W.sector;
  if (f.regionText) s += W.regionText;
  if (f.studentCount !== null && f.studentCount !== undefined) s += W.studentCount;
  if (f.stages) s += W.stages;
  if (f.website) s += W.website;
  if (f.address) s += W.address;
  if (f.facebookUrl) s += W.facebookUrl;
  if (f.instagramUrl) s += W.instagramUrl;
  return Math.min(100, s);
}
function googleMapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

const CLEAN = (v) => {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (t === "غير متوفر" || t === "غير متوفرة" || t === "-") return null;
  return t;
};

// مستوى التحقق من الخريطة → حالة التوثيق ودرجة الموثوقية
function mapVerification(v) {
  if (v === "مؤكد") return { status: "OFFICIALLY_DOCUMENTED", reliability: 0.9 };
  if (v === "يحتاج تحقق") return { status: "NEEDS_VERIFICATION", reliability: 0.5 };
  return { status: "DISCOVERED", reliability: 0.7 }; // جزئي أو غير محدد
}

const CLIENT_KML_LABEL = "خريطة ألف باء الأصلية (KML)";

function fieldEntry(source, sourceLabel, verificationStatus, reliability) {
  return { source, sourceLabel, collectedAt: NOW_ISO, verificationStatus, reliability };
}

async function main() {
  console.log("المدارس في ملف الخريطة:", schools.length);

  // 1) الفحص المسبق: أسماء موجودة في القاعدة (تطابق تام أو تشابه ≥ 0.85)
  const existing = await db.school.findMany({ select: { id: true, name: true, regionText: true, dataSource: true } });
  const skipped = [];
  const seenInKml = new Set();

  for (const s of schools) {
    const sim = existing
      .map((e) => ({ e, score: nameSimilarity(s.name, e.name) }))
      .sort((a, b) => b.score - a.score)[0];
    const nName = normalizeArabic(s.name);
    if (seenInKml.has(nName)) {
      skipped.push({ name: s.name, reason: "مكرر داخل ملف الخريطة نفسه" });
      continue;
    }
    if (sim && sim.score >= 0.85) {
      skipped.push({
        name: s.name,
        reason: `مطابقة مع سجل موجود في النظام: «${sim.e.name}» (${Math.round(sim.score * 100)}%) — لا دمج تلقائي، تحتاج مراجعة الإدارة`,
        existingId: sim.e.id,
      });
      continue;
    }
    seenInKml.add(nName);
  }
  const toImport = schools.filter((s) => !skipped.some((k) => k.name === s.name));
  console.log(`سيتُستورد: ${toImport.length} | متخطاة (مطابقة/مكررة): ${skipped.length}`);

  // 2) إنشاء المناطق غير الموجودة (أسماء جغرافية حقيقية من خريطة العميل)
  const regionNames = [...new Set(toImport.map((s) => CLEAN(s.data["المنطقة"])).filter(Boolean))];
  const createdRegions = [];
  for (const rn of regionNames) {
    const found = await db.region.findFirst({ where: { name: rn, governorate: "بغداد" } });
    if (!found) {
      const r = await db.region.create({ data: { name: rn, governorate: "بغداد", isActive: true } });
      createdRegions.push(r.name);
    }
  }
  console.log("مناطق أُنشئت:", createdRegions.join("، ") || "لا شيء");

  const regionMap = {};
  for (const rn of regionNames) {
    const r = await db.region.findFirst({ where: { name: rn, governorate: "بغداد" } });
    regionMap[rn] = r.id;
  }

  // 3) الاستيراد الفعلي
  const imported = [];
  const noCoords = [];
  for (const s of toImport) {
    const ver = mapVerification(s.data["مستوى التحقق"]);
    const phone = CLEAN(s.data["الهاتف"]);
    const principal = CLEAN(s.data["المدير"]);
    const regionText = CLEAN(s.data["المنطقة"]);
    const address = CLEAN(s.data["العنوان"]);
    // حقل العنوان قد يكرر الموقع الرقمي — لا نخزنه عنواناً إن كان إحداثيات
    const addressFinal = address && /^\s*-?\d{1,2}\.\d+\s*[,،]/.test(address) ? null : address;
    const stage = inferStageFromName(s.name);
    const side = CLEAN(s.data["الجانب"]); // الكرخ / الرصافة

    const coords = s.coords;
    const lat = coords?.lat ?? null;
    const lng = coords?.lng ?? null;

    // توثيق كل حقل بقيمة فعلية
    const meta = {};
    if (s.name) meta.name = fieldEntry("CLIENT_KML", CLIENT_KML_LABEL, ver.status, ver.reliability);
    if (phone) meta.phone = fieldEntry("CLIENT_KML", CLIENT_KML_LABEL, ver.status, ver.reliability);
    if (principal) meta.principalName = fieldEntry("CLIENT_KML", CLIENT_KML_LABEL, ver.status, ver.reliability);
    if (regionText) meta.regionText = fieldEntry("CLIENT_KML", CLIENT_KML_LABEL, ver.status, ver.reliability);
    if (addressFinal) meta.address = fieldEntry("CLIENT_KML", CLIENT_KML_LABEL, ver.status, ver.reliability);
    if (lat !== null && lng !== null) {
      if (coords.method === "KML_EXPLICIT") {
        meta.lat = fieldEntry("CLIENT_KML", CLIENT_KML_LABEL, ver.status, ver.reliability);
        meta.lng = fieldEntry("CLIENT_KML", CLIENT_KML_LABEL, ver.status, ver.reliability);
      } else {
        // إحداثيات مُرمّزة من العنوان — تقريبية وتحتاج تحققاً ميدانياً
        meta.lat = fieldEntry("OSM_NOMINATIM", "ترميز جغرافي من العنوان (Nominatim)", "NEEDS_VERIFICATION", 0.5);
        meta.lng = fieldEntry("OSM_NOMINATIM", "ترميز جغرافي من العنوان (Nominatim)", "NEEDS_VERIFICATION", 0.5);
      }
    }
    if (stage) meta.stage = fieldEntry("NAME_INFERENCE", "استنتاج من اسم المؤسسة (يحتاج تأكيداً)", "DISCOVERED", 0.4);
    meta.sector = fieldEntry("CLIENT_KML", CLIENT_KML_LABEL, ver.status, ver.reliability);

    const dataQuality = computeDataQuality({
      phone, principalName: principal, lat, lng,
      institutionType: "مدرسة", sector: "PRIVATE", regionText, studentCount: null,
      stages: null, website: null, address: addressFinal,
      facebookUrl: null, instagramUrl: null,
    });

    const notesParts = [];
    if (side) notesParts.push(`الجانب: ${side}`);
    notesParts.push(`مستوى التحقق في الخريطة: ${CLEAN(s.data["مستوى التحقق"]) ?? "غير محدد"}`);
    if (coords?.displayName && coords.method === "OSM_GEOCODE") notesParts.push(`موقع تقريبي من العنوان: ${coords.displayName.slice(0, 120)}`);
    const notes = notesParts.join(" — ");

    const created = await db.school.create({
      data: {
        name: s.name,
        governorate: "بغداد",
        regionId: regionText ? (regionMap[regionText] ?? null) : null,
        regionText,
        institutionType: "مدرسة",
        stage,
        sector: "PRIVATE",
        principalName: principal,
        phone,
        address: addressFinal,
        lat,
        lng,
        locationUrl: lat !== null ? googleMapsUrl(lat, lng) : null,
        dataSource: "CLIENT_KML",
        discoveryStatus: ver.status,
        fieldMeta: JSON.stringify(meta),
        dataQuality,
        notes,
        discoveredAt: NOW,
      },
    });
    imported.push({ id: created.id, name: created.name, coords: lat !== null });
    if (lat === null) noCoords.push(created.name);
  }

  console.log(`أُضيفت فعلياً: ${imported.length} منها بلا إحداثيات: ${noCoords.length}`);

  // 4) سجل الاستيراد + الإشعار
  const status = skipped.length > 0 ? "PARTIAL" : "COMPLETED";
  await db.importLog.create({
    data: {
      fileName: MAP_FILE,
      fileType: "KML",
      totalRows: schools.length,
      addedCount: imported.length,
      skippedCount: skipped.length,
      errorCount: 0,
      status,
      details: JSON.stringify({
        source: "خريطة Google My Maps الأصلية لألف باء",
        explicitCoords: schools.filter((x) => x.coords?.method === "KML_EXPLICIT").length,
        geocodedCoords: schools.filter((x) => x.coords?.method === "OSM_GEOCODE").length,
        noCoordsCount: noCoords.length,
        noCoordsNames: noCoords,
        createdRegions,
        skipped,
      }),
    },
  });
  await db.notification.create({
    data: {
      title: "استيراد خريطة ألف باء الأصلية",
      message: `أُضيفت ${imported.length} مدرسة أهلية من خريطة ألف باء الأصلية (${schools.filter((x) => x.coords?.method === "KML_EXPLICIT").length} بإحداثيات الخريطة مباشرة و${schools.filter((x) => x.coords?.method === "OSM_GEOCODE").length} مواقع تقريبية من العناوين) وتُخطت ${skipped.length} سجلات مطابقة تحتاج مراجعة.`,
      type: "SUCCESS",
    },
  });

  const counts = {
    schools: await db.school.count(),
    regions: await db.region.count(),
    privateSector: await db.school.count({ where: { sector: "PRIVATE" } }),
  };
  console.log("حالة القاعدة:", JSON.stringify(counts));

  // 5) تقرير مفصل للحفظ
  const report = {
    mapName: "خريطة مدارس بغداد الأهلية – ألف باء",
    importedAt: NOW_ISO,
    totalInKml: schools.length,
    imported: imported.length,
    coordsExplicit: schools.filter((x) => x.coords?.method === "KML_EXPLICIT").length,
    coordsGeocoded: schools.filter((x) => x.coords?.method === "OSM_GEOCODE").length,
    noCoordsCount: noCoords.length,
    noCoordsNames: noCoords,
    createdRegions,
    skippedForReview: skipped,
    verificationSplit: {
      confirmed: schools.filter((x) => x.data["مستوى التحقق"] === "مؤكد").length,
      partial: schools.filter((x) => x.data["مستوى التحقق"] === "جزئي").length,
      needsVerification: schools.filter((x) => x.data["مستوى التحقق"] === "يحتاج تحقق").length,
    },
  };
  fs.writeFileSync("/tmp/kml-import-report.json", JSON.stringify(report, null, 2));
  console.log("saved /tmp/kml-import-report.json");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
