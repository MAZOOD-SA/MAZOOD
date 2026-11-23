// شكل ردود الخادم لشاشات المرحلة ٤ (العروض والقبول والتنفيذ). نفس الشكل في الخادم الحقيقي
// (apps/api/src/routes) والخادم التجريبي داخل المتصفح (src/demo/server.ts).
import type { Inclusions } from "@mazood/shared";
import type { CancellationFee, CancellationPolicy, CommitmentView, FactoryUiAction, RequestStatus } from "@mazood/shared";
import type { CategoryId } from "@/data/categories";
import type { When } from "@/data/types";

export type Price = { amountHalalas: number; includesVat: false; includesCommission: false };
export type RatingSummary = { average: number; count: number } | null;

export type ApiRequest = {
  id: string;
  category: CategoryId;
  typeId: string;
  details: string;
  area: string | null;
  location: string;
  cityId: string;
  when: When;
  status: RequestStatus;
  createdAt: string;
  expiresAt: string;
};

export type ProviderCard = { tradeName: string; verified: boolean; rating: RatingSummary; commitment: CommitmentView };

export type FactoryOffer = {
  id: string;
  provider: ProviderCard;
  price: Price;
  durationHours: number;
  note: string | null;
  /** «يشمل / ما يشمل» (القرار ٥٨). null: عرض قبل الميزة. */
  inclusions?: Inclusions | null;
  validUntil: string;
  status: "active" | "accepted";
  revised: boolean;
  createdAt: string;
};

export type ApiOrder = {
  id: string;
  state: string;
  price: Price;
  acceptedAt: string;
  startedAt: string | null;
  deliveredAt: string | null;
  confirmedAt: string | null;
  cancellationPolicy: CancellationPolicy;
  /** بدون رقم الجوال (القرار ٣٥): التواصل من غرفة الصفقة. */
  provider: { tradeName: string; verified: boolean };
};

export type PriceChange = {
  id: string;
  oldPriceHalalas: number;
  newPriceHalalas: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  requestedAt: string;
  decidedAt: string | null;
};

export type TimelineEvent = { at: string; by: string; event: string; stage?: string };

export type Execution = {
  autoConfirmAt: string | null;
  confirmedBy: string | null;
  /** link.path: مسار نسبي على الخادم (رابط مؤقت)، أو رابط كامل في الوضع التجريبي. */
  photos: { id: string; stage: "start" | "delivery"; createdAt: string; link: { path: string; expiresAt: string } }[];
  priceChanges: PriceChange[];
  timeline: TimelineEvent[];
};

export type CancellationRequestView = {
  id: string;
  kind: string;
  status: "pending" | "agreed" | "declined" | "expired" | "withdrawn";
  reason: string | null;
  requestedAt: string;
  respondBy: string | null;
  respondedAt: string | null;
  responseNote: string | null;
  fee: { feeHalalas: number; toProviderHalalas: number; toFactoryHalalas: number; toPlatformHalalas: number };
};

export type DisputeView = {
  id: string;
  number: number;
  reason: string;
  details: string | null;
  openedBy: string;
  status: "open" | "closed";
  resolution: string | null;
  openedAt: string;
  closedAt: string | null;
  notes: { by: string; body: string; at: string }[];
};

/** تفاصيل الطلب للمصنع (GET /v1/requests/:id). */
export type FactoryRequestView = {
  request: ApiRequest;
  reach: number;
  offers: FactoryOffer[];
  approval: { offerId: string; nominatedAt: string; nominatedBy: { userId: string; phone: string } } | null;
  order: ApiOrder | null;
  execution: Execution | null;
  actions: { primary: FactoryUiAction | null; others: FactoryUiAction[] };
  cancellationPolicy: CancellationPolicy | null;
  cancellationFee: CancellationFee | null;
  cancellationRequest: CancellationRequestView | null;
  withdrawal: { at: string; reason: string | null } | null;
  dispute: DisputeView | null;
  rating: { stars: number; createdAt: string } | null;
  /** رسائل من المزوّد ما قرأها هذا المستخدم (غرفة الصفقة). */
  unreadMessages: number;
};

/** طلب مفتوح كما يشوفه المزوّد (بدون اسم المصنع والموقع بالضبط). */
export type OpenRequest = {
  id: string;
  category: CategoryId;
  typeId: string;
  details: string;
  area: string | null;
  cityId: string;
  when: When;
  createdAt: string;
  expiresAt: string;
  /** منشأة أو فرد (بدون الاسم قبل القبول، القرار ٤١). */
  customerKind?: "business" | "individual";
  offerCount: number;
  myOffer: { id: string } | null;
};

export type MyOffer = {
  id: string;
  requestId: string;
  priceHalalas: number;
  durationHours: number;
  note: string | null;
  inclusions?: Inclusions | null;
  validUntil: string;
  status: "active" | "withdrawn" | "accepted" | "rejected" | "expired";
  revision: number;
  seenByFactory: boolean;
  createdAt: string;
  updatedAt: string;
  request: { id: string; category: CategoryId; typeId: string; area: string | null; when: When; status: RequestStatus };
};

export type JobSummary = {
  orderId: string;
  requestId: string;
  status: RequestStatus;
  category: CategoryId;
  typeId: string;
  details: string;
  area: string | null;
  location: string;
  when: When;
  priceHalalas: number;
  acceptedAt: string;
  startedAt: string | null;
  deliveredAt: string | null;
  factory: { name: string | null; kind?: "business" | "individual" };
  /** رسائل من العميل ما قرأها المزوّد (غرفة الصفقة). */
  unreadMessages: number;
};

/** الطلب المنفّذ للمزوّد (GET /v1/provider/jobs/:orderId). */
export type JobView = JobSummary & {
  confirmedAt: string | null;
  cancellationPolicy: CancellationPolicy;
  execution: Execution;
  cancellationRequest: CancellationRequestView | null;
  withdrawalFee: CancellationFee | null;
  dispute: DisputeView | null;
};

export type DeletionRequest = { id: string; status: "pending" | "done" | "rejected"; requestedAt: string; note?: string | null } | null;
