// المبالغ: بالهللة كأرقام صحيحة دائمًا (١ ريال = ١٠٠ هللة). ما نستخدم كسور عشرية للمبالغ أبدًا.

/** مبلغ بالهللة: رقم صحيح موجب. أي كسر أو نص ينرفض. */
export function isHalalas(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

/**
 * السعر اللي يشوفه المصنع لعرض معيّن. **دالة وحدة** تستخدمها كل الشاشات والخادم.
 *
 * ⚠️ الحين (المرحلة ٤) ترجّع سعر المزوّد قبل الضريبة كما هو، مع includesVat: false
 * (الواجهة تكتب «السعر غير شامل الضريبة»). كيف ينحسب السعر النهائي (شامل العمولة؟ شامل الضريبة؟
 * والضريبة لو المزوّد غير مسجّل؟) يعتمد على سؤالي ١ و٢ في PLAN.md (مين البائع، ومسار الفلوس).
 * في المرحلة ٥ تتغيّر هذي الدالة بس، وكل الشاشات تتبعها. ما نفترض شي قبلها.
 */
export function priceForFactory(providerPriceHalalas: number): { amountHalalas: number; includesVat: false; includesCommission: false } {
  if (!isHalalas(providerPriceHalalas)) throw new Error(`مبلغ غير صالح بالهللة: ${providerPriceHalalas}`);
  return { amountHalalas: providerPriceHalalas, includesVat: false, includesCommission: false };
}
