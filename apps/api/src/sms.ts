// إرسال الرسائل النصية. مزوّد الرسائل الحقيقي ما انقرر للحين (سؤال ٥ في PLAN.md).
// لما ينقرر: نضيف كلاس جديد يطبّق SmsSender (مثل UnifonicSmsSender)، ونضيف اسمه في
// SMS_PROVIDER في config.ts، ومفتاحه في .env.example. باقي الكود ما يتغيّر.
import type { FastifyBaseLogger } from "fastify";
import { maskPhone } from "./security";

export interface SmsSender {
  sendOtp(phone: string, code: string, locale: "ar" | "en"): Promise<void>;
}

/** للتطوير والتجربة فقط: يكتب الرمز في سجل الخادم بدل ما يرسله. ممنوع في الإنتاج (config.ts). */
export class ConsoleSmsSender implements SmsSender {
  constructor(private log: FastifyBaseLogger) {}
  async sendOtp(phone: string, code: string): Promise<void> {
    this.log.warn({ phone: maskPhone(phone) }, `[رسالة تجريبية، ما انرسلت] رمز التحقق: ${code}`);
  }
}

/** نص الرسالة. يبدأ بالرمز عشان يطلع في التنبيه، وينتهي بتحذير من مشاركته. */
export function otpMessage(code: string, locale: "ar" | "en"): string {
  return locale === "ar"
    ? `${code} رمز الدخول إلى مزوّد. لا تشاركه مع أي أحد.`
    : `${code} is your Mazood sign-in code. Don't share it with anyone.`;
}
