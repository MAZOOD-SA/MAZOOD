// الإلغاء والبديل والبلاغ (المرحلة ٤، الخطوة ٨).
//
// وش فيه:
//  - الإلغاء قبل البدء (مباشر): قبل القبول مجاني دائمًا، وبعد القبول تنحسب الرسوم (صفر الحين) من السياسة المحفوظة.
//  - «طلب الإلغاء» بعد البدء: المزوّد يوافق أو يرفض خلال المهلة. لو رفض أو ما رد، يتحوّل بلاغ لخدمة العملاء.
//  - اعتذار المزوّد قبل البدء: الطلب يرجع مفتوح، والعروض الثانية اللي لسا صالحة ترجع فعّالة («اختر عرض ثاني»).
//  - إعادة نشر الطلب المنتهي بدون عروض.
//  - البلاغ (نسخة أولى): يفتحه المصنع أو المزوّد أو النظام، وخدمة العملاء تكتب ملاحظات وتقرر.
//
// ⚠️ قواعد مهمة:
//  - كل تغيير حالة يمر على جدول الانتقالات (packages/shared/src/order-flow.ts) عن طريق nextStatus().
//  - كل عملية في معاملة وحدة مع قفل الطلب والطلب المنفّذ (نفس أسلوب execution.ts).
//  - **الرسوم تنحسب دائمًا من السياسة المحفوظة مع الطلب وقت القبول** (orders.cancellation_policy) بدالة وحدة
//    cancellationFee()، وتنحفظ مع الإلغاء. تغيير الإعداد ما ينطبق على طلب قديم.
//  - المزوّد اللي يعتذر ما ياخذ أي رسوم (هو اللي انسحب)، والاعتذار ينسجل في ملفه للإدارة.
import {
  cancellationFee,
  nextStatus,
  parseCancellationPolicy,
  type CancellationFee,
  type CancellationStage,
  type DisputeReason,
  type RequestStatus,
} from "@mazood/shared";
import { audit } from "./audit.ts";
import type { SessionUser } from "./auth.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { lockOpenOrderOfRequest, lockProviderOrder, providerIdFor, setRequestStatus, type LockedOrder } from "./execution.ts";
import { actorOf } from "./http.ts";
import { effectiveStatus, lockFactoryRequest, orderEvent } from "./orders.ts";
import { getSettings } from "./settings.ts";

type Party = "factory" | "provider";

/** سياسة الطلب المنفّذ المحفوظة، وسعره، ووقت قبوله: كل اللي تحتاجه حسبة الرسوم. */
async function orderTerms(db: Db, orderId: string) {
  const [o] = await db.query<{ cancellation_policy: unknown; price_halalas: string; accepted_at: Date }>(
    "SELECT cancellation_policy, price_halalas, accepted_at FROM orders WHERE id=$1",
    [orderId],
  );
  return { policy: parseCancellationPolicy(o.cancellation_policy), priceHalalas: Number(o.price_halalas), acceptedAt: new Date(o.accepted_at) };
}

/** الرسوم لو انلغى هذا الطلب المنفّذ الحين (للعرض قبل التأكيد، ولحفظها وقت الإلغاء). */
export async function feeFor(db: Db, orderId: string, payer: Party, stage: CancellationStage, now: Date): Promise<CancellationFee> {
  const terms = await orderTerms(db, orderId);
  return cancellationFee({ ...terms, payer, stage, now });
}

