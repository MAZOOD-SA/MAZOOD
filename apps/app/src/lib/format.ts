// تنسيق الأرقام والمبالغ والأوقات حسب لغة الواجهة.
// قاعدة الهوية: أرقام عربية مشرقية (٢٬٤٥٠) في العربي، ولاتينية في الإنجليزي، وما نخلطهم.
export type Locale = "ar" | "en";

const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-SA-u-nu-arab" : "en-US");

export function formatNumber(n: number, locale: Locale, fractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  }).format(n);
}

/** ٢٤٥٠٠٠ هللة → «٢٬٤٥٠ ر.س». الكسور تظهر بس إذا فيه هللات. */
export function formatMoney(halalas: number, locale: Locale): string {
  const hasFraction = halalas % 100 !== 0;
  const value = formatNumber(halalas / 100, locale, hasFraction ? 2 : 0);
  return locale === "ar" ? `${value} ر.س` : `SAR ${value}`;
}

/** يحوّل أي أرقام لاتينية داخل نص للأرقام المشرقية إذا اللغة عربي. */
export function localizeDigits(text: string, locale: Locale): string {
  if (locale !== "ar") return text;
  return text.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** «قبل ١٥ دقيقة»، «أمس»، أو التاريخ. */
export function formatRelative(iso: string, locale: Locale, now: Date = new Date()): string {
  const diffMin = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  const n = (x: number) => formatNumber(x, locale);
  if (locale === "ar") {
    if (diffMin < 1) return "الآن";
    if (diffMin < 60) return `قبل ${n(diffMin)} دقيقة`;
    const h = Math.round(diffMin / 60);
    if (h < 24) return h === 1 ? "قبل ساعة" : `قبل ${n(h)} ساعات`;
    const d = Math.round(h / 24);
    if (d === 1) return "أمس";
    if (d < 7) return `قبل ${n(d)} أيام`;
    return formatDate(iso, locale);
  }
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${n(diffMin)} min ago`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${n(h)} hours ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${n(d)} days ago`;
  return formatDate(iso, locale);
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "gregory",
  }).format(new Date(iso));
}

/** «055 123 4567» → «+966551234567». القاعدة نفسها اللي يستخدمها الخادم (packages/shared). */
export { normalizeSaudiMobile } from "@mazood/shared";

/**
 * يعرض رمز مثل «MZ-2026-000128» بأرقام لغة الواجهة وبالترتيب الصحيح.
 * الأرقام العربية المشرقية تنقلب داخل النص إذا بينها شرطات، فنحط علامة اتجاه
 * (U+200E) حول كل رمز غير رقمي، ونعزل الكل كقطعة من اليسار لليمين (U+2066…U+2069).
 */
export function codeForDisplay(s: string, locale: Locale): string {
  if (locale !== "ar") return s;
  const ltrMarked = localizeDigits(s, locale).replace(/([^٠-٩])/g, "\u200E$1\u200E");
  return `\u2066${ltrMarked}\u2069`;
}
