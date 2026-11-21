// مسارات الدخول: طلب الرمز، والتحقق منه، وتجديد الجلسة، والخروج.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { otpRequestSchema, otpVerifySchema, refreshSchema, type ClientKind, type SessionDto } from "@mazood/shared";
import type { AppDeps } from "../app.ts";
import { requestOtp, verifyOtp } from "../auth/otp.ts";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  SESSION_TTL_SECONDS,
} from "../auth/policy.ts";
import { createSession, revokeSession, rotateRefreshToken, sessionIdFromRefreshToken } from "../auth/sessions.ts";
import { audit } from "../lib/audit.ts";
import { HttpError, unauthorized } from "../lib/errors.ts";
import { loadMe } from "../lib/me.ts";
import { parse } from "../lib/validate.ts";

export async function authRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db, config, sms, tokens } = deps;

  // حد إضافي لكل عنوان IP على مسارات الدخول، فوق حدود كل رقم جوال.
  const authRateLimit = { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } };

  function setRefreshCookie(reply: FastifyReply, token: string) {
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true, // JavaScript في المتصفح ما يقدر يقرأه
      secure: true, // ما ينرسل إلا على HTTPS (المتصفحات تستثني localhost للتطوير)
      sameSite: "strict", // ما ينرسل من مواقع ثانية
      path: REFRESH_COOKIE_PATH,
      maxAge: SESSION_TTL_SECONDS,
    });
  }

  function clearRefreshCookie(reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH, httpOnly: true, secure: true, sameSite: "strict" });
  }

  /** مفتاح التجديد: من الكوكي في المتصفح، ومن الطلب نفسه في الجوال. */
  function presentedRefreshToken(req: FastifyRequest, client: ClientKind, bodyToken?: string): string | undefined {
    if (client === "native") return bodyToken;
    if (req.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) throw new HttpError(403, "forbidden");
    return req.cookies[REFRESH_COOKIE];
  }

  async function sessionResponse(
    reply: FastifyReply,
    s: { sessionId: string; userId: string; refreshToken: string },
    client: ClientKind,
  ): Promise<SessionDto> {
    const accessToken = await tokens.sign({ sub: s.userId, sid: s.sessionId });
    const me = await loadMe(db, s.userId);
    if (client === "web") {
      setRefreshCookie(reply, s.refreshToken);
      return { accessToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS, me };
    }
    return { accessToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS, refreshToken: s.refreshToken, me };
  }

  app.post("/auth/otp/request", authRateLimit, async (req) => {
    const { phone } = parse(otpRequestSchema, req.body);
    const r = await requestOtp({ db, sms, pepper: config.OTP_PEPPER }, { phone, ip: req.ip });
    // نفس الرد دائمًا، سواء الرقم مسجّل أو جديد.
    return { sent: true, expiresInSeconds: r.expiresInSeconds };
  });

  app.post("/auth/otp/verify", authRateLimit, async (req, reply) => {
    const input = parse(otpVerifySchema, req.body);
    await verifyOtp({ db, pepper: config.OTP_PEPPER }, input);

    // الرمز صح: نلاقي المستخدم أو ننشئه. أي رقم جديد يبدأ بدور «مصنع».
    // (المزوّدين يسجّلون من مسار خاص في المرحلة 3.)
    const existing = await db.user.findUnique({ where: { phone: input.phone } });
    const user = existing ?? (await db.user.create({ data: { phone: input.phone, role: "factory" } }));
    if (user.status !== "active") throw new HttpError(403, "account_suspended");

    const s = await createSession(db, user.id, input.client);
    await audit(db, {
      action: "auth.login",
      actorUserId: user.id,
      entityType: "session",
      entityId: s.sessionId,
      metadata: { client: input.client, newUser: !existing },
    });
    return sessionResponse(reply, { ...s, userId: user.id }, input.client);
  });

  app.post("/auth/refresh", authRateLimit, async (req, reply) => {
    const input = parse(refreshSchema, req.body);
    const presented = presentedRefreshToken(req, input.client, input.refreshToken);
    if (!presented) throw unauthorized();
    try {
      const s = await rotateRefreshToken(db, presented);
      return await sessionResponse(reply, s, input.client);
    } catch (e) {
      if (input.client === "web") clearRefreshCookie(reply);
      throw e;
    }
  });

  app.post("/auth/logout", async (req, reply) => {
    const input = parse(refreshSchema, req.body);
    const presented = presentedRefreshToken(req, input.client, input.refreshToken);
    const sessionId = presented ? await sessionIdFromRefreshToken(db, presented) : null;
    if (sessionId) {
      await revokeSession(db, sessionId, "logout");
      await audit(db, { action: "auth.logout", entityType: "session", entityId: sessionId });
    }
    if (input.client === "web") clearRefreshCookie(reply);
    // الخروج ينجح دائمًا، حتى لو الجلسة منتهية أصلًا.
    return reply.code(204).send();
  });
}
