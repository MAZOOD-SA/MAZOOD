// الدخول برقم الجوال ورمز التحقق (OTP).
//
// تحديد المحاولات (عشان ما أحد يخمّن الرموز أو يغرق جوال أحد برسائل):
//   - رمز جديد لنفس الجوال: مرة كل ٦٠ ثانية، و٥ مرات بالساعة بالكثير.
//   - من نفس عنوان IP: ٢٠ رمز بالساعة بالكثير.
//   - كل رمز: ٥ محاولات إدخال، وبعدها ينتهي ويحتاج رمز جديد.
//   - كل رمز ينتهي بعد ٥ دقايق، وينفع مرة وحدة بس.
// والرد ما يكشف أبدًا هل الرقم مسجّل عندنا ولا لا.
import { localeSchema, otpRequestSchema, otpVerifySchema, permissionsFor, type Me, type OtpRequestResponse, type SessionResponse } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit";
import { principalOf, requireUser, SESSION_COOKIE, SESSION_TTL_MS } from "../auth";
import type { Config } from "../config";
import type { AppContext } from "../context";
import { HttpError, parse } from "../errors";
import { generateOtpCode, generateSessionToken, hashOtp, hashSessionToken, safeEqualHex } from "../security";
import { factoryDto } from "./factory";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_PER_PHONE_PER_HOUR = 5;
export const OTP_MAX_PER_IP_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

const tooMany = (retryAfterMs: number) =>
  new HttpError(429, "rate_limited", { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) });

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config, clock } = ctx;

  app.post("/auth/otp/request", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req): Promise<OtpRequestResponse> => {
    const { phone } = parse(otpRequestSchema, req.body);
    const now = clock.now();
    const hourAgo = new Date(now.getTime() - HOUR_MS);

    const [last, phoneCount, ipCount] = await Promise.all([
      db.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } }),
      db.otpChallenge.count({ where: { phone, createdAt: { gt: hourAgo } } }),
      db.otpChallenge.count({ where: { ip: req.ip, createdAt: { gt: hourAgo } } }),
    ]);
    if (last && now.getTime() - last.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw tooMany(OTP_RESEND_COOLDOWN_MS - (now.getTime() - last.createdAt.getTime()));
    }
    if (phoneCount >= OTP_MAX_PER_PHONE_PER_HOUR || ipCount >= OTP_MAX_PER_IP_PER_HOUR) throw tooMany(HOUR_MS);

    const code = generateOtpCode();
    await db.$transaction([
      // أي رمز قديم لنفس الجوال يبطل، فما يشتغل إلا آخر رمز.
      db.otpChallenge.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: now } }),
      db.otpChallenge.create({
        data: { phone, codeHash: hashOtp(config.OTP_SECRET, phone, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), ip: req.ip, createdAt: now },
      }),
    ]);
    await ctx.sms.sendOtp(phone, code, "ar");

    return {
      resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
      // config.ts يمنع هذا الإعداد في الإنتاج.
      ...(config.OTP_EXPOSE_IN_RESPONSE ? { devCode: code } : {}),
    };
  });

  app.post("/auth/otp/verify", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply): Promise<SessionResponse> => {
    const { phone, code, deviceName } = parse(otpVerifySchema, req.body);
    // الموقع يعرّف نفسه بالرأس X-Client: web، فيستلم الجلسة في ملف تعريف محمي بدل ما ترجع في الرد.
    const isWeb = req.headers["x-client"] === "web";
    const now = clock.now();

    const challenge = await db.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(400, "code_expired");

    // نزيد عدد المحاولات قبل المقارنة، وبشرط إنه أقل من الحد. هذا يمنع محاولات متزامنة تتجاوز الحد.
    const bumped = await db.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count === 0) throw new HttpError(400, "code_expired");

    if (!safeEqualHex(challenge.codeHash, hashOtp(config.OTP_SECRET, phone, code))) {
      const left = OTP_MAX_ATTEMPTS - (challenge.attempts + 1);
      await audit(db, { actorUserId: null, action: "auth.otp_failed", entityType: "user", metadata: { attemptsLeft: left }, ip: req.ip });
      throw new HttpError(400, left > 0 ? "code_wrong" : "code_expired");
    }

    // الرمز ينفع مرة وحدة: نعلّمه مستخدم بشرط إنه ما انستخدم، فلو وصل طلبين بنفس الوقت ينجح واحد بس.
    const consumed = await db.otpChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: now } });
    if (consumed.count === 0) throw new HttpError(400, "code_expired");

    const existing = await db.user.findUnique({ where: { phone } });
    if (existing && existing.status !== "active") throw new HttpError(403, "account_suspended");
    const user = existing ?? (await db.user.create({ data: { phone, role: "factory" } }));

    const token = generateSessionToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const session = await db.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt,
        userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
        deviceName: deviceName ?? null,
        channel: isWeb ? "web" : "app",
      },
    });
    await audit(db, {
      actorUserId: user.id,
      action: existing ? "auth.signed_in" : "auth.signed_up",
      entityType: "session",
      entityId: session.id,
      ip: req.ip,
    });

    const me = await loadMe(ctx, user.id);
    if (isWeb) {
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config.APP_ENV, SESSION_TTL_MS));
      return { expiresAt: expiresAt.toISOString(), me };
    }
    return { token, expiresAt: expiresAt.toISOString(), me };
  });

  app.post("/auth/logout", async (req, reply) => {
    const u = requireUser(req);
    await db.session.update({ where: { id: u.sessionId }, data: { revokedAt: clock.now() } });
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(config.APP_ENV, 0));
    await audit(db, { actorUserId: u.id, action: "auth.signed_out", entityType: "session", entityId: u.sessionId, ip: req.ip });
    return { ok: true };
  });

  app.get("/me", async (req): Promise<Me> => loadMe(ctx, requireUser(req).id));

  app.patch("/me", async (req): Promise<Me> => {
    const u = requireUser(req);
    const body = parse(localeSchema, req.body);
    await db.user.update({ where: { id: u.id }, data: { locale: body.locale } });
    return loadMe(ctx, u.id);
  });
}

export async function loadMe({ db }: AppContext, userId: string): Promise<Me> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { factoryMembers: { include: { factory: true }, take: 1 }, staffRoles: { select: { role: true } } },
  });
  const staffRoles = user.staffRoles.map((s) => s.role);
  const factory = user.factoryMembers[0]?.factory;
  return {
    id: user.id,
    phone: user.phone,
    role: user.role,
    locale: user.locale === "en" ? "en" : "ar",
    factory: factory ? factoryDto(factory) : null,
    staffRoles,
    permissions: [...permissionsFor(principalOf({ role: user.role, staffRoles }))],
  };
}

/**
 * إعدادات ملف تعريف الجلسة في الموقع:
 *   - HttpOnly: كود الصفحة ما يقدر يقراه.
 *   - SameSite=Strict: المتصفح ما يرسله مع طلبات جاية من مواقع ثانية.
 *   - Secure: ما ينرسل إلا عبر HTTPS (في التجريبي والإنتاج. على جهاز المبرمج العنوان http).
 *   - Path=/api: ما ينرسل إلا لمسارات الخادم.
 */
export function sessionCookieOptions(appEnv: Config["APP_ENV"], maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: appEnv === "staging" || appEnv === "production",
    path: "/api",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
