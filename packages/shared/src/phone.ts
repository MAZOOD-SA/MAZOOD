// تطبيع رقم الجوال السعودي. أي صيغة معقولة تنقلب لـ +9665XXXXXXXX، وغيرها يُرفض.
// نفس الدالة تشتغل في الواجهة (رسالة خطأ فورية) وفي الخادم (التحقق الفعلي).

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXT_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** يحوّل الأرقام المشرقية للاتينية، ويشيل المسافات والشرطات والأقواس. */
function cleanDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXT_ARABIC_INDIC.indexOf(d)))
    .replace(/[\s\-().]/g, "");
}

/** يرجّع +9665XXXXXXXX أو null إذا ما كان جوال سعودي صحيح. */
export function normalizeSaudiMobile(input: string): string | null {
  let s = cleanDigits(input);
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("966")) s = s.slice(3);
  if (s.startsWith("0")) s = s.slice(1);
  return /^5\d{8}$/.test(s) ? `+966${s}` : null;
}
