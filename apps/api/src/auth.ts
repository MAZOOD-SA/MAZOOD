// التحقق من الدخول والصلاحيات. **هنا تُطبّق الصلاحيات، مو في الواجهة.**
//
// كل طلب للخادم لازم يحمل رمز الجلسة في الرأس: Authorization: Bearer <token>
// الخادم يحسب بصمة الرمز ويدوّرها في جدول الجلسات. إذا الجلسة منتهية أو ملغية
// أو الحساب موقوف، يرجع ٤٠١ والتطبيق يرجّع المستخدم لشاشة الدخول.
import type { FastifyRequest } from "fastify";
import type { Db } from "./db";
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
};

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
  return /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}

/** يقرأ المستخدم من رمز الجلسة. يرجع null إذا ما فيه جلسة صالحة. */
export async function resolveUser(db: Db, req: FastifyRequest): Promise<AuthUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { factoryMembers: { select: { factoryId: true }, take: 1 } } } },
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

/** لازم يكون مستخدم مصنع، وكمّل بيانات المصنع. يرجع رقم المصنع اللي تُفلتر عليه كل البيانات. */
export function requireFactory(req: FastifyRequest): AuthUser & { factoryId: string } {
  const u = requireRole(req, "factory");
  if (!u.factoryId) throw new HttpError(403, "factory_profile_required");
  return u as AuthUser & { factoryId: string };
}
