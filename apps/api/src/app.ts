// بناء تطبيق الـ API. كل الصلاحيات تُفحص هنا في الخادم، والواجهة ما تُصدَّق أبدًا.
// القاعدة الذهبية: هوية المصنع تجي من الجلسة، ما تجي أبدًا من اللي يرسله العميل.
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  createRequestBody,
  factoryProfileBody,
  requestOtpBody,
  uuidSchema,
  verifyOtpBody,
} from "@mazood/shared";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { audit } from "./audit.ts";
import { requestOtp, revokeSession, sessionUserByToken, verifyOtp, type SessionUser } from "./auth.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import type { SmsSender } from "./sms.ts";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
    token?: string;
  }
}

export type AppDeps = {
  db: Db;
  sms: SmsSender;
  config: Config;
  now?: () => Date;
  /** في الاختبارات نرفع حدود الـ IP عشان ما تتداخل، وعندنا اختبار مخصص يشغّلها. */
  strictRateLimits?: boolean;
};

const REQUEST_COLUMNS = `id, category, type_id AS "typeId", details, location, needed_when AS "when", status, created_at AS "createdAt"`;

export async function buildApp({ db, sms, config, now = () => new Date(), strictRateLimits = config.env !== "test" }: AppDeps): Promise<FastifyInstance> {
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
  // حد عام لكل IP. مسارات الدخول لها حد أضيق (تحت).
  await app.register(rateLimit, { global: true, max: strictRateLimits ? 120 : 100_000, timeWindow: "1 minute" });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("cache-control", "no-store");
    reply.header("referrer-policy", "no-referrer");
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, ...err.extra } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "validation", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      });
    }
    const e = err as { statusCode?: number; code?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: { code: "rate_limited" } });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: { code: e.code ?? "bad_request" } });
    req.log.error(err);
    // ما نرجّع تفاصيل الخطأ الداخلي للعميل.
    return reply.status(500).send({ error: { code: "internal" } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: "not_found" } }));

  const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> => schema.parse(data);

  // ---------- صلاحيات ----------
  async function authenticate(req: FastifyRequest): Promise<void> {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token || token.length > 200) throw new ApiError(401, "unauthorized");
    const user = await sessionUserByToken(db, token, now());
    if (!user) throw new ApiError(401, "unauthorized");
    req.user = user;
    req.token = token;
  }
  /** يتأكد إن المستخدم مصنع وعنده مصنع. يرجّع معرّف المصنع من الجلسة. */
  async function requireFactory(req: FastifyRequest): Promise<{ user: SessionUser; factoryId: string }> {
    await authenticate(req);
    const user = req.user!;
    if (user.role !== "factory" || !user.factoryId) throw new ApiError(403, "forbidden");
    return { user, factoryId: user.factoryId };
  }

  const authLimit = (max: number) => ({ config: { rateLimit: { max: strictRateLimits ? max : 100_000, timeWindow: "10 minutes" } } });

  app.get("/health", async () => ({ ok: true }));

  // ---------- الدخول ----------
  app.post("/v1/auth/otp/request", authLimit(20), async (req, reply) => {
    const { phone } = parse(requestOtpBody, req.body);
    const r = await requestOtp(db, sms, config.authSecret, phone, now());
    // نفس الرد سواء الرقم مسجّل أو جديد: ما نكشف مين عندنا.
    return reply.status(202).send({ ok: true, retryAfterSeconds: r.retryAfterSeconds });
  });

  app.post("/v1/auth/otp/verify", authLimit(30), async (req) => {
    const { phone, code } = parse(verifyOtpBody, req.body);
    const { token, user } = await verifyOtp(db, config.authSecret, phone, code, now());
    return { token, user: publicUser(user) };
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    await authenticate(req);
    await revokeSession(db, req.token!, req.user!);
    return reply.status(204).send();
  });

  // ---------- الحساب ----------
  app.get("/v1/me", async (req) => {
    await authenticate(req);
    const user = req.user!;
    const factory = user.factoryId ? await loadFactory(db, user.factoryId) : null;
    return { user: publicUser(user), factory };
  });

  app.put("/v1/factory", async (req) => {
    const { user, factoryId } = await requireFactory(req);
    const body = parse(factoryProfileBody, req.body);
    await db.query(
      `UPDATE factories SET name=$2, city=$3, commercial_register=$4, vat_number=$5, updated_at=now() WHERE id=$1`,
      [factoryId, body.name, body.city, body.commercialRegister, body.vatNumber],
    );
    // في السجل نكتب أن الحساب تحدّث، بدون أرقام السجل والضريبة.
    await audit(db, { id: user.id, role: user.role }, "factory.profile_updated", { type: "factory", id: factoryId });
    return { factory: await loadFactory(db, factoryId) };
  });

  // ---------- الطلبات ----------
  app.post("/v1/requests", async (req, reply) => {
    const { user, factoryId } = await requireFactory(req);
    const body = parse(createRequestBody, req.body);
    const [row] = await db.query(
      `INSERT INTO requests (factory_id, category, type_id, details, location, needed_when)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${REQUEST_COLUMNS}`,
      [factoryId, body.category, body.typeId, body.details, body.location, body.when],
    );
    await audit(db, { id: user.id, role: user.role }, "request.created", { type: "request", id: String(row.id) }, {
      category: body.category,
    });
    return reply.status(201).send({ request: row });
  });

  app.get("/v1/requests", async (req) => {
    const { factoryId } = await requireFactory(req);
    const rows = await db.query(
      `SELECT ${REQUEST_COLUMNS} FROM requests WHERE factory_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [factoryId],
    );
    return { requests: rows };
  });

  app.get("/v1/requests/:id", async (req) => {
    const { factoryId } = await requireFactory(req);
    return { request: await ownRequest(db, factoryId, (req.params as { id: string }).id) };
  });

  // الإلغاء مسموح قبل قبول أي عرض بس (قاعدة المنتج: ولا مرة طريق مسدود، لكن بعد القبول الإلغاء له سياسة، سؤال ١٥).
  app.post("/v1/requests/:id/cancel", async (req) => {
    const { user, factoryId } = await requireFactory(req);
    const id = (req.params as { id: string }).id;
    await ownRequest(db, factoryId, id);
    // الشرط في نفس الأمر (status = awaiting_offers) عشان ما يصير تعارض لو انقبل عرض في نفس اللحظة.
    const rows = await db.query(
      `UPDATE requests SET status='cancelled', updated_at=now()
        WHERE id=$1 AND factory_id=$2 AND status='awaiting_offers' RETURNING ${REQUEST_COLUMNS}`,
      [id, factoryId],
    );
    if (rows.length === 0) throw new ApiError(409, "request_not_cancellable");
    await audit(db, { id: user.id, role: user.role }, "request.cancelled", { type: "request", id });
    return { request: rows[0] };
  });

  return app;
}

function publicUser(u: SessionUser) {
  return { id: u.id, phone: u.phone, role: u.role, hasFactory: !!u.factoryId };
}

async function loadFactory(db: Db, factoryId: string) {
  const [f] = await db.query<{
    id: string;
    name: string | null;
    city: string | null;
    commercialRegister: string | null;
    vatNumber: string | null;
  }>(
    `SELECT id, name, city, commercial_register AS "commercialRegister", vat_number AS "vatNumber" FROM factories WHERE id=$1`,
    [factoryId],
  );
  return { ...f, profileComplete: !!(f.name && f.city && f.commercialRegister && f.vatNumber) };
}

/** طلب يخص هذا المصنع بس. لو الطلب لمصنع ثاني نرجّع «غير موجود» (مو «ممنوع») عشان ما نكشف وجوده. */
async function ownRequest(db: Db, factoryId: string, id: string) {
  if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
  const rows = await db.query(`SELECT ${REQUEST_COLUMNS} FROM requests WHERE id=$1 AND factory_id=$2`, [id, factoryId]);
  if (rows.length === 0) throw new ApiError(404, "not_found");
  return rows[0];
}

export type { FastifyReply };
