// طبقة بيانات لوحة التحكم — كل الأرقام تُحسب فعلياً من قاعدة البيانات.
// لا توجد أي قيم مكتوبة يدوياً. قاعدة فارغة تعني أصفاراً ورسائل توضيحية.

import { db } from "@/lib/db";
import {
  getBaghdadStartOfDay,
  getBaghdadEndOfDay,
  getBaghdadDayRange,
  getBaghdadDaysAgoStart,
} from "@/lib/time";

// ——— أنواع البيانات المشتركة مع الواجهة ———

export type ActivityType = "VISIT" | "CALL" | "INITIAL_APPROVAL" | "CONTRACT" | "OTHER";

export interface SchoolStats {
  total: number;
  visited: number;
  notVisited: number;
  contracted: number;
  notContracted: number;
  available: number;
  unavailable: number;
  dueReviews: number;
}

export interface TodayActivity {
  visits: number;
  calls: number;
  initialApprovals: number;
  contracts: number;
}

export interface FollowUpItem {
  id: string;
  title: string | null;
  type: string;
  schoolName: string;
  regionName: string | null;
  coordinatorName: string | null;
  dueDate: string;
  status: string;
}

export interface FollowUpsData {
  todayReviews: FollowUpItem[];
  overdueReviews: FollowUpItem[];
  upcomingFollowUps: FollowUpItem[];
}

export interface RegionDistributionItem {
  regionId: string;
  regionName: string;
  schoolCount: number;
}

export interface RecentActivityItem {
  id: string;
  type: ActivityType;
  occurredAt: string;
  schoolName: string;
  regionName: string | null;
  coordinatorName: string | null;
  result: string | null;
  notes: string | null;
}

export interface DashboardData {
  stats: SchoolStats;
  todayActivity: TodayActivity;
  followUps: FollowUpsData;
  regionDistribution: RegionDistributionItem[];
  unassignedSchools: number;
  recentActivities: RecentActivityItem[];
  updatedAt: string;
}

export type ActivityPeriod = "today" | "week" | "month" | "all";

export const ACTIVITY_PERIODS: ActivityPeriod[] = ["today", "week", "month", "all"];

function isPeriod(value: unknown): value is ActivityPeriod {
  return typeof value === "string" && ACTIVITY_PERIODS.includes(value as ActivityPeriod);
}

export function parseActivityPeriod(value: string | null): ActivityPeriod {
  return isPeriod(value) ? value : "all";
}

/** نطاق زمني للفترة المطلوبة (بتوقيت بغداد) */
function periodRange(period: ActivityPeriod): { start?: Date; end?: Date } {
  switch (period) {
    case "today":
      return { start: getBaghdadStartOfDay(), end: getBaghdadEndOfDay() };
    case "week":
      return { start: getBaghdadDaysAgoStart(6), end: getBaghdadEndOfDay() };
    case "month":
      return { start: getBaghdadDaysAgoStart(29), end: getBaghdadEndOfDay() };
    default:
      return {};
  }
}

// ——— حساب الإحصائيات الرئيسية ———

async function getSchoolStats(): Promise<SchoolStats> {
  const todayEnd = getBaghdadEndOfDay();

  const [total, visited, contracted, notContracted, available, unavailable, dueReviews] =
    await Promise.all([
      db.school.count(),
      // تمت الزيارة: مدرسة لها زيارة ميدانية مسجلة فعلياً (lastVisitAt)
      db.school.count({ where: { lastVisitAt: { not: null } } }),
      db.school.count({ where: { contractStatus: "CONTRACTED" } }),
      db.school.count({ where: { contractStatus: "NOT_CONTRACTED" } }),
      db.school.count({ where: { availabilityStatus: "AVAILABLE" } }),
      db.school.count({ where: { availabilityStatus: "UNAVAILABLE" } }),
      // المراجعات المستحقة: مراجعات معلقة انتهى موعدها أو يستحق اليوم (تشمل المتأخرة)
      db.followUp.count({
        where: {
          status: "PENDING",
          type: "REVIEW",
          dueDate: { lte: todayEnd },
        },
      }),
    ]);

  return {
    total,
    visited,
    notVisited: total - visited,
    contracted,
    notContracted,
    available,
    unavailable,
    dueReviews,
  };
}

// ——— نشاط اليوم ———

