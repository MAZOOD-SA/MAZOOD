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
  DATA_ENCRYPTION_KEY: z.string().optional(),
  STORAGE_DIR: z.string().optional(),
  /** إشعارات الجوال عن طريق Expo (القرار ٤٩). مقفولة لين ينفتح حساب Expo وFirebase باسم الشركة. */
  PUSH_PROVIDER: z.enum(["expo", "none"]).default("none"),
  /** اختياري: رمز وصول Expo لو فعّلنا «Enhanced Security for Push» في حساب Expo. سرّي. */
  EXPO_ACCESS_TOKEN: z.string().optional(),
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
  dataEncryptionKey: string;
  /** مجلد التخزين الخاص للمستندات. فاضي في التطوير = في الذاكرة (ينمسح مع كل تشغيل). */
  storageDir?: string;
  pushProvider: "expo" | "none";
  expoAccessToken?: string;
};

const DEV_SECRET = "dev-only-secret-do-not-use-in-production-0000";
const DEV_DATA_KEY = "dev-only-data-key-do-not-use-in-production-000";

export function loadConfig(env: Record<string, string | undefined>): Config {
  const e = schema.parse(env);
  const prod = e.NODE_ENV === "production";
  const problems: string[] = [];

  if (prod && !e.DATABASE_URL) problems.push("DATABASE_URL مطلوب في الإنتاج");
  if (prod && (!e.AUTH_SECRET || e.AUTH_SECRET.length < 32)) problems.push("AUTH_SECRET مطلوب في الإنتاج (٣٢ حرف أو أكثر)");
  if (prod && e.SMS_PROVIDER === "console") problems.push("SMS_PROVIDER=console ممنوع في الإنتاج: الرمز كان راح يطلع في السجلات");
  if (prod && !e.CORS_ORIGINS) problems.push("CORS_ORIGINS مطلوب في الإنتاج");
  if (prod && (!e.DATA_ENCRYPTION_KEY || e.DATA_ENCRYPTION_KEY.length < 32)) problems.push("DATA_ENCRYPTION_KEY مطلوب في الإنتاج (٣٢ حرف أو أكثر)");
  if (prod && e.DATA_ENCRYPTION_KEY && e.DATA_ENCRYPTION_KEY === e.AUTH_SECRET) problems.push("DATA_ENCRYPTION_KEY لازم يختلف عن AUTH_SECRET");
  if (prod && !e.STORAGE_DIR) problems.push("STORAGE_DIR مطلوب في الإنتاج (مكان حفظ المستندات)");
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
    dataEncryptionKey: e.DATA_ENCRYPTION_KEY ?? DEV_DATA_KEY,
    storageDir: e.STORAGE_DIR,
    pushProvider: e.PUSH_PROVIDER,
    expoAccessToken: e.EXPO_ACCESS_TOKEN,
  };
}
