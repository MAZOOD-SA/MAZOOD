// إعدادات المنصة: كل قيمة رقمية تتحكم في الطلبات والعروض. تنحفظ في جدول settings بقاعدة البيانات،
// فتتغيّر بدون مبرمج (بالأمر pnpm api:set-setting الحين، ومن لوحة الإدارة في المرحلة ٦).
// القيم هنا هي المقترحة في docs/plans/phase-4.md (القسم ٣)، ونرجع لها لو ما فيه قيمة محفوظة.
import { z } from "zod";

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
     * سياسة الإلغاء (سؤال ١٥). قبل ما يبدأ المزوّد: إلغاء مجاني مباشر.
     * بعد البدء: «طلب إلغاء» يرد عليه المزوّد خلال responseHours، وإلا يتحوّل بلاغ.
     * feeHalalas: رسوم الإلغاء بالهللة (صفر الحين، تنحسب فعليًا في المرحلة ٥).
     * السياسة تنحفظ مع الطلب وقت القبول، فتغييرها ما يأثّر على طلب قديم.
     */
    cancellation: z.object({ responseHours: hours(24 * 7), feeHalalas: z.number().int().min(0) }).strict(),
    /** الأحداث اللي توصل برسالة نصية (لها تكلفة). الباقي إشعار وتنبيه داخل التطبيق. سؤال ١٩. */
    smsEvents: z.array(z.enum(["first_offer", "offer_accepted", "cancellation_requested"])).max(3),
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
  cancellation: { responseHours: 24, feeHalalas: 0 },
  smsEvents: ["first_offer", "offer_accepted", "cancellation_requested"],
};
