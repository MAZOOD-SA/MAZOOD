// سوق منتجات المصانع (خطة docs/plans/customers-and-market.md، القسم ٤). قواعد التحقق والأرقام الثابتة.
// الحلقة: المشتري يطلب سعر بكمية ← المصنع البائع يرد بسعر ومدة ← المشتري يقبل أو يرفض أو يطلب تعديل مرة وحدة.
// المبالغ كلها بالهللة (أعداد صحيحة) قبل الضريبة، مثل العروض.
import { z } from "zod";
import { cityIdSchema, CUSTOMER_KINDS, whenSchema } from "./schemas.ts";

/** الوحدات اللي يبيع بها المصنع. تنضاف وحدة جديدة هنا وفي نصوص الواجهة. */
export const PRODUCT_UNITS = ["pallet", "carton", "ton", "kg", "piece", "meter", "square_meter", "liter", "bag", "roll"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/** صور المنتج: حتى ٥، كل وحدة ٣ ميجا بالكثير (الواجهة تضغطها قبل الرفع). */
export const PRODUCT_MAX_IMAGES = 5;
export const PRODUCT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const text = (min: number, max: number) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min, "too_short").max(max, "too_long"));

/** أقصى سعر وحدة: مليون ريال (حماية من خطأ في الكتابة). */
const unitPrice = z.number().int("halalas_integer").min(1).max(100_000_000);
const qty = z.number().int().min(1).max(10_000_000);

/** شرائح السعر: «من ١٠٠ وحدة بسعر أقل». مرتبة تصاعديًا، وكل شريحة أرخص من اللي قبلها. */
const priceTiers = z
  .array(z.object({ minQty: qty, unitPriceHalalas: unitPrice }).strict())
  .max(5)
  .superRefine((tiers, ctx) => {
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].minQty <= tiers[i - 1].minQty || tiers[i].unitPriceHalalas >= tiers[i - 1].unitPriceHalalas) {
        ctx.addIssue({ code: "custom", path: [i], message: "tiers_not_increasing" });
      }
    }
  });

/**
 * المنتج: سعر جملة معلن (fixed) أو «اطلب سعر» (quote) بدون سعر معلن.
 * الاسم والوصف نص حر، ونمنع فيه أرقام التواصل والروابط في الخادم (نفس قاعدة الخدمات).
 */
export const productBody = z
  .object({
    name: text(2, 120),
    categoryId: z.string().regex(/^[a-z_]{2,40}$/, "category_invalid"),
    description: text(10, 3000),
    unit: z.enum(PRODUCT_UNITS),
    minOrderQty: qty,
    pricing: z.enum(["fixed", "quote"]),
    unitPriceHalalas: unitPrice.nullable().optional(),
    priceTiers: priceTiers.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.pricing === "fixed" && !v.unitPriceHalalas) ctx.addIssue({ code: "custom", path: ["unitPriceHalalas"], message: "price_required" });
    if (v.pricing === "quote" && (v.unitPriceHalalas || v.priceTiers?.length)) {
      ctx.addIssue({ code: "custom", path: ["unitPriceHalalas"], message: "quote_has_no_price" });
    }
    const first = v.priceTiers?.[0];
    if (first && v.unitPriceHalalas && (first.minQty <= v.minOrderQty || first.unitPriceHalalas >= v.unitPriceHalalas)) {
      ctx.addIssue({ code: "custom", path: ["priceTiers"], message: "tiers_not_increasing" });
    }
  });
export type ProductBody = z.infer<typeof productBody>;

/** سعر الوحدة لكمية معيّنة من السعر المعلن وشرائحه. null للمنتج بدون سعر معلن. */
export function unitPriceFor(p: { pricing: "fixed" | "quote"; unitPriceHalalas: number | null; priceTiers: { minQty: number; unitPriceHalalas: number }[] }, quantity: number): number | null {
  if (p.pricing !== "fixed" || !p.unitPriceHalalas) return null;
  let price = p.unitPriceHalalas;
  for (const t of p.priceTiers) if (quantity >= t.minQty) price = t.unitPriceHalalas;
  return price;
}

/** طلب السعر من المشتري: الكمية والمدينة والموعد وملاحظة (بدون أرقام أو روابط). */
export const purchaseRequestBody = z
  .object({
    quantity: qty,
    cityId: cityIdSchema.optional(),
    when: whenSchema.or(z.literal("this_month")),
    note: text(0, 1000).optional(),
  })
  .strict();
export type PurchaseRequestBody = z.infer<typeof purchaseRequestBody>;

/** رد المصنع: سعر الوحدة النهائي، ومدة التوريد بالأيام، وهل التوصيل عليه، وصلاحية الرد. */
export const purchaseQuoteBody = z
  .object({
    unitPriceHalalas: unitPrice,
    leadTimeDays: z.number().int().min(0).max(365),
    deliveryIncluded: z.boolean(),
    validDays: z.number().int().min(1).max(30),
    note: text(0, 1000).optional(),
  })
  .strict();
export type PurchaseQuoteBody = z.infer<typeof purchaseQuoteBody>;

/** طلب تعديل الرد (مرة وحدة) أو رفضه: السبب اختياري. */
export const purchaseNoteBody = z.object({ note: text(0, 500).optional() }).strict();

