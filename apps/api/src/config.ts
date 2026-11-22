// كل الإعدادات من متغيرات البيئة. القيم السرية ما تنكتب في الكود أبدًا (شوف .env.example).
// في الإنتاج: الخادم يرفض يشتغل إذا نقص شي مهم، بدل ما يشتغل بإعداد ضعيف.
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  CORS_ORIGINS: z.string().default(""),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  SMS_PROVIDER: z.enum(["console", "none"]).default("console"),
});

export type Config = {
  env: "development" | "test" | "production";
  port: number;
  host: string;
  databaseUrl?: string;
  pgliteDir?: string;
  authSecret: string;
  corsOrigins: string[];
  trustProxy: boolean;
  smsProvider: "console" | "none";
};

const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0000";

export function loadConfig(env: Record<string, string | undefined>): Config {
  const e = schema.parse(env);
  const prod = e.NODE_ENV === "production";
  const problems: string[] = [];

  if (prod && !e.DATABASE_URL) problems.push("DATABASE_URL مطلوب في الإنتاج");
  if (prod && (!e.AUTH_SECRET || e.AUTH_SECRET.length < 32)) problems.push("AUTH_SECRET مطلوب في الإنتاج (٣٢ حرف أو أكثر)");
  if (prod && e.SMS_PROVIDER === "console") problems.push("SMS_PROVIDER=console ممنوع في الإنتاج: الرمز كان راح يطلع في السجلات");
  if (prod && !e.CORS_ORIGINS) problems.push("CORS_ORIGINS مطلوب في الإنتاج");
  if (e.AUTH_SECRET && e.AUTH_SECRET.length < 32) problems.push("AUTH_SECRET أقصر من ٣٢ حرف");
  if (problems.length) throw new Error(`إعدادات غير صالحة:\n- ${problems.join("\n- ")}`);

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    pgliteDir: e.PGLITE_DIR,
    authSecret: e.AUTH_SECRET ?? DEV_SECRET,
    corsOrigins: e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    trustProxy: e.TRUST_PROXY === "true",
    smsProvider: e.SMS_PROVIDER,
  };
}
