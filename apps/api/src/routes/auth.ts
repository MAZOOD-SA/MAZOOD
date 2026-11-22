import { requestOtpBody, verifyOtpBody } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { requestOtp, revokeSession, verifyOtp, type SessionUser } from "../auth.ts";
import { parse, type Ctx, type Guards } from "../http.ts";

export function publicUser(u: SessionUser) {
  return { id: u.id, phone: u.phone, role: u.role, staffRole: u.staffRole, hasFactory: !!u.factoryId, hasProvider: !!u.providerId };
}

export function authRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const authLimit = (max: number) => ({ config: { rateLimit: { max: ctx.strictRateLimits ? max : 100_000, timeWindow: "10 minutes" } } });

  app.post("/v1/auth/otp/request", authLimit(20), async (req, reply) => {
    const { phone } = parse(requestOtpBody, req.body);
    const r = await requestOtp(ctx.db, ctx.sms, ctx.config.authSecret, phone, ctx.now());
    // نفس الرد سواء الرقم مسجّل أو جديد: ما نكشف مين عندنا.
    return reply.status(202).send({ ok: true, retryAfterSeconds: r.retryAfterSeconds });
  });

  app.post("/v1/auth/otp/verify", authLimit(30), async (req) => {
    const { phone, code, as } = parse(verifyOtpBody, req.body);
    const { token, user } = await verifyOtp(ctx.db, ctx.config.authSecret, phone, code, ctx.now(), as);
    return { token, user: publicUser(user) };
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const user = await g.authenticate(req);
    await revokeSession(ctx.db, req.token!, user);
    return reply.status(204).send();
  });
}
