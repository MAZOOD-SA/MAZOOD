// المرحلة ٤، الخطوة ٠: جلسة الموقع في كوكي محمي، والحماية من الطلبات المزوّرة (CSRF)،
// وحد الطلبات لكل مستخدم بدل كل شبكة.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, type TestCtx } from "./test-helpers.ts";

const CSRF = { "x-requested-with": "mazood" };

async function webSignIn(ctx: TestCtx, phone: string) {
  await ctx.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
  const n = `+966${phone.slice(1)}`;
  return ctx.app.inject({ method: "POST", url: "/v1/auth/otp/verify", payload: { phone, code: ctx.codes.get(n)!, channel: "web" } });
}

function cookieFrom(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie!;
  return raw.split(";")[0];
}

describe("جلسة الموقع في كوكي محمي", () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await createTestCtx(); });
  afterAll(async () => { await ctx.close(); });

  it("الموقع ياخذ الجلسة في كوكي HttpOnly وSameSite=Strict، والرمز ما يطلع في الرد", async () => {
    const r = await webSignIn(ctx, "0511000001");
    expect(r.statusCode).toBe(200);
    expect(r.json().token).toBeUndefined();
    const sc = String(r.headers["set-cookie"]);
    expect(sc).toMatch(/^mz_session=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Strict/i);
    expect(sc).toMatch(/Path=\/v1/);
    const cookie = cookieFrom(r.headers["set-cookie"]);
    expect(r.body).not.toContain(cookie.split("=")[1]);
    const me = await ctx.app.inject({ method: "GET", url: "/v1/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.phone).toBe("+966511000001");
  });

  it("طلب يغيّر شي بالكوكي وبدون رأس الحماية ينرفض، ومعه يمر", async () => {
    const cookie = cookieFrom((await webSignIn(ctx, "0511000002")).headers["set-cookie"]);
    const profile = { name: "مصنع تجريبي", city: "سدير", commercialRegister: "1010000000", vatNumber: "300000000000003" };
    const bad = await ctx.app.inject({ method: "PUT", url: "/v1/factory", headers: { cookie }, payload: profile });
    expect(bad.statusCode).toBe(403);
    expect(bad.json().error.code).toBe("csrf");
    const ok = await ctx.app.inject({ method: "PUT", url: "/v1/factory", headers: { cookie, ...CSRF }, payload: profile });
    expect(ok.statusCode).toBe(200);
  });

  it("الخروج يمسح الكوكي ويلغي الجلسة", async () => {
    const cookie = cookieFrom((await webSignIn(ctx, "0511000003")).headers["set-cookie"]);
    const out = await ctx.app.inject({ method: "POST", url: "/v1/auth/logout", headers: { cookie, ...CSRF } });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers["set-cookie"])).toMatch(/mz_session=;/);
    expect((await ctx.app.inject({ method: "GET", url: "/v1/me", headers: { cookie } })).statusCode).toBe(401);
  });

  it("التطبيق (بدون channel) يكمل ياخذ الرمز في الرد بدون كوكي", async () => {
    await ctx.app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone: "0511000004" } });
    const r = await ctx.app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { phone: "0511000004", code: ctx.codes.get("+966511000004")! },
    });
    expect(typeof r.json().token).toBe("string");
    expect(r.headers["set-cookie"]).toBeUndefined();
    // رمز Bearer ما يحتاج رأس الحماية: المتصفح ما يرسله تلقائيًا.
    const post = await ctx.app.inject({ method: "POST", url: "/v1/auth/logout", headers: auth(r.json().token) });
    expect(post.statusCode).toBe(204);
  });
});

describe("حد الطلبات لكل مستخدم", () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await createTestCtx({ strictRateLimits: true }); });
  afterAll(async () => { await ctx.close(); });

  it("موظفين بنفس الشبكة ما ينحجبون مع بعض، وكل واحد له حده", async () => {
    const a = await ctx.signIn("0512000001");
    const b = await ctx.signIn("0512000002");
    for (let i = 0; i < 120; i++) {
      const r = await ctx.app.inject({ method: "GET", url: "/v1/requests", headers: auth(a.token) });
      expect(r.statusCode).toBe(200);
    }
    expect((await ctx.app.inject({ method: "GET", url: "/v1/requests", headers: auth(a.token) })).statusCode).toBe(429);
    // نفس الـ IP، مستخدم ثاني: يمر.
    expect((await ctx.app.inject({ method: "GET", url: "/v1/requests", headers: auth(b.token) })).statusCode).toBe(200);
  });
});
