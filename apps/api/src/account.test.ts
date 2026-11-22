// المرحلة ٤، الخطوة ١١: «طلب حذف الحساب» من «حسابي»، و«وصل طلبك لـ X مزوّد موثّق» (رقم حقيقي).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;

const call = (method: "GET" | "POST", url: string, token: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

beforeAll(async () => {
  ctx = await createTestCtx();
});
afterAll(async () => {
  await ctx.close();
});

describe("طلب حذف الحساب", () => {
  it("المصنع يطلب الحذف مرة وحدة، والطلب الثاني وهو ينتظر ينرفض", async () => {
    const f = await ctx.factory("0528100001");
    expect((await call("GET", "/v1/account/deletion", f.token)).json().request).toBeNull();
    const r = await call("POST", "/v1/account/deletion", f.token, { reason: "ما عاد نحتاج المنصة" });
    expect(r.statusCode).toBe(201);
    expect(r.json().request.status).toBe("pending");
    expect((await call("POST", "/v1/account/deletion", f.token, {})).json().error.code).toBe("deletion_pending");
    expect((await call("GET", "/v1/account/deletion", f.token)).json().request.status).toBe("pending");
  });

  it("المزوّد يقدر يطلب، وما ينمسح شي تلقائيًا (الحساب لسا يدخل)", async () => {
    const p = await ctx.verifiedProvider("0568100001");
    expect((await call("POST", "/v1/account/deletion", p.token, {})).statusCode).toBe(201);
    expect((await call("GET", "/v1/provider/me", p.token)).statusCode).toBe(200);
  });

  it("السبب فيه رقم جوال ينرفض، وبدون دخول ممنوع", async () => {
    const f = await ctx.factory("0528100002");
    expect((await call("POST", "/v1/account/deletion", f.token, { reason: "كلموني 0551234567" })).json().error.code).toBe("contact_info_not_allowed");
    expect((await ctx.app.inject({ method: "POST", url: "/v1/account/deletion", headers: { "x-requested-with": "mazood" }, payload: {} })).statusCode).toBe(401);
  });
});

describe("وصل طلبك لـ X مزوّد موثّق", () => {
  it("الرقم يعدّ المزوّدين الموثّقين في القسم والمدينة بس", async () => {
    const f = await ctx.factory("0528100003");
    const before = (await call("POST", "/v1/requests", f.token, validRequest)).json();
    await ctx.verifiedProvider("0568100002");
    const after = (await call("POST", "/v1/requests", f.token, validRequest)).json();
    expect(after.reach).toBe(before.reach + 1);
    const detail = (await call("GET", `/v1/requests/${after.request.id}`, f.token)).json();
    expect(detail.reach).toBe(after.reach);
  });
});

describe("قائمة طلبات المصنع", () => {
  it("كل طلب معه عدد العروض، وعدد اللي ما انفتحت", async () => {
    const f = await ctx.factory("0528100004");
    const p = await ctx.verifiedProvider("0568100003");
    const id = (await call("POST", "/v1/requests", f.token, validRequest)).json().request.id;
    await call("POST", `/v1/provider/requests/${id}/offers`, p.token, { priceHalalas: 50_000, durationHours: 4 });
    const row = () => call("GET", "/v1/requests", f.token).then((r) => r.json().requests.find((x: { id: string }) => x.id === id));
    expect(await row()).toMatchObject({ offerCount: 1, newOfferCount: 1 });
    await call("GET", `/v1/requests/${id}`, f.token);
    expect(await row()).toMatchObject({ offerCount: 1, newOfferCount: 0 });
  });
});
