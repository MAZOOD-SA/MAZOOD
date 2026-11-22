// التقييم ورقم الالتزام (المرحلة ٤، الخطوة ٩، والقرار ٣٣): الحساب الصافي بدون قاعدة بيانات.
import { describe, expect, it } from "vitest";
import { commitmentView, DEFAULT_COMMITMENT_SETTINGS } from "./commitment.ts";
import { rateOrderBody, ratingSummary } from "./rating.ts";
import { SETTING_DEFAULTS, SETTINGS_SCHEMA } from "./settings.ts";

describe("التقييم بالنجوم", () => {
  it("من ١ إلى ٥ بس، وأرقام صحيحة، وبدون تعليق مكتوب", () => {
    expect(rateOrderBody.safeParse({ stars: 1 }).success).toBe(true);
    expect(rateOrderBody.safeParse({ stars: 5 }).success).toBe(true);
    for (const stars of [0, 6, 4.5, "5"]) expect(rateOrderBody.safeParse({ stars }).success).toBe(false);
    expect(rateOrderBody.safeParse({ stars: 5, comment: "ممتاز" }).success).toBe(false);
  });

  it("المتوسط بخانة عشرية وحدة، ومعه العدد. وبدون تقييمات: null", () => {
    expect(ratingSummary(0, 0)).toBeNull();
    expect(ratingSummary(9, 2)).toEqual({ average: 4.5, count: 2 });
    expect(ratingSummary(14, 3)).toEqual({ average: 4.7, count: 3 });
  });
});

describe("رقم الالتزام «التزم بـ X من Y طلب»", () => {
  const s = DEFAULT_COMMITMENT_SETTINGS;

  it("الإعداد الافتراضي حسب قرار المالك: شغّال، و١٢ شهر، و٥ طلبات", () => {
    expect(s).toEqual({ enabled: true, windowMonths: 12, minOrders: 5 });
    expect(SETTING_DEFAULTS.commitment).toEqual(s);
  });

  it("قبل ٥ طلبات: «جديد على المنصة» حتى لو اعتذر", () => {
    expect(commitmentView({ accepted: 0, withdrawals: 0 }, s)).toEqual({ kind: "new" });
    expect(commitmentView({ accepted: 4, withdrawals: 1 }, s)).toEqual({ kind: "new" });
  });

  it("من ٥ طلبات: المقبولة ناقص الاعتذارات", () => {
    expect(commitmentView({ accepted: 5, withdrawals: 0 }, s)).toEqual({ kind: "count", kept: 5, total: 5 });
    expect(commitmentView({ accepted: 10, withdrawals: 1 }, s)).toEqual({ kind: "count", kept: 9, total: 10 });
  });

  it("ما ينزل تحت الصفر", () => {
    expect(commitmentView({ accepted: 5, withdrawals: 9 }, s)).toEqual({ kind: "count", kept: 0, total: 5 });
  });

  it("الإيقاف يخفي الرقم (null)، والحد الأدنى يتغيّر من الإعداد", () => {
    expect(commitmentView({ accepted: 10, withdrawals: 0 }, { ...s, enabled: false })).toBeNull();
    expect(commitmentView({ accepted: 2, withdrawals: 0 }, { ...s, minOrders: 2 })).toEqual({ kind: "count", kept: 2, total: 2 });
  });

  it("الإعداد يرفض القيم الغلط", () => {
    const c = SETTINGS_SCHEMA.shape.commitment;
    expect(c.safeParse({ ...s, windowMonths: 0 }).success).toBe(false);
    expect(c.safeParse({ ...s, windowMonths: 61 }).success).toBe(false);
    expect(c.safeParse({ ...s, minOrders: 0 }).success).toBe(false);
    expect(c.safeParse({ ...s, extra: 1 }).success).toBe(false);
    expect(c.safeParse({ ...s, windowMonths: 24 }).success).toBe(true);
  });
});
