// منطق الطلبات والعروض في الخادم. القواعد نفسها في packages/shared/src/requests.ts،
// وهنا نطبّقها على قاعدة البيانات.
//
// قاعدتين أمان في كل دالة هنا:
//   1. **كل استعلام مفلتر برقم المصنع.** المصنع ما يشوف ولا يلمس طلب مصنع ثاني. لو حاول،
//      يرجع «غير موجود» (٤٠٤) مو «ممنوع» (٤٠٣)، عشان ما يعرف إن الطلب موجود أصلًا.
//   2. **كل تغيير حالة مشروط بالحالة القديمة** (updateMany مع where status). لو وصل طلبين
//      بنفس اللحظة (مثلًا قبول عرضين)، ينجح واحد بس، والثاني يرجع ٤٠٩.
import {
  allowedFactoryActions,
  isAllowed,
  type CancelPolicy,
  type CreateRequestData,
  type FactoryAction,
  type OfferDto,
  type RequestDetailsDto,
  type RequestDto,
} from "@mazood/shared";
import { audit } from "../audit";
import type { Db } from "../db";
import { conflict, notFound } from "../errors";
import type { Offer, Provider, Request } from "../generated/prisma/client";
import type { RequestStatus } from "../generated/prisma/enums";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OfferWithProvider = Offer & { provider: Provider };
type RequestWithOffers = Request & { offers: OfferWithProvider[] };

export type Actor = { userId: string; factoryId: string; ip: string | null };

function snapshot(r: RequestWithOffers) {
  return {
    status: r.status,
    cancelRequestStatus: r.cancelRequestStatus ?? null,
    disputeOpened: r.disputeOpenedAt !== null,
    pendingOffers: r.offers.filter((o) => o.status === "pending").length,
  };
}

function offerDto(o: OfferWithProvider): OfferDto {
  return {
    id: o.id,
    requestId: o.requestId,
    provider: {
      id: o.provider.id,
      name: { ar: o.provider.nameAr, en: o.provider.nameEn },
      verified: o.provider.verified,
      ratingTenths: o.provider.ratingTenths,
      completedOrders: o.provider.completedOrders,
    },
    priceHalalas: o.priceHalalas,
    summary: { ar: o.summaryAr, en: o.summaryEn },
    note: { ar: o.noteAr, en: o.noteEn },
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    seen: o.seenAt !== null,
  };
}

function requestDto(r: RequestWithOffers, policy: CancelPolicy): RequestDto {
  const s = snapshot(r);
  return {
    id: r.id,
    category: r.category as RequestDto["category"],
    typeId: r.typeId,
    details: r.details,
    location: r.location,
    when: r.when,
    status: r.status,
    cancelRequestStatus: s.cancelRequestStatus,
    disputeOpened: s.disputeOpened,
    createdAt: r.createdAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    pendingOffers: s.pendingOffers,
    unseenOffers: r.offers.filter((o) => o.status === "pending" && o.seenAt === null).length,
    acceptedPriceHalalas: r.offers.find((o) => o.id === r.acceptedOfferId)?.priceHalalas ?? null,
    actions: allowedFactoryActions(s, policy),
  };
}

function detailsDto(r: RequestWithOffers, policy: CancelPolicy): RequestDetailsDto {
  const accepted = r.offers.find((o) => o.id === r.acceptedOfferId);
  return {
    ...requestDto(r, policy),
    // العروض من الأقل سعرًا.
    offers: r.offers.filter((o) => o.status === "pending").sort((a, b) => a.priceHalalas - b.priceHalalas).map(offerDto),
    acceptedOffer: accepted ? offerDto(accepted) : null,
  };
}

const withOffers = { offers: { include: { provider: true } } } as const;

/** يجيب طلب للمصنع هذا بس. أي طلب لمصنع ثاني (أو رقم غلط) = غير موجود. */
async function loadOwned(db: Db, factoryId: string, requestId: string): Promise<RequestWithOffers> {
  if (!UUID.test(requestId)) throw notFound();
  const r = await db.request.findFirst({ where: { id: requestId, factoryId }, include: withOffers });
  if (!r) throw notFound();
  return r;
}

