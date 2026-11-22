// رسوم الإلغاء (المرحلة ٤، الخطوة ٨): الحساب بالهللة بدون كسور، والتوزيع، ومهلة السماح، والشكل القديم.
// كل المبالغ صفر في الإعداد الافتراضي لين يقرر المالك، فالاختبارات هنا تجرّب قيم افتراضية للتأكد إن الهيكل صحيح.
import { describe, expect, it } from "vitest";
import {
  applyFeeRule,
  cancellationFee,
  DEFAULT_CANCELLATION_POLICY,
  parseCancellationPolicy,
  ZERO_FEE,
  type CancellationPolicy,
} from "./cancellation.ts";

const acceptedAt = new Date("2026-11-22T10:00:00Z");
const min = (n: number) => new Date(acceptedAt.getTime() + n * 60_000);

/** المثال اللي انعرض على المالك (للتجربة بس، مو قرار): ٥٪ قبل البدء (٢٥ إلى ٣٠٠ ريال)، و١٥٪ بعده (١٠٠ إلى ٢٠٠٠). */
const EXAMPLE: CancellationPolicy = {
  ...DEFAULT_CANCELLATION_POLICY,
  graceMinutesAfterAccept: 60,
  factory: {
    afterAccept: { fixedHalalas: 0, percentBps: 500, minHalalas: 2_500, maxHalalas: 30_000 },
    afterStart: { fixedHalalas: 0, percentBps: 1_500, minHalalas: 10_000, maxHalalas: 200_000 },
  },
  providerShareBps: 8_000,
  provider: { afterAccept: { fixedHalalas: 5_000, percentBps: 0, minHalalas: 0, maxHalalas: null }, toFactoryBps: 10_000 },
};

describe("قاعدة رسوم وحدة", () => {
  it("كل شي صفر = بدون رسوم", () => {
    expect(applyFeeRule(ZERO_FEE, 1_000_000)).toBe(0);
  });
  it("مبلغ ثابت، ونسبة، والاثنين", () => {
    expect(applyFeeRule({ ...ZERO_FEE, fixedHalalas: 5_000 }, 100_000)).toBe(5_000);
    expect(applyFeeRule({ ...ZERO_FEE, percentBps: 500 }, 100_000)).toBe(5_000);
    expect(applyFeeRule({ ...ZERO_FEE, fixedHalalas: 1_000, percentBps: 500 }, 100_000)).toBe(6_000);
  });
  it("الحد الأدنى والأعلى", () => {
    const rule = { fixedHalalas: 0, percentBps: 500, minHalalas: 2_500, maxHalalas: 30_000 };
    expect(applyFeeRule(rule, 10_000)).toBe(2_500); // ٥٪ من ١٠٠ ريال = ٥ ريال، أقل من الحد الأدنى
    expect(applyFeeRule(rule, 100_000_000)).toBe(30_000); // ٥٪ من مليون ريال، فوق الحد الأعلى
  });
  it("الرسوم ما تزيد أبدًا على سعر الطلب", () => {
    expect(applyFeeRule({ ...ZERO_FEE, fixedHalalas: 50_000 }, 20_000)).toBe(20_000);
    expect(applyFeeRule({ ...ZERO_FEE, minHalalas: 10_000 }, 3_000)).toBe(3_000);
  });
  it("كسر الهللة ينقص لصالح اللي يدفع، والناتج رقم صحيح دائمًا", () => {
    expect(applyFeeRule({ ...ZERO_FEE, percentBps: 333 }, 1_001)).toBe(33); // ٣٣٫٣٣ هللة
    for (const price of [1, 7, 99, 12_345, 99_999_999]) {
      expect(Number.isInteger(applyFeeRule({ ...ZERO_FEE, percentBps: 777 }, price))).toBe(true);
    }
  });
  it("سعر غير صالح يرمي خطأ", () => {
    expect(() => applyFeeRule(ZERO_FEE, 0)).toThrow();
    expect(() => applyFeeRule(ZERO_FEE, 10.5)).toThrow();
  });
});

