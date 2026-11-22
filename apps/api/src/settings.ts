// إعدادات المنصة المحفوظة في قاعدة البيانات (جدول settings).
// الفرق بينها وبين config.ts: هذي تتغيّر من لوحة الإدارة بدون مبرمج (المرحلة ٦)،
// وconfig.ts إعدادات تقنية يحددها المبرمج وقت النشر.
import { DEFAULT_CANCEL_POLICY, type CancelPolicy } from "@mazood/shared";
import { z } from "zod";
import type { Db } from "./db";

const cancelPolicySchema = z.object({ freeCancelUntil: z.enum(["provider_starts", "offer_accepted"]) });

/** سياسة الإلغاء الحالية. لو ما انحفظت أو انحفظت غلط، نرجع للمعتمدة مبدئيًا. */
export async function getCancelPolicy(db: Db): Promise<CancelPolicy> {
  const row = await db.setting.findUnique({ where: { key: "cancel_policy" } });
  const parsed = cancelPolicySchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_CANCEL_POLICY;
}

export async function setCancelPolicy(db: Db, policy: CancelPolicy): Promise<void> {
  const value = cancelPolicySchema.parse(policy);
  await db.setting.upsert({ where: { key: "cancel_policy" }, create: { key: "cancel_policy", value }, update: { value } });
}
