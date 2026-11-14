// تحليل بنية ملف KML: المجلدات (الطبقات)، العلامات (المدارس)، الألوان، الإحداثيات
import fs from "fs";
const xml = fs.readFileSync("/tmp/alifba-map.kml", "utf-8");

// عدد العلامات
const placemarkCount = (xml.match(/<Placemark>/g) || []).length;
const folderCount = (xml.match(/<Folder>/g) || []).length;
console.log("Placemarks:", placemarkCount, "| Folders:", folderCount);

// أسماء المجلدات
const folderNames = [...xml.matchAll(/<Folder>\s*<name>([^<]+)<\/name>/g)].map(m => m[1]);
console.log("Folders:", folderNames);

// الأنماط والألوان
const styles = [...xml.matchAll(/<Style id="([^"]+)">[\s\S]*?<color>([^<]+)<\/color>/g)];
console.log("Styles:", styles.length);

// أول 3 علامات كاملة
const pm = xml.split("<Placemark>")[1];
console.log("---SAMPLE PLACEMARK---");
console.log(pm.slice(0, 1500));
