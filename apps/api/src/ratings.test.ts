// المرحلة ٤، الخطوة ٩: التقييم بالنجوم، ورقم الالتزام «التزم بـ X من Y طلب» في بطاقة العرض (القرار ٣٣).
import { DEFAULT_COMMITMENT_SETTINGS } from "@mazood/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScheduledJobs } from "./jobs.ts";
import { setSetting } from "./settings.ts";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let factory: { token: string };
let otherFactory: { token: string };
let p: { token: string; providerId: string };
const HOUR = 3600_000;
const SYS = { id: null, role: "system" };

const call = (method: "GET" | "POST", url: string, token: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

const newRequest = async (f = factory) => (await call("POST", "/v1/requests", f.token, validRequest)).json().request.id as string;
const offer = async (id: string, prov: { token: string }, priceHalalas = 100_000) =>
  (await call("POST", `/v1/provider/requests/${id}/offers`, prov.token, { priceHalalas, durationHours: 5 })).json().offer.id as string;

/** طلب عرض prov مقبول فيه. */
async function accepted(prov: { token: string } = p, f = factory) {
  const id = await newRequest(f);
  const o = await offer(id, prov);
  const acc = await call("POST", `/v1/requests/${id}/offers/${o}/accept`, f.token);
  expect(acc.statusCode).toBe(200);
  return { id, orderId: acc.json().order.id as string };
}

async function delivered(prov: { token: string } = p, f = factory) {
  const j = await accepted(prov, f);
  expect((await call("POST", `/v1/provider/jobs/${j.orderId}/start`, prov.token)).statusCode).toBe(200);
  expect((await call("POST", `/v1/provider/jobs/${j.orderId}/deliver`, prov.token)).statusCode).toBe(200);
  return j;
}

async function completed(prov: { token: string } = p, f = factory) {
  const j = await delivered(prov, f);
  expect((await call("POST", `/v1/requests/${j.id}/confirm`, f.token)).statusCode).toBe(200);
  return j;
}

const rate = (id: string, stars: unknown, f = factory, extra: object = {}) => call("POST", `/v1/requests/${id}/rating`, f.token, { stars, ...extra });

/** بطاقة عرض المزوّد كما يشوفها المصنع على طلب جديد. */
async function cardFor(prov: { token: string }) {
  const id = await newRequest();
  await offer(id, prov);
  const v = (await call("GET", `/v1/requests/${id}`, factory.token)).json();
  return v.offers[0].provider as { rating: unknown; commitment: unknown; verified: boolean };
}

beforeAll(async () => {
  ctx = await createTestCtx();
  factory = await ctx.factory("0527000001");
  otherFactory = await ctx.factory("0527000002");
  p = await ctx.verifiedProvider("0567000001");
});
afterAll(async () => {
  await ctx.close();
});

describe("التقييم بالنجوم", () => {
  it("ما يقيّم قبل الاكتمال: قبل البدء، وأثناء التنفيذ، وبعد «تم التنفيذ»", async () => {
    const a = await accepted();
    expect((await rate(a.id, 5)).json().error.code).toBe("not_completed");
    expect((await call("POST", `/v1/provider/jobs/${a.orderId}/start`, p.token)).statusCode).toBe(200);
    expect((await rate(a.id, 5)).json().error.code).toBe("not_completed");
    expect((await call("POST", `/v1/provider/jobs/${a.orderId}/deliver`, p.token)).statusCode).toBe(200);
    const r = await rate(a.id, 5);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("not_completed");
  });

  it("بعد الاكتمال يقيّم مرة وحدة، و«قيّم» يختفي ويبقى «اطلب مرة ثانية»", async () => {
    const { id } = await completed();
    const before = (await call("GET", `/v1/requests/${id}`, factory.token)).json();
    expect(before.rating).toBeNull();
    expect(before.actions.others).toContain("rate");

    const r = await rate(id, 4);
    expect(r.statusCode).toBe(200);
    expect(r.json().rating.stars).toBe(4);
    expect(r.json().actions).toEqual({ primary: "reorder", others: [] });

    const again = await rate(id, 5);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("already_rated");
    const [{ n }] = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM ratings WHERE request_id=$1", [id]);
    expect(n).toBe(1);
  });

  it("مصنع ثاني ما يقيّم (ولا يعرف إن الطلب موجود)", async () => {
    const { id } = await completed();
    const r = await rate(id, 1, otherFactory);
    expect(r.statusCode).toBe(404);
    expect((await call("GET", `/v1/requests/${id}`, factory.token)).json().rating).toBeNull();
  });

  it("المزوّد ما يقدر يقيّم نفسه", async () => {
    const { id } = await completed();
    expect((await call("POST", `/v1/requests/${id}/rating`, p.token, { stars: 5 })).statusCode).toBe(403);
  });

  it("النجوم من ١ إلى ٥ بس، وما فيه تعليق مكتوب", async () => {
    const { id } = await completed();
    for (const stars of [0, 6, 3.5, "5"]) expect((await rate(id, stars)).statusCode).toBe(400);
    expect((await rate(id, 5, factory, { comment: "ممتاز" })).statusCode).toBe(400);
    // والقاعدة نفسها ترفض أي نص في التعليق لين يقرر المالك والمحامي.
    await expect(ctx.db.query("UPDATE ratings SET comment='نص' WHERE true")).rejects.toThrow();
  });

  it("الطلب اللي اكتمل تلقائيًا ينقيّم", async () => {
    const { id } = await delivered();
    ctx.clock.advance(73 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    expect((await call("GET", `/v1/requests/${id}`, factory.token)).json().request.status).toBe("completed");
    expect((await rate(id, 3)).statusCode).toBe(200);
  });

  it("الإلغاء ما ينقيّم", async () => {
    const a = await accepted();
    expect((await call("POST", `/v1/requests/${a.id}/cancel`, factory.token)).statusCode).toBe(200);
    expect((await rate(a.id, 1)).json().error.code).toBe("not_completed");
  });

  it("متوسط المزوّد وعدد التقييمات يظهر في بطاقة العرض وفي حسابه", async () => {
    // التقييمات فوق: ٤ و٣. مزوّد جديد بتقييمين ٥ و٤.
    const q = await ctx.verifiedProvider("0567000002");
    expect((await cardFor(q)).rating).toBeNull();
    expect((await rate((await completed(q)).id, 5)).statusCode).toBe(200);
    expect((await rate((await completed(q)).id, 4)).statusCode).toBe(200);
    expect((await cardFor(q)).rating).toEqual({ average: 4.5, count: 2 });
    expect((await cardFor(p)).rating).toEqual({ average: 3.5, count: 2 });
    expect((await call("GET", "/v1/provider/me", q.token)).json().provider.rating).toEqual({ average: 4.5, count: 2 });
  });
});

describe("رقم الالتزام «التزم بـ X من Y طلب» (القرار ٣٣)", () => {
  it("المزوّد الجديد: «جديد على المنصة» لين يوصل ٥ طلبات مقبولة", async () => {
    const q = await ctx.verifiedProvider("0567000010");
    expect((await cardFor(q)).commitment).toEqual({ kind: "new" });
    for (let i = 0; i < 4; i++) await accepted(q);
    expect((await cardFor(q)).commitment).toEqual({ kind: "new" });
    await accepted(q);
    expect((await cardFor(q)).commitment).toEqual({ kind: "count", kept: 5, total: 5 });
  });

  it("اعتذار المزوّد ينقص الرقم، وإلغاء المصنع ما ينحسب عليه", async () => {
    const q = await ctx.verifiedProvider("0567000011");
    const jobs = [];
    for (let i = 0; i < 5; i++) jobs.push(await accepted(q));
    expect((await call("POST", `/v1/provider/jobs/${jobs[0].orderId}/withdraw`, q.token, { reason: "تعطّلت الشاحنة" })).statusCode).toBe(200);
    expect((await call("POST", `/v1/requests/${jobs[1].id}/cancel`, factory.token)).statusCode).toBe(200);
    expect((await cardFor(q)).commitment).toEqual({ kind: "count", kept: 4, total: 5 });
    expect((await call("GET", "/v1/provider/me", q.token)).json().provider.commitment).toEqual({ kind: "count", kept: 4, total: 5 });
  });

  it("الإعدادات تتغيّر بدون مبرمج: الإيقاف، والحد الأدنى، والمدة", async () => {
    const q = await ctx.verifiedProvider("0567000012");
    for (let i = 0; i < 2; i++) await accepted(q);
    try {
      await setSetting(ctx.db, SYS, "commitment", { ...DEFAULT_COMMITMENT_SETTINGS, enabled: false });
      expect((await cardFor(q)).commitment).toBeNull();
      await setSetting(ctx.db, SYS, "commitment", { ...DEFAULT_COMMITMENT_SETTINGS, minOrders: 2 });
      expect((await cardFor(q)).commitment).toEqual({ kind: "count", kept: 2, total: 2 });
      const [{ n }] = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_log WHERE action='settings.updated'");
      expect(n).toBeGreaterThanOrEqual(2);
    } finally {
      await setSetting(ctx.db, SYS, "commitment", DEFAULT_COMMITMENT_SETTINGS);
    }
  });

  // يقدّم الساعة، فخلّه آخر اختبار.
  it("ينحسب من آخر ١٢ شهر بس: الطلبات الأقدم ما تدخل", async () => {
    const q = await ctx.verifiedProvider("0567000013");
    for (let i = 0; i < 5; i++) await accepted(q);
    expect((await cardFor(q)).commitment).toEqual({ kind: "count", kept: 5, total: 5 });
    ctx.clock.advance(366 * 24 * HOUR);
    // الجلسة مدتها ٣٠ يوم، فبعد سنة يدخلون من جديد.
    factory = await ctx.signIn("0527000001");
    Object.assign(q, await ctx.signIn("0567000013", "provider"));
    expect((await cardFor(q)).commitment).toEqual({ kind: "new" });
    // ولو طوّل المالك المدة لـ ٢٤ شهر، ترجع.
    try {
      await setSetting(ctx.db, SYS, "commitment", { ...DEFAULT_COMMITMENT_SETTINGS, windowMonths: 24 });
      expect((await cardFor(q)).commitment).toEqual({ kind: "count", kept: 5, total: 5 });
    } finally {
      await setSetting(ctx.db, SYS, "commitment", DEFAULT_COMMITMENT_SETTINGS);
    }
  });
});
