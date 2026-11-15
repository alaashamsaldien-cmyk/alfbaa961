import { db } from "@/lib/db";
import { getPrincipal } from "@/lib/auth";
import { getPermissionMap } from "@/lib/permissions";
import { approvedMapSchoolWhere, isMapSchoolSource } from "@/lib/map-school-scope";
import { SECTION_KEYS, emptyPerms, type SectionKey, type SectionPerms } from "@/lib/sections-catalog";

export async function requireFieldAccount() {
  const principal = await getPrincipal();
  if (principal?.type === "COORDINATOR") {
    return { principal: { userId: principal.coordinatorId, name: principal.name, isCoordinator: true } };
  }
  if (principal?.type === "ADMIN" && principal.role !== "ADMIN") {
    return { principal: { userId: principal.userId, name: principal.name, isCoordinator: false } };
  }
  return { response: Response.json(
    { error: principal ? "هذه العملية لحساب ميداني." : "يجب تسجيل الدخول." },
    { status: principal ? 403 : 401 }
  ) };
}

export async function getFieldPermissions(account: { userId: string; isCoordinator: boolean }) {
  if (!account.isCoordinator) return getPermissionMap(account.userId);
  const coordinator = await db.coordinator.findUnique({
    where: { id: account.userId },
    select: { canRegisterVisits: true, canViewVisits: true, canViewSchools: true },
  });
  const perms = Object.fromEntries(SECTION_KEYS.map((key) => [key, emptyPerms()])) as Record<SectionKey, SectionPerms>;
  perms.home = { ...emptyPerms(), visible: true, view: true };
  if (coordinator?.canViewSchools) {
    perms.schools = { ...emptyPerms(), visible: true, view: true };
  }
  if (coordinator?.canRegisterVisits) perms.visit_register = { ...emptyPerms(), visible: true, view: true, create: true };
  if (coordinator?.canViewVisits) perms.visits = { ...emptyPerms(), visible: true, view: true };
  return perms;
}

export async function getFieldSchoolScope(account: { userId: string; isCoordinator: boolean }) {
  if (account.isCoordinator) return { coordinatorId: account.userId, AND: [approvedMapSchoolWhere] };
  const employee = await db.user.findUniqueOrThrow({
    where: { id: account.userId },
    select: { governorate: true, regionId: true },
  });
  return {
    governorate: employee.governorate ?? undefined,
    regionId: employee.regionId ?? undefined,
  };
}

export function fieldVisitOwner(account: { userId: string; isCoordinator: boolean }) {
  return account.isCoordinator ? { coordinatorId: account.userId } : { employeeId: account.userId };
}

export function coordinatorSchoolContact(school: {
  dataSource: string | null; address: string | null; phone: string | null;
  principalName: string | null; studentCount: number | null; stage: string | null;
}) {
  const { address, phone, principalName, studentCount, stage } = school;
  return isMapSchoolSource(school.dataSource)
    ? { address, phone, principalName, studentCount, stage }
    : { address: null, phone: null, principalName: null, studentCount: null, stage: null };
}
