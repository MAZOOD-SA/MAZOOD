// قواعد التحقق من المدخلات (Zod). الخادم يطبّقها على كل طلب، والواجهة تستخدم نفسها لرسائل فورية.
// ما نثق بأي مدخل جاي من الواجهة: كل شي يمر من هنا قبل ما يلمس قاعدة البيانات.
import { z } from "zod";
import { CATEGORY_IDS, isValidCategoryType } from "./categories.ts";
import { normalizeSaudiMobile } from "./phone.ts";

export const phoneSchema = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    const n = normalizeSaudiMobile(v);
    if (!n) ctx.addIssue({ code: "custom", message: "phone_invalid" });
    return n ?? z.NEVER;
  });

export const otpCodeSchema = z.string().regex(/^\d{6}$/, "code_invalid");

export const requestOtpBody = z.object({ phone: phoneSchema }).strict();
export const verifyOtpBody = z.object({ phone: phoneSchema, code: otpCodeSchema }).strict();

/** نص حر: نشيل الأحرف التحكمية (ما عدا السطر الجديد) ونقص المسافات. */
const freeText = (min: number, max: number) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min, "too_short").max(max, "too_long"));

export const whenSchema = z.enum(["today", "tomorrow", "this_week"]);
export type When = z.infer<typeof whenSchema>;

export const createRequestBody = z
  .object({
    category: z.enum(CATEGORY_IDS as [string, ...string[]]),
    typeId: z.string().min(1).max(40),
    details: freeText(10, 2000),
    location: freeText(2, 200),
    when: whenSchema,
  })
  .strict()
  .refine((v) => isValidCategoryType(v.category, v.typeId), { path: ["typeId"], message: "type_not_in_category" });
export type CreateRequestBody = z.infer<typeof createRequestBody>;

/** السجل التجاري السعودي: ١٠ أرقام. الرقم الضريبي: ١٥ رقم ويبدأ وينتهي بـ ٣. */
const digits = (n: number, msg: string) => z.string().regex(new RegExp(`^\\d{${n}}$`), msg);

export const factoryProfileBody = z
  .object({
    name: freeText(2, 120),
    city: freeText(2, 80),
    commercialRegister: digits(10, "cr_invalid"),
    vatNumber: z.string().regex(/^3\d{13}3$/, "vat_invalid"),
  })
  .strict();
export type FactoryProfileBody = z.infer<typeof factoryProfileBody>;

export const uuidSchema = z.string().uuid();
