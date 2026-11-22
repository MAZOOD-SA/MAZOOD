// أدوات مشتركة للاختبارات: خادم بنسخة اختبار، وساعة نتحكم فيها، ورسائل محفوظة في الذاكرة.
import { randomInt } from "node:crypto";
import type { SessionResponse } from "@mazood/shared";
import { afterAll } from "vitest";
import { API_PREFIX, buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { AppContext, Clock, Scheduler } from "../src/context";
import { createDb, type Db } from "../src/db";
import { ensureDemoProviders } from "../src/demo";
import type { SmsSender } from "../src/sms";
import { TEST_DATABASE_URL } from "./global-setup";

export class TestClock implements Clock {
  t = new Date("2026-11-21T09:00:00Z").getTime();
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t += ms;
  }
}

/** جدولة يدوية: المهام ما تشتغل إلا لما نقول runAll(). */
export class ManualScheduler implements Scheduler {
  tasks: (() => Promise<void>)[] = [];
  after(_ms: number, task: () => Promise<void>) {
    this.tasks.push(task);
  }
  async runAll() {
    const t = this.tasks;
    this.tasks = [];
    for (const task of t) await task();
  }
}

export class MemorySms implements SmsSender {
  sent: { phone: string; code: string }[] = [];
  async sendOtp(phone: string, code: string) {
    this.sent.push({ phone, code });
  }
  lastCodeFor(phone: string) {
    return [...this.sent].reverse().find((s) => s.phone === phone)?.code;
  }
}

let sharedDb: Db | null = null;
function db(): Db {
  sharedDb ??= createDb(TEST_DATABASE_URL);
  return sharedDb;
}
afterAll(async () => {
  await sharedDb?.$disconnect();
  sharedDb = null;
});

export async function makeTestApp(env: Record<string, string> = {}) {
  const clock = new TestClock();
  const scheduler = new ManualScheduler();
  const sms = new MemorySms();
  const config = loadConfig({
    APP_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    OTP_SECRET: "test-secret-0123456789abcdefghijklmnop",
    DEMO_MODE: "true",
    ...env,
  });
  const ctx: AppContext = { config, db: db(), clock, scheduler, sms };
  if (config.DEMO_MODE) await ensureDemoProviders(ctx);
  const app = await buildApp(ctx);
  afterAll(() => app.close());

  // كل اختبار من عنوان IP مختلف، عشان حدود المحاولات لكل IP ما تتداخل بين الاختبارات.
  const ip = randomIp();
  type Opts = { token?: string; body?: unknown; ip?: string };
  const call = async (method: "GET" | "POST" | "PUT" | "PATCH", path: string, o: Opts = {}) => {
    const res = await app.inject({
      method,
      url: `${API_PREFIX}${path}`,
      remoteAddress: o.ip ?? ip,
      headers: o.token ? { authorization: `Bearer ${o.token}` } : {},
      ...(o.body !== undefined ? { payload: o.body as object } : {}),
    });
    return { status: res.statusCode, body: res.body ? res.json() : null, headers: res.headers };
  };

  async function signIn(phone = randomPhone()): Promise<SessionResponse & { phone: string }> {
    // كل دخول من عنوان مختلف، عشان حد المحاولات لكل عنوان ما يوقف الاختبارات نفسها.
    const ip = randomIp();
    const r = await call("POST", "/auth/otp/request", { body: { phone }, ip });
    if (r.status !== 200) throw new Error(`otp request ${r.status} ${JSON.stringify(r.body)}`);
    const e164 = `+966${phone.slice(1)}`;
    const v = await call("POST", "/auth/otp/verify", { body: { phone, code: sms.lastCodeFor(e164) }, ip });
    if (v.status !== 200) throw new Error(`otp verify ${v.status} ${JSON.stringify(v.body)}`);
    return { ...v.body, phone: e164 };
  }

  /** مستخدم مصنع داخل وكمّل بيانات مصنعه. */
  async function factoryUser(name = "مصنع اختبار") {
    const s = await signIn();
    const r = await call("PUT", "/factory", { token: s.token, body: { name, location: "سدير" } });
    if (r.status !== 200) throw new Error(`factory ${r.status}`);
    return { token: s.token, userId: s.me.id, factoryId: r.body.factory.id as string, phone: s.phone };
  }

  return { app, ctx, db: ctx.db, clock, scheduler, sms, call, signIn, factoryUser, ip };
}

/** جوال سعودي عشوائي بصيغة 05XXXXXXXX. */
export function randomPhone(): string {
  return `05${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

export function randomIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

export const validRequest = {
  category: "transport",
  typeId: "flatbed",
  details: "نقل ٦ قوالب حديد للميناء",
  location: "مدينة سدير الصناعية",
  when: "tomorrow",
};
