// إرسال الرسائل النصية. الخادم يتعامل مع واجهة SmsSender بس، فتبديل المزوّد
// (Unifonic أو Taqnyat أو Msegat، سؤال 5 في PLAN.md) يكون بإضافة صنف جديد هنا وتغيير SMS_PROVIDER.
import type { FastifyBaseLogger } from "fastify";
import { maskMobile } from "@mazood/shared";
import type { Config } from "../config.ts";

export interface SmsSender {
  /** يرسل رسالة. يرمي خطأ إذا فشل الإرسال. */
  send(toE164: string, text: string): Promise<void>;
}

/**
 * للتطوير بس: يكتب الرسالة (وفيها الرمز) في سجل الخادم بدل ما يرسلها.
 * يرفض يشتغل إذا NODE_ENV=production، عشان ما تنكشف الرموز في التشغيل الحقيقي.
 */
export class ConsoleSmsSender implements SmsSender {
  constructor(
    private readonly log: Pick<FastifyBaseLogger, "warn">,
    nodeEnv: Config["NODE_ENV"],
  ) {
    if (nodeEnv === "production") {
      throw new Error("ConsoleSmsSender ممنوع في production: الرموز بتنكتب في السجل. اختر مزوّد رسائل حقيقي.");
    }
  }

  async send(toE164: string, text: string): Promise<void> {
    this.log.warn({ to: maskMobile(toE164) }, `[SMS للتطوير فقط] ${text}`);
  }
}

export function createSmsSender(config: Config, log: Pick<FastifyBaseLogger, "warn">): SmsSender {
  switch (config.SMS_PROVIDER) {
    case "console":
      return new ConsoleSmsSender(log, config.NODE_ENV);
  }
}
