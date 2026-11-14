// استخراج كامل: كل علامة → JSON باسمها وإحداثياتها وحقولها الموسعة
import fs from "fs";
const xml = fs.readFileSync("/tmp/alifba-map.kml", "utf-8");

// المجلدات: قسّم حسب Folder لمعرفة الجانب من الطبقة نفسها
const schools = [];
// كل علامة <Placemark>...</Placemark>
const parts = xml.split(/<Placemark>([\s\S]*?)<\/Placemark>/);
// parts[1], parts[3], ... محتوى العلامات
for (let i = 1; i < parts.length; i += 2) {
  const block = parts[i];
  const name = block.match(/<name>([^<]+)<\/name>/)?.[1]?.trim() ?? null;
  const point = block.match(/<Point>\s*<coordinates>([^<]+)<\/coordinates>/)?.[1]?.trim() ?? null;
  const styleUrl = block.match(/<styleUrl>#([^<]+)<\/styleUrl>/)?.[1] ?? null;
  const data = {};
  for (const m of block.matchAll(/<Data name="([^"]+)">\s*<value>([\s\S]*?)<\/value>\s*<\/Data>/g)) {
    data[m[1].trim()] = m[2].trim();
  }
  schools.push({ name, point, styleUrl, data });
}

console.log("total:", schools.length);
// إحصاءات
const noCoords = schools.filter(s => !s.point).length;
console.log("بدون إحداثيات:", noCoords);
const fields = new Set();
schools.forEach(s => Object.keys(s.data).forEach(k => fields.add(k)));
console.log("الحقول الموسعة:", [...fields].join(" | "));
// مستويات التحقق
const verif = {};
schools.forEach(s => { const v = s.data["مستوى التحقق"] ?? "غير محدد"; verif[v] = (verif[v] ?? 0) + 1; });
console.log("مستويات التحقق:", JSON.stringify(verif));
// الجوانب
const sides = {};
schools.forEach(s => { const v = s.data["الجانب"] ?? "غير محدد"; sides[v] = (sides[v] ?? 0) + 1; });
console.log("الجوانب:", JSON.stringify(sides));
// المناطق
const regions = {};
schools.forEach(s => { const v = s.data["المنطقة"] ?? "غير محدد"; regions[v] = (regions[v] ?? 0) + 1; });
console.log("المناطق (" + Object.keys(regions).length + "):", JSON.stringify(regions));
// الألوان المستخدمة
const colors = {};
schools.forEach(s => { const v = s.styleUrl; colors[v] = (colors[v] ?? 0) + 1; });
console.log("الأنماط:", JSON.stringify(colors));
// عينات بلا إحداثيات
console.log("---بدون إحداثيات:", JSON.stringify(schools.filter(s => !s.point).slice(0, 3).map(s => ({ name: s.name, data: s.data })), null, 1));
// عينات عامة
console.log("---عينة:", JSON.stringify(schools.slice(0, 2), null, 1));

fs.writeFileSync("/tmp/kml-schools.json", JSON.stringify(schools, null, 1));
console.log("saved /tmp/kml-schools.json");
