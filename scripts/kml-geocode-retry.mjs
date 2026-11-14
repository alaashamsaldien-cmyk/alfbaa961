// محاولة ثانية للمدارس بلا إحداثيات: صيغ بديلة للعنوان (المنطقة وحدها لا تصلح — تُرجع المنطقة نفسها)
import fs from "fs";
const schools = JSON.parse(fs.readFileSync("/tmp/kml-schools-geo.json", "utf-8"));
const UA = "AlifBa-School-Platform/1.0 (school data import; contact: admin@alifba.system)";
const BOUNDS = { latMin: 32.5, latMax: 34.0, lngMin: 43.8, lngMax: 44.8 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const pending = schools.filter((s) => !s.coords);
console.log("بلا إحداثيات:", pending.length);
// عينات من العناوين المتاحة
pending.slice(0, 8).forEach((s) => console.log("  -", s.name, "| عنوان:", s.data["العنوان"], "| منطقة:", s.data["المنطقة"]));
