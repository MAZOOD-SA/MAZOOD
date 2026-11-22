// اختبارات الدخول: الرمز، وحدود المحاولات، والجلسات.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
beforeAll(async () => { ctx = await createTestCtx(); });
afterAll(async () => { await ctx.close(); });

const post = (url: string, payload: unknown, headers = {}) => ctx.app.inject({ method: "POST", url, payload: payload as object, headers });

describe("الدخول برقم الجوال", () => {
  it("يرفض رقم غير سعودي", async () => {
    const r = await post("/v1/auth/otp/request", { phone: "12345" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("validation");
  });

  it("يقبل صيغ مختلفة لنفس الرقم ويطبّعها", async () => {
    const r = await post("/v1/auth/otp/request", { phone: "٠٥٠٢٣٤٥٦٧٨" });
    expect(r.statusCode).toBe(202);
    expect(ctx.codes.has("+966502345678")).toBe(true);
  });

  it("ما يرجّع الرمز في رد الـ API", async () => {
    const r = await post("/v1/auth/otp/request", { phone: "0503333333" });
    const code = ctx.codes.get("+966503333333")!;
    expect(r.body).not.toContain(code);
  });

  it("ما يحفظ الرمز نصًا في قاعدة البيانات", async () => {
    await post("/v1/auth/otp/request", { phone: "0504444444" });
    const code = ctx.codes.get("+966504444444")!;
    const rows = await ctx.db.query<{ code_hash: string }>("SELECT code_hash FROM otp_codes WHERE phone='+966504444444'");
    expect(rows[0].code_hash).not.toContain(code);
    expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("رمز صحيح يعطي جلسة، ويُنشئ مصنع فاضي للمستخدم الجديد", async () => {
    const { token } = await ctx.signIn("0505555555");
    const me = await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.phone).toBe("+966505555555");
    expect(me.json().factory.profileComplete).toBe(false);
  });

  it("الرمز يُستخدم مرة وحدة", async () => {
    await post("/v1/auth/otp/request", { phone: "0506666666" });
    const code = ctx.codes.get("+966506666666")!;
    expect((await post("/v1/auth/otp/verify", { phone: "0506666666", code })).statusCode).toBe(200);
    expect((await post("/v1/auth/otp/verify", { phone: "0506666666", code })).statusCode).toBe(400);
  });

  it("رمز غلط يرجّع نفس الخطأ، وبعد ٥ محاولات غلط يبطل الرمز حتى لو الخامس صحيح", async () => {
    await post("/v1/auth/otp/request", { phone: "0507777777" });
    const good = ctx.codes.get("+966507777777")!;
    const bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await post("/v1/auth/otp/verify", { phone: "0507777777", code: bad });
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe("otp_invalid");
    }
    const r = await post("/v1/auth/otp/verify", { phone: "0507777777", code: good });
    expect(r.statusCode).toBe(400);
  });

  it("الرمز ينتهي بعد ٥ دقايق", async () => {
    await post("/v1/auth/otp/request", { phone: "0508888888" });
    const code = ctx.codes.get("+966508888888")!;
    ctx.clock.advance(5 * 60_000 + 1000);
    expect((await post("/v1/auth/otp/verify", { phone: "0508888888", code })).statusCode).toBe(400);
  });

  it("فاصل ٦٠ ثانية بين رمزين، وحد ٣ رموز كل ١٠ دقايق", async () => {
    const phone = "0509999999";
    expect((await post("/v1/auth/otp/request", { phone })).statusCode).toBe(202);
    const cool = await post("/v1/auth/otp/request", { phone });
    expect(cool.statusCode).toBe(429);
    expect(cool.json().error.code).toBe("otp_cooldown");
    ctx.clock.advance(61_000);
    expect((await post("/v1/auth/otp/request", { phone })).statusCode).toBe(202);
    ctx.clock.advance(61_000);
    expect((await post("/v1/auth/otp/request", { phone })).statusCode).toBe(202);
    ctx.clock.advance(61_000);
    const limited = await post("/v1/auth/otp/request", { phone });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("otp_rate_limited");
  });

  it("الرمز الجديد يبطّل القديم", async () => {
    const phone = "0501010101";
    await post("/v1/auth/otp/request", { phone });
    const first = ctx.codes.get("+966501010101")!;
    ctx.clock.advance(61_000);
    await post("/v1/auth/otp/request", { phone });
    const second = ctx.codes.get("+966501010101")!;
    if (first !== second) expect((await post("/v1/auth/otp/verify", { phone, code: first })).statusCode).toBe(400);
    expect((await post("/v1/auth/otp/verify", { phone, code: second })).statusCode).toBe(200);
  });

  it("حقول زيادة في الطلب تُرفض (strict)", async () => {
    const r = await post("/v1/auth/otp/request", { phone: "0502020202", role: "staff" });
    expect(r.statusCode).toBe(400);
  });
});

describe("الجلسات", () => {
  it("بدون توكن أو بتوكن غلط: 401", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth("x".repeat(40)) })).statusCode).toBe(401);
  });

  it("التوكن ما ينحفظ نصًا في قاعدة البيانات", async () => {
    const { token } = await ctx.signIn("0503030303");
    const rows = await ctx.db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
  });

  it("تسجيل الخروج يلغي الجلسة", async () => {
    const { token } = await ctx.signIn("0504040404");
    expect((await ctx.app.inject({ method: "POST", url: "/v1/auth/logout", headers: auth(token) })).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(token) })).statusCode).toBe(401);
  });

  it("الجلسة تنتهي بعد ٣٠ يوم", async () => {
    const { token } = await ctx.signIn("0505050505");
    ctx.clock.advance(31 * 24 * 3600_000);
    expect((await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(token) })).statusCode).toBe(401);
  });

  it("الحساب الموقوف ما يدخل ولا تشتغل جلسته", async () => {
    const { token, userId } = await ctx.signIn("0506060606");
    await ctx.db.query("UPDATE users SET status='suspended' WHERE id=$1", [userId]);
    expect((await ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(token) })).statusCode).toBe(401);
    ctx.clock.advance(61_000);
    await post("/v1/auth/otp/request", { phone: "0506060606" });
    const code = ctx.codes.get("+966506060606")!;
    expect((await post("/v1/auth/otp/verify", { phone: "0506060606", code })).statusCode).toBe(400);
  });
});

