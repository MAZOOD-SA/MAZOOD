// إعدادات الخادم. كلها تُقرأ من متغيرات البيئة (أسماؤها وشرحها في .env.example)،
// ولا شي منها مكتوب في الكود. الخادم يرفض يشتغل لو فيه إعداد ناقص أو خطير.
import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  /** development: جهاز المبرمج. test: الاختبارات. staging: العنوان التجريبي. production: المنصة الحقيقية. */
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL مطلوب"),
  /** مفتاح سري لبصمة رموز التحقق. ٣٢ حرف على الأقل، ويختلف لكل بيئة. */
  OTP_SECRET: z.string().min(32, "OTP_SECRET لازم يكون ٣٢ حرف على الأقل"),
  /** console: الرمز يطلع في سجل الخادم (للتطوير والتجربة فقط). */
  SMS_PROVIDER: z.enum(["console"]).default("console"),
  /** يرجّع رمز التحقق في رد الخادم، عشان نجرّب بدون مزوّد رسائل. ممنوع في الإنتاج. */
  OTP_EXPOSE_IN_RESPONSE: bool.default(false),
  /** مزوّدين وعروض وهمية للتجربة. ممنوع في الإنتاج. */
  DEMO_MODE: bool.default(false),
  /** المواقع المسموح لها تكلّم الخادم من المتصفح، مفصولة بفواصل. فاضي = نفس العنوان بس. */
  CORS_ORIGINS: z.string().default(""),
  /** true إذا الخادم ورا موازن أحمال (عند أغلب الاستضافات)، عشان نعرف عنوان IP الحقيقي. */
  TRUST_PROXY: bool.default(false),
  /** مجلد نسخة الموقع المبنية (apps/app/dist). إذا موجود، الخادم يقدّم الموقع من نفس العنوان. */
  WEB_DIST_DIR: z.string().optional(),
});

export type Config = z.infer<typeof schema> & { isProduction: boolean };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`إعدادات الخادم ناقصة أو غلط:\n${lines.join("\n")}`);
  }
  const c = parsed.data;
  const isProduction = c.APP_ENV === "production";

  // حماية: إعدادات التجربة ما تشتغل أبدًا على المنصة الحقيقية.
  if (isProduction) {
    const problems: string[] = [];
    if (c.SMS_PROVIDER === "console") problems.push("SMS_PROVIDER=console (لازم مزوّد رسائل حقيقي)");
    if (c.OTP_EXPOSE_IN_RESPONSE) problems.push("OTP_EXPOSE_IN_RESPONSE=true");
    if (c.DEMO_MODE) problems.push("DEMO_MODE=true");
    if (problems.length) throw new Error(`إعدادات تجربة ممنوعة في الإنتاج:\n- ${problems.join("\n- ")}`);
  }
  return { ...c, isProduction };
}