export async function listRequests(db: Db, factoryId: string, policy: CancelPolicy): Promise<RequestDto[]> {
  const rows = await db.request.findMany({ where: { factoryId }, include: withOffers, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map((r) => requestDto(r, policy));
}

export async function getRequest(db: Db, factoryId: string, requestId: string, policy: CancelPolicy): Promise<RequestDetailsDto> {
  return detailsDto(await loadOwned(db, factoryId, requestId), policy);
}

export async function createRequest(db: Db, actor: Actor, input: CreateRequestData, policy: CancelPolicy) {
  const r = await db.request.create({
    data: {
      factoryId: actor.factoryId,
      createdById: actor.userId,
      category: input.category,
      typeId: input.typeId,
      details: input.details,
      location: input.location,
      when: input.when,
    },
    include: withOffers,
  });
  await audit(db, { actorUserId: actor.userId, action: "request.created", entityType: "request", entityId: r.id, metadata: { category: r.category }, ip: actor.ip });
  return detailsDto(r, policy);
}

/** يعلّم عروض الطلب كمقروءة (لما يفتح المصنع تفاصيل الطلب). */
export async function markOffersSeen(db: Db, actor: Actor, requestId: string, now: Date): Promise<void> {
  const r = await loadOwned(db, actor.factoryId, requestId);
  await db.offer.updateMany({ where: { requestId: r.id, seenAt: null }, data: { seenAt: now } });
}

/** يتأكد إن الإجراء مسموح على الطلب الحين، حسب القواعد المشتركة. */
function assertAllowed(action: FactoryAction, r: RequestWithOffers, policy: CancelPolicy) {
  if (!isAllowed(action, snapshot(r), policy)) throw conflict();
}

/** تغيير حالة مشروط: ينجح بس لو الطلب لسا بنفس الحالة اللي قرأناها. */
async function transition(db: Pick<Db, "request">, r: Request, data: Parameters<Db["request"]["updateMany"]>[0]["data"]) {
  const res = await db.request.updateMany({
    where: { id: r.id, status: r.status, cancelRequestStatus: r.cancelRequestStatus },
    data,
  });
  if (res.count !== 1) throw conflict();
}

// ─── إجراءات المصنع ───────────────────────────────────────────

/** قبول عرض واحد. باقي العروض ترفض تلقائيًا. */
export async function acceptOffer(db: Db, actor: Actor, requestId: string, offerId: string, policy: CancelPolicy, now: Date) {
  const r = await loadOwned(db, actor.factoryId, requestId);
  assertAllowed("accept_offer", r, policy);
  const offer = r.offers.find((o) => o.id === offerId && o.status === "pending");
  if (!offer) throw notFound();

  await db.$transaction(async (tx) => {
    await transition(tx, r, { status: "accepted", acceptedOfferId: offer.id, acceptedAt: now });
    await tx.offer.update({ where: { id: offer.id }, data: { status: "accepted" } });
    await tx.offer.updateMany({ where: { requestId: r.id, id: { not: offer.id }, status: "pending" }, data: { status: "declined" } });
    await audit(tx, {
      actorUserId: actor.userId,
      action: "request.offer_accepted",
      entityType: "request",
      entityId: r.id,
      metadata: { offerId: offer.id, providerId: offer.providerId, priceHalalas: offer.priceHalalas },
      ip: actor.ip,
    });
  });
  return getRequest(db, actor.factoryId, requestId, policy);
}

/** إلغاء مباشر (مجاني): قبل قبول عرض، أو بعده وقبل بدء التنفيذ حسب السياسة. */
export async function cancelRequest(db: Db, actor: Actor, requestId: string, policy: CancelPolicy, now: Date) {
  const r = await loadOwned(db, actor.factoryId, requestId);
  assertAllowed("cancel", r, policy);
  await db.$transaction(async (tx) => {
    await transition(tx, r, { status: "cancelled", cancelledAt: now });
    await tx.offer.updateMany({ where: { requestId: r.id, status: "pending" }, data: { status: "declined" } });
    await audit(tx, { actorUserId: actor.userId, action: "request.cancelled", entityType: "request", entityId: r.id, metadata: { fromStatus: r.status }, ip: actor.ip });
  });
  return getRequest(db, actor.factoryId, requestId, policy);
}

/** «طلب إلغاء» بعد بدء التنفيذ: يروح للمزوّد يوافق أو يرفض. */
export async function requestCancellation(db: Db, actor: Actor, requestId: string, policy: CancelPolicy) {
  const r = await loadOwned(db, actor.factoryId, requestId);
  assertAllowed("request_cancel", r, policy);
  await db.$transaction(async (tx) => {
    await transition(tx, r, { cancelRequestStatus: "pending" });
    await audit(tx, { actorUserId: actor.userId, action: "request.cancel_requested", entityType: "request", entityId: r.id, ip: actor.ip });
  });
  return getRequest(db, actor.factoryId, requestId, policy);
}

export async function withdrawCancellation(db: Db, actor: Actor, requestId: string, policy: CancelPolicy) {
  const r = await loadOwned(db, actor.factoryId, requestId);
  assertAllowed("withdraw_cancel_request", r, policy);
  await db.$transaction(async (tx) => {
    await transition(tx, r, { cancelRequestStatus: null });
    await audit(tx, { actorUserId: actor.userId, action: "request.cancel_request_withdrawn", entityType: "request", entityId: r.id, ip: actor.ip });
  });
  return getRequest(db, actor.factoryId, requestId, policy);
}

/** المصنع يأكد إن الشغل خلص. الفاتورة الرسمية تجي في المرحلة ٥. */
export async function confirmReceipt(db: Db, actor: Actor, requestId: string, policy: CancelPolicy, now: Date) {
  const r = await loadOwned(db, actor.factoryId, requestId);
  assertAllowed("confirm_receipt", r, policy);
  await db.$transaction(async (tx) => {
    // لو فيه طلب إلغاء معلّق، تأكيد الاستلام يلغيه (الشغل خلص فعلًا).
    await transition(tx, r, { status: "completed", completedAt: now, cancelRequestStatus: null });
    await audit(tx, { actorUserId: actor.userId, action: "request.completed", entityType: "request", entityId: r.id, ip: actor.ip });
  });
  return getRequest(db, actor.factoryId, requestId, policy);
}

/** المزوّد رفض الإلغاء: المصنع يفتح بلاغ، وفريق مزوّد يتابعه من لوحة الإدارة (المرحلة ٣ و٦). */
export async function openDispute(db: Db, actor: Actor, requestId: string, policy: CancelPolicy, now: Date) {
  const r = await loadOwned(db, actor.factoryId, requestId);
  assertAllowed("open_dispute", r, policy);
  await db.$transaction(async (tx) => {
    await transition(tx, r, { disputeOpenedAt: now });
    await audit(tx, { actorUserId: actor.userId, action: "request.dispute_opened", entityType: "request", entityId: r.id, ip: actor.ip });
  });
  return getRequest(db, actor.factoryId, requestId, policy);
}

// ─── إجراءات المزوّد ───────────────────────────────────────────
// الحين يستخدمها وضع التجربة (demo.ts) بس. في المرحلة ٤ تصير لها شاشات ومسارات للمزوّد،
// مع فحص إن المزوّد موثّق وإن الطلب في أقسامه.

export async function providerSubmitOffer(
  db: Db,
  providerId: string,
  requestId: string,
  offer: { priceHalalas: number; summaryAr: string; summaryEn: string; noteAr?: string; noteEn?: string },
): Promise<boolean> {
  const r = await db.request.findUnique({ where: { id: requestId } });
  if (!r || r.status !== "awaiting_offers") return false;
  const created = await db.offer.create({ data: { requestId, providerId, ...offer } });
  await audit(db, { actorUserId: null, action: "offer.submitted", entityType: "offer", entityId: created.id, metadata: { requestId, providerId, priceHalalas: offer.priceHalalas } });
  return true;
}

/** المزوّد صاحب العرض المقبول يضغط «بدأت التنفيذ». */
export async function providerStartWork(db: Db, providerId: string, requestId: string, now: Date): Promise<boolean> {
  return providerTransition(db, providerId, requestId, ["accepted"], { status: "in_progress", startedAt: now }, "request.work_started");
}

/** المزوّد يرد على طلب الإلغاء: يوافق (ينلغي الطلب) أو يرفض (يكمل التنفيذ). */
export async function providerRespondToCancel(db: Db, providerId: string, requestId: string, approve: boolean, now: Date): Promise<boolean> {
  const r = await db.request.findUnique({ where: { id: requestId }, include: { acceptedOffer: true } });
  if (!r || r.acceptedOffer?.providerId !== providerId || r.cancelRequestStatus !== "pending") return false;
  return providerTransition(
    db,
    providerId,
    requestId,
    [r.status],
    approve ? { status: "cancelled", cancelledAt: now, cancelRequestStatus: null } : { cancelRequestStatus: "declined" },
    approve ? "request.cancel_approved" : "request.cancel_declined",
    "pending",
  );
}

async function providerTransition(
  db: Db,
  providerId: string,
  requestId: string,
  from: RequestStatus[],
  data: Parameters<Db["request"]["updateMany"]>[0]["data"],
  action: string,
  cancelRequestStatus?: "pending",
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const res = await tx.request.updateMany({
      where: { id: requestId, status: { in: from }, acceptedOffer: { providerId }, ...(cancelRequestStatus ? { cancelRequestStatus } : {}) },
      data,
    });
    if (res.count !== 1) return false;
    await audit(tx, { actorUserId: null, action, entityType: "request", entityId: requestId, metadata: { providerId } });
    return true;
  });
}
