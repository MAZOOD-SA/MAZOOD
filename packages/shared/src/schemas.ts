// قواعد التحقق من المدخلات (Zod). الخادم يطبّقها على كل طلب، والواجهة تستخدم نفسها لرسائل فورية.
// ما نثق بأي مدخل جاي من الواجهة: كل شي يمر من هنا قبل ما يلمس قاعدة البيانات.
import { z } from "zod";
import { CATEGORY_IDS, CITY_ID_PATTERN, isValidCategoryType } from "./categories.ts";
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
/**
 * as: نوع الحساب لو الرقم جديد (مصنع أو مزوّد). الحسابات الموجودة يبقى نوعها كما هو.
 * channel: "web" للموقع: الجلسة تنحط في كوكي محمي (HttpOnly) وما يرجع الرمز في الرد.
 * بدونه (التطبيق): الرمز يرجع في الرد وينحفظ في خزنة الجوال المشفّرة.
 */
export const verifyOtpBody = z
  .object({
    phone: phoneSchema,
    code: otpCodeSchema,
    as: z.enum(["factory", "provider"]).optional(),
    channel: z.enum(["web", "app"]).optional(),
  })
  .strict();

/** نص حر: نشيل الأحرف التحكمية (ما عدا السطر الجديد) ونقص المسافات. */
const freeText = (min: number, max: number) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min, "too_short").max(max, "too_long"));

export const whenSchema = z.enum(["today", "tomorrow", "this_week"]);
export type When = z.infer<typeof whenSchema>;

export const cityIdSchema = z.string().regex(CITY_ID_PATTERN, "city_invalid");

/**
 * area: المنطقة (مثل «المرحلة الثانية»): تظهر للمزوّد قبل القبول عشان يسعّر.
 * location: الموقع بالضبط: ما يظهر للمزوّد إلا بعد ما يُقبل عرضه.
 * cityId: اختياري. بدونه = مدينة المصنع.
 */
export const createRequestBody = z
  .object({
    category: z.enum(CATEGORY_IDS as [string, ...string[]]),
    typeId: z.string().min(1).max(40),
    details: freeText(10, 2000),
    area: freeText(2, 120),
    location: freeText(2, 200),
    when: whenSchema,
    cityId: cityIdSchema.optional(),
  })
  .strict()
  .refine((v) => isValidCategoryType(v.category, v.typeId), { path: ["typeId"], message: "type_not_in_category" });
export type CreateRequestBody = z.infer<typeof createRequestBody>;

/** إعادة نشر الطلب المنتهي (بدون عروض خلال المدة): يقدر يعدّل التفاصيل والمنطقة والموقع والموعد وهو يعيد النشر. */
export const republishBody = z
  .object({
    details: freeText(10, 2000).optional(),
    area: freeText(2, 120).optional(),
    location: freeText(2, 200).optional(),
    when: whenSchema.optional(),
  })
  .strict();

/** السجل التجاري السعودي: ١٠ أرقام. الرقم الضريبي: ١٥ رقم ويبدأ وينتهي بـ ٣. */
const digits = (n: number, msg: string) => z.string().regex(new RegExp(`^\\d{${n}}$`), msg);

/** cityId اختياري: لو فيه مدينة وحدة فعّالة بس، تنحط تلقائيًا (والواجهة ما تبيّن الخانة). */
export const factoryProfileBody = z
  .object({
    name: freeText(2, 120),
    cityId: cityIdSchema.optional(),
    commercialRegister: digits(10, "cr_invalid"),
    vatNumber: z.string().regex(/^3\d{13}3$/, "vat_invalid"),
  })
  .strict();
export type FactoryProfileBody = z.infer<typeof factoryProfileBody>;

export const uuidSchema = z.string().uuid();

/** أدوار موظفين المصنع (سؤال ١٦): المدير يقبل مباشرة ويدير الموظفين، والموظف يرفع الطلبات ويرشّح عرض. */
export const FACTORY_ROLES = ["manager", "member"] as const;
export type FactoryRole = (typeof FACTORY_ROLES)[number];
export const addFactoryMemberBody = z.object({ phone: phoneSchema, role: z.enum(FACTORY_ROLES) }).strict();

/** طلب حذف الحساب: السبب اختياري. */
export const accountDeletionBody = z
  .object({ reason: z.string().trim().max(500).optional() })
  .strict();
