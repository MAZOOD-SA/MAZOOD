// تحويل شكل الطلب من الخادم لشكل الواجهة.
import { categoryById, type CategoryId } from "@/data/categories";
import type { AppNotification, RequestStatus, ServiceRequest, When } from "@/data/types";
import { notificationText, type NotificationEvent, type NotificationLink } from "@mazood/shared";

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

/** تنبيه من الخادم (/v1/notifications). النص من @mazood/shared بنفس بيانات الحدث. */
export type ServerNotification = { id: string; event: NotificationEvent; data: { title?: string; n?: number; link?: NotificationLink }; readAt: string | null; createdAt: string };

/** الرابط داخل التطبيق لكل شاشة يودّي لها التنبيه. */
export function notificationHref(link: NotificationLink | undefined): string | undefined {
  if (!link) return undefined;
  switch (link.screen) {
    case "request": return `/request/${link.id}`;
    case "provider_request": return `/provider/request/${link.id}`;
    case "provider_job": return `/provider/job/${link.id}`;
    case "purchase": return `/purchase/${link.id}`;
    case "seller_purchase": return `/seller/purchase/${link.id}`;
    case "store": return "/store";
    case "provider_account": return "/provider/account";
  }
}

export function fromServerNotification(n: ServerNotification): AppNotification {
  return {
    id: n.id,
    text: { ar: notificationText(n.event, n.data, "ar"), en: notificationText(n.event, n.data, "en") },
    createdAt: n.createdAt,
    read: !!n.readAt,
    href: notificationHref(n.data.link),
  };
}

export type ServerFactory = {
  id: string;
  /** منشأة أو فرد (القرار ٤١). فاضي = ما اختار للحين. */
  kind: "business" | "individual" | null;
  name: string | null;
  cityId: string | null;
  city: { ar: string; en: string } | null;
  commercialRegister: string | null;
  vatNumber: string | null;
  idType?: "national_id" | "iqama" | null;
  /** آخر ٤ أرقام من الهوية بس (******1234). الرقم الكامل ما يطلع من الخادم. */
  idNumberMasked?: string | null;
  identity?: { status: "not_required" | "pending" | "verified"; verifiedAt: string | null };
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
  | "errPriceUnchanged" | "errManagerApproval" | "errProviderUnavailable"
  | "errProfileIncomplete" | "errIdentityUnverified" | "errKindLocked" | "errIndividualNoMembers"
  | "errProductsLimit" | "errImagesLimit" | "errBelowMinOrder" | "errOwnProduct" | "errSellerNotEnabled" | "errProductRemoved"
  | "errMarketBuyerNotAllowed" | "errSellerBusinessOnly";

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
    case "profile_incomplete":
      return "errProfileIncomplete";
    case "identity_unverified":
      return "errIdentityUnverified";
    case "kind_locked":
      return "errKindLocked";
    case "individual_no_members":
      return "errIndividualNoMembers";
    case "products_limit":
      return "errProductsLimit";
    case "images_limit":
      return "errImagesLimit";
    case "below_min_order":
      return "errBelowMinOrder";
    case "own_product":
      return "errOwnProduct";
    case "seller_not_enabled":
      return "errSellerNotEnabled";
    case "product_removed":
      return "errProductRemoved";
    case "market_buyer_not_allowed":
      return "errMarketBuyerNotAllowed";
    case "seller_business_only":
      return "errSellerBusinessOnly";
    case "network":
      return "networkError";
    case "request_not_cancellable":
      return "notCancellable";
    default:
      return "serverError";
  }
}
