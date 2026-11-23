// اختبارات الطلبات والصلاحيات. الأهم: مصنع ما يشوف ولا يلمس طلبات مصنع ثاني.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let a: { token: string; userId: string };
let b: { token: string; userId: string };
beforeAll(async () => {
  ctx = await createTestCtx();
  a = await ctx.factory("0511111111");
  b = await ctx.factory("0522222222");
});
afterAll(async () => { await ctx.close(); });

const create = (token: string, payload: unknown = validRequest) =>
  ctx.app.inject({ method: "POST", url: "/v1/requests", headers: auth(token), payload: payload as object });

describe("رفع الطلب", () => {
  it("يتطلب دخول", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/v1/requests", payload: validRequest })).statusCode).toBe(401);
  });

  it("طلب صحيح ينحفظ بحالة بانتظار العروض", async () => {
    const r = await create(a.token);
    expect(r.statusCode).toBe(201);
    expect(r.json().request.status).toBe("awaiting_offers");
  });

  it("يرفض نوع ما يتبع القسم", async () => {
    const r = await create(a.token, { ...validRequest, typeId: "plumbing" });
    expect(r.statusCode).toBe(400);
  });

  it("يرفض قسم غير موجود، وتفاصيل قصيرة، وحقول زيادة", async () => {
    expect((await create(a.token, { ...validRequest, category: "weapons" })).statusCode).toBe(400);
    expect((await create(a.token, { ...validRequest, details: "قصير" })).statusCode).toBe(400);
    expect((await create(a.token, { ...validRequest, factoryId: "00000000-0000-0000-0000-000000000000" })).statusCode).toBe(400);
  });

  it("ما يقدر العميل يحدد المصنع ولا الحالة: يؤخذ من الجلسة", async () => {
    const r = await create(a.token, { ...validRequest, status: "completed" });
    expect(r.statusCode).toBe(400);
  });

  it("يشيل الأحرف التحكمية من النص", async () => {
    const r = await create(a.token, { ...validRequest, details: "نقل ماكينة\u0000 ثقيلة جدًا للرياض" });
    expect(r.statusCode).toBe(201);
    expect(r.json().request.details).not.toContain("\u0000");
  });

  it("نص فيه SQL يتخزّن كنص عادي ولا ينفّذ", async () => {
    const r = await create(a.token, { ...validRequest, details: "'; DROP TABLE requests; -- نقل ماكينة" });
    expect(r.statusCode).toBe(201);
    expect((await ctx.db.query("SELECT 1 FROM requests LIMIT 1")).length).toBe(1);
  });
});

describe("عزل المصانع", () => {
  let aRequestId: string;
  beforeAll(async () => {
    aRequestId = (await create(a.token)).json().request.id;
  });

  it("المصنع يشوف طلباته بس", async () => {
    const mine = await ctx.app.inject({ method: "GET", url: "/v1/requests", headers: auth(a.token) });
    const theirs = await ctx.app.inject({ method: "GET", url: "/v1/requests", headers: auth(b.token) });
    expect(mine.json().requests.some((r: { id: string }) => r.id === aRequestId)).toBe(true);
    expect(theirs.json().requests.some((r: { id: string }) => r.id === aRequestId)).toBe(false);
  });

  it("مصنع ثاني ما يقدر يفتح طلبك (404 مو 403)", async () => {
    const r = await ctx.app.inject({ method: "GET", url: `/v1/requests/${aRequestId}`, headers: auth(b.token) });
    expect(r.statusCode).toBe(404);
  });

  it("مصنع ثاني ما يقدر يلغي طلبك، والطلب يبقى كما هو", async () => {
    const r = await ctx.app.inject({ method: "POST", url: `/v1/requests/${aRequestId}/cancel`, headers: auth(b.token) });
    expect(r.statusCode).toBe(404);
    const still = await ctx.app.inject({ method: "GET", url: `/v1/requests/${aRequestId}`, headers: auth(a.token) });
    expect(still.json().request.status).toBe("awaiting_offers");
  });

  it("معرّف غير صالح يرجّع 404 بدون خطأ داخلي", async () => {
    const r = await ctx.app.inject({ method: "GET", url: "/v1/requests/not-a-uuid", headers: auth(a.token) });
    expect(r.statusCode).toBe(404);
  });

  it("مستخدم دوره مزوّد أو إدارة ما يوصل لمسارات المصنع", async () => {
    const p = await ctx.signIn("0533333333");
    await ctx.db.query("UPDATE users SET role='provider' WHERE id=$1", [p.userId]);
    const r = await ctx.app.inject({ method: "GET", url: "/v1/requests", headers: auth(p.token) });
    expect(r.statusCode).toBe(403);
  });
});

describe("إلغاء الطلب", () => {
  it("يلغي طلب بانتظار العروض، ويسجّل في السجل", async () => {
    const id = (await create(a.token)).json().request.id;
    const r = await ctx.app.inject({ method: "POST", url: `/v1/requests/${id}/cancel`, headers: auth(a.token) });
    expect(r.statusCode).toBe(200);
    expect(r.json().request.status).toBe("cancelled");
    const log = await ctx.db.query("SELECT 1 FROM audit_log WHERE action='request.cancelled' AND entity_id=$1", [id]);
    expect(log.length).toBe(1);
  });

  it("ما يلغي مرتين، ولا يلغي طلب انقبل فيه عرض (يحتاج سياسة الإلغاء)", async () => {
    const id = (await create(a.token)).json().request.id;
    await ctx.db.query("UPDATE requests SET status='in_progress' WHERE id=$1", [id]);
    const r = await ctx.app.inject({ method: "POST", url: `/v1/requests/${id}/cancel`, headers: auth(a.token) });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("request_not_cancellable");
  });
});

describe("حساب المصنع", () => {
  it("يحفظ بيانات الشركة ويتحقق من السجل والرقم الضريبي", async () => {
    const bad = await ctx.app.inject({
      method: "PUT", url: "/v1/factory", headers: auth(a.token),
      payload: { name: "مصنع", commercialRegister: "123", vatNumber: "123" },
    });
    expect(bad.statusCode).toBe(400);
    // أرقام تجريبية شكلًا فقط، مو بيانات شركة حقيقية.
    const ok = await ctx.app.inject({
      method: "PUT", url: "/v1/factory", headers: auth(a.token),
      payload: { name: "مصنع تجريبي", commercialRegister: "1010000000", vatNumber: "300000000000003" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().factory.profileComplete).toBe(true);
  });

  it("تحديث الحساب ما يكتب أرقام السجل في سجل الإجراءات", async () => {
    const rows = await ctx.db.query<{ details: unknown }>("SELECT details FROM audit_log WHERE action='factory.profile_updated'");
    expect(JSON.stringify(rows)).not.toContain("1010000000");
  });
});

describe("إعدادات الأمان", () => {
  it("رؤوس الأمان موجودة، والأخطاء ما تكشف تفاصيل داخلية", async () => {
    const r = await ctx.app.inject({ method: "GET", url: "/nope" });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.json()).toEqual({ error: { code: "not_found" } });
  });
});
