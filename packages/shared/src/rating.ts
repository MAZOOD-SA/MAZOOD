// التقييم بالنجوم (المرحلة ٤، الخطوة ٩): المصنع يقيّم المزوّد مرة وحدة بعد اكتمال الطلب، وهو اختياري.
// ما فيه تعليق مكتوب الحين (القرار ٣٣): الحقل موجود في الجدول وفاضي، والطلب ما يقبل نص.
import { z } from "zod";

export const rateOrderBody = z.object({ stars: z.number().int().min(1).max(5) }).strict();
export type RateOrderBody = z.infer<typeof rateOrderBody>;

/** متوسط تقييم المزوّد كما يظهر في بطاقة العرض: رقم بخانة عشرية وحدة، وعدد التقييمات. بدون تقييمات: null. */
export type RatingSummary = { average: number; count: number } | null;

export function ratingSummary(totalStars: number, count: number): RatingSummary {
  if (count <= 0) return null;
  return { average: Math.round((totalStars / count) * 10) / 10, count };
}
