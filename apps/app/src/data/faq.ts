// أسئلة صفحة «مساعدة» لكل نوع مستخدم، منقولة من الردود المعتمدة في docs/admin/faq.md (بنفس النص).
// لو تعدّل رد هناك، عدّله هنا كمان. تنتقل للوحة الإدارة في المرحلة ٦ (تعديل المحتوى بدون مبرمج).
import type { Localized } from "@/i18n/I18nProvider";

export type FaqItem = { q: Localized; a: Localized };
export type FaqRole = "factory" | "provider";

export const FAQ: Record<FaqRole, FaqItem[]> = {
  factory: [
    {
      q: { ar: "كيف أتأكد إن المزوّد موثوق؟", en: "How do I know a provider is trustworthy?" },
      a: {
        ar: "المزوّد الموثّق تطلع جنب اسمه شارة «موثّق» الخضراء. هذا يعني إننا راجعنا هويته وسجله التجاري ومستندات قسمه، وإنها سارية.",
        en: "A verified provider has the green “Verified” badge next to their name. It means we checked their ID, commercial registration, and category documents, and that they are valid.",
      },
    },
    {
      q: { ar: "ليش ما أشوف رقم جوال المزوّد؟", en: "Why can’t I see the provider’s phone number?" },
      a: {
        ar: "بعد القبول تتراسلون من المحادثة في صفحة الطلب. كذا كل اتفاق مكتوب، ولو صار خلاف نقدر نرجع له ونحمي حقك.",
        en: "After you accept, you message each other in the chat on the request page. That way every agreement is in writing, and if there is a dispute we can refer to it and protect your rights.",
      },
    },
    {
      q: { ar: "مين يقدر يقرا المحادثة؟", en: "Who can read the chat?" },
      a: {
        ar: "أنت والطرف الثاني بس. المحادثة محفوظة مشفّرة، وخدمة العملاء ما تفتحها إلا لو انفتح بلاغ على الطلب، وكل فتح يتسجّل.",
        en: "Only you and the other party. The chat is stored encrypted. Customer service only opens it if a dispute is raised on the request, and every access is logged.",
      },
    },
    {
      q: { ar: "أقدر أعدّل رسالة أو أحذفها؟", en: "Can I edit or delete a message?" },
      a: {
        ar: "لا. الرسائل تنحفظ مثل ما انكتبت، عشان تكون مرجع للطرفين.",
        en: "No. Messages are kept exactly as written, so both sides have a reliable record.",
      },
    },
    {
      q: { ar: "ليش ما أقدر أكتب بعد ما اكتمل الطلب؟", en: "Why can’t I write after the request is completed?" },
      a: {
        ar: "المحادثة تنقفل للكتابة مع اكتمال الطلب أو إلغائه، وتقدر تقراها في أي وقت. لو عندك مشكلة في طلب مكتمل، تواصل مع خدمة العملاء.",
        en: "The chat closes for writing when the request is completed or cancelled, and you can still read it any time. If you have a problem with a completed request, contact customer service.",
      },
    },
  ],
  provider: [
    {
      q: { ar: "كم ياخذ التوثيق؟", en: "How long does verification take?" },
      a: {
        ar: "نراجع الطلبات بالترتيب، وغالبًا خلال يوم عمل. يوصلك القرار في حسابك على المنصة.",
        en: "We review applications in order, usually within one business day. You’ll see the decision in your account on the platform.",
      },
    },
    {
      q: { ar: "وش المستندات المطلوبة؟", en: "Which documents are required?" },
      a: {
        ar: "الهوية الوطنية أو الإقامة، والسجل التجاري. وحسب أقسامك: النقل يحتاج استمارة المركبة ورخصة نشاط النقل، والأمن يحتاج ترخيص الحراسات، والتخليص الجمركي يحتاج رخصة مخلّص. تطلع لك القائمة في حسابك بعد ما تختار أقسامك.",
        en: "Your national ID or Iqama, and your commercial registration. Depending on your categories: transport needs the vehicle registration and a transport license, security needs a security services license, and customs clearance needs a customs broker license. The list appears in your account after you choose your categories.",
      },
    },
    {
      q: { ar: "انرفض مستندي، وش أسوي؟", en: "My document was rejected. What should I do?" },
      a: {
        ar: "افتح حسابك، وشوف سبب الرفض تحت المستند، واضغط «ارفع نسخة جديدة».",
        en: "Open your account, read the reason under the document, and tap “Upload a new copy”.",
      },
    },
    {
      q: { ar: "ليش اختفت شارة «موثّق»؟", en: "Why did my “Verified” badge disappear?" },
      a: {
        ar: "غالبًا انتهى أحد مستنداتك. افتح حسابك، واضغط «جدّد المستند» عند المستند المنتهي، وترجع الشارة بعد قبوله.",
        en: "Most likely one of your documents expired. Open your account, tap “Renew document” next to the expired one, and the badge comes back once it is approved.",
      },
    },
    {
      q: { ar: "أبي أغيّر الأقسام أو الاسم التجاري بعد التوثيق.", en: "I want to change my categories or trade name after verification." },
      a: {
        ar: "(حاليًا) تواصل معنا وحنا نرتّب لك. تعديلها بنفسك يجي في تحديث قادم.",
        en: "(For now) contact us and we’ll arrange it for you. Editing them yourself is coming in a future update.",
      },
    },
    {
      q: { ar: "مين يشوف رقم هويتي؟", en: "Who can see my ID number?" },
      a: {
        ar: "رقمك محفوظ مشفّر، ويطّلع عليه فريق التوثيق بس، وكل اطلاع مسجّل.",
        en: "Your number is stored encrypted. Only the verification team can view it, and every view is logged.",
      },
    },
  ],
};

/** أسئلة المساعدة حسب نوع الحساب. الموظف يشوف القائمتين عشان يرد على الكل. */
export function faqFor(role: FaqRole | "staff"): FaqItem[] {
  return role === "staff" ? [...FAQ.factory, ...FAQ.provider] : FAQ[role];
}
