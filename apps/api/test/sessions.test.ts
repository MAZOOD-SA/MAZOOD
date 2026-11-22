// اختبارات جلسة الموقع (ملف تعريف محمي)، والحماية من الطلبات المزوّرة، و«أجهزتي».
import { describe, expect, it } from "vitest";
import { makeTestApp, randomIp, randomPhone, validRequest } from "./helpers";

const t = await makeTestApp();

/** دخول من الموقع: يرجع ملف التعريف كما يرسله المتصفح. */
async function webSignIn() {
  const phone = randomPhone();
  const ip = randomIp();
  await t.call("POST", "/auth/otp/request", { body: { phone }, ip });
  const res = await t.call("POST", "/auth/otp/verify", {
    body: { phone, code: t.sms.lastCodeFor(`+966${phone.slice(1)}`), deviceName: "Chrome على Windows" },
    ip,
    headers: { "x-client": "web" },
  });
  const setCookie = String(res.headers["set-cookie"] ?? "");
  const cookie = setCookie.split(";")[0];
  return { res, setCookie, cookie, ip };
}

describe("جلسة الموقع في ملف تعريف محمي", () => {
  it("الدخول من الموقع ما يرجع رمز الجلسة في الرد، ويحطه في ملف تعريف HttpOnly", async () => {
    const { res, setCookie } = await webSignIn();
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(setCookie).toMatch(/^mz_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\/api/);
  });

  it("ملف التعريف يكفي للقراءة", async () => {
    const { cookie } = await webSignIn();
    const me = await t.call("GET", "/me", { headers: { cookie } });
    expect(me.status).toBe(200);
  });

  it("طلب يغيّر شي بملف التعريف بدون رأس الحماية ينرفض (حماية CSRF)", async () => {
    const { cookie } = await webSignIn();
    const bad = await t.call("PUT", "/factory", { headers: { cookie }, body: { name: "مصنع", location: "سدير" } });
    expect(bad.status).toBe(403);
    expect(bad.body.error).toBe("csrf");
    const ok = await t.call("PUT", "/factory", { headers: { cookie, "x-requested-with": "mazood" }, body: { name: "مصنع", location: "سدير" } });
    expect(ok.status).toBe(200);
    const r = await t.call("POST", "/requests", { headers: { cookie, "x-requested-with": "mazood" }, body: validRequest });
    expect(r.status).toBe(201);
  });

  it("تطبيق الجوال (Bearer) ما يحتاج رأس الحماية، لأن المتصفح ما يرسل الرمز تلقائيًا", async () => {
    const a = await t.factoryUser();
    expect((await t.call("POST", "/requests", { token: a.token, body: validRequest })).status).toBe(201);
  });

  it("الخروج يلغي الجلسة ويمسح ملف التعريف", async () => {
    const { cookie } = await webSignIn();
    const out = await t.call("POST", "/auth/logout", { headers: { cookie, "x-requested-with": "mazood" } });
    expect(out.status).toBe(200);
    expect(String(out.headers["set-cookie"])).toMatch(/mz_session=;/);
    expect((await t.call("GET", "/me", { headers: { cookie } })).status).toBe(401);
  });

  it("ملف تعريف بشكل غلط ينتجاهل", async () => {
    expect((await t.call("GET", "/me", { headers: { cookie: "mz_session=not valid!" } })).status).toBe(401);
  });
});

describe("أجهزتي", () => {
  async function twoDevices() {
    const phone = randomPhone();
    const e164 = `+966${phone.slice(1)}`;
    const login = async (deviceName: string) => {
      t.clock.advance(61_000);
      const ip = randomIp();
      await t.call("POST", "/auth/otp/request", { body: { phone }, ip });
      return (await t.call("POST", "/auth/otp/verify", { body: { phone, code: t.sms.lastCodeFor(e164), deviceName }, ip })).body.token as string;
    };
    return { phoneA: await login("iPhone"), phoneB: await login("Android") };
  }

  it("يعرض أجهزة المستخدم، ويحدد الجهاز الحالي", async () => {
    const { phoneA } = await twoDevices();
    const list = await t.call("GET", "/sessions", { token: phoneA });
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.body.map((s: { deviceName: string }) => s.deviceName).sort()).toEqual(["Android", "iPhone"]);
  });

  it("يطلّع جهاز محدد", async () => {
    const { phoneA, phoneB } = await twoDevices();
    const list = await t.call("GET", "/sessions", { token: phoneA });
    const other = list.body.find((s: { current: boolean }) => !s.current);
    expect((await t.call("POST", `/sessions/${other.id}/revoke`, { token: phoneA })).status).toBe(200);
    expect((await t.call("GET", "/me", { token: phoneB })).status).toBe(401);
    expect((await t.call("GET", "/me", { token: phoneA })).status).toBe(200);
  });

  it("«خروج من الأجهزة الأخرى» يطلّع الكل إلا الجهاز الحالي", async () => {
    const { phoneA, phoneB } = await twoDevices();
    const r = await t.call("POST", "/sessions/revoke-others", { token: phoneB });
    expect(r.body.revoked).toBe(1);
    expect((await t.call("GET", "/me", { token: phoneA })).status).toBe(401);
    expect((await t.call("GET", "/me", { token: phoneB })).status).toBe(200);
  });

  it("ما يقدر يطلّع جهاز مستخدم ثاني", async () => {
    const a = await twoDevices();
    const b = await twoDevices();
    const bSessions = await t.call("GET", "/sessions", { token: b.phoneA });
    const r = await t.call("POST", `/sessions/${bSessions.body[0].id}/revoke`, { token: a.phoneA });
    expect(r.status).toBe(404);
    expect((await t.call("GET", "/me", { token: b.phoneA })).status).toBe(200);
  });
});
