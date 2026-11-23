// لوحة الإدارة (هـ-٢): الصلاحيات القابلة للتغيير، والإعدادات والعمولة، وطلبات الحذف، والأرقام، و«بانتظارك».
import { DEFAULT_MARKET_SETTINGS, resolvePermissions } from "@mazood/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let owner: string;
let gm: string;
let support: string;
let finance: string;
let verification: string;

const call = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

beforeAll(async () => {
  ctx = await createTestCtx();
  owner = (await ctx.staff("0500000101", "owner")).token;
  gm = (await ctx.staff("0500000102", "general_manager")).token;
  support = (await ctx.staff("0500000103", "support")).token;
  finance = (await ctx.staff("0500000104", "finance")).token;
  verification = (await ctx.staff("0500000105", "verification")).token;
});
afterAll(async () => {
  await ctx.close();
});

describe("جدول الصلاحيات", () => {
  it("المالك عنده كل شي دائمًا، والمقفولة ما تتغيّر", () => {
    const map = resolvePermissions({ "reports.view": [], "settings.commission": ["general_manager"] });
    expect(map["reports.view"]).toEqual(["owner"]);
    expect(map["settings.commission"]).toEqual(["owner"]);
  });

  it("الأرقام: المالك والمدير العام والمالية، وخدمة العملاء لا", async () => {
    for (const t of [owner, gm, finance]) expect((await call("GET", "/v1/admin/stats", t)).statusCode).toBe(200);
    expect((await call("GET", "/v1/admin/stats", support)).statusCode).toBe(403);
  });

  it("خدمة العملاء ما توصل للإعدادات ولا الدفعات، والمالية ما توصل للبلاغات", async () => {
    expect((await call("GET", "/v1/admin/settings", support)).statusCode).toBe(403);
    expect((await call("GET", "/v1/admin/market/subscriptions", support)).statusCode).toBe(403);
    expect((await call("GET", "/v1/admin/disputes", finance)).statusCode).toBe(403);
  });

  it("المالك يغيّر الصلاحيات من اللوحة وتنطبق فورًا، والمدير العام ما يقدر", async () => {
    expect((await call("GET", "/v1/admin/permissions", gm)).statusCode).toBe(403);
    expect((await call("PUT", "/v1/admin/permissions", gm, { rolePermissions: {} })).statusCode).toBe(403);
    // المالك يشيل الأرقام من المالية.
    const r = await call("PUT", "/v1/admin/permissions", owner, { rolePermissions: { "reports.view": ["owner", "general_manager"] } });
    expect(r.statusCode).toBe(200);
    expect((await call("GET", "/v1/admin/stats", finance)).statusCode).toBe(403);
    const me = (await call("GET", "/v1/me", finance)).json();
    expect(me.user.staffPermissions).not.toContain("reports.view");
    // ويرجّعها.
    await call("PUT", "/v1/admin/permissions", owner, { rolePermissions: {} });
    expect((await call("GET", "/v1/admin/stats", finance)).statusCode).toBe(200);
    const audit = (await call("GET", "/v1/admin/audit", owner)).json();
    expect(JSON.stringify(audit)).toContain("rolePermissions");
  });

  it("الصلاحية المقفولة أو غير المعروفة تنرفض", async () => {
    expect((await call("PUT", "/v1/admin/permissions", owner, { rolePermissions: { "settings.commission": ["owner", "general_manager"] } })).json().error.code).toBe("permission_locked");
    expect((await call("PUT", "/v1/admin/permissions", owner, { rolePermissions: { "nope.x": ["owner"] } })).statusCode).toBe(400);
  });
});

describe("الإعدادات والعمولة", () => {
  it("المدير العام يعدّل الإعدادات، والتعديل ينسجل", async () => {
    const r = await call("PUT", "/v1/admin/settings/requestOpenDays", gm, { value: 10 });
    expect(r.statusCode).toBe(200);
    expect(r.json().settings.requestOpenDays).toBe(10);
    expect((await call("PUT", "/v1/admin/settings/requestOpenDays", gm, { value: 0 })).statusCode).toBe(400);
    expect((await call("PUT", "/v1/admin/settings/rolePermissions", owner, { value: {} })).statusCode).toBe(404);
    expect((await call("GET", "/v1/admin/settings", gm)).json().settings.rolePermissions).toBeUndefined();
  });

  it("المدير العام ما يغيّر العمولة حتى داخل إعدادات السوق، والمالك يقدر", async () => {
    const market = { ...DEFAULT_MARKET_SETTINGS, commissionBps: 250 };
    expect((await call("PUT", "/v1/admin/settings/market", gm, { value: market })).json().error.code).toBe("owner_only");
    // باقي إعدادات السوق بدون العمولة: مسموح للمدير.
    expect((await call("PUT", "/v1/admin/settings/market", gm, { value: { ...DEFAULT_MARKET_SETTINGS, expiryWarningDays: 10 } })).statusCode).toBe(200);
    expect((await call("GET", "/v1/admin/settings", gm)).json().canEditCommission).toBe(false);
    const r = await call("PUT", "/v1/admin/settings/market", owner, { value: { ...market, expiryWarningDays: 10 } });
    expect(r.statusCode).toBe(200);
    expect(r.json().settings.market.commissionBps).toBe(250);
    await call("PUT", "/v1/admin/settings/market", owner, { value: DEFAULT_MARKET_SETTINGS });
  });
});

