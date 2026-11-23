// شكل ردود الخادم لشاشات السوق (apps/api/src/routes/market.ts). نفس الشكل يرجّعه الخادم التجريبي.
import type { BuyerPurchaseAction, ProductUnit, PurchaseStatus } from "@mazood/shared";

export type L10n = { ar: string; en: string };

export type MarketCategory = { id: string; name: L10n };

export type MarketProduct = {
  id: string;
  name: string;
  description: string;
  category: { id: string; name: L10n | null };
  unit: ProductUnit;
  minOrderQty: number;
  pricing: "fixed" | "quote";
  unitPriceHalalas: number | null;
  priceTiers: { minQty: number; unitPriceHalalas: number }[];
  images: { id: string; url: string }[];
  seller: { id: string; name: string | null; verified?: boolean; rating?: { average: number; count: number } | null };
  featured: boolean;
  status: "active" | "hidden" | "removed";
  removedReason: string | null;
  updatedAt: string;
};

export type ProductList = { products: MarketProduct[]; comingSoon: boolean; page: number; hasMore: boolean };

export type SellerPage = {
  seller: { id: string; name: string | null; city: L10n | null; verified: true; verifiedAt: string; rating: { average: number; count: number } | null };
  products: MarketProduct[];
};

export type SellerState = {
  status: "draft" | "pending" | "verified" | "rejected" | "suspended";
  statusReason: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  document: { id: string; status: "pending" | "approved" | "rejected" | "replaced"; expiresOn: string; rejectReason: string | null } | null;
  documentValid: boolean;
  subscription: { planId: string; kind: "trial" | "paid"; startsAt: string; endsAt: string } | null;
  listed: boolean;
  warnings: { subscriptionEndingSoon: boolean; documentExpiringSoon: boolean };
  products: { total: number; active: number };
};

export type SellerResponse = {
  seller: SellerState | null;
  plan: { id: string; name: L10n; monthlyPriceHalalas: number; maxProducts: number | null } | null;
  trialDays: number;
};

export type PurchaseQuote = {
  id: string;
  unitPriceHalalas: number;
  totalHalalas: number;
  leadTimeDays: number;
  deliveryIncluded: boolean;
  validUntil: string;
  note: string | null;
  createdAt: string;
};

export type PurchaseRequest = {
  id: string;
  product: { id: string; name: string; unit: ProductUnit; imageUrl: string | null };
  seller: { id: string; name: string | null };
  buyer?: { kind: "business" | "individual" | "provider"; name: string | null };
  quantity: number;
  cityId: string;
  when: "today" | "tomorrow" | "this_week" | "this_month";
  note: string | null;
  status: PurchaseStatus;
  revisionUsed: boolean;
  revisionNote: string | null;
  decisionNote: string | null;
  quote: PurchaseQuote | null;
  contact: { name: string | null; phone: string } | null;
  rated: boolean;
  /** للمشتري: BuyerPurchaseAction. للبائع: quote أو decline. */
  actions: (BuyerPurchaseAction | "quote" | "decline")[];
  acceptedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
};
