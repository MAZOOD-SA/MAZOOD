// سياسة الإلغاء ورسومه (سؤال ١٥، وقرار المالك 22 نوفمبر 2026: «ممكن نحط رسوم على الإلغاء»).
//
// ⚠️ المالك وافق على **الهيكل** بس. المبلغ، ومتى ينطبق، ولمين يروح، قرار المالك مع الشريك بعدين
// (ويُراجع مع المحامي: docs/legal/brief-for-lawyer.md البنود ٢٣ و٢٤). فكل القيم الافتراضية هنا **صفر**،
// والهيكل يتحمّل كل الخيارات اللي انعرضت عليه:
//  - متى: قبل القبول دائمًا مجاني (ما فيه إعداد له أصلًا). بعد القبول وقبل البدء (مع مهلة سماح بالدقايق)،
//    وبعد البدء: لكل مرحلة قاعدة لحالها.
//  - كم: مبلغ ثابت، أو نسبة من سعر الطلب، أو الاثنين، مع حد أدنى وحد أعلى.
//  - لمين: رسوم المصنع تنقسم بين المزوّد والمنصة بنسبة (providerShareBps). ورسوم اعتذار المزوّد
//    تنقسم بين المصنع والمنصة (provider.toFactoryBps).
//
// القواعد الثابتة:
//  - **السياسة تنحفظ مع الطلب وقت القبول** (orders.cancellation_policy)، والحساب يكون دائمًا من النسخة
//    المحفوظة. فتغيير الإعداد ما ينطبق على طلب قديم.
//  - المبالغ بالهللة كأرقام صحيحة، والنسب بـ «نقطة أساس» (١٠٠٠٠ = ١٠٠٪) عشان ما نستخدم كسور.
//    أي كسر هللة ينقص لصالح اللي يدفع (Math.floor).
//  - الرسوم ما تزيد أبدًا على سعر الطلب.
//  - التحصيل الفعلي في المرحلة ٥ مع الفلوس والفاتورة. الحين نحسب المبلغ ونعرضه وينحفظ مع الإلغاء بس.
import { z } from "zod";

const halalas = z.number().int().min(0).max(100_000_000_000);
/** نقطة أساس: ١٠٠٠٠ = ١٠٠٪، و٥٠٠ = ٥٪. */
const bps = z.number().int().min(0).max(10_000);

/** قاعدة رسوم وحدة: (ثابت + نسبة من السعر)، ثم الحد الأدنى والأعلى. كلها صفر = بدون رسوم. */
export const feeRuleSchema = z
  .object({
    fixedHalalas: halalas,
    percentBps: bps,
    minHalalas: halalas,
    /** null = بدون حد أعلى (غير سعر الطلب نفسه). */
    maxHalalas: halalas.nullable(),
  })
  .strict()
  .refine((r) => r.maxHalalas === null || r.maxHalalas >= r.minHalalas, { message: "max_below_min" });
export type FeeRule = z.infer<typeof feeRuleSchema>;

export const ZERO_FEE: FeeRule = { fixedHalalas: 0, percentBps: 0, minHalalas: 0, maxHalalas: null };

export const cancellationPolicySchema = z
  .object({
    /** بعد البدء: كم ساعة عند المزوّد يرد على «طلب الإلغاء»، وبعدها يتحوّل بلاغ لخدمة العملاء. */
    responseHours: z.number().int().min(1).max(24 * 7),
    /** بعد القبول: كم دقيقة يقدر المصنع يلغي فيها بدون رسوم (لو غلط في الاختيار). ٠ = بدون مهلة. */
    graceMinutesAfterAccept: z.number().int().min(0).max(24 * 60),
    /** رسوم على المصنع لما يلغي. */
    factory: z.object({ afterAccept: feeRuleSchema, afterStart: feeRuleSchema }).strict(),
    /** كم من رسوم المصنع تروح للمزوّد (تعويض عن تحرّكه)، والباقي للمنصة. ١٠٠٠٠ = كلها للمزوّد. */
    providerShareBps: bps,
    /** رسوم على المزوّد لما يعتذر بعد قبول عرضه وقبل البدء، وكم منها تروح للمصنع (والباقي للمنصة). */
    provider: z.object({ afterAccept: feeRuleSchema, toFactoryBps: bps }).strict(),
  })
  .strict();
