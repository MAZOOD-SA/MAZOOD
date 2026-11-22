// إرسال الرسائل النصية. واجهة وحدة، والمزوّد الحقيقي (Unifonic أو Taqnyat أو Msegat...)
// يُضاف كـ adapter بعد ما المالك يختار المزوّد ويسجّل اسم المرسل (سؤال ٥ في PLAN.md).
import { maskPhone } from "./security.ts";

export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

/** للتطوير فقط: يطبع الرسالة في الطرفية. الإعدادات ترفض هذا الخيار في الإنتاج. */
export function consoleSms(log: (m: string) => void = console.log): SmsSender {
  return {
    async send(phone, text) {
      log(`[SMS تطوير] إلى ${phone}: ${text}`);
    },
  };
}

/** لما ما فيه مزوّد مضبوط: نفشل بوضوح بدل ما نتظاهر بإننا أرسلنا. */
export function noSms(): SmsSender {
  return {
    async send(phone) {
      throw new Error(`ما فيه مزوّد رسائل مضبوط. ما أُرسل شي إلى ${maskPhone(phone)}`);
    },
  };
}
