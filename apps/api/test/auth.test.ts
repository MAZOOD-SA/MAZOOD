// اختبارات الدخول برمز التحقق، والجلسات، وتحديد المحاولات.
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { hashSessionToken } from "../src/security";
import { makeTestApp, randomIp, randomPhone } from "./helpers";

const t = await makeTestApp();

describe("الدخول برمز التحقق", () => {
  it("أول دخول ينشئ حساب مصنع وجلسة، و/me يرجع الحساب", async () => {
    const s = await t.signIn();
    expect(s.me.role).toBe("factory");
    expect(s.me.factory).toBeNull();
    const me = await t.call("GET", "/me", { token: s.token });
    expect(me.status).toBe(200);
    expect(me.body.phone).toBe(s.phone);
  });

  it("نفس الرقم بصيغ مختلفة = نفس الحساب", async () => {
    const phone = randomPhone();
    const a = await t.signIn(phone);
    t.clock.advance(61_000);
    const b = await t.signIn(phone);
    expect(b.me.id).toBe(a.me.id);
  });

  it("رمز غلط يرجع code_wrong، وبعد ٥ محاولات الرمز ينتهي حتى لو صح", async () => {
    const phone = randomPhone();
    await t.call("POST", "/auth/otp/request", { body: { phone } });
    const right = t.sms.lastCodeFor(`+966${phone.slice(1)}`)!;
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      expect((await t.call("POST", "/auth/otp/verify", { body: { phone, code: wrong } })).body.error).toBe("code_wrong");
    }
    expect((await t.call("POST", "/auth/otp/verify", { body: { phone, code: wrong } })).body.error).toBe("code_expired");
    const r = await t.call("POST", "/auth/otp/verify", { body: { phone, code: right } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("code_expired");
  });

  it("الرمز ينتهي بعد ٥ دقايق", async () => {
    const phone = randomPhone();
    await t.call("POST", "/auth/otp/request", { body: { phone } });
    t.clock.advance(5 * 60_000 + 1);
    const r = await t.call("POST", "/auth/otp/verify", { body: { phone, code: t.sms.lastCodeFor(`+966${phone.slice(1)}`) } });
    expect(r.body.error).toBe("code_expired");
  });

  it("الرمز ينفع مرة وحدة بس", async () => {
    const phone = randomPhone();
    await t.call("POST", "/auth/otp/request", { body: { phone } });
    const code = t.sms.lastCodeFor(`+966${phone.slice(1)}`);
    expect((await t.call("POST", "/auth/otp/verify", { body: { phone, code } })).status).toBe(200);
    expect((await t.call("POST", "/auth/otp/verify", { body: { phone, code } })).body.error).toBe("code_expired");
  });

  it("رمز جديد يبطّل القديم", async () => {
    const phone = randomPhone();
    const e164 = `+966${phone.slice(1)}`;
    await t.call("POST", "/auth/otp/request", { body: { phone } });
    const old = t.sms.lastCodeFor(e164)!;
    t.clock.advance(61_000);
    await t.call("POST", "/auth/otp/request", { body: { phone } });
    const fresh = t.sms.lastCodeFor(e164)!;
    if (old !== fresh) expect((await t.call("POST", "/auth/otp/verify", { body: { phone, code: old } })).status).toBe(400);
    expect((await t.call("POST", "/auth/otp/verify", { body: { phone, code: fresh } })).status).toBe(200);
  });

  it("رقم غير سعودي أو رمز بشكل غلط يرجع ٤٠٠ مع اسم الحقل", async () => {
    const a = await t.call("POST", "/auth/otp/request", { body: { phone: "+971501234567" } });
    expect(a.status).toBe(400);
    expect(a.body).toMatchObject({ error: "phone_invalid", field: "phone" });
    const b = await t.call("POST", "/auth/otp/verify", { body: { phone: "0551234567", code: "12ab" } });
    expect(b.body).toMatchObject({ error: "code_invalid", field: "code" });
  });

  it("الرمز ما يرجع في الرد إلا إذا الإعداد مفعّل", async () => {
    const r = await t.call("POST", "/auth/otp/request", { body: { phone: randomPhone() } });
    expect(r.body.devCode).toBeUndefined();
    const t2 = await makeTestApp({ OTP_EXPOSE_IN_RESPONSE: "true" });
    const r2 = await t2.call("POST", "/auth/otp/request", { body: { phone: randomPhone() } });
    expect(r2.body.devCode).toMatch(/^\d{6}$/);
  });
});

describe("تحديد المحاولات", () => {
  it("رمز جديد لنفس الجوال: مرة كل ٦٠ ثانية", async () => {
    const phone = randomPhone();
    expect((await t.call("POST", "/auth/otp/request", { body: { phone } })).status).toBe(200);
    const r = await t.call("POST", "/auth/otp/request", { body: { phone } });
    expect(r.status).toBe(429);
    expect(r.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.headers["retry-after"]).toBeDefined();
    t.clock.advance(61_000);
    expect((await t.call("POST", "/auth/otp/request", { body: { phone } })).status).toBe(200);
  });

  it("٥ رموز بالساعة بالكثير لنفس الجوال، حتى من عناوين مختلفة", async () => {
    const phone = randomPhone();
    for (let i = 0; i < 5; i++) {
      expect((await t.call("POST", "/auth/otp/request", { body: { phone }, ip: randomIp() })).status).toBe(200);
      t.clock.advance(61_000);
    }
    expect((await t.call("POST", "/auth/otp/request", { body: { phone }, ip: randomIp() })).status).toBe(429);
  });

  it("٢٠ رمز بالساعة بالكثير من نفس العنوان، حتى لأرقام مختلفة", async () => {
    // نسجّل ٢٠ رمز سابق من نفس العنوان مباشرة في قاعدة البيانات
    // (لو أرسلناها من الخادم، حد الدقيقة العام يوقفها قبل ما نوصل للعشرين).
    const ip = randomIp();
    await t.db.otpChallenge.createMany({
      data: Array.from({ length: 20 }, () => ({
        phone: `+9665${randomPhone().slice(2)}`,
        codeHash: "0".repeat(64),
        expiresAt: t.clock.now(),
        createdAt: new Date(t.clock.now().getTime() - 10 * 60_000),
        ip,
      })),
    });
    const r = await t.call("POST", "/auth/otp/request", { body: { phone: randomPhone() }, ip });
    expect(r.status).toBe(429);
    expect((await t.call("POST", "/auth/otp/request", { body: { phone: randomPhone() }, ip: randomIp() })).status).toBe(200);
  });
});

describe("الجلسات", () => {
  it("بدون رمز جلسة أو برمز غلط: ٤٠١", async () => {
    expect((await t.call("GET", "/me")).status).toBe(401);
    expect((await t.call("GET", "/me", { token: "x".repeat(43) })).status).toBe(401);
    expect((await t.call("GET", "/me", { token: "not a token!" })).status).toBe(401);
  });

  it("تسجيل الخروج يلغي الجلسة", async () => {
    const s = await t.signIn();
    expect((await t.call("POST", "/auth/logout", { token: s.token })).status).toBe(200);
    expect((await t.call("GET", "/me", { token: s.token })).status).toBe(401);
  });

  it("الجلسة تنتهي بعد ٣٠ يوم بدون استخدام", async () => {
    const s = await t.signIn();
    await t.db.session.updateMany({ where: { tokenHash: hashSessionToken(s.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await t.call("GET", "/me", { token: s.token })).status).toBe(401);
  });

  it("الحساب الموقوف ما يقدر يستخدم جلسته ولا يدخل من جديد", async () => {
    const s = await t.signIn();
    await t.db.user.update({ where: { id: s.me.id }, data: { status: "suspended" } });
    expect((await t.call("GET", "/me", { token: s.token })).status).toBe(401);
    t.clock.advance(61_000);
    const phone = `0${s.phone.slice(4)}`;
    const ip = randomIp();
    expect((await t.call("POST", "/auth/otp/request", { body: { phone }, ip })).status).toBe(200);
    const r = await t.call("POST", "/auth/otp/verify", { body: { phone, code: t.sms.lastCodeFor(s.phone) }, ip });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("account_suspended");
  });
});

describe("حماية البيانات المحفوظة", () => {
  it("رمز التحقق ورمز الجلسة ما ينحفظون كما هم", async () => {
    const s = await t.signIn();
    const challenge = await t.db.otpChallenge.findFirst({ where: { phone: s.phone } });
    const code = t.sms.lastCodeFor(s.phone)!;
    expect(challenge!.codeHash).not.toContain(code);
    expect(challenge!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    const sessions = await t.db.session.findMany({ where: { userId: s.me.id } });
    expect(sessions.every((x) => x.tokenHash !== s.token)).toBe(true);
  });

  it("سجل الإجراءات ما ينعدّل ولا ينحذف", async () => {
    const s = await t.signIn();
    const row = await t.db.auditLog.findFirst({ where: { actorUserId: s.me.id } });
    expect(row?.action).toBe("auth.signed_up");
    await expect(t.db.auditLog.update({ where: { id: row!.id }, data: { action: "x" } })).rejects.toThrow();
    await expect(t.db.auditLog.delete({ where: { id: row!.id } })).rejects.toThrow();
  });

  it("الخادم يرفض يشتغل في الإنتاج بإعدادات التجربة", () => {
    const base = { APP_ENV: "production", DATABASE_URL: "postgres://x", OTP_SECRET: "x".repeat(32) };
    expect(() => loadConfig(base)).toThrow(/SMS_PROVIDER/);
    expect(() => loadConfig({ ...base, DEMO_MODE: "true" })).toThrow();
    expect(() => loadConfig({ ...base, APP_ENV: "staging", OTP_SECRET: "short" })).toThrow(/OTP_SECRET/);
  });

  it("ردود الخادم ما تنحفظ في ذاكرة المتصفح، وفيها رؤوس الأمان", async () => {
    const r = await t.call("GET", "/health");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("الصلاحيات في /me وأدوار الإدارة", () => {
  it("المصنع ياخذ صلاحيات المصنع بس", async () => {
    const s = await t.signIn();
    expect(s.me.staffRoles).toEqual([]);
    expect(s.me.permissions.sort()).toEqual(["factory.profile.edit", "request.create", "request.manage_own", "request.view_own"]);
  });

  it("الموظف ياخذ صلاحيات دوره، وما يقدر يتصرف كمصنع", async () => {
    const { grantStaffRole } = await import("../src/staff");
    const phone = randomPhone();
    await grantStaffRole(t.db, phone, "verification");
    const ip = randomIp();
    await t.call("POST", "/auth/otp/request", { body: { phone }, ip });
    const v = await t.call("POST", "/auth/otp/verify", { body: { phone, code: t.sms.lastCodeFor(`+966${phone.slice(1)}`) }, ip });
    expect(v.body.me.role).toBe("staff");
    expect(v.body.me.staffRoles).toEqual(["verification"]);
    expect(v.body.me.permissions).toContain("providers.verify");
    expect(v.body.me.permissions).not.toContain("invoices.view");
    expect((await t.call("POST", "/requests", { token: v.body.token, body: { category: "materials" } })).status).toBe(403);
  });

  it("رقم مسجّل كمصنع ما يتحوّل لموظف", async () => {
    const { grantStaffRole } = await import("../src/staff");
    const s = await t.signIn();
    await expect(grantStaffRole(t.db, `0${s.phone.slice(4)}`, "owner")).rejects.toThrow(/مسجّل كمصنع/);
  });
});
