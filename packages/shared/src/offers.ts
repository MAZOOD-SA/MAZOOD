// قواعد إدخال العرض. الخادم يطبّقها، والواجهة تستخدمها لرسائل فورية.
import { z } from "zod";
import type { CategoryId } from "./categories.ts";

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
    inclusions: z.record(z.string().max(40), z.enum(["included", "excluded"])).optional(),
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

/**
 * «يشمل / ما يشمل» (فكرة ايكيا، docs/plans/ikea-ideas.md المهمة ٥-ب، القرار ٥٧).
 * بنود ثابتة لكل قسم، يجاوب عليها المزوّد مع عرضه، والعميل يشوفها تحت السعر.
 * **القائمة مبدئية وقابلة للتغيير (قرار المالك ٢٣ نوفمبر ٢٠٢٦).** لتغييرها: عدّل هنا، وأضف اسم البند
 * في الواجهة (apps/app/src/data/inclusions.ts). في المرحلة ٦ تنتقل للوحة الإدارة.
 * لو شلت بند، العروض القديمة اللي فيها البند ما تنكسر: الواجهة تتجاهل البند اللي ما له اسم.
 */
export const OFFER_INCLUSIONS: Record<CategoryId, readonly string[]> = {
  transport: ["loading", "unloading", "waiting_over_2h"],
  maintenance: ["parts", "inspection_fee", "warranty"],
  materials: ["delivery", "unloading_spreading"],
  security: ["delivery", "installation", "guard_gear"],
  cleaning: ["delivery", "setup"],
  customs: ["government_fees", "port_transport"],
  pest_control: ["pesticides", "revisit"],
};

export type InclusionValue = "included" | "excluded";
export type Inclusions = Record<string, InclusionValue>;

/**
 * يتحقق إن البنود هي بنود القسم بالضبط: ولا بند ناقص، ولا بند غريب. يرجّع رمز الخطأ أو null.
 * العرض بدون بنود (undefined) مقبول: نسخ التطبيق القديمة على الجوالات ما تعرف الميزة. التطبيق الجديد يلزم بها.
 */
export function inclusionsError(category: string, inclusions: Inclusions | undefined): "inclusions_incomplete" | "inclusions_unknown" | null {
  if (inclusions === undefined) return null;
  const allowed = OFFER_INCLUSIONS[category as CategoryId] ?? [];
  if (Object.keys(inclusions).some((k) => !allowed.includes(k))) return "inclusions_unknown";
  if (allowed.some((k) => !(k in inclusions))) return "inclusions_incomplete";
  return null;
}
