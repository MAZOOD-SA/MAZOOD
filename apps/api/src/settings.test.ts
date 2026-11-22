// المرحلة ٤، الخطوة ٢: الإعدادات في قاعدة البيانات، مو مكتوبة في الكود.
import { DEFAULT_CANCELLATION_POLICY, SETTING_DEFAULTS, type FeeRule } from "@mazood/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSettings, setSetting } from "./settings.ts";
import { createTestCtx, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
beforeAll(async () => { ctx = await createTestCtx(); });
afterAll(async () => { await ctx.close(); });

describe("الإعدادات", () => {
  it("القيم المقترحة في الخطة هي البداية", async () => {
    const s = await getSettings(ctx.db);
    expect(s).toEqual(SETTING_DEFAULTS);
    expect(s.offerValidityHours).toBe(48);
    expect(s.requestOpenDays).toBe(7);
    expect(s.maxOffersPerRequest).toBe(10);
    expect(s.autoConfirmHours).toBe(72);
    // رسوم الإلغاء: الهيكل جاهز، وكل المبالغ صفر لين يقرر المالك (cancellation.ts).
    expect(s.cancellation).toEqual(DEFAULT_CANCELLATION_POLICY);
    expect(s.cancellation.responseHours).toBe(24);
    expect(s.cancellation.factory.afterAccept).toEqual({ fixedHalalas: 0, percentBps: 0, minHalalas: 0, maxHalalas: null });
    expect(s.cancellation.factory.afterStart).toEqual({ fixedHalalas: 0, percentBps: 0, minHalalas: 0, maxHalalas: null });
    expect(s.cancellation.provider.afterAccept).toEqual({ fixedHalalas: 0, percentBps: 0, minHalalas: 0, maxHalalas: null });
    expect(s.smsEvents).toEqual(["first_offer", "offer_accepted", "cancellation_requested"]);
  });

  it("تغيير صلاحية العرض ينعكس فورًا بدون إعادة تشغيل، وينكتب في السجل", async () => {
    await setSetting(ctx.db, { id: null, role: "system" }, "offerValidityHours", 24);
    expect((await getSettings(ctx.db)).offerValidityHours).toBe(24);
    const log = await ctx.db.query<{ details: { key: string; from: unknown; to: unknown } }>(
      "SELECT details FROM audit_log WHERE action='settings.updated' ORDER BY id DESC LIMIT 1",
    );
    expect(log[0].details).toEqual({ key: "offerValidityHours", from: 48, to: 24 });
    await setSetting(ctx.db, { id: null, role: "system" }, "offerValidityHours", 48);
  });

  it("سياسة إلغاء محفوظة بالشكل القديم تنقرى وتترقّى (ما توقف المنصة)", async () => {
    await ctx.db.query("INSERT INTO settings (key, value) VALUES ('cancellation', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [
      JSON.stringify({ responseHours: 12, feeHalalas: 0 }),
    ]);
    const c = (await getSettings(ctx.db)).cancellation;
    expect(c.responseHours).toBe(12);
    expect(c.factory.afterStart.fixedHalalas).toBe(0);
    await ctx.db.query("DELETE FROM settings WHERE key='cancellation'");
  });

  it("قاعدة رسوم غلط تنرفض: نسبة فوق ١٠٠٪، أو كسر، أو حد أعلى أقل من الأدنى", async () => {
    const bad = (rule: FeeRule) => ({ ...DEFAULT_CANCELLATION_POLICY, factory: { ...DEFAULT_CANCELLATION_POLICY.factory, afterStart: rule } });
    const sys = { id: null, role: "system" };
    await expect(setSetting(ctx.db, sys, "cancellation", bad({ fixedHalalas: 0, percentBps: 10_001, minHalalas: 0, maxHalalas: null }))).rejects.toThrow();
    await expect(setSetting(ctx.db, sys, "cancellation", bad({ fixedHalalas: 2.5, percentBps: 0, minHalalas: 0, maxHalalas: null }))).rejects.toThrow();
    await expect(setSetting(ctx.db, sys, "cancellation", bad({ fixedHalalas: 0, percentBps: 0, minHalalas: 500, maxHalalas: 100 }))).rejects.toThrow();
    expect((await getSettings(ctx.db)).cancellation).toEqual(DEFAULT_CANCELLATION_POLICY);
  });

  it("قيمة غلط أو مفتاح مو معروف ينرفض", async () => {
    await expect(setSetting(ctx.db, { id: null, role: "system" }, "maxOffersPerRequest", 0)).rejects.toThrow();
    await expect(setSetting(ctx.db, { id: null, role: "system" }, "maxOffersPerRequest", 2.5)).rejects.toThrow();
    await expect(setSetting(ctx.db, { id: null, role: "system" }, "nope" as never, 1 as never)).rejects.toThrow();
    expect((await getSettings(ctx.db)).maxOffersPerRequest).toBe(10);
  });
});
