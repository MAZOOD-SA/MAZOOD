// منطق العروض والفواتير التجريبية (بدون خادم). الطلبات الحقيقية صارت في الخادم (المرحلة ٢)،
// وهذا الملف يخدم الطلبات التجريبية بس. القواعد هنا بتنتقل للخادم في المرحلة ٤ و٥:
//   - المصنع يقبل عرض واحد بس، وباقي العروض تُرفض تلقائيًا.
//   - ما ينقبل عرض إلا على طلب «بانتظار العروض».
//   - تأكيد الاستلام يكمّل الطلب ويُصدر فاتورة.
//   - الإلغاء مسموح بس قبل قبول أي عرض.
import type { AppNotification, Invoice, Offer, ServiceRequest } from "./types";

export type State = {
  requests: ServiceRequest[];
  offers: Offer[];
  invoices: Invoice[];
  notifications: AppNotification[];
  invoiceCounter: number;
};

export type Action =
  | { type: "offersArrived"; offers: Offer[]; now: string }
  | { type: "acceptOffer"; offerId: string; now: string }
  | { type: "confirmReceipt"; requestId: string; now: string }
  | { type: "cancelRequest"; requestId: string }
  | { type: "markNotificationsRead" };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
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