describe("رسوم الإلغاء حسب المرحلة ومين ألغى", () => {
  it("الإعداد الافتراضي: صفر في كل مرحلة ولكل طرف", () => {
    for (const stage of ["after_accept", "after_start"] as const) {
      const f = cancellationFee({ policy: DEFAULT_CANCELLATION_POLICY, payer: "factory", stage, priceHalalas: 500_000, acceptedAt, now: min(600) });
      expect(f.feeHalalas).toBe(0);
    }
    const p = cancellationFee({ policy: DEFAULT_CANCELLATION_POLICY, payer: "provider", stage: "after_accept", priceHalalas: 500_000, acceptedAt, now: min(5) });
    expect(p.feeHalalas).toBe(0);
  });

  it("داخل مهلة السماح بعد القبول: بدون رسوم، وبعدها تنطبق", () => {
    const at = (m: number) => cancellationFee({ policy: EXAMPLE, payer: "factory", stage: "after_accept", priceHalalas: 100_000, acceptedAt, now: min(m) });
    expect(at(30)).toMatchObject({ feeHalalas: 0, withinGrace: true, graceUntil: min(60).toISOString() });
    expect(at(60)).toMatchObject({ feeHalalas: 5_000, withinGrace: false });
  });

  it("بعد البدء مبلغ أكبر، ومهلة السماح ما تنطبق", () => {
    const f = cancellationFee({ policy: EXAMPLE, payer: "factory", stage: "after_start", priceHalalas: 100_000, acceptedAt, now: min(10) });
    expect(f.feeHalalas).toBe(15_000);
    expect(f.withinGrace).toBe(false);
  });

  it("رسوم المصنع تنقسم بين المزوّد والمنصة، والمجموع ما يتغيّر حتى مع الكسور", () => {
    const f = cancellationFee({ policy: EXAMPLE, payer: "factory", stage: "after_start", priceHalalas: 100_003, acceptedAt, now: min(10) });
    expect(f.toProviderHalalas + f.toPlatformHalalas).toBe(f.feeHalalas);
    expect(f.toFactoryHalalas).toBe(0);
    expect(f.toProviderHalalas).toBe(Math.floor(f.feeHalalas * 0.8));
  });

  it("رسوم اعتذار المزوّد تروح للمصنع والمنصة حسب النسبة، والمزوّد ما ياخذ منها شي", () => {
    const f = cancellationFee({ policy: EXAMPLE, payer: "provider", stage: "after_accept", priceHalalas: 100_000, acceptedAt, now: min(5) });
    expect(f).toMatchObject({ payer: "provider", feeHalalas: 5_000, toFactoryHalalas: 5_000, toPlatformHalalas: 0, toProviderHalalas: 0, withinGrace: false });
  });

  it("المزوّد ما يعتذر بعد البدء (يمر على البلاغ)", () => {
    expect(() => cancellationFee({ policy: EXAMPLE, payer: "provider", stage: "after_start", priceHalalas: 100_000, acceptedAt, now: min(5) })).toThrow();
  });
});

describe("السياسة المحفوظة", () => {
  it("الشكل القديم ({ responseHours, feeHalalas }) يترقّى: الرسوم القديمة كانت بعد البدء، وبدون مهلة سماح", () => {
    const p = parseCancellationPolicy({ responseHours: 12, feeHalalas: 700 });
    expect(p.responseHours).toBe(12);
    expect(p.graceMinutesAfterAccept).toBe(0);
    expect(p.factory.afterAccept).toEqual(ZERO_FEE);
    expect(p.factory.afterStart.fixedHalalas).toBe(700);
  });
  it("الشكل الجديد ينقرى كما هو، وأي حقل زايد أو ناقص ينرفض", () => {
    expect(parseCancellationPolicy(EXAMPLE)).toEqual(EXAMPLE);
    expect(() => parseCancellationPolicy({ ...EXAMPLE, extra: 1 })).toThrow();
    const { provider: _drop, ...missing } = EXAMPLE;
    expect(() => parseCancellationPolicy(missing)).toThrow();
  });
});
