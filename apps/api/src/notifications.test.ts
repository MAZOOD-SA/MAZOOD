// التنبيهات (القرار ٤٩): كل حدث يكتب تنبيه للشخص الصح بس، والإرسال يعيد المحاولة لو فشل،
// واللي طفّى الرسائل ما توصله، والتذكيرات ما تتكرر.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScheduledJobs } from "./jobs.ts";
import { deliverPending, notify, type PushSender } from "./notify.ts";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
const HOUR = 3600_000;
const call = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: object) => ctx.app.inject({ method, url, headers: auth(token), payload });
// الساعة ثابتة في الاختبار، فالتنبيهات بنفس اللحظة: نقارنها مرتبة أبجديًا.
const eventsOf = async (userId: string) =>
  (await ctx.db.query<{ event: string }>("SELECT event FROM notifications WHERE user_id=$1", [userId])).map((r) => r.event).sort();

beforeAll(async () => { ctx = await createTestCtx(); });
afterAll(async () => { await ctx.close(); });

describe("الأحداث تكتب تنبيه للشخص الصح بس", () => {
  it("طلب ← عرض ← قبول ← بدأ ← تم ← تأكيد: كل طرف يوصله اللي يخصه", async () => {
    const f = await ctx.factory("0519000001");
    const p1 = await ctx.verifiedProvider("0569000001", ["transport"]);
    const p2 = await ctx.verifiedProvider("0569000002", ["transport"]);
    const pOther = await ctx.verifiedProvider("0569000003", ["cleaning"]);
    const requestId = (await call("POST", "/v1/requests", f.token, validRequest)).json().request.id;
    expect(await eventsOf(p1.userId)).toEqual(["new_request"]);
    expect(await eventsOf(pOther.userId)).toEqual([]);

    const offer = { priceHalalas: 150000, durationHours: 8 };
    const o1 = (await call("POST", `/v1/provider/requests/${requestId}/offers`, p1.token, offer)).json().offer.id;
    await call("POST", `/v1/provider/requests/${requestId}/offers`, p2.token, offer);
    expect(await eventsOf(f.userId)).toEqual(["first_offer", "more_offers"].sort());

    await call("POST", `/v1/requests/${requestId}/offers/${o1}/accept`, f.token);
    expect(await eventsOf(p1.userId)).toEqual(["new_request", "offer_accepted"].sort());
    expect(await eventsOf(p2.userId)).toEqual(["new_request", "offer_not_selected"].sort());

    const job = (await call("GET", "/v1/provider/jobs", p1.token)).json().jobs[0];
    await call("POST", `/v1/provider/jobs/${job.orderId}/start`, p1.token);
    await call("POST", `/v1/provider/jobs/${job.orderId}/deliver`, p1.token);
    await call("POST", `/v1/requests/${requestId}/confirm`, f.token);
    expect(await eventsOf(f.userId)).toEqual(["first_offer", "more_offers", "job_started", "job_delivered", "rate_provider"].sort());
  });

  it("العميل يشوف تنبيهاته بس، ويقدر يعلّمها مقروءة", async () => {
    const f = await ctx.factory("0519000010");
    const other = await ctx.factory("0519000011");
    await notify(ctx.db, [f.userId], "rate_provider", { title: "طلب تجريبي" }, ctx.clock.now);
    const mine = (await call("GET", "/v1/notifications", f.token)).json();
    expect(mine.unread).toBe(1);
    expect((await call("GET", "/v1/notifications", other.token)).json().notifications).toEqual([]);
    await call("POST", "/v1/notifications/read", f.token, {});
    expect((await call("GET", "/v1/notifications", f.token)).json().unread).toBe(0);
  });
});

