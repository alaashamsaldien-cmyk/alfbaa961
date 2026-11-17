// أنواع بيانات مشتركة بين الواجهة والخادم — قسم المدارس والمنسقات
import type { FieldMeta, VerificationStatus } from "@/lib/geo/normalize";

export type { FieldMeta, VerificationStatus };

export interface SchoolDTO {
  id: string;
  name: string;
  governorate: string | null;
  regionId: string | null;
  region: { id: string; name: string; governorate: string } | null;
  regionName: string | null;
  regionText: string | null;
  institutionType: string | null;
  stage: string | null;
  principalName: string | null;
  phone: string | null;
  address: string | null;
  locationUrl: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  osmType: string | null;
  osmId: number | null;
  dataSource: string | null;
  sector: string | null;
  studentCount: number | null;
  stages: string | null;
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  otherLinks: string[];
  availabilityStatus: string;
  contractStatus: string;
  platformName: string | null;
  coordinatorId: string | null;
  coordinator: { id: string; name: string } | null;
  lastVisitAt: string | null;
  lastVisitorName?: string | null;
  notes: string | null;
  discoveryStatus: string;
  fieldMeta: FieldMeta | null;
  dataQuality: number;
  discoveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasCoords: boolean;
  coordOutsideIraq: boolean;
  mapsUrl: string | null;
  qualityHint: number;
}

export interface CoordinatorDTO {
  canAddSchools?: boolean;
  canRegisterVisits?: boolean;
  canViewVisits?: boolean;
  canViewSchools?: boolean;
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  schoolCount: number;
  /** حالة حساب الدخول للبوابة الميدانية */
  hasAccount?: boolean;
  username?: string | null;
  lastLoginAt?: string | null;
  hasActiveSession?: boolean;
  createdAt: string;
}

export interface SchoolsListResponse {
  total: number;
  mappedTotal?: number;
  schools: SchoolDTO[];
  options?: {
    governorates: string[];
    governorateCounts?: Record<string, number>;
    institutionTypes: string[];
    regions: { id: string; name: string; governorate: string }[];
    coordinators: { id: string; name: string }[];
  };
}

export interface AppConfig {
  googlePlacesEnabled: boolean;
  basemapTiles: string;
  governorates: { name: string; center: { lat: number; lng: number } }[];
  baghdadAreas: { name: string; center: { lat: number; lng: number } }[];
  institutionTypes: { key: string; label: string }[];
  limits: { maxResultsPerSearch: number; rateLimitNote: string };
}

export interface DiscoveredPlaceDTO {
  provider: string;
  providerRef: string;
  placeId?: string;
  osmType?: string;
  osmId?: number;
  name?: string;
  institutionType: string;
  rawTypes: string[];
  sector?: "GOVERNMENT" | "PRIVATE";
  address?: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  regionText?: string;
  governorate?: string;
  stages?: string;
  mapsUrl: string;
  rawTags?: Record<string, string>;
}

export interface DiscoveryResultItem {
  place: DiscoveredPlaceDTO;
  inSystem: boolean;
  existingSchoolId: string | null;
  similarCandidates: { schoolId: string; name: string; similarity: number; distanceM: number | null }[];
}

export interface DiscoverySearchResponse {
  items: DiscoveryResultItem[];
  meta: {
    provider: string;
    requestsMade: number;
    truncated: boolean;
    warnings: string[];
    governorate?: string;
    areaName?: string;
    bounds?: { west: number; south: number; east: number; north: number } | null;
    center?: { lat: number; lng: number } | null;
    radiusMeters?: number | null;
    keyword?: string;
    types?: string[] | null;
  };
}

export interface SaveSummaryDTO {
  items: (
    | { state: "SAVED"; schoolId: string; name: string }
    | { state: "DUPLICATE"; name: string; existingSchoolId: string; reason: string }
    | { state: "SIMILAR_REVIEW"; name: string; candidates: { schoolId: string; name: string; similarity: number; distanceM: number | null }[] }
  )[];
  addedCount: number;
  duplicateCount: number;
  reviewCount: number;
  sessionId: string;
}

export const DATA_SOURCE_LABELS: Record<string, string> = {
  GOOGLE_PLACES: "Google Places API",
  OSM_NOMINATIM: "OpenStreetMap (Nominatim)",
  OSM_OVERPASS: "OpenStreetMap (Overpass)",
  EXCEL_IMPORT: "استيراد Excel",
  MANUAL_ENTRY: "إدخال يدوي",
  CLIENT_KML: "خريطة ألف باء الأصلية (KML)",
};

export const SECTOR_LABELS_UI: Record<string, string> = {
  GOVERNMENT: "حكومية",
  PRIVATE: "أهلية",
};

export const DISCOVERY_STATUS_LABELS: Record<string, string> = {
  MAP_APPROVED: "مدرسة خريطة",
  DISCOVERED: "مكتشفة",
  NEEDS_VERIFICATION: "تحتاج إلى تحقق",
  OFFICIALLY_DOCUMENTED: "موثقة من مصدر رسمي",
  FIELD_CONFIRMED: "مؤكدة ميدانياً",
};

export const DISCOVERY_STATUS_BADGE: Record<string, string> = {
  MAP_APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DISCOVERED: "bg-slate-100 text-slate-700 border-slate-200",
  NEEDS_VERIFICATION: "bg-amber-50 text-amber-700 border-amber-200",
  OFFICIALLY_DOCUMENTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FIELD_CONFIRMED: "bg-green-100 text-green-800 border-green-300",
};

/** ترجمة مفاتيح توثيق الحقول للعرض */
export const FIELD_LABELS_UI: Record<string, string> = {
  name: "اسم المدرسة",
  governorate: "المحافظة",
  regionText: "المنطقة",
  institutionType: "نوع المؤسسة",
  sector: "القطاع",
  address: "العنوان",
  lat: "خط العرض",
  lng: "خط الطول",
  phone: "رقم التواصل",
  website: "الموقع الإلكتروني",
  facebookUrl: "صفحة فيسبوك",
  instagramUrl: "انستغرام",
  stages: "المراحل الدراسية",
  principalName: "اسم المدير",
  studentCount: "عدد الطلاب",
  notes: "ملاحظات",
  platformName: "اسم المنصة",
  regionId: "المنطقة",
};
