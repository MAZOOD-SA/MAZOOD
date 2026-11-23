// أنواع البيانات في النسخة التجريبية. نفس الشكل المبسّط اللي في PLAN.md (القسم ٣)،
// وفي المرحلة ٢ تصير جداول حقيقية في قاعدة البيانات.
import type { Localized } from "@/i18n/I18nProvider";
import type { RequestStatus } from "@mazood/shared";
import type { CategoryId } from "./categories";

export type { RequestStatus };

export type When = "today" | "tomorrow" | "this_week";

export type ServiceRequest = {
  id: string;
  category: CategoryId;
  typeId: string;
  title: Localized;
  details: Localized;
  /** المنطقة (تظهر للمزوّد قبل القبول). */
  area?: string;
  /** الموقع بالضبط (يظهر للمزوّد بعد القبول بس). */
  location: Localized;
  when: When;
  createdAt: string;
  status: RequestStatus;
  acceptedOfferId?: string;
  invoiceId?: string;
  /** عدد العروض الصالحة، وكم واحد منها ما انفتح (من قائمة الطلبات في الخادم). */
  offerCount?: number;
  newOfferCount?: number;
  /** رسائل من المزوّد ما انقرت (غرفة الصفقة). */
  unreadMessages?: number;
};

export type Provider = {
  id: string;
  name: Localized;
  verified: boolean;
  /** التقييم من ٥، بالعُشر: ٤٨ = ٤٫٨ */
  ratingTenths: number;
  completedOrders: number;
};

export type OfferStatus = "pending" | "accepted" | "declined";

export type Offer = {
  id: string;
  requestId: string;
  providerId: string;
  /** السعر قبل الضريبة بالهللة */
  priceHalalas: number;
  summary: Localized;
  note: Localized;
  createdAt: string;
  status: OfferStatus;
};

export type InvoiceLine = { description: Localized; amountHalalas: number };

export type Invoice = {
  id: string;
  number: string;
  requestId: string;
  issuedAt: string;
  lines: InvoiceLine[];
  status: "paid" | "due";
};

export type AppNotification = {
  id: string;
  text: Localized;
  createdAt: string;
  read: boolean;
  requestId?: string;
  /** وين يودّي التنبيه (التنبيهات من الخادم، القرار ٤٩). */
  href?: string;
};

/** العميل (منشأة أو فرد). الاسم «Factory» باقي في الكود عشان ما نكسر شي (القرار ٤١). */
export type Factory = {
  kind: "business" | "individual" | null;
  name: Localized;
  city: Localized;
  commercialRegister: string;
  vatNumber: string;
  idType: "national_id" | "iqama" | null;
  idNumberMasked: string | null;
  identityStatus: "not_required" | "pending" | "verified";
};
