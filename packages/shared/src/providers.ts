// المزوّدين ومستنداتهم: أنواع المستندات، والمطلوب لكل قسم، وقائمة التحقق لكل مستند.
// ⚠️ قائمة المستندات لكل قسم «مقترحة» وتنتظر اعتماد المالك (سؤال ٨ في PLAN.md).
// تعديلها هنا يغيّرها في الخادم والواجهة معًا.
import { z } from "zod";
import { CATEGORY_IDS, type CategoryId } from "./categories.ts";

export const DOC_TYPES = [
  "id_document", // الهوية الوطنية أو الإقامة
  "cr_certificate", // السجل التجاري
  "vehicle_registration", // استمارة المركبة
  "transport_license", // رخصة نشاط النقل
  "security_license", // ترخيص الحراسات الأمنية
  "customs_broker_license", // رخصة مخلّص جمركي
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** مستندات يطلبها كل مزوّد، مهما كانت أقسامه. */
const BASE_DOCS: DocType[] = ["id_document", "cr_certificate"];

/** مستندات إضافية حسب القسم (مقترح). */
const CATEGORY_DOCS: Partial<Record<CategoryId, DocType[]>> = {
  transport: ["vehicle_registration", "transport_license"],
  security: ["security_license"],
  customs: ["customs_broker_license"],
};

export function requiredDocsFor(categories: readonly string[]): DocType[] {
  const set = new Set<DocType>(BASE_DOCS);
  for (const c of categories) for (const d of CATEGORY_DOCS[c as CategoryId] ?? []) set.add(d);
  return DOC_TYPES.filter((d) => set.has(d));
}

/**
 * قائمة التحقق لكل مستند: موظف التوثيق لازم يأشّر على كل بند قبل ما يقبل المستند.
 * الخادم يرفض القبول إذا نقص بند.
 */
export const DOC_CHECKLISTS: Record<DocType, { id: string; ar: string; en: string }[]> = {
  id_document: [
    { id: "legible", ar: "الصورة واضحة وكل البيانات مقروءة", en: "Image is clear and readable" },
    { id: "name_match", ar: "الاسم يطابق اسم صاحب الحساب", en: "Name matches the account holder" },
    { id: "number_match", ar: "رقم الهوية أو الإقامة يطابق المسجّل", en: "ID number matches the one entered" },
    { id: "valid", ar: "سارية، وتاريخ الانتهاء يطابق المدخل", en: "Valid, and expiry matches the one entered" },
  ],
  cr_certificate: [
    { id: "legible", ar: "المستند واضح ومقروء", en: "Document is clear and readable" },
    { id: "number_match", ar: "رقم السجل يطابق المسجّل", en: "CR number matches the one entered" },
    { id: "name_match", ar: "الاسم التجاري يطابق المسجّل", en: "Trade name matches" },
    { id: "activity_match", ar: "النشاط يناسب الأقسام المختارة", en: "Activity fits the selected categories" },
    { id: "valid", ar: "ساري، وتاريخ الانتهاء يطابق المدخل", en: "Valid, and expiry matches the one entered" },
  ],
  vehicle_registration: [
    { id: "legible", ar: "المستند واضح ومقروء", en: "Document is clear and readable" },
    { id: "owner_match", ar: "المالك أو المستخدم الفعلي هو المزوّد أو منشأته", en: "Owner or user is the provider or their company" },
    { id: "valid", ar: "سارية، وتاريخ الانتهاء يطابق المدخل", en: "Valid, and expiry matches the one entered" },
  ],
  transport_license: [
    { id: "legible", ar: "المستند واضح ومقروء", en: "Document is clear and readable" },
    { id: "name_match", ar: "صادر باسم المنشأة نفسها", en: "Issued to the same company" },
    { id: "valid", ar: "ساري، وتاريخ الانتهاء يطابق المدخل", en: "Valid, and expiry matches the one entered" },
  ],
  security_license: [
    { id: "legible", ar: "المستند واضح ومقروء", en: "Document is clear and readable" },
    { id: "name_match", ar: "صادر باسم المنشأة نفسها", en: "Issued to the same company" },
    { id: "valid", ar: "ساري، وتاريخ الانتهاء يطابق المدخل", en: "Valid, and expiry matches the one entered" },
  ],
  customs_broker_license: [
    { id: "legible", ar: "المستند واضح ومقروء", en: "Document is clear and readable" },
    { id: "name_match", ar: "صادر باسم المزوّد أو منشأته", en: "Issued to the provider or their company" },
    { id: "valid", ar: "سارية، وتاريخ الانتهاء يطابق المدخل", en: "Valid, and expiry matches the one entered" },
  ],
};

/** كم يوم قبل الانتهاء نبدأ ننبّه (متطلب في CLAUDE.md). */
export const EXPIRY_WARNING_DAYS = 30;

/** أنواع الملفات المسموحة وحجمها. الخادم يتأكد من محتوى الملف نفسه، مو من اسمه بس. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

const freeText = (min: number, max: number) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex
    .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min, "too_short").max(max, "too_long"));

/** رقم الهوية الوطنية يبدأ بـ ١، والإقامة بـ ٢، وكلها ١٠ أرقام. نتحقق من الشكل بس. */
export const providerProfileBody = z
  .object({
    tradeName: freeText(2, 120),
    ownerName: freeText(2, 120),
    idType: z.enum(["national_id", "iqama"]),
    idNumber: z.string().regex(/^\d{10}$/, "id_invalid"),
    commercialRegister: z.string().regex(/^\d{10}$/, "cr_invalid"),
    categories: z.array(z.enum(CATEGORY_IDS as [string, ...string[]])).min(1, "categories_required").max(6),
  })
  .strict()
  .refine((v) => v.idNumber[0] === (v.idType === "national_id" ? "1" : "2"), { path: ["idNumber"], message: "id_type_mismatch" });
export type ProviderProfileBody = z.infer<typeof providerProfileBody>;

/** تاريخ بصيغة YYYY-MM-DD (تاريخ ميلادي). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date_invalid")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "date_invalid");

export const documentReviewBody = z
  .object({
    decision: z.enum(["approve", "reject"]),
    checklist: z.array(z.string().max(40)).max(20).default([]),
    reason: z.string().max(500).optional(),
  })
  .strict()
  .refine((v) => v.decision === "approve" || (v.reason?.trim().length ?? 0) >= 5, { path: ["reason"], message: "reason_required" });

export const providerDecisionBody = z
  .object({ decision: z.enum(["verify", "reject"]), reason: z.string().max(500).optional() })
  .strict()
  .refine((v) => v.decision === "verify" || (v.reason?.trim().length ?? 0) >= 5, { path: ["reason"], message: "reason_required" });

export const reasonBody = z.object({ reason: z.string().trim().min(5, "reason_required").max(500) }).strict();

export type ProviderStatus = "draft" | "pending" | "verified" | "rejected" | "suspended";
export type DocStatus = "pending" | "approved" | "rejected" | "replaced";