describe("الإرسال", () => {
  it("الرسالة النصية لأول عرض بس (الإعداد smsEvents)، واللي طفّى الرسائل ما توصله", async () => {
    const f = await ctx.factory("0519000020");
    const quiet = await ctx.factory("0519000021");
    await call("PUT", "/v1/notifications/prefs", quiet.token, { sms: false, push: true, muted: [] });
    await notify(ctx.db, [f.userId, quiet.userId], "first_offer", { title: "سطحة" }, ctx.clock.now);
    await notify(ctx.db, [f.userId], "more_offers", { title: "سطحة" }, ctx.clock.now);
    const rows = await ctx.db.query<{ user_id: string; event: string; sms_status: string }>(
      "SELECT user_id, event, sms_status FROM notifications WHERE user_id = ANY($1::uuid[]) ORDER BY created_at",
      [[f.userId, quiet.userId]],
    );
    expect(rows.find((r) => r.user_id === f.userId && r.event === "first_offer")!.sms_status).toBe("pending");
    expect(rows.find((r) => r.user_id === quiet.userId)!.sms_status).toBe("skipped");
    expect(rows.find((r) => r.event === "more_offers")!.sms_status).toBe("none");

    const sent: string[] = [];
    await deliverPending(ctx.db, { sms: { async send(phone, text) { sent.push(`${phone}|${text}`); } }, push: null }, ctx.clock.now);
    expect(sent.some((x) => x.startsWith("+966519000020|") && x.includes("سطحة"))).toBe(true);
    expect(sent.some((x) => x.startsWith("+966519000021|"))).toBe(false);
  });

  it("الفشل يعيد المحاولة بعد دقيقة ثم ٥ ثم ٣٠ ثم ساعتين، وبعدها «فشل»", async () => {
    const f = await ctx.factory("0519000030");
    await notify(ctx.db, [f.userId], "offer_accepted", { title: "x" }, ctx.clock.now);
    const failing = { sms: { async send() { throw new Error("down"); } }, push: null };
    const state = async () =>
      (await ctx.db.query<{ sms_status: string; attempts: number; next_attempt_at: Date | null }>("SELECT sms_status, attempts, next_attempt_at FROM notifications WHERE user_id=$1", [f.userId]))[0];
    let t = ctx.clock.now;
    for (const wait of [1, 5, 30, 120]) {
      await deliverPending(ctx.db, failing, t);
      const s = await state();
      expect(s.sms_status).toBe("pending");
      expect(new Date(s.next_attempt_at!).getTime() - t.getTime()).toBe(wait * 60_000);
      t = new Date(s.next_attempt_at!);
    }
    await deliverPending(ctx.db, failing, t);
    expect(await state()).toMatchObject({ sms_status: "failed", attempts: 5, next_attempt_at: null });
  });

  it("إشعار الجوال للأجهزة المسجّلة، والرمز اللي ما عاد صالح ينلغي", async () => {
    const f = await ctx.factory("0519000040");
    const token = "ExponentPushToken[abcdefghijklmnop]";
    expect((await call("POST", "/v1/push-tokens", f.token, { token, platform: "android" })).statusCode).toBe(200);
    expect((await call("POST", "/v1/push-tokens", f.token, { token: "x", platform: "android" })).statusCode).toBe(400);
    await notify(ctx.db, [f.userId], "job_started", { title: "y" }, ctx.clock.now);
    const pushed: string[][] = [];
    const push: PushSender = { async send(tokens) { pushed.push(tokens); return { invalidTokens: tokens }; } };
    await deliverPending(ctx.db, { sms: { async send() {} }, push }, ctx.clock.now);
    expect(pushed).toEqual([[token]]);
    const [row] = await ctx.db.query<{ revoked_at: Date | null }>("SELECT revoked_at FROM push_tokens WHERE token=$1", [token]);
    expect(row.revoked_at).not.toBeNull();
  });

  it("الحدث المكتوم ما يرسل شي خارج التطبيق، بس يظهر داخله", async () => {
    const f = await ctx.factory("0519000050");
    await call("PUT", "/v1/notifications/prefs", f.token, { sms: true, push: true, muted: ["first_offer"] });
    await notify(ctx.db, [f.userId], "first_offer", { title: "z" }, ctx.clock.now);
    const [row] = await ctx.db.query<{ sms_status: string; push_status: string }>("SELECT sms_status, push_status FROM notifications WHERE user_id=$1", [f.userId]);
    expect(row).toEqual({ sms_status: "none", push_status: "none" });
  });
});

describe("التذكيرات", () => {
  it("تذكير تأكيد الاستلام بعد ٢٤ و٤٨ ساعة، مرة وحدة لكل واحد", async () => {
    const f = await ctx.factory("0519000060");
    const p = await ctx.verifiedProvider("0569000060", ["transport"]);
    const requestId = (await call("POST", "/v1/requests", f.token, validRequest)).json().request.id;
    const offerId = (await call("POST", `/v1/provider/requests/${requestId}/offers`, p.token, { priceHalalas: 1000, durationHours: 2 })).json().offer.id;
    await call("POST", `/v1/requests/${requestId}/offers/${offerId}/accept`, f.token);
    const job = (await call("GET", "/v1/provider/jobs", p.token)).json().jobs.find((j: { requestId: string }) => j.requestId === requestId);
    await call("POST", `/v1/provider/jobs/${job.orderId}/start`, p.token);
    await call("POST", `/v1/provider/jobs/${job.orderId}/deliver`, p.token);
    const base = ctx.clock.now;
    const count = async () => (await eventsOf(f.userId)).filter((e) => e === "confirm_reminder").length;
    await runScheduledJobs(ctx.db, new Date(base.getTime() + 25 * HOUR));
    await runScheduledJobs(ctx.db, new Date(base.getTime() + 26 * HOUR));
    expect(await count()).toBe(1);
    await runScheduledJobs(ctx.db, new Date(base.getTime() + 49 * HOUR));
    expect(await count()).toBe(2);
  });
});
