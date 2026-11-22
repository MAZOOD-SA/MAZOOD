// الأخطاء اللي يرجعها الخادم. كل خطأ له رمز ثابت (مثل "not_found")،
// والتطبيق يترجمه لرسالة واضحة. ما نرجع أبدًا تفاصيل داخلية (مثل نص خطأ قاعدة البيانات).
import type { ApiError } from "@mazood/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: Omit<ApiError, "error"> = {},
  ) {
    super(code);
  }
}

export const notFound = () => new HttpError(404, "not_found");
export const forbidden = () => new HttpError(403, "forbidden");
/** العملية ما تنفع على حالة الطلب الحالية (مثل قبول عرض على طلب ملغي). */
export const conflict = (code = "invalid_state") => new HttpError(409, code);

/** يتحقق من المدخل بقاعدة Zod، ويرجع خطأ ٤٠٠ برمز أول مشكلة واسم الحقل. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const field = issue?.path.join(".") || undefined;
  // رسائلنا في shared/schemas.ts رموز قصيرة. أي رسالة ثانية من Zod نفسه تصير "invalid_input".
  const code = issue && /^[a-z_]+$/.test(issue.message) ? issue.message : "invalid_input";
  throw new HttpError(400, code, { field });
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      if (err.extra.retryAfterSeconds) reply.header("retry-after", String(err.extra.retryAfterSeconds));
      return reply.status(err.status).send({ error: err.code, ...err.extra } satisfies ApiError);
    }
    // تحديد المحاولات العام (@fastify/rate-limit) وأخطاء Fastify المعروفة.
    const status = err.statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ error: "rate_limited" } satisfies ApiError);
    if (status >= 400 && status < 500) return reply.status(status).send({ error: "bad_request" } satisfies ApiError);
    req.log.error({ err }, "خطأ غير متوقع");
    return reply.status(500).send({ error: "server_error" } satisfies ApiError);
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: "not_found" } satisfies ApiError));
}
