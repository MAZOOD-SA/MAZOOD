import { requestOtpBody, verifyOtpBody } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { requestOtp, revokeSession, verifyOtp, type SessionUser } from "../auth.ts";
import { parse, SESSION_COOKIE, sessionCookieOptions, type Ctx, type Guards } from "../http.ts";
import { SESSION_TTL_MS } from "../auth.ts";

export function publicUser(u: SessionUser) {
  return { id: u.id, phone: u.phone, role: u.role, staffRole: u.staffRole, factoryRole: u.factoryRole, hasFactory: !!u.factoryId, hasProvider: !!u.providerId };
}

export function authRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const authLimit = (max: number) => ({ config: { rateLimit: { max: ctx.strictRateLimits ? max : 100_000, timeWindow: "10 minutes" } } });

  app.post("/v1/auth/otp/request", authLimit(20), async (req, reply) => {
    const { phone } = parse(requestOtpBody, req.body);
    const r = await requestOtp(ctx.db, ctx.sms, ctx.config.authSecret, phone, ctx.now());
    // نفس الرد سواء الرقم مسجّل أو جديد: ما نكشف مين عندنا.
    return reply.status(202).send({ ok: true, retryAfterSeconds: r.retryAfterSeconds });
  });

  app.post("/v1/auth/otp/verify", authLimit(30), async (req, reply) => {
    const { phone, code, as, channel } = parse(verifyOtpBody, req.body);
    const { token, user } = await verifyOtp(ctx.db, ctx.config.authSecret, phone, code, ctx.now(), as);
    if (channel === "web") {
      // الموقع: الرمز في كوكي محمي بس، وما يرجع في الرد (كود الصفحة ما يشوفه أبدًا).
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(ctx.config.env, SESSION_TTL_MS));
      return { user: publicUser(user) };
    }
    return { token, user: publicUser(user) };
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const user = await g.authenticate(req);
    await revokeSession(ctx.db, req.token!, user);
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(ctx.config.env, 0));
    return reply.status(204).send();
  });
}
