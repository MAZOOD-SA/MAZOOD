// الأخطاء اللي يرجعها الخادم للتطبيق. كل خطأ له كود ثابت (packages/shared/src/errors.ts)
// والتطبيق يحوّله لرسالة. ما نرجع أبدًا تفاصيل تقنية أو نص الخطأ الداخلي.
import type { ApiErrorBody, ErrorCode } from "@mazood/shared";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    readonly extra: Omit<ApiErrorBody, "error"> = {},
  ) {
    super(code);
  }

  body(): ApiErrorBody {
    return { error: this.code, ...this.extra };
  }
}

export const notFound = () => new HttpError(404, "not_found");
export const unauthorized = () => new HttpError(401, "unauthorized");
export const forbidden = () => new HttpError(403, "forbidden");
