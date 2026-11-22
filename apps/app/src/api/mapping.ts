// تحويل شكل الطلب من الخادم لشكل الواجهة.
import { categoryById, type CategoryId } from "@/data/categories";
import type { RequestStatus, ServiceRequest, When } from "@/data/types";

export type ServerRequest = {
  id: string;
  category: CategoryId;
  typeId: string;
  details: string;
  /** المنطقة (تظهر للمزوّد). فاضية في الطلبات القديمة قبل المرحلة ٤. */
  area: string | null;
  location: string;
  cityId: string;
  when: When;
  status: RequestStatus;
  createdAt: string;
  offerCount?: number;
  newOfferCount?: number;
};

export function fromServerRequest(r: ServerRequest): ServiceRequest {
  const type = categoryById(r.category).types.find((x) => x.id === r.typeId);
  const title = type?.name ?? categoryById(r.category).name;
  return {
    id: r.id,
    category: r.category,
    typeId: r.typeId,
    title,
    // نص المستخدم يظهر نفسه في اللغتين.
    details: { ar: r.details, en: r.details },
    area: r.area ?? undefined,
    location: { ar: r.location, en: r.location },
    when: r.when,
    createdAt: new Date(r.createdAt).toISOString(),
    status: r.status,
    offerCount: r.offerCount,
    newOfferCount: r.newOfferCount,
  };
}

export type ServerFactory = {
  id: string;
  name: string | null;
  cityId: string | null;
  city: { ar: string; en: string } | null;
  commercialRegister: string | null;
  vatNumber: string | null;
  profileComplete: boolean;
};

/** رسالة الخطأ المناسبة لرمز الخطأ القادم من الخادم. */
export type ErrorKey =
  | "otpCooldown" | "otpRateLimited" | "otpInvalid" | "networkError" | "serverError" | "notCancellable"
  | "errFileType" | "errFileTooLarge" | "errDocExpired" | "errDocumentsMissing" | "errProfileLocked"
  | "errChecklistIncomplete" | "errReasonRequired" | "errForbidden" | "errPhoneUsed" | "errNotApproved" | "errValidation"
  | "errContactInfo" | "errOfferExists" | "errOffersFull" | "errOfferNotActive" | "errOfferLocked" | "errValidityTooLong"
  | "errPriceChangePending" | "errCancellationPending" | "errAlreadyRated" | "errInvalidTransition" | "errDeletionPending"
  | "errDemoUnsupported" | "errPhotosLimit" | "errPhotoNotAllowed" | "errPhoneInUse" | "errProviderNotVerified" | "errNotFound"
  | "errPriceUnchanged" | "errManagerApproval" | "errProviderUnavailable";

export function errorKey(code: string): ErrorKey {
  switch (code) {
    case "file_type_not_allowed":
      return "errFileType";
    case "file_too_large":
      return "errFileTooLarge";
    case "doc_expired":
      return "errDocExpired";
    case "documents_missing":
      return "errDocumentsMissing";
    case "profile_locked":
    case "already_submitted":
      return "errProfileLocked";
    case "checklist_incomplete":
      return "errChecklistIncomplete";
    case "forbidden":
      return "errForbidden";
    case "phone_used_by_customer":
      return "errPhoneUsed";
    case "documents_not_approved":
      return "errNotApproved";
    case "otp_cooldown":
      return "otpCooldown";
    case "otp_rate_limited":
    case "rate_limited":
      return "otpRateLimited";
    case "otp_invalid":
      return "otpInvalid";
    case "validation":
      return "errValidation";
    case "contact_info_not_allowed":
      return "errContactInfo";
    case "offer_exists":
      return "errOfferExists";
    case "offers_full":
      return "errOffersFull";
    case "offer_not_active":
      return "errOfferNotActive";
    case "offer_locked":
      return "errOfferLocked";
    case "validity_too_long":
      return "errValidityTooLong";
    case "price_change_pending":
      return "errPriceChangePending";
    case "cancellation_pending":
      return "errCancellationPending";
    case "already_rated":
      return "errAlreadyRated";
    case "invalid_transition":
    case "not_completed":
    case "price_change_not_allowed":
    case "price_change_not_pending":
      return "errInvalidTransition";
    case "deletion_pending":
      return "errDeletionPending";
    case "demo_unsupported":
      return "errDemoUnsupported";
    case "photos_limit":
      return "errPhotosLimit";
    case "photo_not_allowed":
      return "errPhotoNotAllowed";
    case "phone_in_use":
      return "errPhoneInUse";
    case "provider_not_verified":
    case "provider_suspended":
      return "errProviderNotVerified";
    case "not_found":
      return "errNotFound";
    case "price_unchanged":
      return "errPriceUnchanged";
    case "manager_approval_required":
      return "errManagerApproval";
    case "provider_unavailable":
      return "errProviderUnavailable";
    case "network":
      return "networkError";
    case "request_not_cancellable":
      return "notCancellable";
    default:
      return "serverError";
  }
}
