// إعدادات المنصة: كل قيمة رقمية تتحكم في الطلبات والعروض. تنحفظ في جدول settings بقاعدة البيانات،
// فتتغيّر بدون مبرمج (بالأمر pnpm api:set-setting الحين، ومن لوحة الإدارة في المرحلة ٦).
// القيم هنا هي المقترحة في docs/plans/phase-4.md (القسم ٣)، ونرجع لها لو ما فيه قيمة محفوظة.
import { z } from "zod";
import { cancellationPolicySchema, DEFAULT_CANCELLATION_POLICY, upgradeCancellationPolicy } from "./cancellation.ts";
import { commitmentSettingsSchema, DEFAULT_COMMITMENT_SETTINGS } from "./commitment.ts";

const hours = (max: number) => z.number().int().min(1).max(max);

export const SETTINGS_SCHEMA = z
  .object({
    /** صلاحية العرض بالساعات (أقصى قيمة يقدر يختارها المزوّد، وهي الافتراضية). سؤال ٤-١. */
    offerValidityHours: hours(24 * 30),
    /** كم يوم يبقى الطلب مفتوح لو ما جاه عرض. سؤال ٤-٣. */
    requestOpenDays: z.number().int().min(1).max(60),
    /** أقصى عدد عروض على الطلب، وبعدها يختفي من الطلبات المتاحة. سؤال ٤-٣. */
    maxOffersPerRequest: z.number().int().min(1).max(50),
    /** بعد «تم التنفيذ» بكم ساعة يكتمل الطلب تلقائيًا لو المصنع ما أكّد ولا فتح بلاغ. سؤال ١٨. */
    autoConfirmHours: hours(24 * 14),
    /** تذكير المصنع بتأكيد الاستلام (ساعات بعد «تم التنفيذ»). */
    confirmReminderHours: z.array(hours(24 * 14)).max(5),
    /**
     * سياسة الإلغاء ورسومه (سؤال ١٥): الشرح كامل في cancellation.ts. قبل القبول دائمًا مجاني.
     * بعد البدء: «طلب إلغاء» يرد عليه المزوّد خلال responseHours، وإلا يتحوّل بلاغ.
     * الرسوم كلها صفر لين يقرر المالك. السياسة تنحفظ مع الطلب وقت القبول، فتغييرها ما يأثّر على طلب قديم.
     * (الشكل القديم { responseHours, feeHalalas } ينقرى ويترقّى تلقائيًا.)
     */
    cancellation: z.preprocess(upgradeCancellationPolicy, cancellationPolicySchema),
    /** الأحداث اللي توصل برسالة نصية (لها تكلفة). الباقي إشعار وتنبيه داخل التطبيق. سؤال ١٩. */
    smsEvents: z.array(z.enum(["first_offer", "offer_accepted", "cancellation_requested"])).max(3),
    /** رقم «التزم بـ X من Y طلب» في بطاقة العرض: تشغيل وإيقاف، والمدة بالأشهر، والحد الأدنى (القرار ٣٣). */
    commitment: commitmentSettingsSchema,
    /**
     * الفرد ما يرفع طلب إلا بعد ما تتأكد هويته (نفاذ، القرار ٤٢). مقفول الحين لأن ربط نفاذ يحتاج
     * سجل الشركة وموافقة «علم»، وقبله الفحص بصيغة الرقم بس. لما يجهز الربط: يتفعّل بأمر واحد.
     */
    individualRequiresVerifiedIdentity: z.boolean(),
  })
  .strict();

export type Settings = z.infer<typeof SETTINGS_SCHEMA>;
export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(SETTINGS_SCHEMA.shape) as SettingKey[];

export const SETTING_DEFAULTS: Settings = {
  offerValidityHours: 48,
  requestOpenDays: 7,
  maxOffersPerRequest: 10,
  autoConfirmHours: 72,
  confirmReminderHours: [24, 48],
  cancellation: DEFAULT_CANCELLATION_POLICY,
  smsEvents: ["first_offer", "offer_accepted", "cancellation_requested"],
  commitment: DEFAULT_COMMITMENT_SETTINGS,
  individualRequiresVerifiedIdentity: false,
};
