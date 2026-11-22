// المرحلة ٤، الخطوة ٤: الطلبات المتاحة للمزوّد.
// القواعد: مزوّد موثّق بس، طلبات أقسامه ومدنه المفتوحة بس، وبدون اسم المصنع والموقع بالضبط.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, providerProfile, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let factory: { token: string; factoryId: string };
let transport: { token: string; providerId: string };
let requestId: string;

const get = (url: string, token: string) => ctx.app.inject({ method: "GET", url, headers: auth(token) });

beforeAll(async () => {
  ctx = await createTestCtx();
  factory = await ctx.factory("0520000001", "مصنع السرية التجريبي");
  transport = await ctx.verifiedProvider("0560100001", ["transport"]);
  const r = await ctx.app.inject({ method: "POST", url: "/v1/requests", headers: auth(factory.token), payload: validRequest });
  requestId = r.json().request.id;
});
afterAll(async () => { await ctx.close(); });

describe("الطلبات المتاحة للمزوّد", () => {
  it("المزوّد الموثّق في القسم يشوف الطلب: القسم والنوع والتفاصيل والمنطقة والموعد وعدد العروض", async () => {
    const r = await get("/v1/provider/requests", transport.token);
    expect(r.statusCode).toBe(200);
    const item = r.json().requests.find((x: { id: string }) => x.id === requestId);
    expect(item).toMatchObject({
      category: "transport",
      typeId: "flatbed",
      details: validRequest.details,
      area: validRequest.area,
      cityId: "sudair",
      when: "tomorrow",
      offerCount: 0,
      myOffer: null,
    });
  });

  it("اسم المصنع والموقع بالضبط ما يطلعون في الرد أبدًا", async () => {
    for (const url of ["/v1/provider/requests", `/v1/provider/requests/${requestId}`]) {
      const r = await get(url, transport.token);
      expect(r.statusCode).toBe(200);
      expect(r.body).not.toContain("مصنع السرية التجريبي");
      expect(r.body).not.toContain(validRequest.location);
      expect(r.body).not.toContain(factory.factoryId);
    }
  });

  it("مزوّد غير موثّق يرجع له رفض", async () => {
    const s = await ctx.signIn("0560100002", "provider");
    await ctx.app.inject({ method: "PUT", url: "/v1/provider/profile", headers: auth(s.token), payload: { ...providerProfile, categories: ["transport"] } });
    const r = await get("/v1/provider/requests", s.token);
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe("provider_not_verified");
  });

  it("مزوّد قسم ثاني ما يشوف الطلب، ولا يفتحه بالرابط", async () => {
    const cleaning = await ctx.verifiedProvider("0560100003", ["cleaning"]);
    const r = await get("/v1/provider/requests", cleaning.token);
    expect(r.json().requests.map((x: { id: string }) => x.id)).not.toContain(requestId);
    expect((await get(`/v1/provider/requests/${requestId}`, cleaning.token)).statusCode).toBe(404);
  });

  it("المزوّد اللي ما يخدم مدينة الطلب ما يشوفه", async () => {
    await ctx.db.query("INSERT INTO cities (id, name_ar, name_en) VALUES ('majmaah','المجمعة','Majmaah')");
    const other = await ctx.verifiedProvider("0560100004", ["transport"]);
    await ctx.db.query("DELETE FROM provider_cities WHERE provider_id=$1", [other.providerId]);
    await ctx.db.query("INSERT INTO provider_cities (provider_id, city_id) VALUES ($1,'majmaah')", [other.providerId]);
    const r = await get("/v1/provider/requests", other.token);
    expect(r.json().requests.map((x: { id: string }) => x.id)).not.toContain(requestId);
    await ctx.db.query("DELETE FROM provider_cities WHERE city_id='majmaah'");
    await ctx.db.query("DELETE FROM cities WHERE id='majmaah'");
  });

  it("المزوّد الموقوف، أو اللي انتهى مستنده، ما يشوف", async () => {
    const p = await ctx.verifiedProvider("0560100005", ["transport"]);
    await ctx.db.query("UPDATE providers SET status='suspended' WHERE id=$1", [p.providerId]);
    expect((await get("/v1/provider/requests", p.token)).statusCode).toBe(403);
    const q = await ctx.verifiedProvider("0560100006", ["transport"]);
    await ctx.db.query("UPDATE provider_documents SET expires_on='2026-01-01' WHERE provider_id=$1 AND doc_type='cr_certificate'", [q.providerId]);
    expect((await get("/v1/provider/requests", q.token)).statusCode).toBe(403);
  });

  it("المصنع والموظف ما يفتحون مسار المزوّد", async () => {
    expect((await get("/v1/provider/requests", factory.token)).statusCode).toBe(403);
  });

  it("الطلب الملغي أو المنتهي ما يظهر", async () => {
    const r = await ctx.app.inject({ method: "POST", url: "/v1/requests", headers: auth(factory.token), payload: validRequest });
    const id = r.json().request.id;
    await ctx.app.inject({ method: "POST", url: `/v1/requests/${id}/cancel`, headers: auth(factory.token) });
    expect((await get("/v1/provider/requests", transport.token)).json().requests.map((x: { id: string }) => x.id)).not.toContain(id);

    const r2 = await ctx.app.inject({ method: "POST", url: "/v1/requests", headers: auth(factory.token), payload: validRequest });
    ctx.clock.advance(8 * 86400_000);
    const list = (await get("/v1/provider/requests", transport.token)).json().requests.map((x: { id: string }) => x.id);
    expect(list).not.toContain(r2.json().request.id);
    expect(list).not.toContain(requestId);
    ctx.clock.advance(-8 * 86400_000);
  });

  it("فلترة بالقسم", async () => {
    const both = await ctx.verifiedProvider("0560100007", ["transport", "cleaning"]);
    const r = await get("/v1/provider/requests?category=cleaning", both.token);
    expect(r.statusCode).toBe(200);
    expect(r.json().requests.every((x: { category: string }) => x.category === "cleaning")).toBe(true);
    expect((await get("/v1/provider/requests?category=nope", both.token)).statusCode).toBe(400);
  });
});
