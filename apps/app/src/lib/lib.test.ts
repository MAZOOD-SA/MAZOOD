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

describe("المدد والأوقات القادمة", () => {
  it("المدة بالساعات والأيام بالعربي والإنجليزي", async () => {
    const { formatDuration } = await import("./format");
    expect(formatDuration(2, "ar")).toBe("ساعتين");
    expect(formatDuration(6, "ar")).toBe("٦ ساعات");
    expect(formatDuration(48, "ar")).toBe("يومين");
    expect(formatDuration(24, "en")).toBe("1 day");
    expect(formatDuration(5, "en")).toBe("5 hours");
  });
  it("الوقت القادم", async () => {
    const { formatUntil } = await import("./format");
    const now = new Date("2026-11-22T10:00:00Z");
    expect(formatUntil("2026-11-22T15:00:00Z", "en", now)).toBe("in 5 hours");
    expect(formatUntil("2026-11-22T09:00:00Z", "ar", now)).toBe("انتهى");
  });
});

describe("المقاسات (useLayout)", () => {
  it("جوال أقل من ٧٦٨، وتابلت لين ١١٩٩، وكمبيوتر من ١٢٠٠", async () => {
    const { layoutFor } = await import("./layout-size");
    expect(layoutFor(390)).toMatchObject({ size: "phone", sidebar: false, split: false });
    expect(layoutFor(767).size).toBe("phone");
    expect(layoutFor(768)).toMatchObject({ size: "tablet", sidebar: true, split: false });
    expect(layoutFor(1199).size).toBe("tablet");
    expect(layoutFor(1200)).toMatchObject({ size: "desktop", sidebar: true, split: true });
  });
  it("عدد البطاقات في الصف ما يتعدى المسموح", async () => {
    const { layoutFor } = await import("./layout-size");
    expect(layoutFor(390).columns(3)).toBe(1);
    expect(layoutFor(900).columns(3)).toBe(2);
    expect(layoutFor(1440).columns(3)).toBe(3);
    expect(layoutFor(1440).columns(2)).toBe(2);
  });
});

describe("سعر العرض بالريال", () => {
  it("يقبل الأرقام العربية والفواصل، ويرفض الكسور الطويلة", async () => {
    const { parseRiyals } = await import("./money");
    expect(parseRiyals("٢٬٤٥٠")).toBe(245_000);
    expect(parseRiyals("2450.5")).toBe(245_050);
    expect(parseRiyals("0")).toBeNull();
    expect(parseRiyals("12.345")).toBeNull();
    expect(parseRiyals("abc")).toBeNull();
  });
});

describe("تصغير صورة المنتج", () => {
  it("يحافظ على النسبة، وما يكبّر الصورة الصغيرة", async () => {
    const { fitWithin } = await import("./image");
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1000, 3200)).toEqual({ width: 500, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("ألوان الأقسام", () => {
  it("لكل قسم توكنين موجودين في الفاتح والداكن ومختلفين", async () => {
    const { colors } = await import("@mazood/brand");
    const { CATEGORIES, categoryColorKeys } = await import("@/data/categories");
    for (const c of CATEGORIES) {
      const { fg, soft } = categoryColorKeys(c.id);
      expect(colors.light[fg], `${c.id} fg`).toBeTruthy();
      expect(colors.light[soft], `${c.id} soft`).toBeTruthy();
      expect(colors.dark[fg], `${c.id} fg dark`).toBeTruthy();
      expect(colors.dark[soft], `${c.id} soft dark`).toBeTruthy();
      expect(fg).not.toBe(soft);
    }
  });
});

describe("أسئلة صفحة المساعدة", () => {
  it("لكل نوع ٤ أسئلة أو أكثر، بنص عربي وإنجليزي، وبدون تكرار", async () => {
    const { FAQ } = await import("@/data/faq");
    for (const role of ["factory", "provider"] as const) {
      const list = FAQ[role];
      expect(list.length, role).toBeGreaterThanOrEqual(4);
      for (const { q, a } of list) {
        for (const text of [q.ar, q.en, a.ar, a.en]) expect(text.trim(), `${role}: ${q.ar}`).not.toBe("");
      }
      expect(new Set(list.map((x) => x.q.ar)).size).toBe(list.length);
      expect(new Set(list.map((x) => x.q.en)).size).toBe(list.length);
    }
  });
  it("faqFor: كل نوع يشوف أسئلته، والموظف يشوف الاثنين", async () => {
    const { FAQ, faqFor } = await import("@/data/faq");
    expect(faqFor("factory")).toEqual(FAQ.factory);
    expect(faqFor("provider")).toEqual(FAQ.provider);
    expect(faqFor("staff")).toEqual([...FAQ.factory, ...FAQ.provider]);
  });
  it("سؤال «(حاليًا)» انتقل كما هو من docs/admin/faq.md", async () => {
    const { FAQ } = await import("@/data/faq");
    expect(FAQ.provider.some((x) => x.a.ar.startsWith("(حاليًا)"))).toBe(true);
  });
});