/**
 * حالات طلب الشراء:
 *  - pending: وصل للمصنع وما رد.     - quoted: رد المصنع، ينتظر المشتري.
 *  - revision_requested: المشتري طلب تعديل (مرة وحدة).
 *  - accepted: اتفقوا، والتواصل ظهر.  - received: المشتري أكّد الاستلام.
 *  - rejected: المشتري رفض الرد.      - declined: المصنع اعتذر.
 *  - cancelled: المشتري ألغى قبل الاتفاق. - expired: الرد انتهت صلاحيته (تنحسب وقت القراءة).
 */
export const PURCHASE_STATUSES = ["pending", "quoted", "revision_requested", "accepted", "received", "rejected", "declined", "cancelled", "expired"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/**
 * مين يقدر يشتري من السوق: أنواع العميل (منشأة أو فرد) + المزوّد الموثّق
 * (قرار المالك 23 نوفمبر 2026: المزوّد يشتري من المصانع، مثل مزوّد النظافة يشتري منظفات).
 */
export const MARKET_BUYER_KINDS = [...CUSTOMER_KINDS, "provider"] as const;
export type MarketBuyerKind = (typeof MARKET_BUYER_KINDS)[number];

/** إعدادات السوق (تتغيّر بأمر واحد، مثل باقي الإعدادات). */
export const marketSettingsSchema = z
  .object({
    /** مين يقدر يطلب من السوق. الحين المنشآت والمزوّدين الموثّقين (قرار المالك). */
    buyerKinds: z.array(z.enum(MARKET_BUYER_KINDS)).min(1),
    /** الفترة المجانية لأول اشتراك بالأيام. صفر = مقفولة لين يتقرر (قرار المالك). */
    trialDays: z.number().int().min(0).max(180),
    /** عمولة المنصة على البيعة بالجزء من عشرة آلاف (١٠٠ = ١٪). صفر الحين. **تغييرها قرار المالك بس** (CLAUDE.md). */
    commissionBps: z.number().int().min(0).max(3000),
    /** الصفحة العامة للسوق ما تنفتح للزوار إلا بعد هذا العدد من المنتجات المعروضة. صفر = مفتوحة. */
    publicMinProducts: z.number().int().min(0).max(10_000),
    /** تنبيه المصنع قبل انتهاء الاشتراك أو السجل بكم يوم. */
    expiryWarningDays: z.number().int().min(1).max(60),
  })
  .strict();
export type MarketSettings = z.infer<typeof marketSettingsSchema>;

export const DEFAULT_MARKET_SETTINGS: MarketSettings = {
  buyerKinds: ["business", "provider"],
  trialDays: 0,
  commissionBps: 0,
  publicMinProducts: 0,
  expiryWarningDays: 7,
};

/** تسجيل دفعة اشتراك يدوية (موظف المالية): المبلغ والتاريخ ورقم المرجع وعدد الأشهر. */
export const subscriptionPaymentBody = z
  .object({
    planId: z.string().regex(/^[a-z_]{2,40}$/),
    months: z.number().int().min(1).max(24),
    amountHalalas: z.number().int().min(0).max(100_000_000),
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_invalid"),
    reference: text(2, 80),
  })
  .strict();

/** قرار موظف التوثيق على البائع، أو إخفاء منتج مخالف: السبب لازم مع الرفض والإخفاء. */
export const sellerDecisionBody = z
  .object({ decision: z.enum(["verify", "reject"]), reason: text(0, 500).optional() })
  .strict()
  .refine((v) => v.decision === "verify" || (v.reason ?? "").length >= 3, { path: ["reason"], message: "reason_required" });
export const productModerationBody = z.object({ reason: text(3, 500) }).strict();

/** تعديل باقة (السعر الشهري وأقصى عدد منتجات) من اللوحة. */
export const planUpdateBody = z
  .object({ monthlyPriceHalalas: z.number().int().min(0).max(100_000_000), maxProducts: z.number().int().min(1).max(10_000).nullable() })
  .strict();

/**
 * أزرار المشتري في كل حالة (مبدأ «ولا مرة طريق مسدود»، CLAUDE.md): كل حالة فيها زر واحد على الأقل.
 * الخادم يرجّعها مع كل طلب شراء، والواجهة تبيّنها كما هي. order_again يفتح صفحة المنتج.
 */
export type BuyerPurchaseAction = "accept" | "reject" | "request_revision" | "cancel" | "confirm_received" | "rate" | "order_again";
export function buyerPurchaseActions(status: PurchaseStatus, opts: { revisionUsed: boolean; rated: boolean }): BuyerPurchaseAction[] {
  switch (status) {
    case "pending":
    case "revision_requested":
      return ["cancel"];
    case "quoted":
      return opts.revisionUsed ? ["accept", "reject", "cancel"] : ["accept", "request_revision", "reject", "cancel"];
    case "expired":
      // الرد انتهت صلاحيته: يطلب رد جديد (لو ما استخدم التعديل) أو يلغي.
      return opts.revisionUsed ? ["cancel", "order_again"] : ["request_revision", "cancel"];
    case "accepted":
      return ["confirm_received"];
    case "received":
      return opts.rated ? ["order_again"] : ["rate", "order_again"];
    case "rejected":
    case "declined":
    case "cancelled":
      return ["order_again"];
  }
}
