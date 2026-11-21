// الجلسات: تبديل مفتاح التجديد، وكشف استخدام مفتاح قديم، والخروج، والكوكي في المتصفح.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE, REFRESH_COOKIE } from "../src/auth/policy.ts";
import { bearer, json, login, randomIp, randomPhone, setupApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeAll(async () => {
  t = await setupApp();
});
afterAll(async () => t.close());

const refreshNative = (refreshToken: string) =>
  t.app.inject({ method: "POST", url: "/auth/refresh", payload: { client: "native", refreshToken }, remoteAddress: randomIp() });
const me = (token: string) => t.app.inject({ method: "GET", url: "/me", headers: bearer(token) });

describe("مفتاح الدخول", () => {
  it("بدون مفتاح، أو بمفتاح معدّل، يرجع 401", async () => {
    expect((await t.app.inject({ method: "GET", url: "/me" })).statusCode).toBe(401);
    const u = await login(t);
    const tampered = u.accessToken.slice(0, -3) + (u.accessToken.endsWith("A") ? "BBB" : "AAA");
    expect((await me(tampered)).statusCode).toBe(401);
    expect((await me(u.accessToken)).statusCode).toBe(200);
  });
});

describe("تبديل مفتاح التجديد", () => {
  it("كل تجديد يعطي مفتاح جديد، والقديم ما يرجع يشتغل", async () => {
    const u = await login(t);
    const r1 = await refreshNative(u.refreshToken);
    expect(r1.statusCode).toBe(200);
    const next = json(r1).refreshToken as string;
    expect(next).not.toBe(u.refreshToken);
    expect((await me(json(r1).accessToken)).statusCode).toBe(200);
  });

  it("استخدام مفتاح قديم يلغي الجلسة كاملة (حتى المفتاح الجديد ومفتاح الدخول)", async () => {
    const u = await login(t);
    const r1 = await refreshNative(u.refreshToken);
    const { refreshToken: newer, accessToken } = json(r1);

    // أحد سرق المفتاح القديم وجرّبه:
    const stolen = await refreshNative(u.refreshToken);
    expect(stolen.statusCode).toBe(401);

    expect((await refreshNative(newer)).statusCode).toBe(401);
    expect((await me(accessToken)).statusCode).toBe(401);
    const s = await t.db.session.findFirstOrThrow({ where: { userId: u.userId } });
    expect(s.revokeReason).toBe("refresh_reuse");
    expect(await t.db.auditLog.count({ where: { action: "auth.refresh_reuse", actorUserId: u.userId } })).toBe(1);
  });

  it("الجلسة المنتهية ما تتجدد", async () => {
    const u = await login(t);
    await t.db.session.updateMany({ where: { userId: u.userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refreshNative(u.refreshToken)).statusCode).toBe(401);
  });
});

describe("الخروج", () => {
  it("يلغي الجلسة فورًا", async () => {
    const u = await login(t);
    const out = await t.app.inject({ method: "POST", url: "/auth/logout", payload: { client: "native", refreshToken: u.refreshToken } });
    expect(out.statusCode).toBe(204);
    expect((await me(u.accessToken)).statusCode).toBe(401);
    expect((await refreshNative(u.refreshToken)).statusCode).toBe(401);
  });
});

describe("المتصفح: مفتاح التجديد في كوكي محمي", () => {
  async function webLogin() {
    const phone = randomPhone();
    const ip = randomIp();
    await t.app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone }, remoteAddress: ip });
    return t.app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { phone, code: t.sms.lastCode(phone), client: "web" },
      remoteAddress: ip,
    });
  }

  it("الكوكي httpOnly وSecure وSameSite=Strict، والمفتاح ما يرجع في الرد", async () => {
    const r = await webLogin();
    expect(r.statusCode).toBe(200);
    expect(json(r).refreshToken).toBeUndefined();
    const c = r.cookies.find((x) => x.name === REFRESH_COOKIE);
    expect(c).toBeDefined();
    expect(c?.httpOnly).toBe(true);
    expect(c?.secure).toBe(true);
    expect(c?.sameSite).toBe("Strict");
    expect(c?.path).toBe("/auth");
  });

  it("التجديد بالكوكي يحتاج رأس الحماية من CSRF", async () => {
    const r = await webLogin();
    const cookie = r.cookies.find((x) => x.name === REFRESH_COOKIE)!;
    const cookies = { [REFRESH_COOKIE]: cookie.value };

    const noHeader = await t.app.inject({ method: "POST", url: "/auth/refresh", payload: { client: "web" }, cookies });
    expect(noHeader.statusCode).toBe(403);

    const ok = await t.app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { client: "web" },
      cookies,
      headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
    });
    expect(ok.statusCode).toBe(200);
    expect(json(ok).refreshToken).toBeUndefined();
    expect(ok.cookies.find((x) => x.name === REFRESH_COOKIE)?.value).not.toBe(cookie.value);
  });
});
