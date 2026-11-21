// إعدادات الخادم. كلها تُقرأ من متغيرات البيئة (أسماؤها وشرحها في .env.example)،
// وتُفحص عند التشغيل: إذا ناقص شي أو قيمته غلط، الخادم يوقف برسالة واضحة بدل ما يشتغل غلط.
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

export const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    /** يوقّع مفاتيح الدخول القصيرة. ٣٢ حرف عشوائي على الأقل. */
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET لازم يكون ٣٢ حرف على الأقل"),
    /** يدخل في بصمة رموز التحقق وعناوين IP. ٣٢ حرف عشوائي على الأقل. */
    OTP_PEPPER: z.string().min(32, "OTP_PEPPER لازم يكون ٣٢ حرف على الأقل"),

    /** المواقع المسموح لها تتصل بالخادم من المتصفح، مفصولة بفاصلة. */
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(z.url()).min(1)),

    /** مزوّد الرسائل النصية. «console» يكتب الرمز في سجل الخادم، للتطوير بس. */
    SMS_PROVIDER: z.enum(["console"]),

    /** فعّله إذا الخادم ورا موزّع أحمال أو بروكسي، عشان نعرف عنوان IP الحقيقي للمستخدم. */
    TRUST_PROXY: bool,
  })
  .superRefine((c, ctx) => {
    if (c.SESSION_SECRET === c.OTP_PEPPER) {
      ctx.addIssue({ code: "custom", path: ["OTP_PEPPER"], message: "لازم يختلف عن SESSION_SECRET" });
    }
    if (c.NODE_ENV === "production" && c.SMS_PROVIDER === "console") {
      ctx.addIssue({
        code: "custom",
        path: ["SMS_PROVIDER"],
        message: "«console» ممنوع في التشغيل الحقيقي (production). اختر مزوّد رسائل حقيقي",
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

/** يقرأ الإعدادات ويفحصها. يرمي خطأ فيه كل المشاكل مرة وحدة. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "?"}: ${i.message}`);
    throw new Error(`إعدادات الخادم ناقصة أو غلط (الأسماء والشرح في .env.example بجذر المستودع):\n${lines.join("\n")}`);
  }
  return parsed.data;
}