export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;

/**
 * الافتراضي: كل الرسوم صفر لين يقرر المالك. القيم غير الصفرية هنا (مهلة الرد ٢٤ ساعة،
 * وساعة سماح بعد القبول، والرسوم كلها للمزوّد) ما لها أثر مالي وهي صفر، وتنراجع مع القرار.
 */
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  responseHours: 24,
  graceMinutesAfterAccept: 60,
  factory: { afterAccept: ZERO_FEE, afterStart: ZERO_FEE },
  providerShareBps: 10_000,
  provider: { afterAccept: ZERO_FEE, toFactoryBps: 0 },
};

/**
 * يقرأ سياسة محفوظة، ويترقّى الشكل القديم (قبل الخطوة ٨: { responseHours, feeHalalas }).
 * الشكل القديم كان feeHalalas وحده = رسوم بعد البدء بمبلغ ثابت (وكانت صفر في كل البيانات).
 */
export function upgradeCancellationPolicy(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "feeHalalas" in raw && !("factory" in raw)) {
    const old = raw as { responseHours?: unknown; feeHalalas?: unknown };
    const fee = typeof old.feeHalalas === "number" ? old.feeHalalas : 0;
    return {
      ...DEFAULT_CANCELLATION_POLICY,
      responseHours: old.responseHours,
      graceMinutesAfterAccept: 0,
      factory: { afterAccept: ZERO_FEE, afterStart: { ...ZERO_FEE, fixedHalalas: fee } },
    };
  }
  return raw;
}

export function parseCancellationPolicy(raw: unknown): CancellationPolicy {
  return cancellationPolicySchema.parse(upgradeCancellationPolicy(raw));
}

/** مبلغ قاعدة وحدة على سعر معيّن. */
export function applyFeeRule(rule: FeeRule, priceHalalas: number): number {
  if (!Number.isSafeInteger(priceHalalas) || priceHalalas <= 0) throw new Error(`سعر غير صالح بالهللة: ${priceHalalas}`);
  if (rule.fixedHalalas === 0 && rule.percentBps === 0 && rule.minHalalas === 0) return 0;
  // priceHalalas * bps أقصاه ١٠^١١ × ١٠^٤ = ١٠^١٥، أقل من حد الأرقام الصحيحة الآمنة (٩×١٠^١٥).
  let fee = rule.fixedHalalas + Math.floor((priceHalalas * rule.percentBps) / 10_000);
  fee = Math.max(fee, rule.minHalalas);
  if (rule.maxHalalas !== null) fee = Math.min(fee, rule.maxHalalas);
  return Math.min(fee, priceHalalas);
}

/** مرحلة الطلب وقت الإلغاء. قبل القبول ما فيه طلب منفّذ ولا سياسة محفوظة: دائمًا مجاني. */
export type CancellationStage = "after_accept" | "after_start";

export type CancellationFee = {
  /** مين يدفع الرسوم */
  payer: "factory" | "provider";
  stage: CancellationStage;
  feeHalalas: number;
  /** توزيع المبلغ. المجموع = feeHalalas دائمًا. */
  toProviderHalalas: number;
  toFactoryHalalas: number;
  toPlatformHalalas: number;
  /** الإلغاء داخل مهلة السماح بعد القبول (فالرسوم صفر). */
  withinGrace: boolean;
  /** لين متى الإلغاء بدون رسوم (بعد القبول)، لو فيه مهلة. الواجهة تبيّنها للمصنع. */
  graceUntil: string | null;
};

