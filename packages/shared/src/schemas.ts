// قواعد التحقق من المدخلات (Zod). الخادم يرفض أي مدخل ما يطابقها،
// والتطبيق يستخدم نفسها عشان يعطي المستخدم رسالة واضحة قبل الإرسال.
// رسائل الخطأ هنا رموز (مثل "phone_invalid")، والتطبيق يترجمها للعربي والإنجليزي.
import { z } from "zod";
import { CATEGORY_IDS, typeName } from "./categories";
import { normalizeSaudiMobile, toLatinDigits } from "./phone";
import { WHEN_OPTIONS } from "./requests";

/** نص عادي: نشيل المسافات الزايدة ونمنع رموز التحكم (اللي ممكن تُستخدم للتلاعب بالعرض). */
const cleanText = (min: number, max: number, code: string) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min, code).max(max, code));

export const phoneSchema = z
  .string()
  .max(20, "phone_invalid")
  .transform((v, ctx) => {
    const n = normalizeSaudiMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "phone_invalid" });
      return z.NEVER;
    }
    return n;
  });

export const otpRequestSchema = z.object({ phone: phoneSchema });

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .max(10, "code_invalid")
    .transform((c) => toLatinDigits(c).trim())
    .pipe(z.string().regex(/^\d{6}$/, "code_invalid")),
});

/**
 * بيانات المصنع. الاسم والموقع إلزامية عشان يرفع أول طلب بسرعة.
 * السجل التجاري والرقم الضريبي اختيارية الحين، وتصير إلزامية قبل الفاتورة (المرحلة ٥).
 */
export const factoryProfileSchema = z.object({
  name: cleanText(2, 120, "name_invalid"),
  location: cleanText(2, 200, "location_invalid"),
  commercialRegister: z
    .string()
    .transform((s) => toLatinDigits(s).replace(/\s/g, ""))
    .pipe(z.string().regex(/^(\d{10})?$/, "cr_invalid"))
    .optional(),
  // الرقم الضريبي السعودي ١٥ رقم، يبدأ بـ 3 وينتهي بـ 3.
  vatNumber: z
    .string()
    .transform((s) => toLatinDigits(s).replace(/\s/g, ""))
    .pipe(z.string().regex(/^(3\d{13}3)?$/, "vat_invalid"))
    .optional(),
});

export const createRequestSchema = z
  .object({
    category: z.enum(CATEGORY_IDS, "category_required"),
    typeId: z.string().max(40, "type_invalid"),
    details: cleanText(10, 1000, "details_invalid"),
    location: cleanText(2, 200, "location_invalid"),
    when: z.enum(WHEN_OPTIONS, "when_invalid"),
  })
  .refine((v) => typeName(v.category, v.typeId) !== null, { message: "type_invalid", path: ["typeId"] });

export const localeSchema = z.object({ locale: z.enum(["ar", "en"]) });

export type OtpRequestInput = z.input<typeof otpRequestSchema>;
export type OtpVerifyInput = z.input<typeof otpVerifySchema>;
export type FactoryProfileInput = z.input<typeof factoryProfileSchema>;
export type CreateRequestInput = z.input<typeof createRequestSchema>;
/** المدخل بعد التحقق والتنظيف. */
export type CreateRequestData = z.output<typeof createRequestSchema>;
