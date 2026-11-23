// المرحلة ٤، الخطوة ٥: العروض. إرسال وتعديل وسحب، وفحص الأرقام والروابط، وأقصى عدد، والصلاحية.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let factory: { token: string };
let a: { token: string; providerId: string };
let b: { token: string; providerId: string };
const offer = { priceHalalas: 245_000, durationHours: 24, note: "السطحة جاهزة بكرة الصبح" };

const call = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });
const newRequest = async () => (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id as string;

beforeAll(async () => {
  ctx = await createTestCtx();
  factory = await ctx.factory("0521000001");
  a = await ctx.verifiedProvider("0561000001");
  b = await ctx.verifiedProvider("0561000002");
});
afterAll(async () => { await ctx.close(); });

describe("إرسال العرض", () => {
  it("المزوّد الموثّق يرسل عرض، وصلاحيته الافتراضية ٤٨ ساعة", async () => {
    const id = await newRequest();
    const r = await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer);
    expect(r.statusCode).toBe(201);
    expect(r.json().offer).toMatchObject({ priceHalalas: 245_000, durationHours: 24, status: "active", revision: 1 });
    expect(new Date(r.json().offer.validUntil).getTime() - ctx.clock.now.getTime()).toBe(48 * 3600_000);
    const list = await call("GET", "/v1/provider/requests", a.token);
    expect(list.json().requests.find((x: { id: string }) => x.id === id).myOffer.id).toBe(r.json().offer.id);
  });

  it("عرض ثاني من نفس المزوّد على نفس الطلب ينرفض", async () => {
    const id = await newRequest();
    expect((await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer)).statusCode).toBe(201);
    const r = await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("offer_exists");
  });

  it("العرض الحادي عشر ينرفض، والطلب يختفي من الطلبات المتاحة", async () => {
    const id = await newRequest();
    for (let i = 0; i < 10; i++) {
      const p = await ctx.verifiedProvider(`05620000${String(i).padStart(2, "0")}`);
      expect((await call("POST", `/v1/provider/requests/${id}/offers`, p.token, offer)).statusCode).toBe(201);
    }
    const eleventh = await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer);
    expect(eleventh.statusCode).toBe(409);
    expect(eleventh.json().error.code).toBe("offers_full");
    expect((await call("GET", "/v1/provider/requests", a.token)).json().requests.map((x: { id: string }) => x.id)).not.toContain(id);
  });

  it.each([
    ["رقم جوال", "كلمني على 0551234567"],
    ["رقم بأرقام عربية ومسافات", "رقمي ٠٥٥ ١٢٣ ٤٥٦٧"],
    ["رقم دولي", "+966 55 123 4567"],
    ["رابط", "تفاصيل أكثر في www.example.com"],
    ["رابط كامل", "https://example.sa/x"],
    ["إيميل", "راسلني على someone@example.com"],
  ])("ملاحظة فيها %s تنرفض برسالة واضحة", async (_label, note) => {
    const id = await newRequest();
    const r = await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, note });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("contact_info_not_allowed");
  });

  it("الأرقام الصغيرة العادية (مثل ٣ سطحات، ١٤ طن) مسموحة", async () => {
    const id = await newRequest();
    const r = await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, note: "عندي 3 سطحات حمولة 14 طن، والتسليم الساعة 7" });
    expect(r.statusCode).toBe(201);
  });

  it("تفاصيل الطلب أو منطقته فيها رقم جوال: تنرفض", async () => {
    const r = await call("POST", "/v1/requests", factory.token, { ...validRequest, details: "نقل ماكينة، للتواصل 0551234567" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("contact_info_not_allowed");
    const r2 = await call("POST", "/v1/requests", factory.token, { ...validRequest, area: "www.example.com" });
    expect(r2.json().error.code).toBe("contact_info_not_allowed");
  });

  it("المبلغ لازم هللة صحيحة: الكسور والسالب والصفر تنرفض", async () => {
    const id = await newRequest();
    for (const priceHalalas of [100.5, 0, -100, "100"]) {
      expect((await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, priceHalalas })).statusCode).toBe(400);
    }
  });

  it("المزوّد يختار صلاحية أقل، وأكثر من الإعداد تنرفض، والعرض المنتهي ما ينحسب", async () => {
    const id = await newRequest();
    expect((await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, validHours: 49 })).statusCode).toBe(400);
    const r = await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, validHours: 12 });
    expect(new Date(r.json().offer.validUntil).getTime() - ctx.clock.now.getTime()).toBe(12 * 3600_000);
    const count = async () => (await call("GET", `/v1/provider/requests/${id}`, b.token)).json().request.offerCount;
    expect(await count()).toBe(1);
    ctx.clock.advance(12 * 3600_000 + 1000);
    expect(await count()).toBe(0);
    // بعد ما انتهى، يقدر يرسل عرض جديد.
    expect((await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer)).statusCode).toBe(201);
    ctx.clock.advance(-(12 * 3600_000 + 1000));
  });

  it("على طلب ملغي، أو طلب قسم ثاني: ما ينرسل", async () => {
    const id = await newRequest();
    await call("POST", `/v1/requests/${id}/cancel`, factory.token);
    expect((await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer)).statusCode).toBe(404);
    const cleaning = await ctx.verifiedProvider("0561000003", ["cleaning"]);
    expect((await call("POST", `/v1/provider/requests/${await newRequest()}/offers`, cleaning.token, offer)).statusCode).toBe(404);
  });

  it("مزوّد غير موثّق ما يرسل عرض", async () => {
    const s = await ctx.signIn("0561000004", "provider");
    expect((await call("POST", `/v1/provider/requests/${await newRequest()}/offers`, s.token, offer)).statusCode).toBe(403);
  });
});

