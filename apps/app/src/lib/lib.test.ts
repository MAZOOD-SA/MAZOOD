import { describe, expect, it } from "vitest";
import { codeForDisplay, formatMoney, formatNumber, formatRelative, localizeDigits, normalizeSaudiMobile } from "./format";
import { riyals, vatOf, withVat } from "./money";

describe("المبالغ (بالهللة)", () => {
  it("يحسب ضريبة ١٥٪", () => {
    expect(vatOf(riyals(2000))).toBe(riyals(300));
    expect(withVat(riyals(2000))).toBe(riyals(2300));
  });
  it("يقرّب لأقرب هللة", () => {
    expect(vatOf(3)).toBe(0); // 0.45 → 0
    expect(vatOf(10)).toBe(2); // 1.5 → 2
    expect(vatOf(333)).toBe(50); // 49.95 → 50
  });
  it("يرفض المبالغ السالبة والكسور", () => {
    expect(() => vatOf(-1)).toThrow();
    expect(() => vatOf(1.5)).toThrow();
  });
});

describe("التنسيق", () => {
  it("أرقام مشرقية في العربي ولاتينية في الإنجليزي", () => {
    expect(formatNumber(2450, "ar")).toBe("٢٬٤٥٠");
    expect(formatNumber(2450, "en")).toBe("2,450");
  });
  it("المبلغ مع العملة", () => {
    expect(formatMoney(245000, "ar")).toBe("٢٬٤٥٠ ر.س");
    expect(formatMoney(245050, "en")).toBe("SAR 2,450.50");
  });
  it("يحوّل الأرقام داخل النص", () => {
    expect(localizeDigits("سطحة 20 طن", "ar")).toBe("سطحة ٢٠ طن");
    expect(localizeDigits("20 ton", "en")).toBe("20 ton");
  });
  it("الوقت النسبي", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(formatRelative("2026-11-20T11:45:00Z", "ar", now)).toBe("قبل ١٥ دقيقة");
    expect(formatRelative("2026-11-19T12:00:00Z", "ar", now)).toBe("أمس");
    expect(formatRelative("2026-11-20T11:45:00Z", "en", now)).toBe("15 min ago");
  });
});

describe("رقم الجوال", () => {
  it("يقبل الصيغ الشائعة", () => {
    expect(normalizeSaudiMobile("0551234567")).toBe("+966551234567");
    expect(normalizeSaudiMobile("+966 55 123 4567")).toBe("+966551234567");
    expect(normalizeSaudiMobile("٠٥٥١٢٣٤٥٦٧")).toBe("+966551234567");
  });
  it("يرفض الأرقام الغلط", () => {
    expect(normalizeSaudiMobile("0451234567")).toBeNull();
    expect(normalizeSaudiMobile("05512")).toBeNull();
  });
});

describe("عرض الرموز", () => {
  it("رقم الفاتورة بأرقام مشرقية ومعزول باتجاه ثابت", () => {
    const shown = codeForDisplay("MZ-2026-000128", "ar");
    expect(shown.startsWith("\u2066")).toBe(true);
    expect(shown.replace(/[\u200E\u2066\u2069]/g, "")).toBe("MZ-٢٠٢٦-٠٠٠١٢٨");
  });
  it("ما يتغير في الإنجليزي", () => {
    expect(codeForDisplay("MZ-2026-000128", "en")).toBe("MZ-2026-000128");
  });
});
