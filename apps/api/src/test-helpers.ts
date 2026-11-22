// أدوات للاختبارات: تطبيق كامل على PostgreSQL داخل العملية (PGlite) وساعة نتحكم فيها.
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createPgliteDb, type Db } from "./db.ts";
import { migrate } from "./migrate.ts";
import { normalizeSaudiMobile } from "@mazood/shared";
import type { SmsSender } from "./sms.ts";

export type TestCtx = {
  app: FastifyInstance;
  db: Db;
  clock: { now: Date; advance(ms: number): void };
  /** آخر رمز «أُرسل» لكل رقم. */
  codes: Map<string, string>;
  signIn(phone: string): Promise<{ token: string; userId: string }>;
  close(): Promise<void>;
};

export async function createTestCtx(opts: { strictRateLimits?: boolean } = {}): Promise<TestCtx> {
  const db = await createPgliteDb();
  await migrate(db);
  const clock = {
    now: new Date("2026-11-22T10:00:00Z"),
    advance(ms: number) {
      this.now = new Date(this.now.getTime() + ms);
    },
  };
  const codes = new Map<string, string>();
  const sms: SmsSender = {
    async send(phone, text) {
      codes.set(phone, /(\d{6})/.exec(text)![1]);
    },
  };
  const config = loadConfig({ NODE_ENV: "test" });
  const app = await buildApp({ db, sms, config, now: () => clock.now, strictRateLimits: opts.strictRateLimits });

  async function signIn(phone: string) {
    const r1 = await app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
    if (r1.statusCode !== 202) throw new Error(`otp request failed: ${r1.body}`);
    const normalized = normalizeSaudiMobile(phone)!;
    const r2 = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { phone, code: codes.get(normalized)! },
    });
    if (r2.statusCode !== 200) throw new Error(`verify failed: ${r2.body}`);
    const body = r2.json();
    return { token: body.token as string, userId: body.user.id as string };
  }

  return { app, db, clock, codes, signIn, close: async () => { await app.close(); await db.close(); } };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export const validRequest = {
  category: "transport",
  typeId: "flatbed",
  details: "نقل ماكينة من المصنع إلى الرياض",
  location: "مدينة سدير الصناعية",
  when: "tomorrow",
} as const;
