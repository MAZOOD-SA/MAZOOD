// الإعدادات: الخادم يرفض يشتغل بإعدادات ناقصة أو خطرة.
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { ConsoleSmsSender } from "../src/sms/index.ts";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  SESSION_SECRET: "s".repeat(32),
  OTP_PEPPER: "p".repeat(32),
  CORS_ORIGINS: "http://localhost:8081, https://app.example.com",
  SMS_PROVIDER: "console",
};

describe("الإعدادات", () => {
  it("تقرأ الإعدادات الصحيحة", () => {
    const c = loadConfig(base);
    expect(c.CORS_ORIGINS).toEqual(["http://localhost:8081", "https://app.example.com"]);
    expect(c.PORT).toBe(3000);
    expect(c.TRUST_PROXY).toBe(false);
  });

  it("ترفض الإعدادات الناقصة، وتذكر كل الناقص مرة وحدة", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*SESSION_SECRET[\s\S]*OTP_PEPPER/);
  });

  it("ترفض المفاتيح القصيرة أو المتطابقة", () => {
    expect(() => loadConfig({ ...base, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ ...base, OTP_PEPPER: base.SESSION_SECRET })).toThrow(/OTP_PEPPER/);
  });

  it("ترفض SMS_PROVIDER=console في التشغيل الحقيقي", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/SMS_PROVIDER/);
  });

  it("مرسل الرسائل التجريبي يرفض يشتغل في production حتى لو انتجاوز فحص الإعدادات", () => {
    const log = { warn: () => {} };
    expect(() => new ConsoleSmsSender(log, "production")).toThrow();
    expect(() => new ConsoleSmsSender(log, "development")).not.toThrow();
  });
});
