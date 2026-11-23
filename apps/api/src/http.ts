// أدوات مشتركة لكل المسارات: التحقق من الجلسة والصلاحيات وقراءة المدخلات.
// القاعدة: هوية المستخدم ودوره وجهته (مصنع/مزوّد) تجي من الجلسة في الخادم، ما تجي أبدًا من العميل.
import { can, resolvePermissions, type Permission, type PermissionMap, type StaffRole } from "@mazood/shared";
import type { FastifyRequest } from "fastify";
import type { ZodTypeAny, z } from "zod";
import type { SessionUser } from "./auth.ts";
import type { Config } from "./config.ts";
import type { CryptoBox } from "./crypto-box.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { getSettings } from "./settings.ts";
import type { SmsSender } from "./sms.ts";
import type { FileStorage } from "./storage.ts";

export type Ctx = {
  db: Db;
  sms: SmsSender;
  config: Config;
  storage: FileStorage;
  box: CryptoBox;
  now: () => Date;
  strictRateLimits: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
    token?: string;
  }
}

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> => schema.parse(data);

/** اسم كوكي الجلسة في الموقع، والرأس اللي يحمي من الطلبات المزوّرة (شرحها في app.ts). */
export const SESSION_COOKIE = "mz_session";
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "mazood";
/** رموزنا ٤٣ حرف base64url. أي شي ثاني نرفضه قبل ما نلمس قاعدة البيانات. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,100}$/;

/** رمز الجلسة من رأس Authorization (التطبيق)، أو من الكوكي (الموقع). */
export function readSessionToken(req: FastifyRequest): { token: string; via: "bearer" | "cookie" } | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    return TOKEN_FORMAT.test(token) ? { token, via: "bearer" } : null;
  }
  const c = req.cookies?.[SESSION_COOKIE];
  return c && TOKEN_FORMAT.test(c) ? { token: c, via: "cookie" } : null;
}

/**
 * إعدادات كوكي الجلسة:
 *  - HttpOnly: كود الصفحة ما يقدر يقراه (لو صار في الصفحة كود خبيث، ما يسرق الجلسة).
 *  - SameSite=Strict: المتصفح ما يرسله مع طلبات جاية من مواقع ثانية.
 *  - Secure في الإنتاج: ما ينرسل إلا عبر HTTPS.
 *  - Path=/v1: ما ينرسل إلا لمسارات الـ API.
 */
export function sessionCookieOptions(env: Config["env"], maxAgeMs: number) {
  return { httpOnly: true, sameSite: "strict" as const, secure: env === "production", path: "/v1", maxAge: Math.floor(maxAgeMs / 1000) };
}

/** موظف داخل مسار: دوره وجدول الصلاحيات الفعلي لحظة الطلب (عشان تعديل المالك ينطبق فورًا). */
export type StaffUser = SessionUser & { staffRole: StaffRole; perms: PermissionMap };

/** جدول الصلاحيات الفعلي: الافتراضي + تعديلات المالك المحفوظة في الإعدادات (resolvePermissions). */
export async function permissionMap(db: Db): Promise<PermissionMap> {
  return resolvePermissions((await getSettings(db)).rolePermissions);
}

export function makeGuards(ctx: Ctx) {
  /** المستخدم انعرف في app.ts (onRequest). هنا بس نتأكد إنه موجود. */
  async function authenticate(req: FastifyRequest): Promise<SessionUser> {
    if (!req.user || !req.token) throw new ApiError(401, "unauthorized");
    return req.user;
  }

  return {
    authenticate,
    async requireFactory(req: FastifyRequest) {
      const user = await authenticate(req);
      if (user.role !== "factory" || !user.factoryId || !user.factoryRole) throw new ApiError(403, "forbidden");
      return { user, factoryId: user.factoryId, factoryRole: user.factoryRole };
    },
    async requireProviderUser(req: FastifyRequest) {
      const user = await authenticate(req);
      if (user.role !== "provider") throw new ApiError(403, "forbidden");
      return user;
    },
    /** موظف فعّال عنده الصلاحية المطلوبة. */
    async requireStaff(req: FastifyRequest, permission?: Permission): Promise<StaffUser> {
      const user = await authenticate(req);
      if (user.role !== "staff" || !user.staffRole) throw new ApiError(403, "forbidden");
      const perms = await permissionMap(ctx.db);
      if (permission && !can(user.staffRole, permission, perms)) throw new ApiError(403, "forbidden");
      return { ...user, staffRole: user.staffRole, perms };
    },
  };
}

export type Guards = ReturnType<typeof makeGuards>;

export const actorOf = (u: SessionUser) => ({ id: u.id, role: u.staffRole ?? u.role });

/** اليوم بتوقيت السعودية بصيغة YYYY-MM-DD (المستندات تنتهي بالتاريخ، مو بالساعة). */
export function todayRiyadh(now: Date): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

/**
 * الحماية من التكرار: لو الطلب فيه رأس Idempotency-Key وسبق نجح بنفس المفتاح لنفس المستخدم،
 * نرجّع نفس الرد بدل ما نعيد العملية (الزر انضغط مرتين، أو رجع الاتصال وأعاد الجوال الإرسال).
 * الطلبات بدون المفتاح تشتغل عادي.
 */
export async function idempotent<T>(ctx: Ctx, req: FastifyRequest, route: string, fn: () => Promise<T>): Promise<T> {
  const raw = req.headers["idempotency-key"];
  const key = typeof raw === "string" ? raw : undefined;
  if (!key || !req.user) return fn();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new ApiError(400, "idempotency_key_invalid");
  const seen = async () =>
    (await ctx.db.query<{ response: T; route: string }>("SELECT response, route FROM idempotency_keys WHERE user_id=$1 AND key=$2", [req.user!.id, key]))[0];
  const before = await seen();
  if (before) {
    if (before.route !== route) throw new ApiError(409, "idempotency_key_reused");
    return before.response;
  }
  try {
    const result = await fn();
    await ctx.db.query(
      "INSERT INTO idempotency_keys (user_id, key, route, status, response) VALUES ($1,$2,$3,200,$4) ON CONFLICT DO NOTHING",
      [req.user.id, key, route, JSON.stringify(result)],
    );
    return result;
  } catch (e) {
    // طلبين بنفس المفتاح بنفس اللحظة: الثاني يفشل (الحالة تغيّرت)، فنرجّع له رد الأول.
    const after = await seen();
    if (after && after.route === route) return after.response;
    throw e;
  }
}
