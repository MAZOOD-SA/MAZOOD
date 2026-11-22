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
  signIn(phone: string, as?: "factory" | "provider"): Promise<{ token: string; userId: string }>;
  /** يضيف موظف مباشرة في القاعدة ويدخّله. */
  staff(phone: string, role: string): Promise<{ token: string; userId: string }>;
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

  async function signIn(phone: string, as?: "factory" | "provider") {
    const r1 = await app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
    if (r1.statusCode !== 202) throw new Error(`otp request failed: ${r1.body}`);
    const normalized = normalizeSaudiMobile(phone)!;
    const r2 = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { phone, code: codes.get(normalized)!, ...(as ? { as } : {}) },
    });
    if (r2.statusCode !== 200) throw new Error(`verify failed: ${r2.body}`);
    const body = r2.json();
    return { token: body.token as string, userId: body.user.id as string };
  }

  async function staff(phone: string, role: string) {
    const n = normalizeSaudiMobile(phone)!;
    const [u] = await db.query<{ id: string }>("INSERT INTO users (phone, role, display_name) VALUES ($1,'staff','موظف تجريبي') RETURNING id", [n]);
    await db.query("INSERT INTO staff (user_id, role) VALUES ($1,$2)", [u.id, role]);
    return signIn(phone);
  }

  return { app, db, clock, codes, signIn, staff, close: async () => { await app.close(); await db.close(); } };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export const validRequest = {
  category: "transport",
  typeId: "flatbed",
  details: "نقل ماكينة من المصنع إلى الرياض",
  area: "المرحلة الثانية",
  location: "مدينة سدير الصناعية، المرحلة الثانية، مصنع ١٤",
  when: "tomorrow",
} as const;

/** يبني طلب multipart (حقول + ملف) لـ app.inject. */
export function multipart(fields: Record<string, string>, file?: { bytes: Buffer; name?: string; type?: string }) {
  const boundary = "----mazoodtest" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name ?? "doc.pdf"}"\r\nContent-Type: ${file.type ?? "application/pdf"}\r\n\r\n`,
      ),
      file.bytes,
      Buffer.from("\r\n"),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

export const PDF = Buffer.from("%PDF-1.4\n% مستند تجريبي\n%%EOF");
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** بيانات مزوّد تجريبية (أرقام بشكل صحيح فقط، مو لشخص حقيقي). */
export const providerProfile = {
  tradeName: "مؤسسة النقل التجريبية",
  ownerName: "صاحب حساب تجريبي",
  idType: "national_id",
  idNumber: "1000000001",
  commercialRegister: "1010000001",
  categories: ["cleaning"],
};
