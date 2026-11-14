// كم مدرسة بإحداثيات رقمية في حقل الموقع؟ + مطابقة أسماء المناطق مع القاعدة
import fs from "fs";
import { PrismaClient } from "@prisma/client";
const schools = JSON.parse(fs.readFileSync("/tmp/kml-schools.json", "utf-8"));
const p = new PrismaClient();

const withCoords = schools.filter(s => {
  const m = (s.data["الموقع"] ?? "").match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  return m;
});
console.log("بإحداثيات رقمية في الموقع:", withCoords.length, "/", schools.length);

// مطابقة المناطق
const regions = await p.region.findMany({ where: { governorate: "بغداد" }, select: { name: true, id: true, isActive: true } });
const regionNames = new Set(regions.map(r => r.name));
const kmlRegions = [...new Set(schools.map(s => s.data["المنطقة"]).filter(Boolean))];
const matched = [], missing = [];
for (const r of kmlRegions) {
  if (regionNames.has(r)) matched.push(r);
  else missing.push(r);
}
console.log("مناطق مطابقة (" + matched.length + "):", matched.join("، "));
console.log("مناطق غير موجودة في القاعدة (" + missing.length + "):", missing.join("، "));

// فحص أسماء المدارس — التشابه مع الموجود
const existing = await p.school.findMany({ select: { name: true, regionText: true } });
const norm = (s) => s.replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/[ىي]/g, "ي").replace(/\s+/g, " ").trim();
const exactMatches = [];
for (const s of schools) {
  const n = norm(s.name);
  const ex = existing.find(e => norm(e.name) === n);
  if (ex) exactMatches.push({ kml: s.name, db: ex.name });
}
console.log("أسماء مطابقة تماماً مع القاعدة:", exactMatches.length);
exactMatches.forEach(m => console.log("  -", m.kml, "↔", m.db));

// أنواع المؤسسات من الاسم
const types = {};
schools.forEach(s => {
  const n = s.name;
  let t = "غير محدد";
  if (/ابتدائية/.test(n)) t = "ابتدائية";
  else if (/متوسط/.test(n)) t = "متوسطة";
  else if (/ثانوية|إعدادية|اعدادية/.test(n)) t = "ثانوية";
  else if (/روضة|KG|kg/.test(n)) t = "روضة";
  else if (/معهد|كلية|جامعة/.test(n)) t = "معهد/كلية";
  types[t] = (types[t] ?? 0) + 1;
});
console.log("الأنواع من الاسم:", JSON.stringify(types));

await p.$disconnect();
