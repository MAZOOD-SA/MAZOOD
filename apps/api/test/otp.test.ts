// رمز التحقق: الصلاحية، والمحاولات الخاطئة، وحدود الطلب، وعدم كشف الأرقام المسجّلة.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashOtp } from "../src/auth/otp.ts";
import { OTP_LIMITS, OTP_MAX_ATTEMPTS } from "../src/auth/policy.ts";
import { json, login, randomIp, randomPhone, setupApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeAll(async () => {
  t = await setupApp();
});
afterAll(async () => t.close());

const requestCode = (phone: string, ip = randomIp()) =>
  t.app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone }, remoteAddress: ip });
const verify = (phone: string, code: string, ip = randomIp()) =>
  t.app.inject({ method: "POST", url: "/auth/otp/verify", payload: { phone, code, client: "native" }, remoteAddress: ip });
/** رمز مختلف أكيد عن الرمز الصحيح. */
const wrongCode = (right: string) => String((Number(right) + 1) % 1_000_000).padStart(6, "0");

describe("طلب الرمز", () => {
  it("نفس الرد للرقم الجديد والمسجّل (ما نكشف مين مسجّل)", async () => {
    const existing = await login(t);
    const a = await requestCode(existing.phone);
    const b = await requestCode(randomPhone());
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.body).toBe(b.body);
  });

  it("يطبّع الرقم: 05… و+966… نفس الحساب", async () => {
    const local = `0${randomPhone().slice(4)}`;
    const e164 = `+966${local.slice(1)}`;
    await requestCode(local);
    const r = await verify(e164, t.sms.lastCode(e164));
    expect(r.statusCode).toBe(200);
    expect(json(r).me.user.phone).toBe(e164);
  });

  it("الرمز ما يُحفظ كنص، بس بصمته", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const code = t.sms.lastCode(phone);
    const row = await t.db.otpChallenge.findFirstOrThrow({ where: { phone }, orderBy: { createdAt: "desc" } });
    expect(row.codeHash).not.toContain(code);
    expect(row.codeHash).toBe(hashOtp(t.config.OTP_PEPPER, phone, code));
  });

  it("يرفض رقم مو سعودي، وحقول زايدة", async () => {
    expect((await requestCode("+971551234567")).statusCode).toBe(400);
    const r = await t.app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone: randomPhone(), role: "admin" } });
    expect(r.statusCode).toBe(400);
    expect(json(r).error).toBe("invalid_input");
  });

  it(`حد ${OTP_LIMITS.perPhone15Min} طلبات لكل رقم كل ١٥ دقيقة`, async () => {
    const phone = randomPhone();
    for (let i = 0; i < OTP_LIMITS.perPhone15Min; i++) expect((await requestCode(phone)).statusCode).toBe(200);
    const blocked = await requestCode(phone);
    expect(blocked.statusCode).toBe(429);
    expect(json(blocked).error).toBe("rate_limited");
    expect(json(blocked).retryAfterSeconds).toBeGreaterThan(0);
    expect(json(blocked).retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it(`حد ${OTP_LIMITS.perPhoneDay} طلبات لكل رقم باليوم`, async () => {
    const phone = randomPhone();
    // طلبات قديمة (قبل ساعة) ما تنحسب في حد الربع ساعة، بس تنحسب في حد اليوم.
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    await t.db.otpChallenge.createMany({
      data: Array.from({ length: OTP_LIMITS.perPhoneDay }, () => ({
        phone,
        codeHash: "x",
        ipHash: "x",
        expiresAt: hourAgo,
        createdAt: hourAgo,
      })),
    });
    const r = await requestCode(phone);
    expect(r.statusCode).toBe(429);
  });

  it(`حد ${OTP_LIMITS.perIpHour} طلب لكل عنوان IP بالساعة`, async () => {
    const ip = randomIp();
    for (let i = 0; i < OTP_LIMITS.perIpHour; i++) expect((await requestCode(randomPhone(), ip)).statusCode).toBe(200);
    expect((await requestCode(randomPhone(), ip)).statusCode).toBe(429);
  });

  it("طلبات متزامنة لنفس الرقم ما تتجاوز الحد", async () => {
    const phone = randomPhone();
    const results = await Promise.all(Array.from({ length: 8 }, () => requestCode(phone)));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(OTP_LIMITS.perPhone15Min);
  });

  it("إذا فشل إرسال الرسالة يرجع sms_failed", async () => {
    t.sms.fail = true;
    try {
      const r = await requestCode(randomPhone());
      expect(r.statusCode).toBe(502);
      expect(json(r).error).toBe("sms_failed");
    } finally {
      t.sms.fail = false;
    }
  });
});

describe("التحقق من الرمز", () => {
  it("الرمز ينستخدم مرة وحدة بس", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const code = t.sms.lastCode(phone);
    expect((await verify(phone, code)).statusCode).toBe(200);
    const again = await verify(phone, code);
    expect(again.statusCode).toBe(400);
    expect(json(again).error).toBe("code_expired");
  });

  it("الرمز ينتهي بعد ٥ دقائق", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    await t.db.otpChallenge.updateMany({ where: { phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await verify(phone, t.sms.lastCode(phone));
    expect(r.statusCode).toBe(400);
    expect(json(r).error).toBe("code_expired");
  });

  it("الرمز الجديد يلغي اللي قبله", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const first = t.sms.lastCode(phone);
    await requestCode(phone);
    const second = t.sms.lastCode(phone);
    if (first !== second) expect((await verify(phone, first)).statusCode).toBe(400);
    expect((await verify(phone, second)).statusCode).toBe(200);
  });

  it(`بعد ${OTP_MAX_ATTEMPTS} محاولات خاطئة ينلغي الرمز، حتى لو جات بعدها المحاولة الصحيحة`, async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const right = t.sms.lastCode(phone);
    for (let left = OTP_MAX_ATTEMPTS - 1; left >= 0; left--) {
      const r = await verify(phone, wrongCode(right));
      expect(r.statusCode).toBe(400);
      expect(json(r)).toEqual({ error: "code_wrong", attemptsLeft: left });
    }
    const r = await verify(phone, right);
    expect(r.statusCode).toBe(400);
    expect(json(r).error).toBe("code_expired");
    expect(await t.db.auditLog.count({ where: { action: "auth.otp_locked" } })).toBeGreaterThan(0);
  });

  it("محاولات متزامنة كثيرة ما تتجاوز حد المحاولات", async () => {
    const phone = randomPhone();
    await requestCode(phone);
    const right = t.sms.lastCode(phone);
    // ٢٠ تخمين غلط بنفس اللحظة: ما يتقبل منها أكثر من ٥، وبعدها الرمز الصحيح نفسه ما يمشي.
    await Promise.all(Array.from({ length: 20 }, () => verify(phone, wrongCode(right))));
    const row = await t.db.otpChallenge.findFirstOrThrow({ where: { phone }, orderBy: { createdAt: "desc" } });
    expect(row.attempts).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
    expect((await verify(phone, right)).statusCode).toBe(400);
  });

  it("رقم جديد ينشئ حساب «مصنع» بدون بيانات مصنع، والدخول ينكتب في السجل", async () => {
    const u = await login(t);
    const me = await t.app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${u.accessToken}` } });
    expect(json(me).user.role).toBe("factory");
    expect(json(me).factory).toBeNull();
    const logged = await t.db.auditLog.findFirst({ where: { action: "auth.login", actorUserId: u.userId } });
    expect(logged).not.toBeNull();
    // السجل ما فيه رقم الجوال.
    expect(JSON.stringify(logged?.metadata)).not.toContain(u.phone.slice(4));
  });

  it("الحساب الموقوف ما يقدر يدخل", async () => {
    const u = await login(t);
    await t.db.user.update({ where: { id: u.userId }, data: { status: "suspended" } });
    await requestCode(u.phone);
    const r = await verify(u.phone, t.sms.lastCode(u.phone));
    expect(r.statusCode).toBe(403);
    expect(json(r).error).toBe("account_suspended");
    const me = await t.app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${u.accessToken}` } });
    expect(me.statusCode).toBe(403);
  });
});
