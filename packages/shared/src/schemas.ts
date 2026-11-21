// مخططات التحقق من المدخلات. الخادم يفحص فيها كل طلب قبل ما يحفظ أي شي،
// والتطبيق يستخدم نفسها عشان يعطي المستخدم رسالة قبل ما يرسل.
import { z } from "zod";
import { CATEGORY_IDS, isValidType } from "./categories";
import { normalizeSaudiMobile, toLatinDigits } from "./phone";

/** رقم الجوال: يُطبَّع لـ +9665XXXXXXXX، وأي رقم ثاني مرفوض. */
export const mobileSchema = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    const n = normalizeSaudiMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "phone_invalid" });
      return z.NEVER;
    }
    return n;
  });

/** نص يكتبه المستخدم: نشيل المسافات الزايدة، ونمنع رموز التحكم المخفية. */
const userText = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min).max(max));

export const OTP_LENGTH = 6;

export const otpRequestSchema = z.object({ phone: mobileSchema }).strict();
export type OtpRequestInput = z.input<typeof otpRequestSchema>;

/**
 * client: «web» يعني مفتاح التجديد يُحفظ في كوكي محمي ما يقدر يقرأه JavaScript.
 * «native» يعني يرجع في الرد، والتطبيق يحفظه في الخزنة الآمنة للجوال.
 */
export const clientKindSchema = z.enum(["web", "native"]);
export type ClientKind = z.infer<typeof clientKindSchema>;

export const otpVerifySchema = z
  .object({
    phone: mobileSchema,
    code: z
      .string()
      .transform((v) => toLatinDigits(v).replace(/\s/g, ""))
      .pipe(z.string().regex(/^\d{6}$/, "code_format")),
    client: clientKindSchema,
  })
  .strict();
export type OtpVerifyInput = z.input<typeof otpVerifySchema>;

export const refreshSchema = z
  .object({
    client: clientKindSchema,
    // للجوال بس. في المتصفح المفتاح يجي من الكوكي.
    refreshToken: z.string().min(20).max(200).optional(),
  })
  .strict();

/** السجل التجاري: ١٠ أرقام. */
export const commercialRegisterSchema = z
  .string()
  .transform((v) => toLatinDigits(v).replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{10}$/, "cr_format"));

/** الرقم الضريبي: ١٥ رقم، يبدأ بـ 3 وينتهي بـ 3 (حسب صيغة هيئة الزكاة والضريبة والجمارك). */
export const vatNumberSchema = z
  .string()
  .transform((v) => toLatinDigits(v).replace(/\s/g, ""))
  .pipe(z.string().regex(/^3\d{13}3$/, "vat_format"));

/** خانة اختيارية: النص الفاضي يعني «ما عبّاها». */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional().nullable());

export const factoryProfileSchema = z
  .object({
    name: userText(2, 120),
    city: userText(2, 60),
    contactName: userText(2, 80),
    // اختياريين لين يتقرر هل المصنع يحتاج توثيق (سؤال 9 في PLAN.md).
    commercialRegister: optional(commercialRegisterSchema),
    vatNumber: optional(vatNumberSchema),
  })
  .strict();
export type FactoryProfileInput = z.input<typeof factoryProfileSchema>;

export const WHEN_VALUES = ["today", "tomorrow", "this_week"] as const;
export type When = (typeof WHEN_VALUES)[number];

export const REQUEST_STATUSES = ["awaiting_offers", "in_progress", "completed", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const newRequestSchema = z
  .object({
    category: z.enum(CATEGORY_IDS),
    typeId: z.string().max(40),
    details: userText(10, 1000),
    location: userText(2, 200),
    when: z.enum(WHEN_VALUES),
  })
  .strict()
  .refine((v) => isValidType(v.category, v.typeId), { path: ["typeId"], message: "type_invalid" });
export type NewRequestInput = z.input<typeof newRequestSchema>;

export const listRequestsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.uuid() }).strict();

// ── أشكال الردود (للتطبيق) ──

export type UserRole = "factory" | "provider";

export type FactoryDto = {
  id: string;
  name: string;
  city: string;
  contactName: string;
  commercialRegister: string | null;
  vatNumber: string | null;
};

export type MeDto = {
  user: { id: string; phone: string; role: UserRole; locale: "ar" | "en" };
  /** null يعني المصنع ما كمّل بياناته للحين. */
  factory: FactoryDto | null;
};

export type RequestDto = {
  id: string;
  category: (typeof CATEGORY_IDS)[number];
  typeId: string;
  details: string;
  location: string;
  when: When;
  status: RequestStatus;
  createdAt: string;
  cancelledAt: string | null;
};

export type RequestListDto = { items: RequestDto[]; nextCursor: string | null };

export type SessionDto = {
  accessToken: string;
  /** بالثواني */
  accessTokenExpiresIn: number;
  /** للجوال بس. في المتصفح يكون في كوكي محمي. */
  refreshToken?: string;
  me: MeDto;
};
