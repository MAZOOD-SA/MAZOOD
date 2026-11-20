// منطق الطلبات والعروض في النسخة التجريبية (بدون خادم).
// القواعد هنا هي نفس قواعد العمل اللي بتنتقل للخادم في المرحلة ٢ و٤:
//   - المصنع يقبل عرض واحد بس، وباقي العروض تُرفض تلقائيًا.
//   - ما ينقبل عرض إلا على طلب «بانتظار العروض».
//   - تأكيد الاستلام يكمّل الطلب ويُصدر فاتورة.
//   - الإلغاء مسموح بس قبل قبول أي عرض.
import type { CategoryId } from "./categories";
import type { AppNotification, Invoice, Offer, ServiceRequest, When } from "./types";
import type { Localized } from "@/i18n/I18nProvider";

export type State = {
  signedIn: boolean;
  phone: string | null;
  requests: ServiceRequest[];
  offers: Offer[];
  invoices: Invoice[];
  notifications: AppNotification[];
  invoiceCounter: number;
};

export type NewRequestInput = {
  id: string;
  category: CategoryId;
  typeId: string;
  title: Localized;
  details: string;
  location: Localized;
  when: When;
  now: string;
};

export type Action =
  | { type: "signIn"; phone: string }
  | { type: "signOut" }
  | { type: "createRequest"; input: NewRequestInput }
  | { type: "offersArrived"; offers: Offer[]; now: string }
  | { type: "acceptOffer"; offerId: string; now: string }
  | { type: "confirmReceipt"; requestId: string; now: string }
  | { type: "cancelRequest"; requestId: string }
  | { type: "markNotificationsRead" };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "signIn":
      return { ...state, signedIn: true, phone: action.phone };

    case "signOut":
      return { ...state, signedIn: false, phone: null };

    case "createRequest": {
      const { input } = action;
      const request: ServiceRequest = {
        id: input.id,
        category: input.category,
        typeId: input.typeId,
        title: input.title,
        // النص اللي كتبه المستخدم يظهر نفسه في اللغتين.
        details: { ar: input.details, en: input.details },
        location: input.location,
        when: input.when,
        createdAt: input.now,
        status: "awaiting_offers",
      };
      return { ...state, requests: [request, ...state.requests] };
    }

    case "offersArrived": {
      if (action.offers.length === 0) return state;
      const requestId = action.offers[0].requestId;
      const request = state.requests.find((r) => r.id === requestId);
      // الطلب انلغى أو انقبل فيه عرض قبل ما توصل العروض: نتجاهلها.
      if (!request || request.status !== "awaiting_offers") return state;
      const n = action.offers.length;
      const notification: AppNotification = {
        id: `n-${requestId}-${action.now}`,
        text: {
          ar: `وصلك ${n} عروض على ${request.title.ar}`,
          en: `You have ${n} quotes on ${request.title.en}`,
        },
        createdAt: action.now,
        read: false,
        requestId,
      };
      return {
        ...state,
        offers: [...state.offers, ...action.offers],
        notifications: [notification, ...state.notifications],
      };
    }

    case "acceptOffer": {
      const offer = state.offers.find((o) => o.id === action.offerId);
      if (!offer || offer.status !== "pending") return state;
      const request = state.requests.find((r) => r.id === offer.requestId);
      if (!request || request.status !== "awaiting_offers") return state;
      return {
        ...state,
        offers: state.offers.map((o) =>
          o.requestId !== offer.requestId ? o : { ...o, status: o.id === offer.id ? "accepted" : "declined" },
        ),
        requests: state.requests.map((r) =>
          r.id === request.id ? { ...r, status: "in_progress", acceptedOfferId: offer.id } : r,
        ),
      };
    }

    case "confirmReceipt": {
      const request = state.requests.find((r) => r.id === action.requestId);
      if (!request || request.status !== "in_progress" || !request.acceptedOfferId) return state;
      const offer = state.offers.find((o) => o.id === request.acceptedOfferId);
      if (!offer) return state;
      const counter = state.invoiceCounter + 1;
      const invoice: Invoice = {
        id: `i-${request.id}`,
        number: `MZ-2026-${String(counter).padStart(6, "0")}`,
        requestId: request.id,
        issuedAt: action.now,
        lines: [{ description: request.title, amountHalalas: offer.priceHalalas }],
        status: "due",
      };
      return {
        ...state,
        invoiceCounter: counter,
        invoices: [invoice, ...state.invoices],
        requests: state.requests.map((r) =>
          r.id === request.id ? { ...r, status: "completed", invoiceId: invoice.id } : r,
        ),
      };
    }

    case "cancelRequest": {
      const request = state.requests.find((r) => r.id === action.requestId);
      if (!request || request.status !== "awaiting_offers") return state;
      return {
        ...state,
        requests: state.requests.map((r) => (r.id === request.id ? { ...r, status: "cancelled" } : r)),
        offers: state.offers.map((o) =>
          o.requestId === request.id && o.status === "pending" ? { ...o, status: "declined" } : o,
        ),
      };
    }

    case "markNotificationsRead":
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) };
  }
}

/** العروض اللي تنتظر قرار على طلب، مرتبة من الأقل سعرًا. */
export function pendingOffersFor(state: State, requestId: string): Offer[] {
  return state.offers
    .filter((o) => o.requestId === requestId && o.status === "pending")
    .sort((a, b) => a.priceHalalas - b.priceHalalas);
}
