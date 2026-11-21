// تحويل أخطاء الخادم لرسائل بنبرة BRAND.md: مختصرة، وتقول للمستخدم وش يسوي.
import type { StringKey } from "@/i18n/strings";
import { ApiError } from "./api";

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

/** رسالة «الرمز غلط» حسب عدد المحاولات الباقية (العربي يفرّق بين وحدة واثنتين والجمع). */
export function wrongCodeMessage(t: T, attemptsLeft: number): string {
  if (attemptsLeft <= 0) return t("codeLocked");
  if (attemptsLeft === 1) return t("codeWrongOne");
  if (attemptsLeft === 2) return t("codeWrongTwo");
  return t("codeWrongMany", { n: attemptsLeft });
}

export function errorMessage(t: T, e: unknown): string {
  if (!(e instanceof ApiError)) return t("errGeneric");
  switch (e.code) {
    case "network":
      return t("errNetwork");
    case "rate_limited":
      return t("errRateLimited", { m: Math.max(1, Math.ceil((e.body.retryAfterSeconds ?? 60) / 60)) });
    case "sms_failed":
      return t("errSms");
    case "code_wrong":
      return wrongCodeMessage(t, e.body.attemptsLeft ?? 0);
    case "code_expired":
      return t("codeExpired");
    case "account_suspended":
      return t("errSuspended");
    case "invalid_state":
      return t("errInvalidState");
    case "not_found":
      return t("notFound");
    default:
      return t("errGeneric");
  }
}
