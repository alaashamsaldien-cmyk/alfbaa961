"use client";

// ——— أيقونات أقسام النظام — خريطة مشتركة بين إدارة الموظفين وبوابة الموظف ———
import {
  LayoutDashboard,
  School,
  MapPin,
  Search,
  PhoneCall,
  ClipboardPlus,
  ClipboardCheck,
  ChartColumn,
  UsersRound,
  Network,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { SectionKey } from "@/lib/sections-catalog";

export const SECTION_ICONS: Record<SectionKey, LucideIcon> = {
  home: LayoutDashboard,
  schools: School,
  regions: MapPin,
  discovery: Search,
  visits: PhoneCall,
  visit_register: ClipboardPlus,
  reviews: ClipboardCheck,
  reports: ChartColumn,
  employees: UsersRound,
  distribution: Network,
  expenses: Wallet,
  settings: Settings,
};
