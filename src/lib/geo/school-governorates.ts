import { IRAQ_GOVERNORATES } from "./iraq";

const excluded = new Set(["أربيل", "السليمانية", "كركوك"]);

export const SCHOOL_GOVERNORATES = IRAQ_GOVERNORATES.filter(({ name }) => !excluded.has(name));

export function normalizeGovernorate(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه").replace(/[\u064B-\u065F]/g, "")
    .replace(/\b(governorate|province)\b|محافظه/g, "").trim();
}

const englishNames: Record<string, string[]> = {
  بغداد: ["baghdad"], البصرة: ["basra", "basrah"], نينوى: ["nineveh", "ninawa", "ninewa"],
  دهوك: ["duhok", "dohuk"], النجف: ["najaf", "an najaf", "al najaf"],
  كربلاء: ["karbala", "kerbala"], بابل: ["babil", "babylon"], الأنبار: ["anbar", "al anbar"],
  ديالى: ["diyala"], واسط: ["wasit", "wāsiţ"], ميسان: ["maysan", "misan"],
  "ذي قار": ["dhi qar", "thi qar"], "صلاح الدين": ["saladin", "salah al din", "salah ad din"],
  القادسية: ["al qadisiya", "al qadisiyah", "qadisiyyah"], المثنى: ["muthanna", "al muthanna"],
  حلبجة: ["halabja", "halabjah"],
};

export function matchesSchoolGovernorate(value: string, governorate: string) {
  const normalized = normalizeGovernorate(value);
  return [governorate, ...(englishNames[governorate] ?? [])].some((alias) => normalizeGovernorate(alias) === normalized);
}
