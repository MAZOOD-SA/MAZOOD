import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, factoryProfileBody, isValidCategoryType, normalizeSaudiMobile } from "./index.ts";

describe("normalizeSaudiMobile", () => {
  it.each([
    ["0501234567", "+966501234567"],
    ["501234567", "+966501234567"],
    ["+966501234567", "+966501234567"],
    ["00966501234567", "+966501234567"],
    ["966 50 123 4567", "+966501234567"],
    ["٠٥٠١٢٣٤٥٦٧", "+966501234567"],
    ["۰۵۰۱۲۳۴۵۶۷", "+966501234567"],
    ["(050) 123-4567", "+966501234567"],
  ])("%s", (input, expected) => expect(normalizeSaudiMobile(input)).toBe(expected));

  it.each(["", "0401234567", "050123456", "05012345678", "abc", "+971501234567", "0112345678"])("يرفض %s", (input) =>
    expect(normalizeSaudiMobile(input)).toBeNull(),
  );
});

describe("الأقسام", () => {
  it("سبعة أقسام، والسابع مكافحة الحشرات والقوارض", () => {
    expect(CATEGORY_IDS).toHaveLength(7);
    expect(isValidCategoryType("pest_control", "rodents")).toBe(true);
  });
  it("النوع لازم يتبع القسم", () => {
    expect(isValidCategoryType("transport", "flatbed")).toBe(true);
    expect(isValidCategoryType("transport", "plumbing")).toBe(false);
    expect(isValidCategoryType("nope", "x")).toBe(false);
  });
});

describe("بيانات المصنع", () => {
  const ok = { name: "مصنع تجريبي", commercialRegister: "1010000000", vatNumber: "300000000000003" };
  it("تقبل الصحيح", () => expect(factoryProfileBody.safeParse(ok).success).toBe(true));
  it("ترفض رقم ضريبي لا يبدأ وينتهي بـ ٣", () => expect(factoryProfileBody.safeParse({ ...ok, vatNumber: "400000000000004" }).success).toBe(false));
  it("ترفض سجل ليس ١٠ أرقام", () => expect(factoryProfileBody.safeParse({ ...ok, commercialRegister: "12345" }).success).toBe(false));
});

import { containsContactInfo, priceForFactory } from "./index.ts";

describe("منع بيانات التواصل قبل القبول", () => {
  it.each(["0551234567", "٠٥٥١٢٣٤٥٦٧", "+966 55 123 4567", "055-123-4567", "www.x.com", "http://a.b", "a@b.co", "تابعني @mazood_x", "موقعنا example.sa"])(
    "يكشف %s",
    (s) => expect(containsContactInfo(`نص ${s} نص`)).toBe(true),
  );
  it.each(["٣ سطحات", "حمولة 14 طن", "الساعة 7:30", "المرحلة الثانية", "مصنع ١٤", "سعر 2450 ريال", ""])("ما يمنع %s", (s) =>
    expect(containsContactInfo(s)).toBe(false),
  );
});

describe("السعر للمصنع", () => {
  it("الحين سعر المزوّد قبل الضريبة كما هو", () => expect(priceForFactory(245_000)).toEqual({ amountHalalas: 245_000, includesVat: false, includesCommission: false }));
  it("يرفض الكسور والصفر", () => {
    expect(() => priceForFactory(100.5)).toThrow();
    expect(() => priceForFactory(0)).toThrow();
  });
});
