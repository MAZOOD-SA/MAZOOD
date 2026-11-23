import { describe, expect, it } from "vitest";
import { nextStep, type NextStepInput } from "./next-step";

const base: NextStepInput = { role: "factory", profileComplete: true, newOffers: 0, newRequests: 0, expiring: [], today: "2026-11-23" };

describe("خطوتك الجاية", () => {
  it("عميل بياناته ناقصة وعنده ٣ عروض: يكمّل بياناته أول", () => {
    expect(nextStep({ ...base, profileComplete: false, newOffers: 3 })).toEqual({ kind: "completeProfile", href: "/factory-profile" });
  });
  it("عميل كامل وعنده ٣ عروض", () => {
    expect(nextStep({ ...base, newOffers: 3 })).toEqual({ kind: "offers", count: 3, href: "/requests" });
  });
  it("عميل كامل وصفر عروض: ما فيه بطاقة", () => {
    expect(nextStep(base)).toBeNull();
  });
  it("مزوّد عنده مستند منتهي و٥ طلبات: المنتهي أهم", () => {
    const r = nextStep({ ...base, role: "provider", newRequests: 5, expiring: [{ docType: "cr", expiresOn: "2026-11-01", expired: true }] });
    expect(r).toEqual({ kind: "docExpired", docType: "cr", href: "/provider/account" });
  });
  it("مزوّد عنده مستند ينتهي بعد ٢٠ يوم", () => {
    const r = nextStep({ ...base, role: "provider", newRequests: 2, expiring: [{ docType: "cr", expiresOn: "2026-12-13", expired: false }] });
    expect(r).toEqual({ kind: "docExpiring", docType: "cr", daysLeft: 20, href: "/provider/account" });
  });
  it("مستند ينتهي اليوم: صفر يوم، ويطلع كتنبيه قرب الانتهاء", () => {
    const r = nextStep({ ...base, role: "provider", expiring: [{ docType: "id", expiresOn: "2026-11-23", expired: false }] });
    expect(r).toEqual({ kind: "docExpiring", docType: "id", daysLeft: 0, href: "/provider/account" });
  });
  it("مزوّد عنده مستند ينتهي بعد ٤٠ يوم وطلبين: الطلبات", () => {
    const r = nextStep({ ...base, role: "provider", newRequests: 2, expiring: [{ docType: "cr", expiresOn: "2027-01-02", expired: false }] });
    expect(r).toEqual({ kind: "newRequests", count: 2, href: "/provider/requests" });
  });
  it("موظف: ما فيه بطاقة", () => {
    expect(nextStep({ ...base, role: "staff", newOffers: 4, profileComplete: false })).toBeNull();
  });
  it("مستندين قرب الانتهاء: الأقرب يطلع", () => {
    const r = nextStep({ ...base, role: "provider", expiring: [{ docType: "cr", expiresOn: "2026-12-13", expired: false }, { docType: "id", expiresOn: "2026-11-28", expired: false }] });
    expect(r).toMatchObject({ kind: "docExpiring", docType: "id", daysLeft: 5 });
  });
});
