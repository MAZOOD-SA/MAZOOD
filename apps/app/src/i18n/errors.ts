// تحويل أخطاء الخادم لرسالة مفهومة للمستخدم.
import { ApiRequestError } from "@/api/client";
import type { StringKey } from "./strings";
import { strings } from "./strings";

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

export function errorMessage(err: unknown, t: T): string {
  if (!(err instanceof ApiRequestError)) return t("err_generic");
  if (err.code === "rate_limited") {
    return err.retryAfterSeconds && err.retryAfterSeconds < 600 ? t("err_rate_limited", { n: err.retryAfterSeconds }) : t("err_rate_limited_plain");
  }
  const key = `err_${err.code}` as StringKey;
  return key in strings.ar ? t(key) : t("err_generic");
}
