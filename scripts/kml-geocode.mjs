#!/usr/bin/env node
/**
 * الترميز الجغرافي لمدارس خريطة ألف باء الأصلية (KML) التي بلا إحداثيات رقمية.
 * - المدارس ذات الإحداثيات الرقمية في حقل «الموقع» تؤخذ كما هي (كما سجلها صاحب الخريطة).
 * - الباقي يُرمّز جغرافياً من العنوان عبر OpenStreetMap Nominatim (مصدر عام مجاني)
 *   بفاصل 1.1 ثانية احتراماً لسياسة الاستخدام، مع فحص وقوع النتيجة داخل بغداد.
 * الناتج: /tmp/kml-schools-geo.json — لا يُلمس من قاعدة البيانات في هذه الخطوة.
 */
import fs from "fs";

const schools = JSON.parse(fs.readFileSync("/tmp/kml-schools.json", "utf-8"));
const UA = "AlifBa-School-Platform/1.0 (school data import; contact: admin@alifba.system)";
// حدود بغداد الواسعة للتصرّف في النتائج الخاطئة
const BOUNDS = { latMin: 32.5, latMax: 34.0, lngMin: 43.8, lngMax: 44.8 };

function parseNumericCoords(loc) {
  const m = (loc ?? "").match(/^\s*(-?\d{1,2}\.\d+)\s*[,،]\s*(-?\d{1,3}\.\d+)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lng >= BOUNDS.lngMin && lng <= BOUNDS.lngMax) {
    return { lat, lng };
  }
  return null;
}

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ar,en" } });
  if (!res.ok) return null;
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const r = arr[0];
  const lat = Number(r.lat), lng = Number(r.lon);
  if (!(lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lng >= BOUNDS.lngMin && lng <= BOUNDS.lngMax)) return null;
  return { lat, lng, displayName: r.display_name ?? null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let fromKml = 0, geocoded = 0, failed = 0;
  const results = [];
  for (let i = 0; i < schools.length; i++) {
    const s = schools[i];
    const region = s.data["المنطقة"] ?? "";
    const address = s.data["العنوان"] ?? "";
    const loc = s.data["الموقع"] ?? "";

    const numeric = parseNumericCoords(loc);
    if (numeric) {
      fromKml++;
      results.push({ ...s, coords: { ...numeric, method: "KML_EXPLICIT" } });
      continue;
    }

    // ترميز جغرافي: العنوان أولاً ثم اسم المدرسة
    let g = null;
    const q1 = [address, region, "بغداد", "العراق"].filter(Boolean).join("، ");
    if (address && address !== loc) g = await geocode(q1).catch(() => null);
    if (!g) {
      await sleep(1100);
      const q2 = [s.name, region, "بغداد", "العراق"].filter(Boolean).join("، ");
      g = await geocode(q2).catch(() => null);
    }
    if (g) {
      geocoded++;
      results.push({ ...s, coords: { ...g, method: "OSM_GEOCODE" } });
    } else {
      failed++;
      results.push({ ...s, coords: null });
    }
    if ((i + 1) % 10 === 0) console.log(`  ... ${i + 1}/${schools.length}`);
    await sleep(1100);
  }

  fs.writeFileSync("/tmp/kml-schools-geo.json", JSON.stringify(results, null, 1));
  console.log(`الإحداثيات: ${fromKml} من الخريطة مباشرة، ${geocoded} مُرمّزة من العنوان، ${failed} بلا إحداثيات`);
  console.log("saved /tmp/kml-schools-geo.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