/** نصيب من مبلغ بنسبة، والكسر ينقص منه (والباقي يروح للطرف الثاني، فالمجموع ما يتغيّر). */
const share = (amount: number, shareBps: number) => Math.floor((amount * shareBps) / 10_000);

/**
 * **الدالة الوحيدة** لحساب رسوم الإلغاء. الخادم يستخدمها وقت الإلغاء (وينحفظ الناتج)، والشاشات تعرض
 * نفس الناتج قبل ما يضغط المستخدم (الشفافية: المبلغ بالضبط في نافذة التأكيد).
 * policy: السياسة المحفوظة مع الطلب وقت القبول، مو الإعداد الحالي.
 */
export function cancellationFee(input: {
  policy: CancellationPolicy;
  payer: "factory" | "provider";
  stage: CancellationStage;
  priceHalalas: number;
  acceptedAt: Date;
  now: Date;
}): CancellationFee {
  const { policy, payer, stage, priceHalalas, acceptedAt, now } = input;
  const graceMs = policy.graceMinutesAfterAccept * 60_000;
  const graceUntil = stage === "after_accept" && graceMs > 0 ? new Date(acceptedAt.getTime() + graceMs) : null;
  const withinGrace = payer === "factory" && !!graceUntil && now < graceUntil;
  const base = { payer, stage, withinGrace, graceUntil: graceUntil?.toISOString() ?? null };

  if (payer === "provider") {
    // المزوّد يعتذر قبل البدء بس (بعد البدء ما فيه اعتذار: خدمة العملاء تتابع عن طريق البلاغ).
    if (stage !== "after_accept") throw new Error("المزوّد ما يعتذر بعد البدء");
    const fee = applyFeeRule(policy.provider.afterAccept, priceHalalas);
    const toFactory = share(fee, policy.provider.toFactoryBps);
    return { ...base, feeHalalas: fee, toProviderHalalas: 0, toFactoryHalalas: toFactory, toPlatformHalalas: fee - toFactory };
  }
  const fee = withinGrace ? 0 : applyFeeRule(stage === "after_accept" ? policy.factory.afterAccept : policy.factory.afterStart, priceHalalas);
  const toProvider = share(fee, policy.providerShareBps);
  return { ...base, feeHalalas: fee, toProviderHalalas: toProvider, toFactoryHalalas: 0, toPlatformHalalas: fee - toProvider };
}

// ── البلاغ (نسخة أولى، والإدارة الكاملة للنزاعات في المرحلة ٦) ──

/** أسباب البلاغ اللي يختارها المصنع أو المزوّد. */
export const DISPUTE_REASONS = ["quality", "not_delivered", "delay", "price", "conduct", "other"] as const;
/** أسباب يفتحها النظام بنفسه من طلب الإلغاء بعد البدء. */
export const SYSTEM_DISPUTE_REASONS = ["cancellation_declined", "cancellation_no_response"] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number] | (typeof SYSTEM_DISPUTE_REASONS)[number];

/** النص اللي يكتبه المستخدم: سبب الإلغاء، أو تفاصيل البلاغ، أو ملاحظة. */
const userText = z.string().trim().min(3).max(1000);

export const cancelRequestBody = z.object({ reason: userText }).strict();
export const cancelResponseBody = z.object({ decision: z.enum(["agree", "decline"]), note: userText.optional() }).strict();
export const providerWithdrawBody = z.object({ reason: userText }).strict();
export const openDisputeBody = z.object({ reason: z.enum(DISPUTE_REASONS), details: userText }).strict();
export const disputeNoteBody = z.object({ body: userText }).strict();
/** ملاحظة موظف خدمة العملاء: internal = داخلية ما يشوفها المصنع ولا المزوّد. */
export const staffDisputeNoteBody = z.object({ body: userText, internal: z.boolean() }).strict();
export const resolveDisputeBody = z.object({ decision: z.enum(["complete", "cancel", "resume"]), note: userText }).strict();
