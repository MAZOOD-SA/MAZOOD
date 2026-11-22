// المبالغ في مزوّد تُحفظ وتُحسب **بالهللة كأرقام صحيحة** (١ ريال = ١٠٠ هللة)
// عشان ما يصير خطأ تقريب في الفواتير. لا تستخدم كسور عشرية للمبالغ أبدًا.

/** نسبة ضريبة القيمة المضافة في السعودية (١٥٪)، بالنقطة الأساسية: ١٥٠٠ = ١٥٪. */
export const VAT_RATE_BASIS_POINTS = 1500;

/** يحسب الضريبة على مبلغ بالهللة، ويقرّب لأقرب هللة (النصف يُقرّب للأعلى). */
export function vatOf(amountHalalas: number): number {
  assertHalalas(amountHalalas);
  return Math.floor((amountHalalas * VAT_RATE_BASIS_POINTS + 5000) / 10000);
}

/** المبلغ شامل الضريبة. */
export function withVat(amountHalalas: number): number {
  return amountHalalas + vatOf(amountHalalas);
}

/** ريال → هللة. مثال: riyals(2450) = 245000 */
export function riyals(amount: number): number {
  return Math.round(amount * 100);
}

export function assertHalalas(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`مبلغ غير صالح بالهللة: ${n}`);
  }
}

/** «٢٬٤٥٠» أو «2450.50» → هللات (رقم صحيح). null لو المبلغ مو صالح. */
export function parseRiyals(input: string): number | null {
  const latin = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "").replace("٫", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(latin)) return null;
  const halalas = Math.round(Number(latin) * 100);
  return halalas > 0 ? halalas : null;
}
