// أنواع البيانات اللي تعرضها الشاشات.
// الطلبات: حقيقية من الخادم (demo: false)، أو تجريبية من seed.ts (demo: true) عشان تبان دورة العروض والفواتير.
// العروض والفواتير والتنبيهات: تجريبية لين المرحلة 4 و5.
import type { RequestStatus, When } from "@mazood/shared";
import type { Localized } from "@/i18n/I18nProvider";
import type { CategoryId } from "./categories";

export type { RequestStatus, When };

export type ServiceRequest = {
  id: string;
  category: CategoryId;
  typeId: string;
  title: Localized;
  details: Localized;
  location: Localized;
  when: When;
  createdAt: string;
  status: RequestStatus;
  acceptedOfferId?: string;
  invoiceId?: string;
  /** true: بيانات تجريبية (ما تنحفظ في الخادم). تظهر عليها شارة «تجريبي». */
  demo: boolean;
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
};

export type Factory = {
  name: Localized;
  city: Localized;
  commercialRegister: string;
  vatNumber: string;
};