describe("سجل الإجراءات", () => {
  it("يسجّل الدخول، ويمنع التعديل والحذف على مستوى قاعدة البيانات", async () => {
    await ctx.signIn("0507070707");
    const rows = await ctx.db.query<{ action: string }>("SELECT action FROM audit_log WHERE action='auth.login'");
    expect(rows.length).toBeGreaterThan(0);
    await expect(ctx.db.query("UPDATE audit_log SET action='x'")).rejects.toThrow(/append-only/);
    await expect(ctx.db.query("DELETE FROM audit_log")).rejects.toThrow(/append-only/);
    await expect(ctx.db.exec("TRUNCATE audit_log")).rejects.toThrow(/append-only/);
  });
});

describe("حد الطلبات لكل IP", () => {
  it("بعد ٢٠ طلب رمز خلال ١٠ دقايق من نفس الـ IP يرجع 429 حتى لو الأرقام مختلفة", async () => {
    const strict = await createTestCtx({ strictRateLimits: true });
    try {
      let last = 0;
      for (let i = 0; i < 21; i++) {
        const r = await strict.app.inject({
          method: "POST",
          url: "/v1/auth/otp/request",
          payload: { phone: `05${String(10000000 + i)}` },
        });
        last = r.statusCode;
      }
      expect(last).toBe(429);
    } finally {
      await strict.close();
    }
  });
});
