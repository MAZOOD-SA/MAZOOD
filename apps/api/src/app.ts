// بناء تطبيق الـ API. كل الصلاحيات تُفحص هنا في الخادم، والواجهة ما تُصدَّق أبدًا.
// المسارات مقسّمة في routes/: الدخول، والمصنع، والمزوّد، ولوحة الإدارة.
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { UPLOAD_MAX_BYTES } from "@mazood/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Config } from "./config.ts";
import { createCryptoBox } from "./crypto-box.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { makeGuards, type Ctx } from "./http.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import { factoryRoutes } from "./routes/factory.ts";
import { providerRoutes } from "./routes/provider.ts";
import type { SmsSender } from "./sms.ts";
import { memoryStorage, type FileStorage } from "./storage.ts";

export type AppDeps = {
  db: Db;
  sms: SmsSender;
  config: Config;
  storage?: FileStorage;
  now?: () => Date;
  /** في الاختبارات نرفع حدود الـ IP عشان ما تتداخل، وعندنا اختبار مخصص يشغّلها. */
  strictRateLimits?: boolean;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const ctx: Ctx = {
    db: deps.db,
    sms: deps.sms,
    config,
    storage: deps.storage ?? memoryStorage(),
    box: createCryptoBox(config.dataEncryptionKey),
    now: deps.now ?? (() => new Date()),
    strictRateLimits: deps.strictRateLimits ?? config.env !== "test",
  };

  const app = Fastify({
    logger: config.env === "test" ? false : { level: "info", redact: ["req.headers.authorization"] },
    trustProxy: config.trustProxy,
    bodyLimit: 100 * 1024,
  });

  // CORS: بس الأصول المسموحة. في التطوير بدون قائمة نسمح بأي أصل (ما فيه كوكيز، والدخول بتوكن).
  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : config.env !== "production",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["authorization", "content-type"],
  });
  // حد عام لكل IP. مسارات الدخول لها حد أضيق (routes/auth.ts).
  await app.register(rateLimit, { global: true, max: ctx.strictRateLimits ? 120 : 100_000, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 } });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("cache-control", "no-store");
    reply.header("referrer-policy", "no-referrer");
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: { code: err.code, ...err.extra } });
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "validation", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      });
    }
    const e = err as { statusCode?: number; code?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: { code: "rate_limited" } });
    if (e.code === "FST_REQ_FILE_TOO_LARGE") return reply.status(413).send({ error: { code: "file_too_large" } });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: { code: "bad_request" } });
    req.log.error(err);
    // ما نرجّع تفاصيل الخطأ الداخلي للعميل.
    return reply.status(500).send({ error: { code: "internal" } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: "not_found" } }));

  app.get("/health", async () => ({ ok: true }));

  const guards = makeGuards(ctx);
  authRoutes(app, ctx, guards);
  factoryRoutes(app, ctx, guards);
  providerRoutes(app, ctx, guards);
  adminRoutes(app, ctx, guards);
  return app;
}
