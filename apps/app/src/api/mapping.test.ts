import { describe, expect, it } from "vitest";
import { CATEGORY_TYPES } from "@mazood/shared";
import { CATEGORIES } from "@/data/categories";
import { errorKey, fromServerRequest } from "./mapping";

describe("fromServerRequest", () => {
  it("يبني العنوان من نوع الطلب ويحفظ نص المستخدم", () => {
    const r = fromServerRequest({
      id: "x", category: "transport", typeId: "flatbed", details: "نقل ماكينة", area: "المرحلة الثانية", location: "سدير", cityId: "sudair",
      when: "today", status: "awaiting_offers", createdAt: "2026-11-22T10:00:00Z",
    });
    expect(r.title.ar).toBe("سطحة");
    expect(r.details.en).toBe("نقل ماكينة");
    expect(r.area).toBe("المرحلة الثانية");
  });
});

describe("تطابق الأقسام بين الواجهة والخادم", () => {
  it("كل قسم ونوع في الواجهة موجود في قواعد الخادم، والعكس", () => {
    const ui = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.types.map((t) => t.id)]));
    expect(ui).toEqual(Object.fromEntries(Object.entries(CATEGORY_TYPES).map(([k, v]) => [k, [...v]])));
  });
});

describe("errorKey", () => {
  it("يختار رسالة لكل رمز", () => {
    expect(errorKey("otp_cooldown")).toBe("otpCooldown");
    expect(errorKey("network")).toBe("networkError");
    expect(errorKey("whatever")).toBe("serverError");
  });
});
