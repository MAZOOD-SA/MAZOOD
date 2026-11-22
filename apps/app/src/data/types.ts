// أنواع البيانات في النسخة التجريبية. نفس الشكل المبسّط اللي في PLAN.md (القسم ٣)،
// وفي المرحلة ٢ تصير جداول حقيقية في قاعدة البيانات.
import type { Localized } from "@/i18n/I18nProvider";
import type { CategoryId } from "./categories";

export type RequestStatus = "awaiting_offers" | "in_progress" | "completed" | "cancelled";
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
