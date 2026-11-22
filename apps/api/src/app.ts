// تجميع الخادم: الأمان، وتحديد المحاولات، والمسارات، وتقديم الموقع.
// main.ts يشغّله للناس، والاختبارات تشغّله بنسخة خاصة (buildApp) بدون ما تفتح منفذ.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import { CSRF_HEADER, CSRF_VALUE, resolveUser } from "./auth";
import type { AppContext } from "./context";
import { HttpError, registerErrorHandler } from "./errors";
import { authRoutes } from "./routes/auth";
import { factoryRoutes } from "./routes/factory";
import { requestRoutes } from "./routes/requests";
import { sessionRoutes } from "./routes/sessions";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** كل مسارات الخادم تحت هذا البادئ، والموقع يأخذ باقي العناوين. */
export const API_PREFIX = "/api/v1";

export async function buildApp(ctx: AppContext, opts: FastifyServerOptions = {}) {
  const { config } = ctx;
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    logger: opts.logger ?? {
      level: config.APP_ENV === "test" ? "silent" : "info",
      // ما نكتب رموز الجلسات في السجلات أبدًا.
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    ...opts,
  });

  registerErrorHandler(app);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // react-native-web يكتب التنسيقات كـ <style> داخل الصفحة.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", ...origins(config.CORS_ORIGINS)],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  });

  const allowed = origins(config.CORS_ORIGINS);
  // credentials: الموقع وقت التطوير على منفذ ثاني (8081)، ويحتاج يرسل ملف تعريف الجلسة.
  if (allowed.length) await app.register(cors, { origin: allowed, methods: ["GET", "POST", "PUT", "PATCH"], credentials: true });
  await app.register(cookie);

  // حد عام للطلبات. المسارات الحساسة (الدخول، ورفع الطلبات) لها حدود أشد داخلها.
  // الحد يُحسب **لكل مستخدم** إذا كان داخل، ولكل عنوان IP قبل الدخول. السبب: موظفين كثير في
  // مصنع واحد غالبًا يطلعون للإنترنت من نفس العنوان، فلو حسبنا بالعنوان بس، ينحجبون مع بعض.
  // (hook: preHandler يعني الحد يُحسب بعد ما نعرف مين المستخدم من رمز الجلسة.)
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    hook: "preHandler",
    keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`),
  });

  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    if (!req.url.startsWith(API_PREFIX)) return;
    req.user = await resolveUser(ctx.db, req);
    // حماية CSRF: طلب يغيّر شي ويعتمد على ملف التعريف لازم يحمل رأسنا الخاص (شرحها في auth.ts).
    if (req.user?.via === "cookie" && !SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      throw new HttpError(403, "csrf");
    }
  });

  await app.register(
    async (api) => {
      api.addHook("onSend", async (_req, reply) => {
        // ردود الخادم فيها بيانات شخصية: ما تنحفظ في ذاكرة المتصفح أو أي وسيط.
        reply.header("cache-control", "no-store");
      });
      api.get("/health", async () => ({ ok: true }));
      await authRoutes(api, ctx);
      await factoryRoutes(api, ctx);
      await requestRoutes(api, ctx);
      await sessionRoutes(api, ctx);
    },
    { prefix: API_PREFIX },
  );

  // تقديم الموقع من نفس العنوان، إذا كان مبني (pnpm build:web).
  const webDir = config.WEB_DIST_DIR ? resolve(config.WEB_DIST_DIR) : null;
  const serveWeb = !!webDir && existsSync(webDir);
  if (serveWeb) await app.register(fastifyStatic, { root: webDir });

  app.setNotFoundHandler((req, reply) => {
    // عناوين الشاشات (مثل /home أو /request/123) ترجع صفحة الموقع، والموقع يعرض الشاشة الصح.
    // أما ملف ناقص (فيه امتداد مثل .js) فيرجع ٤٠٤ عادي.
    const path = req.url.split("?")[0];
    if (serveWeb && req.method === "GET" && !path.startsWith(API_PREFIX) && !/\.[a-z0-9]+$/i.test(path)) return reply.sendFile("index.html");
    return reply.status(404).send({ error: "not_found" });
  });

  return app;
}

function origins(list: string): string[] {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
