import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

describe("إعدادات الإنتاج", () => {
  const good = { NODE_ENV: "production", DATABASE_URL: "postgres://x", AUTH_SECRET: "a".repeat(40), CORS_ORIGINS: "https://example.sa", SMS_PROVIDER: "none" };
  it("تقبل إعداد كامل", () => expect(loadConfig(good).env).toBe("production"));
  it("ترفض رسائل الطرفية في الإنتاج", () => expect(() => loadConfig({ ...good, SMS_PROVIDER: "console" })).toThrow(/SMS_PROVIDER/));
  it("ترفض سر قصير أو ناقص", () => {
    expect(() => loadConfig({ ...good, AUTH_SECRET: "short" })).toThrow();
    expect(() => loadConfig({ ...good, AUTH_SECRET: undefined })).toThrow();
  });
  it("ترفض بدون قاعدة بيانات", () => expect(() => loadConfig({ ...good, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/));
  it("التطوير يشتغل بدون إعدادات", () => expect(loadConfig({}).smsProvider).toBe("console"));
});
