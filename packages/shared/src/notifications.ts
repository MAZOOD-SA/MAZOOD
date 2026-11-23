// التنبيهات (الخطوة ١٠ في docs/plans/phase-4.md، القسم ٧، ومعها أحداث السوق).
// مكان واحد: كل حدث، ولمين، وأي قناة، ونصّه بالعربي والإنجليزي. الخادم يكتب التنبيه ويرسله،
// والواجهة تعرضه من نفس النصوص. النصوص هنا جاهزة تنتقل لجدول message_templates في المرحلة ٦.
import { z } from "zod";

/**
 * push: إشعار جوال (مجاني). smsCandidate: يقدر يروح رسالة نصية لو الحدث في الإعداد smsEvents
 * (لها تكلفة، فالمقترح ثلاث أحداث بس). كل الأحداث تظهر داخل التطبيق.
 */
export const NOTIFICATION_EVENTS = {
  new_request: { push: true, sms: null },
  first_offer: { push: true, sms: "first_offer" },
  more_offers: { push: true, sms: null },
  approval_needed: { push: true, sms: null },
  offer_accepted: { push: true, sms: "offer_accepted" },
  offer_not_selected: { push: false, sms: null },
  job_started: { push: true, sms: null },
  job_delivered: { push: true, sms: null },
  confirm_reminder: { push: true, sms: null },
  cancellation_requested: { push: true, sms: "cancellation_requested" },
  order_cancelled: { push: true, sms: null },
  price_change_requested: { push: true, sms: null },
  provider_withdrew: { push: true, sms: null },
  dispute_opened: { push: true, sms: null },
  rate_provider: { push: false, sms: null },
  document_expiring: { push: true, sms: null },
  purchase_request: { push: true, sms: null },
  purchase_quoted: { push: true, sms: null },
  purchase_accepted: { push: true, sms: null },
  subscription_ending: { push: true, sms: null },
  new_message: { push: true, sms: null },
} as const satisfies Record<string, { push: boolean; sms: "first_offer" | "offer_accepted" | "cancellation_requested" | null }>;
export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;
export const NOTIFICATION_EVENT_IDS = Object.keys(NOTIFICATION_EVENTS) as NotificationEvent[];

/** وين يودّي التنبيه لما ينضغط. */
export type NotificationLink =
  | { screen: "request"; id: string }
  | { screen: "provider_request"; id: string }
  | { screen: "provider_job"; id: string }
  | { screen: "purchase"; id: string }
  | { screen: "seller_purchase"; id: string }
  | { screen: "store" }
  | { screen: "provider_account" };

/** النص بالعربي والإنجليزي. {n} و{title} تتعبّى من بيانات التنبيه. نبرة BRAND.md: مختصرة ومحددة. */
export const NOTIFICATION_TEXT: Record<NotificationEvent, { ar: string; en: string }> = {
  new_request: { ar: "طلب جديد في قسمك: {title}", en: "New request in your category: {title}" },
  first_offer: { ar: "وصلك أول عرض على طلب {title}", en: "First offer on your {title} request" },
  more_offers: { ar: "وصلتك عروض جديدة على طلب {title}", en: "New offers on your {title} request" },
  approval_needed: { ar: "عرض مرشّح ينتظر موافقتك على طلب {title}", en: "A nominated offer awaits your approval: {title}" },
  offer_accepted: { ar: "انقبل عرضك على طلب {title}. راسل العميل من صفحة الطلب وابدأ.", en: "Your offer on {title} was accepted. Message the customer from the job page and start." },
  offer_not_selected: { ar: "العميل اختار عرض ثاني على طلب {title}.", en: "The customer chose another offer on {title}." },
  job_started: { ar: "المزوّد بدأ تنفيذ طلب {title}", en: "The provider started your {title} request" },
  job_delivered: { ar: "المزوّد خلّص طلب {title}. أكّد الاستلام.", en: "The provider finished {title}. Confirm receipt." },
  confirm_reminder: { ar: "تذكير: أكّد استلام طلب {title}", en: "Reminder: confirm receipt of {title}" },
  cancellation_requested: { ar: "العميل يطلب إلغاء طلب {title}. رد عليه.", en: "The customer asks to cancel {title}. Please respond." },
  order_cancelled: { ar: "العميل ألغى طلب {title}", en: "The customer cancelled {title}" },
  price_change_requested: { ar: "المزوّد يطلب تعديل سعر طلب {title}", en: "The provider asks to change the price of {title}" },
  provider_withdrew: { ar: "المزوّد اعتذر عن طلب {title}. اختر عرض ثاني.", en: "The provider withdrew from {title}. Choose another offer." },
  dispute_opened: { ar: "انفتح بلاغ على طلب {title}. خدمة العملاء بتتواصل معك.", en: "A report was opened on {title}. Customer support will contact you." },
  rate_provider: { ar: "اكتمل طلب {title}. قيّم المزوّد.", en: "{title} is complete. Rate the provider." },
  document_expiring: { ar: "مستند {title} ينتهي خلال {n} يوم. ارفع النسخة الجديدة.", en: "Your {title} document expires in {n} days. Upload the new one." },
  purchase_request: { ar: "وصلك طلب شراء على {title}", en: "New purchase request for {title}" },
  purchase_quoted: { ar: "رد المصنع على طلبك: {title}", en: "The factory replied to your request: {title}" },
  purchase_accepted: { ar: "المشتري قبل ردك على {title}. تواصل معه.", en: "The buyer accepted your reply on {title}. Contact them." },
  subscription_ending: { ar: "اشتراكك في السوق ينتهي خلال {n} يوم. جدّده عشان ما تختفي منتجاتك.", en: "Your market subscription ends in {n} days. Renew it to keep your products live." },
  // بدون نص الرسالة نفسها: التنبيه يظهر على قفل الشاشة، والمحادثة خاصة.
  new_message: { ar: "رسالة جديدة في طلب {title}", en: "New message on {title}" },
};

/** نص التنبيه بالبيانات. */
export function notificationText(event: NotificationEvent, data: { title?: string; n?: number }, locale: "ar" | "en"): string {
  return NOTIFICATION_TEXT[event][locale].replace("{title}", data.title ?? "").replace("{n}", String(data.n ?? ""));
}

/** تفضيلات المستخدم: الرسائل النصية وإشعارات الجوال، وأحداث مكتومة. داخل التطبيق دائمًا يظهر. */
export const notificationPrefsBody = z
  .object({
    sms: z.boolean(),
    push: z.boolean(),
    muted: z.array(z.enum(NOTIFICATION_EVENT_IDS as [NotificationEvent, ...NotificationEvent[]])).max(NOTIFICATION_EVENT_IDS.length),
  })
  .strict();
export type NotificationPrefs = z.infer<typeof notificationPrefsBody>;

export const markReadBody = z.object({ ids: z.array(z.string().uuid()).max(200).optional() }).strict();

/** رمز إشعارات Expo للجهاز. */
export const pushTokenBody = z
  .object({ token: z.string().regex(/^ExponentPushToken\[[A-Za-z0-9_-]{10,100}\]$/, "token_invalid"), platform: z.enum(["ios", "android"]) })
  .strict();

/** الانتظار قبل إعادة المحاولة بعد فشل الإرسال (دقائق): ١ ثم ٥ ثم ٣٠ ثم ساعتين. بعدها «فشل» نهائيًا. */
export const NOTIFY_RETRY_MINUTES = [1, 5, 30, 120] as const;
