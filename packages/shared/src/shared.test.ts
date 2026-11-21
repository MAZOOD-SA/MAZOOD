import { describe, expect, it } from "vitest";
import { factoryProfileSchema, isValidType, newRequestSchema, normalizeSaudiMobile, otpVerifySchema } from "./index";

describe("تنسيق رقم الجوال السعودي", () => {
  it.each([
    ["0551234567", "+966551234567"],
    ["551234567", "+966551234567"],
    ["+966551234567", "+966551234567"],
    ["00966551234567", "+966551234567"],
    ["966551234567", "+966551234567"],
    ["055 123 4567", "+966551234567"],
    ["055-123-4567", "+966551234567"],
    ["٠٥٥١٢٣٤٥٦٧", "+966551234567"],
    ["+٩٦٦٥٥١٢٣٤٥٦٧", "+966551234567"],
    ["۰۵۵۱۲۳۴۵۶۷", "+966551234567"],
  ])("يقبل %s", (input, expected) => {
    expect(normalizeSaudiMobile(input)).toBe(expected);
  });

  it.each(["", "0451234567", "05512345", "055123456789", "+971551234567", "abc", "0551234567x", "+9660551234567"])(
    "يرفض %s",
    (input) => {
      expect(normalizeSaudiMobile(input)).toBeNull();
    },
  );
});

describe("رمز التحقق", () => {
  it("يقبل ٦ أرقام عربية أو لاتينية", () => {
    expect(otpVerifySchema.parse({ phone: "0551234567", code: "١٢٣٤٥٦", client: "web" }).code).toBe("123456");
  });
  it("يرفض أي شي غير ٦ أرقام", () => {
    for (const code of ["12345", "1234567", "12a456", ""]) {
      expect(otpVerifySchema.safeParse({ phone: "0551234567", code, client: "web" }).success).toBe(false);
    }
  });
  it("يرفض الحقول الزايدة", () => {
    expect(otpVerifySchema.safeParse({ phone: "0551234567", code: "123456", client: "web", role: "admin" }).success).toBe(false);
  });
});

describe("الطلب الجديد", () => {
  const valid = { category: "transport", typeId: "flatbed", details: "سطحة ٢٠ طن للدمام بكرة", location: "سدير", when: "tomorrow" };

  it("يقبل طلب صحيح ويشيل المسافات الزايدة", () => {
    const r = newRequestSchema.parse({ ...valid, details: "   سطحة ٢٠ طن للدمام بكرة  " });
    expect(r.details).toBe("سطحة ٢٠ طن للدمام بكرة");
  });
  it("يرفض نوع مو تابع للقسم", () => {
    expect(isValidType("transport", "ac")).toBe(false);
    expect(newRequestSchema.safeParse({ ...valid, typeId: "ac" }).success).toBe(false);
  });
  it("يرفض قسم غير معروف، وتفاصيل قصيرة، وموعد غلط", () => {
    expect(newRequestSchema.safeParse({ ...valid, category: "food" }).success).toBe(false);
    expect(newRequestSchema.safeParse({ ...valid, details: "قصير" }).success).toBe(false);
    expect(newRequestSchema.safeParse({ ...valid, details: "          " }).success).toBe(false);
    expect(newRequestSchema.safeParse({ ...valid, when: "next_year" }).success).toBe(false);
  });
  it("يرفض حقل factoryId: المصنع يُعرف من الجلسة بس", () => {
    expect(newRequestSchema.safeParse({ ...valid, factoryId: "x" }).success).toBe(false);
  });
});

describe("ملف المصنع", () => {
  const base = { name: "مصنع الاختبار", city: "سدير", contactName: "أحمد" };
  it("السجل والرقم الضريبي اختياريين", () => {
    const r = factoryProfileSchema.parse({ ...base, commercialRegister: "", vatNumber: "" });
    expect(r.commercialRegister).toBeUndefined();
    expect(r.vatNumber).toBeUndefined();
  });
  it("يفحص صيغة الرقم الضريبي والسجل إذا انكتبوا", () => {
    expect(factoryProfileSchema.safeParse({ ...base, vatNumber: "300000000000003" }).success).toBe(true);
    expect(factoryProfileSchema.safeParse({ ...base, vatNumber: "100000000000003" }).success).toBe(false);
    expect(factoryProfileSchema.safeParse({ ...base, commercialRegister: "123" }).success).toBe(false);
  });
});
