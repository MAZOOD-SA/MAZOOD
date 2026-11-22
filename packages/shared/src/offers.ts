// قواعد إدخال العرض. الخادم يطبّقها، والواجهة تستخدمها لرسائل فورية.
import { z } from "zod";

/** نص حر: نشيل الأحرف التحكمية ونقص المسافات. */
const note = z
  .string()
  // eslint-disable-next-line no-control-regex
  .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
  .pipe(z.string().max(500, "too_long"));

/**
 * priceHalalas: سعر المزوّد بالهللة **قبل الضريبة** (رقم صحيح، والكسور تنرفض).
 * durationHours: مدة التنفيذ بالساعات.
 * validHours: صلاحية العرض بالساعات. اختياري: الافتراضي والحد الأقصى من الإعدادات (offerValidityHours).
 */
export const offerBody = z
  .object({
    priceHalalas: z.number().int("halalas_integer").positive().max(100_000_000_000),
    durationHours: z.number().int().min(1).max(2160),
    note: note.optional(),
    validHours: z.number().int().min(1).max(24 * 30).optional(),
  })
  .strict();
export type OfferBody = z.infer<typeof offerBody>;

export const OFFER_STATUSES = ["active", "withdrawn", "accepted", "rejected", "expired"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/**
 * طلب تعديل السعر أثناء التنفيذ (الإضافة ٩): العرض المقبول هو السعر النهائي، وأي تغيير يطلبه المزوّد
 * من التطبيق مع السبب، والمصنع يوافق أو يرفض. السعر الجديد بالهللة قبل الضريبة، ويقدر يكون أقل أو أكثر.
 */
export const priceChangeBody = z
  .object({
    newPriceHalalas: z.number().int("halalas_integer").positive().max(100_000_000_000),
    reason: note.pipe(z.string().min(5, "too_short")),
  })
  .strict();
export type PriceChangeBody = z.infer<typeof priceChangeBody>;

export const PRICE_CHANGE_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;
export type PriceChangeStatus = (typeof PRICE_CHANGE_STATUSES)[number];

/** صور التنفيذ: صور البدء وصور الانتهاء، حتى ٣ لكل مرحلة (الإضافة ١٠). */
export const ORDER_PHOTO_STAGES = ["start", "delivery"] as const;
export type OrderPhotoStage = (typeof ORDER_PHOTO_STAGES)[number];
export const ORDER_PHOTOS_PER_STAGE = 3;
