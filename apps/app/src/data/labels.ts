// أسماء المستندات وحالات المزوّد وأدوار الموظفين بالعربي والإنجليزي.
import type { DocType, ProviderStatus, StaffRole } from "@mazood/shared";
import type { BadgeTone } from "@/components/ui";
import type { Localized } from "@/i18n/I18nProvider";

export const DOC_LABELS: Record<DocType, Localized> = {
  id_document: { ar: "الهوية الوطنية أو الإقامة", en: "National ID or Iqama" },
  cr_certificate: { ar: "السجل التجاري", en: "Commercial registration" },
  vehicle_registration: { ar: "استمارة المركبة", en: "Vehicle registration" },
  transport_license: { ar: "رخصة نشاط النقل", en: "Transport license" },
  security_license: { ar: "ترخيص الحراسات الأمنية", en: "Security services license" },
  customs_broker_license: { ar: "رخصة مخلّص جمركي", en: "Customs broker license" },
};

export const PROVIDER_STATUS: Record<ProviderStatus, { label: Localized; tone: BadgeTone }> = {
  draft: { label: { ar: "لم يُرسل للتوثيق", en: "Not submitted" }, tone: "muted" },
  pending: { label: { ar: "بانتظار التوثيق", en: "Under review" }, tone: "new" },
  verified: { label: { ar: "موثّق", en: "Verified" }, tone: "ok" },
  rejected: { label: { ar: "يحتاج تعديل", en: "Needs changes" }, tone: "bad" },
  suspended: { label: { ar: "موقوف", en: "Suspended" }, tone: "bad" },
};

export const STAFF_ROLE_LABELS: Record<StaffRole, Localized> = {
  owner: { ar: "المالك", en: "Owner" },
  general_manager: { ar: "مدير عام", en: "General manager" },
  verification: { ar: "موظف توثيق", en: "Verification officer" },
  support: { ar: "خدمة عملاء", en: "Customer support" },
  finance: { ar: "مالية", en: "Finance" },
};

/** أسماء الإجراءات في سجل الإجراءات. اللي ما له اسم يظهر برمزه. */
export const AUDIT_ACTIONS: Record<string, Localized> = {
  "auth.login": { ar: "دخول", en: "Signed in" },
  "auth.logout": { ar: "خروج", en: "Signed out" },
  "request.created": { ar: "رفع طلب", en: "Created request" },
  "request.cancelled": { ar: "ألغى طلب", en: "Cancelled request" },
  "factory.profile_updated": { ar: "حدّث بيانات المصنع", en: "Updated factory details" },
  "provider.registered": { ar: "سجّل كمزوّد", en: "Registered as provider" },
  "provider.profile_updated": { ar: "حدّث بيانات المزوّد", en: "Updated provider details" },
  "provider.submitted": { ar: "أرسل للتوثيق", en: "Submitted for review" },
  "provider.verified": { ar: "وثّق مزوّد", en: "Verified provider" },
  "provider.rejected": { ar: "رفض طلب توثيق", en: "Rejected provider" },
  "provider.suspended": { ar: "أوقف مزوّد", en: "Suspended provider" },
  "provider.reinstated": { ar: "رفع إيقاف مزوّد", en: "Reinstated provider" },
  "provider.id_number_viewed": { ar: "اطّلع على رقم هوية", en: "Viewed ID number" },
  "document.uploaded": { ar: "رفع مستند", en: "Uploaded document" },
  "document.viewed": { ar: "فتح مستند", en: "Opened document" },
  "document.approved": { ar: "قبل مستند", en: "Approved document" },
  "document.rejected": { ar: "رفض مستند", en: "Rejected document" },
  "staff.added": { ar: "أضاف موظف", en: "Added staff" },
  "staff.added_cli": { ar: "أضاف موظف (من الخادم)", en: "Added staff (server)" },
  "staff.deactivated": { ar: "أوقف موظف", en: "Deactivated staff" },
};
