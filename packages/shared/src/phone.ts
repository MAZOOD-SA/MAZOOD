// رقم الجوال السعودي. نخزّنه دائمًا بصيغة دولية واحدة: +9665XXXXXXXX
// عشان ما يصير للشخص نفسه حسابين بسبب اختلاف طريقة الكتابة.

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹"; // الفارسية/الأردية، تطلع أحيانًا من بعض لوحات المفاتيح

/** يحوّل الأرقام العربية المشرقية (٠-٩ و۰-۹) لأرقام لاتينية. */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EASTERN_ARABIC_INDIC.indexOf(d)));
}

/**
 * يقبل: 05XXXXXXXX، و5XXXXXXXX، و+9665XXXXXXXX، و009665XXXXXXXX، و9665XXXXXXXX،
 * مع مسافات أو شرطات أو أقواس، وبالأرقام العربية أو اللاتينية.
 * يرجع +9665XXXXXXXX، أو null إذا الرقم مو جوال سعودي.
 */
export function normalizeSaudiMobile(input: string): string | null {
  const compact = toLatinDigits(input).replace(/[\s\-().‎‏‪-‮⁦-⁩]/g, "");
  const m = compact.match(/^(?:\+966|00966|966|0)?(5\d{8})$/);
  return m ? `+966${m[1]}` : null;
}

/** +966551234567 → 0551234567 (للعرض). */
export function localMobile(e164: string): string {
  return e164.startsWith("+966") ? `0${e164.slice(4)}` : e164;
}

/** +966551234567 → •••••••4567 (للسجلات التقنية). */
export function maskMobile(e164: string): string {
  return `•••••••${e164.slice(-4)}`;
}