describe("طلبات حذف الحساب", () => {
  it("التنفيذ يمسح الجوال والاسم والهوية، والطلبات والسجل تبقى، والدخول ينقفل", async () => {
    const p = await ctx.verifiedProvider("0568200001");
    await call("POST", "/v1/account/deletion", p.token, { reason: "وقفت الشغل" });
    expect((await call("GET", "/v1/admin/deletions", support)).statusCode).toBe(403);
    const list = (await call("GET", "/v1/admin/deletions", gm)).json().deletions;
    const d = list.find((x: { phone: string }) => x.phone === "+966568200001");
    expect(d.status).toBe("pending");
    expect((await call("POST", `/v1/admin/deletions/${d.id}/complete`, gm)).statusCode).toBe(200);

    const [u] = await ctx.db.query<{ phone: string | null; status: string }>("SELECT phone, status FROM users WHERE id=$1", [p.userId]);
    expect(u).toEqual({ phone: null, status: "deleted" });
    const [pr] = await ctx.db.query<{ owner_name: string | null; id_number_enc: string | null; status: string; trade_name: string }>(
      "SELECT owner_name, id_number_enc, status, trade_name FROM providers WHERE id=$1",
      [p.providerId],
    );
    expect(pr).toMatchObject({ owner_name: null, id_number_enc: null, status: "suspended" });
    expect(pr.trade_name).toBeTruthy();
    const [doc] = await ctx.db.query<{ purged_at: Date | null }>("SELECT purged_at FROM provider_documents WHERE provider_id=$1 AND doc_type='id_document'", [p.providerId]);
    expect(doc.purged_at).not.toBeNull();
    // الجلسة انقفلت.
    expect((await call("GET", "/v1/me", p.token)).statusCode).toBe(401);
    // السجل يبيّن مين نفّذ.
    expect(JSON.stringify((await call("GET", "/v1/admin/audit", owner)).json())).toContain("account.deleted");
    // ما يتنفّذ مرتين.
    expect((await call("POST", `/v1/admin/deletions/${d.id}/complete`, gm)).json().error.code).toBe("deletion_not_pending");
  });

  it("ما ينفّذ والعميل عنده طلب جاري، والرفض لازم سبب ويوصل لصاحب الطلب", async () => {
    const f = await ctx.factory("0528200001");
    await call("POST", "/v1/requests", f.token, validRequest);
    await call("POST", "/v1/account/deletion", f.token, {});
    const d = (await call("GET", "/v1/admin/deletions?status=pending", owner))
      .json()
      .deletions.find((x: { phone: string }) => x.phone === "+966528200001");
    expect((await call("POST", `/v1/admin/deletions/${d.id}/complete`, owner)).json().error.code).toBe("deletion_has_active_orders");
    expect((await call("POST", `/v1/admin/deletions/${d.id}/reject`, owner, { reason: "" })).statusCode).toBe(400);
    expect((await call("POST", `/v1/admin/deletions/${d.id}/reject`, owner, { reason: "عندك طلب مفتوح، ألغه أول" })).statusCode).toBe(200);
    const mine = (await call("GET", "/v1/account/deletion", f.token)).json().request;
    expect(mine).toMatchObject({ status: "rejected", note: "عندك طلب مفتوح، ألغه أول" });
  });
});

describe("«بانتظارك» والأرقام", () => {
  it("كل موظف يشوف أرقام أقسامه بس", async () => {
    const s = (await call("GET", "/v1/admin/overview", support)).json();
    expect(s.openDisputes).toBeTypeOf("number");
    expect(s.pendingDeletions).toBeNull();
    expect(s.subscriptionsDue).toBeNull();
    const f = (await call("GET", "/v1/admin/overview", finance)).json();
    expect(f.subscriptionsDue).toBeTypeOf("number");
    expect(f.openDisputes).toBeNull();
    const v = (await call("GET", "/v1/admin/overview", verification)).json();
    expect(v.providersQueue).toBeTypeOf("number");
    expect(v.identityPending).toBeTypeOf("number");
  });

  it("الأرقام: ١٢ شهر، والشهر الحالي فيه الطلبات والعروض المرسلة", async () => {
    const before = (await call("GET", "/v1/admin/stats", owner)).json();
    expect(before.months).toHaveLength(12);
    const cur = (s: { months: { month: string }[] }) => s.months[s.months.length - 1] as unknown as Record<string, number>;
    const f = await ctx.factory("0528200002");
    const p = await ctx.verifiedProvider("0568200002");
    const id = (await call("POST", "/v1/requests", f.token, validRequest)).json().request.id;
    ctx.clock.advance(30 * 60_000);
    await call("POST", `/v1/provider/requests/${id}/offers`, p.token, { priceHalalas: 50_000, durationHours: 4 });
    const after = (await call("GET", "/v1/admin/stats", owner)).json();
    expect(cur(after).requests).toBe(cur(before).requests + 1);
    expect(cur(after).activeProviders).toBeGreaterThanOrEqual(1);
    expect(cur(after).avgMinutesToFirstOffer).toBeTypeOf("number");
    expect(cur(after).commissionHalalas).toBe(0);
    const transport = after.categories.find((c: { category: string }) => c.category === "transport");
    expect(transport.requests).toBeGreaterThanOrEqual(1);
    expect(transport.providers).toBeGreaterThanOrEqual(1);
  });
});
