// أرقام الجوال السعودية. كل رقم ينحفظ بصيغة دولية وحدة (+9665XXXXXXXX)،
// عشان «0551234567» و«966551234567» و«٠٥٥١٢٣٤٥٦٧» تكون نفس الحساب.

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** يحوّل الأرقام المشرقية للاتينية: «٠٥٥» → «055». */
export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** «055 123 4567» → «+966551234567». يرجع null إذا الرقم مو جوال سعودي. */
export function normalizeSaudiMobile(input: string): string | null {
  const latin = toLatinDigits(input).replace(/[\s-]/g, "");
  const m = latin.match(/^(?:\+?966|0)?(5\d{8})$/);
  return m ? `+966${m[1]}` : null;
}

/** «+966551234567» → «0551234567» للعرض. */
export function localMobile(e164: string): string {
  return e164.startsWith("+966") ? `0${e164.slice(4)}` : e164;
}
