// المرحلة ٤، الخطوة ٢: الإعدادات في قاعدة البيانات، مو مكتوبة في الكود.
import { SETTING_DEFAULTS } from "@mazood/shared";
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
    expect(s.cancellation).toEqual({ responseHours: 24, feeHalalas: 0 });
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

  it("قيمة غلط أو مفتاح مو معروف ينرفض", async () => {
    await expect(setSetting(ctx.db, { id: null, role: "system" }, "maxOffersPerRequest", 0)).rejects.toThrow();
    await expect(setSetting(ctx.db, { id: null, role: "system" }, "maxOffersPerRequest", 2.5)).rejects.toThrow();
    await expect(setSetting(ctx.db, { id: null, role: "system" }, "nope" as never, 1 as never)).rejects.toThrow();
    expect((await getSettings(ctx.db)).maxOffersPerRequest).toBe(10);
  });
});