describe("سرية الأسعار", () => {
  it("المزوّد ما يشوف أسعار غيره: لا في الطلب، ولا في «عروضي»", async () => {
    const id = await newRequest();
    await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, priceHalalas: 777_123 });
    await call("POST", `/v1/provider/requests/${id}/offers`, b.token, { ...offer, priceHalalas: 555_321 });
    const detail = await call("GET", `/v1/provider/requests/${id}`, b.token);
    expect(detail.json().request.offerCount).toBe(2);
    expect(detail.body).not.toContain("777123");
    const mine = await call("GET", "/v1/provider/offers", b.token);
    expect(mine.statusCode).toBe(200);
    expect(mine.body).not.toContain("777123");
    expect(mine.json().offers.every((o: { providerId?: string }) => o.providerId === undefined)).toBe(true);
    expect(mine.json().offers.some((o: { priceHalalas: number }) => o.priceHalalas === 555_321)).toBe(true);
  });
});

describe("تعديل العرض وسحبه", () => {
  it("التعديل ينحفظ كنسخة جديدة، والقديمة تبقى في السجل", async () => {
    const id = await newRequest();
    const o = (await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer)).json().offer;
    const r = await call("PUT", `/v1/provider/offers/${o.id}`, a.token, { ...offer, priceHalalas: 230_000 });
    expect(r.statusCode).toBe(200);
    expect(r.json().offer).toMatchObject({ priceHalalas: 230_000, revision: 2 });
    const rev = await ctx.db.query<{ price_halalas: string; revision: number }>("SELECT price_halalas, revision FROM offer_revisions WHERE offer_id=$1", [o.id]);
    expect(rev.map((x) => [Number(x.price_halalas), x.revision])).toEqual([[245_000, 1]]);
  });

  it("مزوّد ثاني ما يعدّل ولا يسحب عرض غيره", async () => {
    const id = await newRequest();
    const o = (await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer)).json().offer;
    expect((await call("PUT", `/v1/provider/offers/${o.id}`, b.token, offer)).statusCode).toBe(404);
    expect((await call("POST", `/v1/provider/offers/${o.id}/withdraw`, b.token)).statusCode).toBe(404);
  });

  it("السحب يشيل العرض من العدد، ويقدر يرسل عرض جديد بعده", async () => {
    const id = await newRequest();
    const o = (await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer)).json().offer;
    const w = await call("POST", `/v1/provider/offers/${o.id}/withdraw`, a.token);
    expect(w.statusCode).toBe(200);
    expect(w.json().offer.status).toBe("withdrawn");
    expect((await call("GET", `/v1/provider/requests/${id}`, b.token)).json().request.offerCount).toBe(0);
    expect((await call("POST", `/v1/provider/offers/${o.id}/withdraw`, a.token)).statusCode).toBe(409);
    expect((await call("PUT", `/v1/provider/offers/${o.id}`, a.token, offer)).statusCode).toBe(409);
    expect((await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer)).statusCode).toBe(201);
  });
});

describe("«يشمل / ما يشمل» (القرار ٥٨)", () => {
  const inclusions = { loading: "included", unloading: "excluded", waiting_over_2h: "excluded" };

  it("البنود تنحفظ، والعميل يشوفها مع العرض", async () => {
    const id = await newRequest();
    const r = await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, inclusions });
    expect(r.statusCode).toBe(201);
    expect(r.json().offer.inclusions).toEqual(inclusions);
    const view = await call("GET", `/v1/requests/${id}`, factory.token);
    expect(view.json().offers[0].inclusions).toEqual(inclusions);
  });

  it("بند ناقص أو بند من قسم ثاني أو قيمة غلط: ينرفض", async () => {
    const id = await newRequest();
    const send = (inc: object) => call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, inclusions: inc });
    expect((await send({ loading: "included" })).json().error.code).toBe("inclusions_incomplete");
    expect((await send({ ...inclusions, parts: "included" })).json().error.code).toBe("inclusions_unknown");
    expect((await send({ ...inclusions, loading: "maybe" })).statusCode).toBe(400);
  });

  it("عرض بدون بنود (نسخة تطبيق قديمة) ينقبل، والبنود null", async () => {
    const id = await newRequest();
    const r = await call("POST", `/v1/provider/requests/${id}/offers`, b.token, offer);
    expect(r.statusCode).toBe(201);
    expect(r.json().offer.inclusions).toBeNull();
  });

  it("التعديل يغيّر البنود، والتعديل بدون بنود ما يمسحها", async () => {
    const id = await newRequest();
    const sent = await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, inclusions });
    const offerId = sent.json().offer.id;
    const changed = { ...inclusions, unloading: "included" };
    expect((await call("PUT", `/v1/provider/offers/${offerId}`, a.token, { ...offer, inclusions: changed })).json().offer.inclusions).toEqual(changed);
    expect((await call("PUT", `/v1/provider/offers/${offerId}`, a.token, offer)).json().offer.inclusions).toEqual(changed);
  });
});
