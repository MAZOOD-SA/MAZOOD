// اللغة واتجاه الواجهة. العربي هو الأساس ومن اليمين لليسار، والإنجليزي من اليسار لليمين.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nManager, Platform } from "react-native";
import { codeForDisplay, formatDate, formatMoney, formatNumber, formatRelative, localizeDigits, type Locale, formatDuration, formatUntil } from "@/lib/format";
import { loadPref, savePref } from "@/lib/prefs";
import { strings, type StringKey } from "./strings";

/** نص بلغتين، للبيانات (أسماء المزوّدين والطلبات). */
export type Localized = { ar: string; en: string };

type I18nValue = {
  locale: Locale;
  isRTL: boolean;
  setLocale: (l: Locale) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  tl: (text: Localized) => string;
  /** أرقام بأرقام لغة الواجهة (مثل رقم الجوال). */
  digits: (s: string) => string;
  /** رمز ثابت (رقم فاتورة، سجل، رقم ضريبي): بأرقام لغة الواجهة، ومحمي من انقلاب الترتيب داخل النص العربي. */
  code: (s: string) => string;
  money: (halalas: number) => string;
  num: (n: number) => string;
  relative: (iso: string) => string;
  date: (iso: string) => string;
  /** مدة بالساعات: «٦ ساعات»، «يومين». */
  duration: (hours: number) => string;
  /** وقت قادم: «خلال ٥ ساعات». */
  until: (iso: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    loadPref("locale").then((v) => {
      if (v === "ar" || v === "en") setLocaleState(v);
    });
  }, []);

  const isRTL = locale === "ar";

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = isRTL ? "rtl" : "ltr";
      document.title = strings[locale].appName;
    } else {
      // في الجوال: الاتجاه يتطبق كامل بعد إعادة فتح التطبيق.
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(isRTL);
    }
  }, [locale, isRTL]);

  const value = useMemo<I18nValue>(() => {
    const t: I18nValue["t"] = (key, vars) => {
      let s = strings[locale][key];
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return localizeDigits(s, locale);
    };
    return {
      locale,
      isRTL,
      setLocale: (l) => {
        setLocaleState(l);
        savePref("locale", l);
      },
      t,
      tl: (text) => localizeDigits(text[locale], locale),
      digits: (s) => localizeDigits(s, locale),
      code: (s) => codeForDisplay(s, locale),
      money: (h) => formatMoney(h, locale),
      num: (n) => formatNumber(n, locale),
      relative: (iso) => formatRelative(iso, locale),
      date: (iso) => formatDate(iso, locale),
      duration: (h) => formatDuration(h, locale),
      until: (iso) => formatUntil(iso, locale),
    };
  }, [locale, isRTL]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n لازم يكون داخل I18nProvider");
  return v;
}
