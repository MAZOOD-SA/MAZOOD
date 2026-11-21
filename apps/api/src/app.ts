// تركيب الخادم: الحماية، والحدود، والمسارات، ومعالجة الأخطاء.
// buildApp ما يشغّل الخادم، بس يجهّزه. التشغيل في server.ts، والاختبارات تستخدمه مباشرة.
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { Config } from "./config.ts";
import type { Db } from "./db.ts";
import { makeRequireAuth } from "./auth/guard.ts";
import { CSRF_HEADER } from "./auth/policy.ts";
import { AccessTokens } from "./auth/tokens.ts";
import { HttpError } from "./lib/errors.ts";
import { authRoutes } from "./routes/auth.ts";
import { meRoutes } from "./routes/me.ts";
import { requestRoutes } from "./routes/requests.ts";
import type { SmsSender } from "./sms/index.ts";
import { createSmsSender } from "./sms/index.ts";

export type AppDeps = {
  config: Config;
  db: Db;
  sms: SmsSender;
  tokens: AccessTokens;
  requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
};

export async function buildApp(opts: { config: Config; db: Db; sms?: SmsSender }) {
  const { config, db } = opts;

  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 16 * 1024,
    logger: {
      level: config.LOG_LEVEL,
      // السجلات التقنية ما تحفظ مفاتيح دخول ولا كوكيز ولا أرقام جوال ولا رموز.
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
          "*.phone",
          "*.code",
          "*.refreshToken",
          "*.accessToken",
        ],
        censor: "[مخفي]",
      },
    },
  });

  const sms = opts.sms ?? createSmsSender(config, app.log);
  const tokens = new AccessTokens(config.SESSION_SECRET);
  const deps: AppDeps = { config, db, sms, tokens, requireAuth: makeRequireAuth(db, tokens) };

  await app.register(helmet, { crossOriginResourcePolicy: { policy: "same-site" } });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization", CSRF_HEADER],
    maxAge: 600,
  });
  await app.register(cookie);
  // حد عام على كل الخادم لكل عنوان IP. المسارات الحساسة لها حدود أشد.
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send(err.body());
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) {
      const after = Number(reply.getHeader("retry-after")) || 60;
      return reply.code(429).send({ error: "rate_limited", retryAfterSeconds: after });
    }
    // أخطاء Fastify نفسها (JSON غلط، أو حجم كبير، أو نوع محتوى غلط).
    if (status && status >= 400 && status < 500) return reply.code(400).send({ error: "invalid_input" });
    req.log.error({ err }, "خطأ غير متوقع");
    return reply.code(500).send({ error: "internal" });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "not_found" }));

  app.get("/health", { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok", db: "ok" };
    } catch {
      return reply.code(503).send({ status: "error", db: "down" });
    }
  });

  await app.register(async (scope) => authRoutes(scope, deps));
  await app.register(async (scope) => meRoutes(scope, deps));
  await app.register(async (scope) => requestRoutes(scope, deps));

  return app;
}
