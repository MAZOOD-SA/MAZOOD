// منع بيانات التواصل قبل القبول (الإضافة ٨ في الخطة): أرقام الجوال والروابط والإيميلات ممنوعة في
// تفاصيل الطلب ومنطقته وملاحظة العرض. السبب: لو تواصلوا مباشرة قبل القبول، الطرفين يطلعون من المنصة.
// بيانات التواصل الحقيقية تظهر تلقائيًا للطرفين بعد القبول.
// نفس الدالة في الواجهة (تنبيه وقت الكتابة) وفي الخادم (الرفض الفعلي).

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const toLatinDigits = (s: string) =>
  s.replace(ARABIC_DIGITS, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(d) : "۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** ٧ أرقام أو أكثر ورا بعض (حتى لو بينها مسافات أو شرطات أو نقاط): شكل رقم جوال أو هاتف. */
const PHONE_LIKE = /(?:\+?\d[\s\-.()]*){7,}/;
const URL_LIKE = /(?:https?:\/\/|www\.)|\b[a-z0-9-]+\.(?:com|net|org|sa|io|me|co|info|biz|app|link|ly)\b/i;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** معرّفات حسابات التواصل (مثل @someone). */
const HANDLE_LIKE = /(?:^|\s)@[a-z0-9_.]{3,}/i;

export function containsContactInfo(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = toLatinDigits(text);
  return PHONE_LIKE.test(t) || URL_LIKE.test(t) || EMAIL_LIKE.test(t) || HANDLE_LIKE.test(t);
}
