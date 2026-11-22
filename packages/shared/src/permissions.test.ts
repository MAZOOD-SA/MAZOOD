// اختبارات جدول الصلاحيات: كل دور يشوف اللي يخص شغله بس، وقرارات المالك للمالك بس.
import { describe, expect, it } from "vitest";
import { can, OWNER_ONLY, PERMISSIONS, permissionsFor, STAFF_ROLES, type Permission, type Principal, type StaffRole } from "./permissions";

const staff = (...roles: StaffRole[]): Principal => ({ kind: "staff", roles });

describe("جدول الصلاحيات", () => {
  it("قرارات المالك للمالك بس، حتى المدير العام ما يملكها", () => {
    for (const p of OWNER_ONLY) {
      expect(can(staff("owner"), p), p).toBe(true);
      for (const r of STAFF_ROLES.filter((x) => x !== "owner")) expect(can(staff(r), p), `${r} ${p}`).toBe(false);
      expect(can({ kind: "factory" }, p)).toBe(false);
    }
  });

  it("المدير العام عنده كل صلاحيات الإدارة ما عدا قرارات المالك", () => {
    const gm = permissionsFor(staff("general_manager"));
    const owner = permissionsFor(staff("owner"));
    for (const p of owner) expect(gm.has(p), p).toBe(!OWNER_ONLY.includes(p));
    expect(gm.has("staff.manage")).toBe(true);
    expect(gm.has("staff.manage_general_manager")).toBe(false);
  });

  it("موظف التوثيق يوثّق المزوّدين، وما يشوف الفلوس ولا كل الطلبات", () => {
    const v = staff("verification");
    expect(can(v, "providers.verify")).toBe(true);
    for (const p of ["invoices.view", "refunds.create", "payouts.manage", "requests.view_all", "staff.manage", "content.edit"] as Permission[]) {
      expect(can(v, p), p).toBe(false);
    }
  });

  it("المالية تشوف الفواتير وتسترجع لين الحد، وما توثّق", () => {
    const f = staff("finance");
    expect(can(f, "invoices.view")).toBe(true);
    expect(can(f, "refunds.create")).toBe(true);
    expect(can(f, "refunds.approve_over_limit")).toBe(false);
    expect(can(f, "providers.verify")).toBe(false);
  });

  it("خدمة العملاء تتابع الطلبات والبلاغات، وما تلمس الفلوس ولا التوثيق", () => {
    const s = staff("support");
    expect(can(s, "disputes.manage")).toBe(true);
    expect(can(s, "requests.cancel_any")).toBe(true);
    expect(can(s, "refunds.create")).toBe(false);
    expect(can(s, "providers.verify")).toBe(false);
  });

  it("شخص بدورين ياخذ صلاحيات الاثنين", () => {
    const both = staff("verification", "support");
    expect(can(both, "providers.verify")).toBe(true);
    expect(can(both, "disputes.manage")).toBe(true);
    expect(can(both, "refunds.create")).toBe(false);
  });

  it("المزوّد قبل التوثيق: ملفه ومستنداته بس، وما يشوف طلبات ولا يرسل عروض", () => {
    const pending: Principal = { kind: "provider", verified: false };
    expect(can(pending, "provider.documents.upload")).toBe(true);
    expect(can(pending, "provider.requests.view")).toBe(false);
    expect(can(pending, "provider.offers.submit")).toBe(false);
    expect(can({ kind: "provider", verified: true }, "provider.offers.submit")).toBe(true);
  });

  it("المصنع والمزوّد ما عندهم أي صلاحية إدارية", () => {
    for (const p of [{ kind: "factory" }, { kind: "provider", verified: true }] as Principal[]) {
      expect(can(p, "admin.access")).toBe(false);
      expect([...permissionsFor(p)].some((x) => !x.startsWith("factory.") && !x.startsWith("request.") && !x.startsWith("provider."))).toBe(false);
    }
  });

  it("الإدارة ما تقدر تتصرف باسم المصنع أو المزوّد", () => {
    for (const r of STAFF_ROLES) {
      expect(can(staff(r), "request.create"), r).toBe(false);
      expect(can(staff(r), "provider.offers.submit"), r).toBe(false);
    }
  });

  it("كل صلاحية معرّفة لها دور واحد على الأقل يملكها", () => {
    const all: Principal[] = [{ kind: "factory" }, { kind: "provider", verified: true }, staff(...STAFF_ROLES)];
    for (const p of PERMISSIONS) expect(all.some((x) => can(x, p)), p).toBe(true);
  });
});
