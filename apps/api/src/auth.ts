// التحقق من الدخول والصلاحيات. **هنا تُطبّق الصلاحيات، مو في الواجهة.**
//
// رمز الجلسة يوصل بطريقتين:
//   - تطبيق الجوال: في الرأس Authorization: Bearer <token> (الرمز محفوظ في خزنة الجوال).
//   - الموقع: في ملف تعريف محمي mz_session (HttpOnly)، ما يقدر أي كود في الصفحة يقراه،
//     فلو صار في الموقع ثغرة XSS ما ينسرق الرمز.
// الخادم يحسب بصمة الرمز ويدوّرها في جدول الجلسات. إذا الجلسة منتهية أو ملغية
// أو الحساب موقوف، يرجع ٤٠١ والتطبيق يرجّع المستخدم لشاشة الدخول.
//
// حماية الموقع من الطلبات المزوّرة (CSRF): أي طلب يغيّر شي ويعتمد على ملف التعريف لازم يحمل
// الرأس X-Requested-With: mazood. المتصفح ما يسمح لموقع ثاني يرسل هذا الرأس لخادمنا
// (سياسة CORS)، فموقع خبيث ما يقدر يستغل جلسة المستخدم. وفوقها ملف التعريف SameSite=Strict.
import type { FastifyRequest } from "fastify";
import type { Db } from "./db";
import { permissionsFor, type Permission, type Principal, type StaffRole } from "@mazood/shared";
import { HttpError } from "./errors";
import type { UserRole } from "./generated/prisma/enums";
import { hashSessionToken } from "./security";

/** مدة الجلسة: ٣٠ يوم من آخر دخول. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** ما نحدّث «آخر استخدام» في كل طلب، كل ٥ دقايق بالكثير، عشان نخفف على قاعدة البيانات. */
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

export type AuthUser = {
  id: string;
  phone: string;
  role: UserRole;
  locale: "ar" | "en";
  sessionId: string;
  /** المصنع اللي يتبعه المستخدم، إذا كمّل بيانات المصنع. */
  factoryId: string | null;
  /** من وين جا رمز الجلسة. */
  via: "bearer" | "cookie";
  /** أدوار الإدارة (فاضية لغير الموظفين). */
  staffRoles: StaffRole[];
};

/** يحوّل المستخدم لـ «صاحب طلب» عشان نحسب صلاحياته من الجدول المشترك. */
export function principalOf(u: Pick<AuthUser, "role" | "staffRoles">): Principal {
  if (u.role === "staff") return { kind: "staff", roles: u.staffRoles };
  // المزوّد يتوثّق في المرحلة ٣. لين ذاك الوقت ما فيه مزوّد موثّق مرتبط بحساب.
  if (u.role === "provider") return { kind: "provider", verified: false };
  return { kind: "factory" };
}

export const SESSION_COOKIE = "mz_session";
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "mazood";

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,100}$/;

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  const token = h.slice(7).trim();
  // رموزنا ٤٣ حرف base64url. أي شي ثاني نرفضه قبل ما نلمس قاعدة البيانات.
  return TOKEN_FORMAT.test(token) ? token : null;
}

function cookieToken(req: FastifyRequest): string | null {
  const v = req.cookies?.[SESSION_COOKIE];
  return v && TOKEN_FORMAT.test(v) ? v : null;
}

/** يقرأ المستخدم من رمز الجلسة. يرجع null إذا ما فيه جلسة صالحة. */
export async function resolveUser(db: Db, req: FastifyRequest): Promise<AuthUser | null> {
  const bearer = bearerToken(req);
  const token = bearer ?? cookieToken(req);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { factoryMembers: { select: { factoryId: true }, take: 1 }, staffRoles: { select: { role: true } } } } },
  });
  const now = Date.now();
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
  if (session.user.status !== "active") return null;

  if (now - session.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) } });
  }
  const u = session.user;
  return {
    id: u.id,
    phone: u.phone,
    role: u.role,
    locale: u.locale === "en" ? "en" : "ar",
    sessionId: session.id,
    factoryId: u.factoryMembers[0]?.factoryId ?? null,
    via: bearer ? "bearer" : "cookie",
    staffRoles: u.staffRoles.map((s) => s.role),
  };
}

/** لازم يكون داخل. */
export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw new HttpError(401, "unauthorized");
  return req.user;
}

/** لازم يكون داخل وبدور معيّن. */
export function requireRole(req: FastifyRequest, role: UserRole): AuthUser {
  const u = requireUser(req);
  if (u.role !== role) throw new HttpError(403, "forbidden");
  return u;
}

/**
 * لازم يملك صلاحية معيّنة من جدول الصلاحيات (packages/shared/src/permissions.ts).
 * هذي الطريقة المعتمدة لأي مسار جديد، خصوصًا مسارات لوحة الإدارة (المرحلة ٣ وما بعدها).
 */
export function requirePermission(req: FastifyRequest, permission: Permission): AuthUser {
  const u = requireUser(req);
  if (!permissionsFor(principalOf(u)).has(permission)) throw new HttpError(403, "forbidden");
  return u;
}

/**
 * لازم يكون مستخدم مصنع بالصلاحية المطلوبة، وكمّل بيانات مصنعه.
 * يرجع رقم المصنع اللي تُفلتر عليه كل البيانات (في الكود، وفي قاعدة البيانات عن طريق scope.ts).
 */
export function requireFactory(req: FastifyRequest, permission: Permission = "request.view_own"): AuthUser & { factoryId: string } {
  const u = requirePermission(req, permission);
  if (u.role !== "factory") throw new HttpError(403, "forbidden");
  if (!u.factoryId) throw new HttpError(403, "factory_profile_required");
  return u as AuthUser & { factoryId: string };
}