async function getTodayActivity(): Promise<TodayActivity> {
  const { start, end } = getBaghdadDayRange(new Date());

  const groups = await db.activity.groupBy({
    by: ["type"],
    where: { occurredAt: { gte: start, lte: end } },
    _count: { _all: true },
  });

  const countOf = (type: string) =>
    groups.find((g) => g.type === type)?._count._all ?? 0;

  return {
    visits: countOf("VISIT"),
    calls: countOf("CALL"),
    initialApprovals: countOf("INITIAL_APPROVAL"),
    contracts: countOf("CONTRACT"),
  };
}

// ——— المتابعات ———

function mapFollowUp(f: {
  id: string;
  title: string | null;
  type: string;
  dueDate: Date;
  status: string;
  school: { name: string; region: { name: string } | null };
  coordinator: { name: string } | null;
}): FollowUpItem {
  return {
    id: f.id,
    title: f.title,
    type: f.type,
    schoolName: f.school.name,
    regionName: f.school.region?.name ?? null,
    coordinatorName: f.coordinator?.name ?? null,
    dueDate: f.dueDate.toISOString(),
    status: f.status,
  };
}

async function getFollowUps(): Promise<FollowUpsData> {
  const { start: todayStart, end: todayEnd } = getBaghdadDayRange(new Date());

  const baseInclude = {
    school: { select: { name: true, region: { select: { name: true } } } },
    coordinator: { select: { name: true } },
  };
  const baseOrder = { dueDate: "asc" as const };
  const baseWhere = { status: "PENDING" as const };

  const [today, overdue, upcoming] = await Promise.all([
    db.followUp.findMany({
      where: { ...baseWhere, type: "REVIEW", dueDate: { gte: todayStart, lte: todayEnd } },
      include: baseInclude,
      orderBy: baseOrder,
      take: 20,
    }),
    db.followUp.findMany({
      where: { ...baseWhere, type: "REVIEW", dueDate: { lt: todayStart } },
      include: baseInclude,
      orderBy: { dueDate: "desc" },
      take: 20,
    }),
    db.followUp.findMany({
      where: { ...baseWhere, type: "FOLLOW_UP", dueDate: { gt: todayEnd } },
      include: baseInclude,
      orderBy: baseOrder,
      take: 20,
    }),
  ]);

  return {
    todayReviews: today.map(mapFollowUp),
    overdueReviews: overdue.map(mapFollowUp),
    upcomingFollowUps: upcoming.map(mapFollowUp),
  };
}

// ——— توزيع المدارس حسب المناطق ———

async function getRegionDistribution(): Promise<RegionDistributionItem[]> {
  const regions = await db.region.findMany({
    where: { isActive: true },
    select: { id: true, name: true, _count: { select: { schools: true } } },
    orderBy: { name: "asc" },
  });

  return regions.map((r) => ({
    regionId: r.id,
    regionName: r.name,
    schoolCount: r._count.schools,
  }));
}

// ——— آخر النشاطات ———

export async function getRecentActivities(period: ActivityPeriod): Promise<RecentActivityItem[]> {
  const range = periodRange(period);
  const occurredAt = {
    ...(range.start ? { gte: range.start } : {}),
    ...(range.end ? { lte: range.end } : {}),
  };

  const activities = await db.activity.findMany({
    where: { occurredAt },
    include: {
      school: { select: { name: true, region: { select: { name: true } } } },
      coordinator: { select: { name: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 15,
  });

  return activities.map((a) => ({
    id: a.id,
    type: a.type as ActivityType,
    occurredAt: a.occurredAt.toISOString(),
    schoolName: a.school.name,
    regionName: a.school.region?.name ?? null,
    coordinatorName: a.coordinator?.name ?? null,
    result: a.result,
    notes: a.notes,
  }));
}

// ——— تجميع كل بيانات اللوحة ———

export async function getDashboardData(period: ActivityPeriod = "all"): Promise<DashboardData> {
  const [stats, todayActivity, followUps, regionDistribution, unassignedSchools, recentActivities] =
    await Promise.all([
      getSchoolStats(),
      getTodayActivity(),
      getFollowUps(),
      getRegionDistribution(),
      db.school.count({ where: { coordinatorId: null, assignments: { none: {} } } }),
      getRecentActivities(period),
    ]);

  return {
    stats,
    todayActivity,
    followUps,
    regionDistribution,
    unassignedSchools,
    recentActivities,
    updatedAt: new Date().toISOString(),
  };
}
