// شكل البيانات اللي يرجعها الخادم للتطبيق. أي تغيير هنا لازم يتغيّر في الطرفين،
// وTypeScript ينبّه لو واحد منهم ما تحدّث.
import type { CategoryId, Localized } from "./categories";
import type { CancelPolicy, CancelRequestStatus, FactoryAction, RequestStatus, When } from "./requests";

export type ApiError = {
  /** رمز ثابت يترجمه التطبيق، مثل "rate_limited" أو "not_found". */
  error: string;
  /** حقل المدخل اللي فيه الخطأ، إذا الخطأ في التحقق. */
  field?: string;
  /** كم ثانية لين يقدر يحاول مرة ثانية (لأخطاء تحديد المحاولات). */
  retryAfterSeconds?: number;
};

export type OtpRequestResponse = {
  /** كم ثانية لين يقدر يطلب رمز جديد. */
  resendAfterSeconds: number;
  /**
   * في بيئة التطوير والتجربة بس: الرمز نفسه، لأن ما فيه مزوّد رسائل للحين.
   * الخادم يرفض يشتغل بهذا الإعداد في بيئة الإنتاج.
   */
  devCode?: string;
};

export type Me = {
  id: string;
  phone: string;
  role: "factory" | "provider" | "staff";
  locale: "ar" | "en";
  factory: FactoryDto | null;
};

/**
 * رد الدخول. في الجوال: الرمز يرجع هنا ويتحفظ في الخزنة المشفّرة.
 * في الموقع: الرمز ما يرجع أبدًا، والخادم يحطه في ملف تعريف محمي (HttpOnly) ما يقدر كود الصفحة يقراه.
 */
export type SessionResponse = { token?: string; expiresAt: string; me: Me };

/** جلسة دخول لعرضها في «أجهزتي». */
export type SessionDto = {
  id: string;
  deviceName: string | null;
  channel: "web" | "app";
  createdAt: string;
  lastUsedAt: string;
  /** هذا الجهاز اللي يتصفح الحين. */
  current: boolean;
};

export type FactoryDto = {
  id: string;
  name: string;
  location: string;
  commercialRegister: string | null;
  vatNumber: string | null;
};

export type ProviderDto = {
  id: string;
  name: Localized;
  verified: boolean;
  /** التقييم من ٥، بالعُشر: ٤٨ = ٤٫٨ */
  ratingTenths: number;
  completedOrders: number;
};

export type OfferDto = {
  id: string;
  requestId: string;
  provider: ProviderDto;
  /** السعر قبل الضريبة بالهللة */
  priceHalalas: number;
  summary: Localized;
  note: Localized;
  createdAt: string;
  status: "pending" | "accepted" | "declined";
  /** المصنع فتح العرض ولا لا (للرقم على الطلب في الرئيسية). */
  seen: boolean;
};

export type RequestDto = {
  id: string;
  category: CategoryId;
  typeId: string;
  details: string;
  location: string;
  when: When;
  status: RequestStatus;
  cancelRequestStatus: CancelRequestStatus;
  disputeOpened: boolean;
  createdAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  pendingOffers: number;
  unseenOffers: number;
  /** سعر العرض المقبول قبل الضريبة بالهللة، أو null إذا ما انقبل عرض. */
  acceptedPriceHalalas: number | null;
  /** الإجراءات المتاحة للمصنع الحين، محسوبة في الخادم من requests.ts. */
  actions: FactoryAction[];
};

export type RequestDetailsDto = RequestDto & {
  offers: OfferDto[];
  acceptedOffer: OfferDto | null;
};

export type ConfigDto = {
  cancelPolicy: CancelPolicy;
  /** true في بيئة التطوير والتجربة: عروض وهمية توصل تلقائيًا. */
  demoMode: boolean;
};