async function insertCancellation(
  t: Db,
  c: {
    requestId: string;
    orderId: string;
    kind: "before_start" | "after_start" | "provider_withdrawal";
    status: "done" | "pending";
    reason: string | null;
    by: string;
    at: Date;
    respondBy?: Date;
    fee: CancellationFee;
  },
): Promise<string> {
  const [row] = await t.query<{ id: string }>(
    `INSERT INTO cancellations (request_id, order_id, kind, status, reason, requested_by, requested_at, respond_by,
                                payer, fee_halalas, fee_to_provider, fee_to_factory, fee_to_platform)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      c.requestId,
      c.orderId,
      c.kind,
      c.status,
      c.reason,
      c.by,
      c.at,
      c.respondBy ?? null,
      c.fee.payer,
      c.fee.feeHalalas,
      c.fee.toProviderHalalas,
      c.fee.toFactoryHalalas,
      c.fee.toPlatformHalalas,
    ],
  );
  return row.id;
}

// ── المصنع: الإلغاء ──

/**
 * الإلغاء المباشر قبل ما يبدأ المزوّد (سؤال ١٥): من «مفتوح» أو «ينتظر موافقة المدير» أو «مقبول» أو «منتهي».
 * قبل القبول: مجاني دائمًا. بعد القبول: الرسوم من السياسة المحفوظة (صفر الحين، ومهلة سماح بعد القبول).
 * العروض الفعّالة تنرفض، والترشيح ينسحب، والطلب المنفّذ (لو انقبل عرض) ينقفل.
 */
export async function cancelBeforeStart(db: Db, user: SessionUser, factoryId: string, requestId: string, now: Date) {
  await db.tx(async (t) => {
    const r = await lockFactoryRequest(t, requestId, factoryId);
    let to: RequestStatus;
    try {
      to = nextStatus(effectiveStatus(r, now), "cancel", "factory");
    } catch {
      // بعد البدء ما ينلغي مباشرة: «طلب إلغاء» يوافق عليه المزوّد.
      throw new ApiError(409, "request_not_cancellable");
    }
    await setRequestStatus(t, requestId, to, now);
    await t.query(
      "UPDATE offers SET status='rejected', rejected_reason='request_closed', updated_at=$2 WHERE request_id=$1 AND status='active'",
      [requestId, now],
    );
    await t.query("UPDATE approvals_internal SET decision='withdrawn', decided_by=$2, decided_at=$3 WHERE request_id=$1 AND decision IS NULL", [
      requestId,
      user.id,
      now,
    ]);
    const [order] = await t.query<{ id: string }>(
      "UPDATE orders SET state='closed', cancelled_at=$2 WHERE request_id=$1 AND state='open' RETURNING id",
      [requestId, now],
    );
    let fee: CancellationFee | null = null;
    if (order) {
      fee = await feeFor(t, order.id, "factory", "after_accept", now);
      await insertCancellation(t, { requestId, orderId: order.id, kind: "before_start", status: "done", reason: null, by: user.id, at: now, fee });
    }
    const feeHalalas = fee?.feeHalalas ?? 0;
    await orderEvent(t, {
      requestId,
      orderId: order?.id,
      at: now,
      actor: { id: user.id, role: "factory" },
      event: "cancelled",
      details: { freeCancellation: feeHalalas === 0, feeHalalas },
    });
    await audit(t, actorOf(user), "request.cancelled", { type: "request", id: requestId }, { feeHalalas });
  });
}

/**
 * «طلب الإلغاء» بعد البدء. المزوّد يرد خلال المهلة (من السياسة المحفوظة مع الطلب)، وإلا يتحوّل بلاغ.
 * الرسوم تنحسب وتنحفظ الحين (المصنع يشوف المبلغ بالضبط قبل ما يرسل)، وتنطبق لو وافق المزوّد.
 */
export async function requestCancellation(db: Db, user: SessionUser, factoryId: string, requestId: string, reason: string, now: Date) {
  await db.tx(async (t) => {
    const r = await lockFactoryRequest(t, requestId, factoryId);
    // الإلغاء بعد البدء يمر على موافقة المزوّد (cancel_agreed)، فلازم يكون الانتقال هذا ممكن من الحالة الحالية.
    if (r.status !== "in_progress") throw new ApiError(409, "invalid_transition");
    const o = await lockOpenOrderOfRequest(t, requestId);
    const pending = await t.query("SELECT 1 FROM cancellations WHERE order_id=$1 AND status='pending'", [o.id]);
    if (pending.length) throw new ApiError(409, "cancellation_pending");
    const { policy } = await orderTerms(t, o.id);
    const respondBy = new Date(now.getTime() + policy.responseHours * 3600_000);
    const fee = await feeFor(t, o.id, "factory", "after_start", now);
    const id = await insertCancellation(t, { requestId, orderId: o.id, kind: "after_start", status: "pending", reason, by: user.id, at: now, respondBy, fee });
    await orderEvent(t, {
      requestId,
      orderId: o.id,
      at: now,
      actor: { id: user.id, role: "factory" },
      event: "cancellation_requested",
      details: { cancellationId: id, respondBy: respondBy.toISOString(), feeHalalas: fee.feeHalalas },
    });
    await audit(t, actorOf(user), "order.cancellation_requested", { type: "order", id: o.id }, { cancellationId: id });
  });
}

/** المصنع يسحب طلب الإلغاء (غيّر رأيه)، والتنفيذ يكمّل. */
export async function withdrawCancellationRequest(db: Db, user: SessionUser, factoryId: string, requestId: string, now: Date) {
  await db.tx(async (t) => {
    await lockFactoryRequest(t, requestId, factoryId);
    const o = await lockOpenOrderOfRequest(t, requestId);
    const [c] = await t.query<{ id: string }>(
      "UPDATE cancellations SET status='withdrawn', responded_at=$2 WHERE order_id=$1 AND status='pending' RETURNING id",
      [o.id, now],
    );
    if (!c) throw new ApiError(404, "not_found");
    await orderEvent(t, { requestId, orderId: o.id, at: now, actor: { id: user.id, role: "factory" }, event: "cancellation_withdrawn", details: { cancellationId: c.id } });
    await audit(t, actorOf(user), "order.cancellation_withdrawn", { type: "order", id: o.id }, { cancellationId: c.id });
  });
}

// ── المزوّد: الرد على طلب الإلغاء، والاعتذار ──

/** المزوّد يوافق على طلب الإلغاء (ينلغي الطلب) أو يرفضه (ينفتح بلاغ لخدمة العملاء). */
export async function respondToCancellation(db: Db, user: SessionUser, orderId: string, decision: "agree" | "decline", note: string | undefined, now: Date) {
  const providerId = await providerIdFor(db, user.id);
  return db.tx(async (t) => {
    const o = await lockProviderOrder(t, orderId, providerId);
    const [c] = await t.query<{ id: string }>("SELECT id FROM cancellations WHERE order_id=$1 AND status='pending' FOR UPDATE", [o.id]);
    if (!c) throw new ApiError(404, "not_found");
    if (decision === "agree") {
      const to = nextStatus(o.request_status, "cancel_agreed", "provider");
      await t.query("UPDATE cancellations SET status='agreed', responded_by=$2, responded_at=$3, response_note=$4 WHERE id=$1", [c.id, user.id, now, note ?? null]);
      await setRequestStatus(t, o.request_id, to, now);
      await t.query("UPDATE orders SET state='closed', cancelled_at=$2 WHERE id=$1", [o.id, now]);
      await orderEvent(t, { requestId: o.request_id, orderId: o.id, at: now, actor: { id: user.id, role: "provider" }, event: "cancellation_agreed", details: { cancellationId: c.id } });
      await audit(t, actorOf(user), "order.cancellation_agreed", { type: "order", id: o.id }, { cancellationId: c.id });
    } else {
      await t.query("UPDATE cancellations SET status='declined', responded_by=$2, responded_at=$3, response_note=$4 WHERE id=$1", [c.id, user.id, now, note ?? null]);
      await orderEvent(t, { requestId: o.request_id, orderId: o.id, at: now, actor: { id: user.id, role: "provider" }, event: "cancellation_declined", details: { cancellationId: c.id } });
      await audit(t, actorOf(user), "order.cancellation_declined", { type: "order", id: o.id }, { cancellationId: c.id });
      await openDisputeLocked(t, o, { role: "provider", userId: user.id }, "cancellation_declined", note ?? null, now, c.id);
    }
    return o.request_id;
  });
}

/**
 * المزوّد يعتذر بعد قبول عرضه وقبل البدء (الإضافة ١١).
 *  - الطلب يرجع «مفتوح للعروض»، والعروض الثانية اللي انرفضت بسبب القبول وصلاحيتها ما انتهت ترجع فعّالة،
 *    فالمصنع يشوف «اختر عرض ثاني» مباشرة. ولو مدة الطلب قربت تخلص، تتمدد مدة كاملة (requestOpenDays).
 *  - عرض المزوّد نفسه ينسحب، وما يقدر يرسل عرض جديد على نفس الطلب (عشان ما يعتذر ويرجع بسعر أعلى).
 *  - الاعتذار ينسجل في cancellations (kind = provider_withdrawal) مع رسومه من السياسة المحفوظة (صفر الحين)،
 *    والإدارة تشوف عدد اعتذارات كل مزوّد في ملفه.
 */
export async function providerWithdraw(db: Db, user: SessionUser, orderId: string, reason: string, now: Date) {
  const providerId = await providerIdFor(db, user.id);
  const { requestOpenDays } = await getSettings(db);
  return db.tx(async (t) => {
    const o = await lockProviderOrder(t, orderId, providerId);
    const to = nextStatus(o.request_status, "provider_withdraw", "provider");
    const fee = await feeFor(t, o.id, "provider", "after_accept", now);
    const [mine] = await t.query<{ offer_id: string }>("SELECT offer_id FROM orders WHERE id=$1", [o.id]);
    await t.query("UPDATE orders SET state='withdrawn', withdrawn_at=$2 WHERE id=$1", [o.id, now]);
    await t.query("UPDATE offers SET status='withdrawn', updated_at=$2 WHERE id=$1", [mine.offer_id, now]);
    const revived = await t.query<{ id: string }>(
      `UPDATE offers SET status='active', rejected_reason=NULL, updated_at=$2
        WHERE request_id=$1 AND status='rejected' AND rejected_reason='other_accepted' AND valid_until > $2 RETURNING id`,
      [o.request_id, now],
    );
    const minExpiry = new Date(now.getTime() + requestOpenDays * 86400_000);
    await t.query("UPDATE requests SET status=$2, expires_at=GREATEST(expires_at, $3), updated_at=$4 WHERE id=$1", [o.request_id, to, minExpiry, now]);
    const id = await insertCancellation(t, { requestId: o.request_id, orderId: o.id, kind: "provider_withdrawal", status: "done", reason, by: user.id, at: now, fee });
    await orderEvent(t, {
      requestId: o.request_id,
      orderId: o.id,
      at: now,
      actor: { id: user.id, role: "provider" },
      event: "provider_withdrew",
      details: { cancellationId: id, offersReopened: revived.length },
    });
    await audit(t, actorOf(user), "order.provider_withdrew", { type: "order", id: o.id }, { requestId: o.request_id, cancellationId: id });
    return o.request_id;
  });
}

// ── المصنع: إعادة النشر ──

/** إعادة نشر الطلب اللي انتهت مدته بدون قبول. يقدر يعدّل التفاصيل وهو يعيد النشر، والمدة تبدأ من جديد. */
export async function republishRequest(
  db: Db,
  user: SessionUser,
  factoryId: string,
  requestId: string,
  edits: { details?: string; area?: string; location?: string; when?: string },
  now: Date,
) {
  const { requestOpenDays } = await getSettings(db);
  await db.tx(async (t) => {
    const r = await lockFactoryRequest(t, requestId, factoryId);
    const to = nextStatus(effectiveStatus(r, now), "republish", "factory");
    const expiresAt = new Date(now.getTime() + requestOpenDays * 86400_000);
    await t.query(
      `UPDATE requests SET status=$2, expires_at=$3, updated_at=$4,
              details=COALESCE($5, details), area=COALESCE($6, area), location=COALESCE($7, location), needed_when=COALESCE($8, needed_when)
        WHERE id=$1`,
      [requestId, to, expiresAt, now, edits.details ?? null, edits.area ?? null, edits.location ?? null, edits.when ?? null],
    );
    const changed = Object.keys(edits).filter((k) => edits[k as keyof typeof edits] !== undefined);
    await orderEvent(t, { requestId, at: now, actor: { id: user.id, role: "factory" }, event: "republished", details: { changed } });
    await audit(t, actorOf(user), "request.republished", { type: "request", id: requestId }, { changed });
  });
}

// ── البلاغ ──

type Opener = { role: "factory" | "provider" | "system"; userId: string | null };

/**
 * يفتح بلاغ على طلب منفّذ مقفول (الطلب والطلب المنفّذ). الحالة تصير «فيه بلاغ»، فالتأكيد التلقائي ما يصير،
 * وطلب الإلغاء اللي ينتظر (لو فيه) ينقفل لأن خدمة العملاء هي اللي تقرر الحين.
 */
async function openDisputeLocked(
  t: Db,
  o: LockedOrder,
  by: Opener,
  reason: DisputeReason,
  details: string | null,
  now: Date,
  cancellationId: string | null = null,
) {
  const to = nextStatus(o.request_status, "open_dispute", by.role);
  await t.query("UPDATE cancellations SET status='withdrawn', responded_at=$2 WHERE order_id=$1 AND status='pending'", [o.id, now]);
  const [d] = await t.query<{ id: string; number: string }>(
    `INSERT INTO disputes (request_id, order_id, cancellation_id, opened_by_role, opened_by, reason, details, status_before, opened_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, number`,
    [o.request_id, o.id, cancellationId, by.role, by.userId, reason, details, o.request_status, now],
  );
  await setRequestStatus(t, o.request_id, to, now);
  await orderEvent(t, {
    requestId: o.request_id,
    orderId: o.id,
    at: now,
    actor: { id: by.userId, role: by.role },
    event: "dispute_opened",
    details: { disputeId: d.id, number: Number(d.number), reason },
  });
  await audit(t, { id: by.userId, role: by.role }, "dispute.opened", { type: "dispute", id: d.id }, { requestId: o.request_id, reason });
  return { id: d.id, number: Number(d.number) };
}

/** المصنع يفتح بلاغ: من «قيد التنفيذ» أو «تم التنفيذ». */
export async function factoryOpenDispute(db: Db, user: SessionUser, factoryId: string, requestId: string, reason: DisputeReason, details: string, now: Date) {
  return db.tx(async (t) => {
    await lockFactoryRequest(t, requestId, factoryId);
    const o = await lockOpenOrderOfRequest(t, requestId);
    return openDisputeLocked(t, o, { role: "factory", userId: user.id }, reason, details, now);
  });
}

/** المزوّد يفتح بلاغ على طلب ينفّذه. */
export async function providerOpenDispute(db: Db, user: SessionUser, orderId: string, reason: DisputeReason, details: string, now: Date) {
  const providerId = await providerIdFor(db, user.id);
  return db.tx(async (t) => {
    const o = await lockProviderOrder(t, orderId, providerId);
    const d = await openDisputeLocked(t, o, { role: "provider", userId: user.id }, reason, details, now);
    return { ...d, requestId: o.request_id };
  });
}

/**
 * المهمة الدورية: طلبات الإلغاء اللي عدّت مهلتها والمزوّد ما رد عليها تتحوّل بلاغ لخدمة العملاء.
 * كل طلب في معاملة لحاله، وآمنة لو اشتغلت مرتين (نعيد الفحص بعد القفل). ترجّع أرقام الطلبات.
 */
export async function cancellationTimeoutsDue(db: Db, now: Date): Promise<string[]> {
  const due = await db.query<{ id: string; request_id: string }>(
    "SELECT id, request_id FROM cancellations WHERE status='pending' AND respond_by <= $1 ORDER BY respond_by LIMIT 100",
    [now],
  );
  const done: string[] = [];
  for (const c of due) {
    const ok = await db.tx(async (t) => {
      const [r] = await t.query<{ status: RequestStatus }>("SELECT status FROM requests WHERE id=$1 FOR UPDATE", [c.request_id]);
      const [still] = await t.query<{ id: string }>("SELECT id FROM cancellations WHERE id=$1 AND status='pending' FOR UPDATE", [c.id]);
      if (!r || !still || r.status !== "in_progress") return false;
      const o = await lockOpenOrderOfRequest(t, c.request_id);
      await t.query("UPDATE cancellations SET status='timed_out', responded_at=$2 WHERE id=$1", [c.id, now]);
      await openDisputeLocked(t, o, { role: "system", userId: null }, "cancellation_no_response", null, now, c.id);
      return true;
    });
    if (ok) done.push(c.request_id);
  }
  return done;
}

/** ملاحظة من المصنع أو المزوّد على البلاغ المفتوح (توصل لخدمة العملاء). */
export async function addPartyDisputeNote(db: Db, user: SessionUser, party: Party, orderId: string, body: string, now: Date) {
  const [d] = await db.query<{ id: string }>("SELECT id FROM disputes WHERE order_id=$1 AND status='open'", [orderId]);
  if (!d) throw new ApiError(409, "no_open_dispute");
  await db.query("INSERT INTO dispute_notes (dispute_id, author_id, author_role, body, internal, created_at) VALUES ($1,$2,$3,$4,false,$5)", [
    d.id,
    user.id,
    party,
    body,
    now,
  ]);
  await audit(db, actorOf(user), "dispute.note_added", { type: "dispute", id: d.id });
}

/** ملاحظة موظف خدمة العملاء. الداخلية ما يشوفها المصنع ولا المزوّد. */
export async function addStaffDisputeNote(db: Db, user: SessionUser, disputeId: string, body: string, internal: boolean, now: Date) {
  const [d] = await db.query<{ id: string }>("SELECT id FROM disputes WHERE id=$1", [disputeId]);
  if (!d) throw new ApiError(404, "not_found");
  await db.query("INSERT INTO dispute_notes (dispute_id, author_id, author_role, body, internal, created_at) VALUES ($1,$2,'staff',$3,$4,$5)", [
    d.id,
    user.id,
    body,
    internal,
    now,
  ]);
  await audit(db, actorOf(user), "dispute.note_added", { type: "dispute", id: d.id }, { internal });
}

/**
 * قرار خدمة العملاء في البلاغ: يكتمل، أو ينلغي، أو يرجع للتنفيذ. القرار مع سببه ينكتب كملاحظة (يشوفها الطرفين)
 * وفي الخط الزمني والسجل. المبالغ (استرجاع أو رسوم) قرار منفصل في المرحلة ٦ مع إدارة النزاعات الكاملة.
 */
export async function resolveDispute(db: Db, user: SessionUser, disputeId: string, decision: "complete" | "cancel" | "resume", note: string, now: Date) {
  await db.tx(async (t) => {
    const [d] = await t.query<{ id: string; request_id: string; order_id: string; status: string }>(
      "SELECT id, request_id, order_id, status FROM disputes WHERE id=$1 FOR UPDATE",
      [disputeId],
    );
    if (!d) throw new ApiError(404, "not_found");
    if (d.status !== "open") throw new ApiError(409, "dispute_closed");
    const [r] = await t.query<{ status: RequestStatus }>("SELECT status FROM requests WHERE id=$1 FOR UPDATE", [d.request_id]);
    const action = decision === "complete" ? "resolve_complete" : decision === "cancel" ? "resolve_cancel" : "resolve_resume";
    const to = nextStatus(r.status, action, "staff");
    await setRequestStatus(t, d.request_id, to, now);
    if (decision === "complete") {
      await t.query("UPDATE orders SET state='closed', confirmed_at=$2, confirmed_by='staff' WHERE id=$1", [d.order_id, now]);
    } else if (decision === "cancel") {
      await t.query("UPDATE orders SET state='closed', cancelled_at=$2 WHERE id=$1", [d.order_id, now]);
    } else {
      // يرجع للتنفيذ: المزوّد يكمّل ويضغط «تم التنفيذ» من جديد، وموعد التأكيد التلقائي ينحسب وقتها.
      await t.query("UPDATE orders SET delivered_at=NULL, auto_confirm_at=NULL WHERE id=$1", [d.order_id]);
    }
    await t.query("UPDATE disputes SET status='closed', resolution=$2, closed_by=$3, closed_at=$4 WHERE id=$1", [d.id, decision, user.id, now]);
    await t.query("INSERT INTO dispute_notes (dispute_id, author_id, author_role, body, internal, created_at) VALUES ($1,$2,'staff',$3,false,$4)", [
      d.id,
      user.id,
      note,
      now,
    ]);
    await orderEvent(t, { requestId: d.request_id, orderId: d.order_id, at: now, actor: { id: user.id, role: "staff" }, event: "dispute_resolved", details: { disputeId: d.id, decision } });
    await audit(t, actorOf(user), "dispute.resolved", { type: "dispute", id: d.id }, { requestId: d.request_id, decision });
  });
}

// ── العرض ──

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

type CancellationRow = {
  id: string;
  kind: string;
  status: string;
  reason: string | null;
  requested_at: Date;
  respond_by: Date | null;
  responded_at: Date | null;
  response_note: string | null;
  fee_halalas: string;
  fee_to_provider: string;
  fee_to_factory: string;
  fee_to_platform: string;
};

function cancellationView(c: CancellationRow) {
  return {
    id: c.id,
    kind: c.kind,
    status: c.status,
    reason: c.reason,
    requestedAt: iso(c.requested_at),
    respondBy: iso(c.respond_by),
    respondedAt: iso(c.responded_at),
    responseNote: c.response_note,
    fee: {
      feeHalalas: Number(c.fee_halalas),
      toProviderHalalas: Number(c.fee_to_provider),
      toFactoryHalalas: Number(c.fee_to_factory),
      toPlatformHalalas: Number(c.fee_to_platform),
    },
  };
}

/** آخر طلب إلغاء بعد البدء على هذا الطلب المنفّذ (ينتظر، أو آخر واحد انرد عليه). */
export async function latestCancellationRequest(db: Db, orderId: string) {
  const [c] = await db.query<CancellationRow>(
    "SELECT * FROM cancellations WHERE order_id=$1 AND kind='after_start' ORDER BY requested_at DESC, (status = 'pending') DESC LIMIT 1",
    [orderId],
  );
  return c ? cancellationView(c) : null;
}

/** آخر اعتذار مزوّد على هذا الطلب (لو الطلب رجع مفتوح بسببه). بدون هوية المزوّد. */
export async function latestWithdrawal(db: Db, requestId: string) {
  const [c] = await db.query<{ requested_at: Date; reason: string | null }>(
    "SELECT requested_at, reason FROM cancellations WHERE request_id=$1 AND kind='provider_withdrawal' ORDER BY requested_at DESC LIMIT 1",
    [requestId],
  );
  return c ? { at: iso(c.requested_at), reason: c.reason } : null;
}

/**
 * البلاغ (المفتوح، أو آخر واحد) على طلب منفّذ، كما يشوفه طرف معيّن:
 * ملاحظاته هو، وملاحظات خدمة العملاء غير الداخلية. ما يشوف ملاحظات الطرف الثاني.
 */
export async function disputeForParty(db: Db, orderId: string, party: Party) {
  const [d] = await db.query<{
    id: string;
    number: string;
    reason: string;
    details: string | null;
    opened_by_role: string;
    status: string;
    resolution: string | null;
    opened_at: Date;
    closed_at: Date | null;
  }>("SELECT * FROM disputes WHERE order_id=$1 ORDER BY opened_at DESC, number DESC LIMIT 1", [orderId]);
  if (!d) return null;
  const notes = await db.query<{ author_role: string; body: string; created_at: Date }>(
    `SELECT author_role, body, created_at FROM dispute_notes
      WHERE dispute_id=$1 AND (author_role=$2 OR (author_role='staff' AND NOT internal)) ORDER BY created_at, id`,
    [d.id, party],
  );
  const mine = d.opened_by_role === party;
  return {
    id: d.id,
    number: Number(d.number),
    reason: d.reason,
    // تفاصيل البلاغ اللي كتبها الطرف الثاني ما تطلع (توصل لخدمة العملاء بس).
    details: mine ? d.details : null,
    openedBy: d.opened_by_role,
    status: d.status,
    resolution: d.resolution,
    openedAt: iso(d.opened_at),
    closedAt: iso(d.closed_at),
    notes: notes.map((n) => ({ by: n.author_role, body: n.body, at: iso(n.created_at) })),
  };
}

/** عدد اعتذارات المزوّد مقابل عدد مرات قبول عروضه (لملفه في لوحة الإدارة). */
export async function providerReliability(db: Db, providerId: string) {
  const [r] = await db.query<{ accepted: number; withdrawals: number }>(
    `SELECT (SELECT count(*)::int FROM orders WHERE provider_id=$1) AS accepted,
            (SELECT count(*)::int FROM cancellations c JOIN orders o ON o.id=c.order_id
              WHERE o.provider_id=$1 AND c.kind='provider_withdrawal') AS withdrawals`,
    [providerId],
  );
  return r;
}
