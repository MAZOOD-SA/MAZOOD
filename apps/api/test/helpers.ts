// أدوات مشتركة للاختبارات: خادم كامل على قاعدة الاختبار، ومرسل رسائل يحفظ الرموز بدل ما يرسلها.
import { randomInt } from "node:crypto";
import type { LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createDb, type Db } from "../src/db.ts";
import type { SmsSender } from "../src/sms/index.ts";
import { DEFAULT_TEST_DATABASE_URL } from "./global-setup.ts";

/** يحفظ آخر رسالة لكل رقم، عشان الاختبار ياخذ الرمز منها. */
export class CapturingSms implements SmsSender {
  readonly sent: { to: string; text: string }[] = [];
  fail = false;
  async send(to: string, text: string) {
    if (this.fail) throw new Error("فشل وهمي");
    this.sent.push({ to, text });
  }
  lastCode(to: string): string {
    const m = [...this.sent].reverse().find((s) => s.to === to)?.text.match(/\d{6}/);
    if (!m) throw new Error(`ما وصل رمز للرقم ${to}`);
    return m[0];
  }
}

export const testConfig = () =>
  loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
    SESSION_SECRET: "test-session-secret-0123456789abcdef-0123",
    OTP_PEPPER: "test-otp-pepper-0123456789abcdef-012345678",
    CORS_ORIGINS: "http://localhost:8081",
    SMS_PROVIDER: "console",
  });

export async function setupApp() {
  const config = testConfig();
  const db: Db = createDb(config.DATABASE_URL);
  const sms = new CapturingSms();
  const app = await buildApp({ config, db, sms });
  return { app, db, sms, config, close: async () => (await app.close(), await db.$disconnect()) };
}

export type TestApp = Awaited<ReturnType<typeof setupApp>>;

/** رقم جوال عشوائي، عشان كل اختبار يبدأ نظيف وما تتداخل حدود المحاولات. */
export const randomPhone = () => `+9665${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
/** عنوان IP عشوائي لنفس السبب (حد الطلبات لكل IP). */
export const randomIp = () => `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;

export const json = <T = any>(r: LightMyRequestResponse): T => r.json() as T;

/** يسجّل دخول برقم (جديد أو موجود) ويرجع مفتاح الدخول ومفتاح التجديد. */
export async function login(t: TestApp, phone = randomPhone(), ip = randomIp()) {
  const req = await t.app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone }, remoteAddress: ip });
  if (req.statusCode !== 200) throw new Error(`طلب الرمز فشل: ${req.body}`);
  const res = await t.app.inject({
    method: "POST",
    url: "/auth/otp/verify",
    payload: { phone, code: t.sms.lastCode(phone), client: "native" },
    remoteAddress: ip,
  });
  if (res.statusCode !== 200) throw new Error(`التحقق فشل: ${res.body}`);
  const body = json(res);
  return { phone, ip, accessToken: body.accessToken as string, refreshToken: body.refreshToken as string, userId: body.me.user.id as string };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** مصنع جاهز: مسجّل دخول وكمّل بياناته. */
export async function factoryUser(t: TestApp, name = "مصنع الاختبار") {
  const u = await login(t);
  const r = await t.app.inject({
    method: "PUT",
    url: "/factory",
    headers: bearer(u.accessToken),
    payload: { name, city: "سدير", contactName: "مسؤول الاختبار" },
  });
  if (r.statusCode !== 200) throw new Error(`إكمال المصنع فشل: ${r.body}`);
  return { ...u, factoryId: json(r).id as string };
}

export const sampleRequest = {
  category: "transport",
  typeId: "flatbed",
  details: "سطحة ٢٠ طن لنقل قوالب للدمام",
  location: "مدينة سدير الصناعية",
  when: "tomorrow",
};
