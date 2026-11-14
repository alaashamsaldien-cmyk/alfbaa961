// طبقة المصادقة الفعلية — حسابات المستخدمين والمنسقات الميدانيات
// - تجزئة كلمات المرور بـ scrypt (node:crypto) بلا تبعيات خارجية
// - جلسات مخزنة في قاعدة البيانات (AuthSession) مرتبطة بكوكي HttpOnly
// - مبدآن رئيسيان: ADMIN (لوحة الإدارة الكاملة) و COORDINATOR (بوابة الميدان فقط)
// حماية الخصوصية: لا نعيد أبداً passwordHash في أي استجابة.

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

export const SESSION_COOKIE = "alifba_session";
/** مدة صلاحية الجلسة: 14 يوماً */
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// ——— تجزئة كلمات المرور ———

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  try {
    const derived = await scrypt(password, salt, 64);
    const storedBuf = Buffer.from(hashHex, "hex");
    if (storedBuf.length !== derived.length) return false;
    return timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

// ——— الجلسات ———

export type PrincipalType = "ADMIN" | "COORDINATOR";

export interface AdminPrincipal {
  type: "ADMIN";
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface CoordinatorPrincipal {
  type: "COORDINATOR";
  sessionId: string;
  coordinatorId: string;
  name: string;
  username: string;
  phone: string | null;
}

export type Principal = AdminPrincipal | CoordinatorPrincipal;

/** إنشاء جلسة جديدة وتعيين الكوكي — يعيد التوكن للمسارات التي تحتاجه */
export async function createSession(
  principal: { type: PrincipalType; userId?: string; coordinatorId?: string }
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.authSession.create({
    data: {
      token,
      principalType: principal.type,
      userId: principal.userId ?? null,
      coordinatorId: principal.coordinatorId ?? null,
      expiresAt,
    },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** المبدأ الحالي من الجلسة — null إن لم توجد جلسة صالحة */
export async function getPrincipal(): Promise<Principal | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.authSession.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    if (session) {
      // جلسة منتهية — تنظيف فوري
      await db.authSession.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  if (session.principalType === "ADMIN" && session.userId) {
    const user = await db.user.findFirst({
      where: { id: session.userId, isActive: true },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return null;
    return {
      type: "ADMIN",
      sessionId: session.id,
      userId: user.id,
      name: user.name ?? "مدير النظام",
      email: user.email,
      role: user.role,
    };
  }

  if (session.principalType === "COORDINATOR" && session.coordinatorId) {
    const c = await db.coordinator.findFirst({
      where: { id: session.coordinatorId, isActive: true },
      select: { id: true, name: true, username: true, phone: true },
    });
    if (!c) return null;
    return {
      type: "COORDINATOR",
      sessionId: session.id,
      coordinatorId: c.id,
      name: c.name,
      username: c.username ?? "",
      phone: c.phone,
    };
  }

  return null;
}

/** إنهاء الجلسة الحالية إن وُجدت */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.authSession.deleteMany({ where: { token } }).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

/** إنهاء كل جلسات مبدأ معين (تُستخدم عند تعطيل حساب أو تغيير كلمة المرور) */
export async function destroySessionsFor(principal: { userId?: string; coordinatorId?: string }): Promise<void> {
  if (principal.userId) {
    await db.authSession.deleteMany({ where: { userId: principal.userId } }).catch(() => {});
  }
  if (principal.coordinatorId) {
    await db.authSession.deleteMany({ where: { coordinatorId: principal.coordinatorId } }).catch(() => {});
  }
}

// ——— حرّاس الصلاحيات لمسارات API ———

/** مدير مسجل دخول — وإلا استجابة 401 جاهزة */
export async function requireAdmin(): Promise<{ principal: AdminPrincipal } | { response: Response }> {
  const principal = await getPrincipal();
  if (!principal) {
    return {
      response: Response.json(
        { error: "غير مصرح — يجب تسجيل الدخول.", code: "UNAUTHENTICATED" },
        { status: 401 }
      ),
    };
  }
  if (principal.type !== "ADMIN") {
    return {
      response: Response.json(
        { error: "غير مصرح — هذه العملية لمدير النظام فقط.", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }
  // حماية الأدوار: حسابات الموظفين (STAFF/MANAGER) لا تدخل مسارات الإدارة إطلاقاً
  // حتى لو كانت لديها جلسة مستخدم — صلاحياتها تُطبق في مسارات /api/employee فقط
  if (principal.role !== "ADMIN") {
    return {
      response: Response.json(
        { error: "غير مصرح — هذه العملية لمدير النظام فقط، صلاحياتك لا تشملها.", code: "FORBIDDEN_ROLE" },
        { status: 403 }
      ),
    };
  }
  return { principal };
}

/** موظف مسجل دخول (حساب مستخدم بدور STAFF أو MANAGER) — بوابة الموظف فقط */
export async function requireEmployee(): Promise<
  { principal: AdminPrincipal } | { response: Response }
> {
  const principal = await getPrincipal();
  if (!principal) {
    return {
      response: Response.json(
        { error: "غير مصرح — يجب تسجيل الدخول.", code: "UNAUTHENTICATED" },
        { status: 401 }
      ),
    };
  }
  if (principal.type !== "ADMIN") {
    return {
      response: Response.json(
        { error: "غير مصرح — بوابة الموظف لحسابات الموظفين فقط.", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }
  if (principal.role === "ADMIN") {
    return {
      response: Response.json(
        { error: "مدير النظام يستخدم لوحة الإدارة الكاملة — هذه البوابة للموظفين.", code: "ADMIN_NOT_EMPLOYEE" },
        { status: 403 }
      ),
    };
  }
  return { principal };
}

/** منسقة مسجلة دخول — وإلا استجابة 401 جاهزة */
export async function requireCoordinator(): Promise<
  { principal: CoordinatorPrincipal } | { response: Response }
> {
  const principal = await getPrincipal();
  if (!principal) {
    return {
      response: Response.json(
        { error: "غير مصرح — يجب تسجيل الدخول.", code: "UNAUTHENTICATED" },
        { status: 401 }
      ),
    };
  }
  if (principal.type !== "COORDINATOR") {
    return {
      response: Response.json(
        { error: "غير مصرح — هذه العملية لمنسقة ميدانية مسجلة دخول فقط.", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }
  return { principal };
}
