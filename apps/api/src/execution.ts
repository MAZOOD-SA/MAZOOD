// التنفيذ (المرحلة ٤، الخطوة ٧): «بدأت التنفيذ»، والصور، و«تم التنفيذ»، وتأكيد الاستلام، والتأكيد التلقائي،
// وتعديل السعر.
//
// ⚠️ قواعد مهمة:
//  - كل تغيير حالة يمر على جدول الانتقالات (packages/shared/src/order-flow.ts) عن طريق nextStatus().
//  - كل عملية في معاملة وحدة، مع قفل الطلب والطلب المنفّذ، عشان ضغطتين بنفس اللحظة ما يغيّرون الحالة مرتين.
//  - العرض المقبول هو السعر النهائي (الإضافة ٩). السعر ما يتغيّر إلا بطلب من المزوّد مع السبب وموافقة المصنع،
//    وما يقدر المزوّد يضغط «تم التنفيذ» وفيه طلب تعديل سعر ينتظر، عشان السعر يكون محسوم قبل الفاتورة (المرحلة ٥).
//  - موعد التأكيد التلقائي ينحفظ مع الطلب لحظة «تم التنفيذ»، فما يتغيّر لو تغيّر الإعداد بعدين.
//  - التأكيد التلقائي ما يصير لو الطلب صار فيه بلاغ (حالته disputed، مو delivered).
import { nextStatus, type OrderPhotoStage, type PriceChangeBody, type RequestStatus } from "@mazood/shared";
import { randomUUID } from "node:crypto";
import { audit } from "./audit.ts";
import type { SessionUser } from "./auth.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { signPhotoLink } from "./files.ts";
import { actorOf } from "./http.ts";
import { activeMemberCount, lockFactoryRequest, orderEvent } from "./orders.ts";
import { getSettings } from "./settings.ts";
import type { FileStorage } from "./storage.ts";

export type LockedOrder = {
  id: string;
  request_id: string;
  provider_id: string;
  factory_id: string;
  price_halalas: string;
  state: string;
  request_status: RequestStatus;
};

/** المزوّد صاحب الحساب. الموقوف ما يقدر يغيّر شي في التنفيذ (خدمة العملاء تتابع طلباته). */
export async function providerIdFor(db: Db, userId: string): Promise<string> {
  const [p] = await db.query<{ id: string; status: string }>("SELECT id, status FROM providers WHERE user_id=$1", [userId]);
  if (!p) throw new ApiError(404, "not_found");
  if (p.status === "suspended") throw new ApiError(403, "provider_suspended");
  return p.id;
}

/** يقفل طلب منفّذ شغّال يخص هذا المزوّد، مع طلبه. طلب مزوّد ثاني: «غير موجود». */
export async function lockProviderOrder(t: Db, orderId: string, providerId: string): Promise<LockedOrder> {
  const [o] = await t.query<LockedOrder>(
    `SELECT o.id, o.request_id, o.provider_id, o.factory_id, o.price_halalas, o.state, r.status AS request_status
       FROM orders o JOIN requests r ON r.id = o.request_id
      WHERE o.id=$1 AND o.provider_id=$2 AND o.state='open'
      FOR UPDATE`,
    [orderId, providerId],
  );
  if (!o) throw new ApiError(404, "not_found");
  return o;
}

/** الطلب المنفّذ الشغّال لطلب المصنع (بعد قفل الطلب). */
export async function lockOpenOrderOfRequest(t: Db, requestId: string): Promise<LockedOrder> {
  const [o] = await t.query<LockedOrder>(
    `SELECT o.id, o.request_id, o.provider_id, o.factory_id, o.price_halalas, o.state, r.status AS request_status
       FROM orders o JOIN requests r ON r.id = o.request_id
      WHERE o.request_id=$1 AND o.state='open'
      FOR UPDATE OF o`,
    [requestId],
  );
  if (!o) throw new ApiError(409, "invalid_transition");
  return o;
}

export const setRequestStatus = (t: Db, requestId: string, to: RequestStatus, now: Date) =>
  t.query("UPDATE requests SET status=$2, updated_at=$3 WHERE id=$1", [requestId, to, now]);

/** المزوّد: «بدأت التنفيذ». من «مقبول» بس. */
export async function startJob(db: Db, user: SessionUser, orderId: string, now: Date) {
  const providerId = await providerIdFor(db, user.id);
  return db.tx(async (t) => {
    const o = await lockProviderOrder(t, orderId, providerId);
    const to = nextStatus(o.request_status, "start", "provider");
    await setRequestStatus(t, o.request_id, to, now);
    await t.query("UPDATE orders SET started_at=$2 WHERE id=$1", [o.id, now]);
    await orderEvent(t, { requestId: o.request_id, orderId: o.id, at: now, actor: { id: user.id, role: "provider" }, event: "started" });
    await audit(t, actorOf(user), "order.started", { type: "order", id: o.id }, { requestId: o.request_id });
    return o.request_id;
  });
}

/** المزوّد: «تم التنفيذ». من «قيد التنفيذ» بس، وبدون طلب تعديل سعر ينتظر. */
export async function deliverJob(db: Db, user: SessionUser, orderId: string, now: Date) {
  const providerId = await providerIdFor(db, user.id);
  const { autoConfirmHours } = await getSettings(db);
  return db.tx(async (t) => {
    const o = await lockProviderOrder(t, orderId, providerId);
    const to = nextStatus(o.request_status, "deliver", "provider");
    const pending = await t.query("SELECT 1 FROM price_changes WHERE order_id=$1 AND status='pending'", [o.id]);
    if (pending.length) throw new ApiError(409, "price_change_pending");
    // المصنع طلب الإلغاء وينتظر رد المزوّد: يرد أول (يوافق أو يرفض)، بعدين يكمّل.
    const cancelPending = await t.query("SELECT 1 FROM cancellations WHERE order_id=$1 AND status='pending'", [o.id]);
    if (cancelPending.length) throw new ApiError(409, "cancellation_pending");
    const autoConfirmAt = new Date(now.getTime() + autoConfirmHours * 3600_000);
    await setRequestStatus(t, o.request_id, to, now);
    await t.query("UPDATE orders SET delivered_at=$2, auto_confirm_at=$3 WHERE id=$1", [o.id, now, autoConfirmAt]);
    await orderEvent(t, {
      requestId: o.request_id,
      orderId: o.id,
      at: now,
      actor: { id: user.id, role: "provider" },
      event: "delivered",
      details: { autoConfirmAt: autoConfirmAt.toISOString() },
    });
    await audit(t, actorOf(user), "order.delivered", { type: "order", id: o.id }, { requestId: o.request_id });
    return o.request_id;
  });
}

/** المصنع: «أكّد الاستلام». من «تم التنفيذ» بس. أي موظف في المصنع يقدر يأكد (هو اللي استلم الشغل). */
export async function confirmReceipt(db: Db, user: SessionUser, factoryId: string, requestId: string, now: Date) {
  await db.tx(async (t) => {
    const r = await lockFactoryRequest(t, requestId, factoryId);
    const to = nextStatus(r.status as RequestStatus, "confirm", "factory");
    const o = await lockOpenOrderOfRequest(t, requestId);
    await completeOrder(t, o, to, now, "factory");
    await orderEvent(t, { requestId, orderId: o.id, at: now, actor: { id: user.id, role: "factory" }, event: "confirmed" });
    await audit(t, actorOf(user), "order.confirmed", { type: "order", id: o.id }, { requestId });
  });
}

async function completeOrder(t: Db, o: LockedOrder, to: RequestStatus, now: Date, by: "factory" | "system") {
  await setRequestStatus(t, o.request_id, to, now);
  await t.query("UPDATE orders SET state='closed', confirmed_at=$2, confirmed_by=$3 WHERE id=$1", [o.id, now, by]);
}

/**
 * التأكيد التلقائي (سؤال ١٨): الطلبات اللي حالتها «تم التنفيذ» وعدّى موعد تأكيدها تكتمل.
 * تشتغلها المهمة الدورية (jobs.ts). كل طلب في معاملة لحاله، فلو فشل واحد ما يوقف الباقي.
 * يرجّع أرقام الطلبات اللي اكتملت.
 */
export async function autoConfirmDue(db: Db, now: Date): Promise<string[]> {
  const due = await db.query<{ request_id: string }>(
    `SELECT o.request_id FROM orders o JOIN requests r ON r.id = o.request_id
      WHERE o.state='open' AND o.auto_confirm_at <= $1 AND r.status='delivered'
      ORDER BY o.auto_confirm_at LIMIT 100`,
    [now],
  );
  const done: string[] = [];
  for (const { request_id } of due) {
    const ok = await db.tx(async (t) => {
      const [r] = await t.query<{ status: RequestStatus }>("SELECT status FROM requests WHERE id=$1 FOR UPDATE", [request_id]);
      // الحالة ممكن تغيّرت بين القراءة والقفل (المصنع أكّد، أو انفتح بلاغ): نتركه.
      if (!r || r.status !== "delivered") return false;
      const to = nextStatus(r.status, "auto_confirm", "system");
      const o = await lockOpenOrderOfRequest(t, request_id);
      await completeOrder(t, o, to, now, "system");
      await orderEvent(t, { requestId: request_id, orderId: o.id, at: now, actor: { id: null, role: "system" }, event: "auto_confirmed" });
      await audit(t, { id: null, role: "system" }, "order.auto_confirmed", { type: "order", id: o.id }, { requestId: request_id });
      return true;
    });
    if (ok) done.push(request_id);
  }
  return done;
}

/** المزوّد: طلب تعديل السعر، أثناء التنفيذ بس، وطلب واحد ينتظر بالكثير. */
export async function requestPriceChange(db: Db, user: SessionUser, orderId: string, body: PriceChangeBody, now: Date) {
  const providerId = await providerIdFor(db, user.id);
  return db.tx(async (t) => {
    const o = await lockProviderOrder(t, orderId, providerId);
    if (o.request_status !== "in_progress") throw new ApiError(409, "price_change_not_allowed");
    if (body.newPriceHalalas === Number(o.price_halalas)) throw new ApiError(400, "price_unchanged");
    const pending = await t.query("SELECT 1 FROM price_changes WHERE order_id=$1 AND status='pending'", [o.id]);
    if (pending.length) throw new ApiError(409, "price_change_pending");
    const [pc] = await t.query<{ id: string }>(
      `INSERT INTO price_changes (order_id, old_price_halalas, new_price_halalas, reason, requested_by, requested_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [o.id, o.price_halalas, body.newPriceHalalas, body.reason, user.id, now],
    );
    await orderEvent(t, {
      requestId: o.request_id,
      orderId: o.id,
      at: now,
      actor: { id: user.id, role: "provider" },
      event: "price_change_requested",
      details: { priceChangeId: pc.id },
    });
    // في السجل: بدون المبالغ (سرية بين المزوّد والمصنع).
    await audit(t, actorOf(user), "order.price_change_requested", { type: "order", id: o.id }, { priceChangeId: pc.id });
    return o.request_id;
  });
}

/** المزوّد يسحب طلب تعديل السعر اللي ينتظر. */
export async function withdrawPriceChange(db: Db, user: SessionUser, orderId: string, now: Date) {
  const providerId = await providerIdFor(db, user.id);
  return db.tx(async (t) => {
    const o = await lockProviderOrder(t, orderId, providerId);
    const [pc] = await t.query<{ id: string }>(
      "UPDATE price_changes SET status='withdrawn', decided_by=$2, decided_at=$3 WHERE order_id=$1 AND status='pending' RETURNING id",
      [o.id, user.id, now],
    );
    if (!pc) throw new ApiError(404, "not_found");
    await orderEvent(t, { requestId: o.request_id, orderId: o.id, at: now, actor: { id: user.id, role: "provider" }, event: "price_change_withdrawn", details: { priceChangeId: pc.id } });
    await audit(t, actorOf(user), "order.price_change_withdrawn", { type: "order", id: o.id }, { priceChangeId: pc.id });
    return o.request_id;
  });
}

/**
 * المصنع يوافق على تعديل السعر أو يرفضه. قرار مالي، فنفس قاعدة القبول: لو المصنع فيه أكثر من مستخدم،
 * المدير بس يقرر. الموافقة تغيّر السعر المتفق عليه في الطلب المنفّذ (هو اللي تطلع عليه الفاتورة).
 */
export async function decidePriceChange(
  db: Db,
  user: SessionUser,
  factoryId: string,
  requestId: string,
  priceChangeId: string,
  decision: "approve" | "reject",
  now: Date,
) {
  if (user.factoryRole !== "manager" && (await activeMemberCount(db, factoryId)) > 1) throw new ApiError(403, "manager_approval_required");
  await db.tx(async (t) => {
    await lockFactoryRequest(t, requestId, factoryId);
    const o = await lockOpenOrderOfRequest(t, requestId);
    const [pc] = await t.query<{ id: string; new_price_halalas: string; status: string }>(
      "SELECT id, new_price_halalas, status FROM price_changes WHERE id=$1 AND order_id=$2 FOR UPDATE",
      [priceChangeId, o.id],
    );
    if (!pc) throw new ApiError(404, "not_found");
    if (pc.status !== "pending") throw new ApiError(409, "price_change_not_pending");
    const status = decision === "approve" ? "approved" : "rejected";
    await t.query("UPDATE price_changes SET status=$2, decided_by=$3, decided_at=$4 WHERE id=$1", [pc.id, status, user.id, now]);
    if (decision === "approve") await t.query("UPDATE orders SET price_halalas=$2 WHERE id=$1", [o.id, pc.new_price_halalas]);
    await orderEvent(t, { requestId, orderId: o.id, at: now, actor: { id: user.id, role: "factory" }, event: `price_change_${status}`, details: { priceChangeId: pc.id } });
    await audit(t, actorOf(user), `order.price_change_${status}`, { type: "order", id: o.id }, { priceChangeId: pc.id });
  });
}

/**
 * المزوّد يرفع صورة (حتى ٣ لكل مرحلة). صور البدء: قبل «تم التنفيذ» (مقبول أو قيد التنفيذ).
 * صور الانتهاء: أثناء التنفيذ، قبل ما يضغط «تم التنفيذ». النوع يُفحص من المحتوى في المسار قبل ما يوصل هنا.
 */
export async function addOrderPhoto(
  db: Db,
  storage: FileStorage,
  user: SessionUser,
  orderId: string,
  stage: OrderPhotoStage,
  file: { bytes: Buffer; mime: "image/jpeg" | "image/png" },
  maxPerStage: number,
  now: Date,
) {
  const providerId = await providerIdFor(db, user.id);
  const allowed: Record<OrderPhotoStage, RequestStatus[]> = { start: ["accepted", "in_progress"], delivery: ["in_progress"] };
  // نفحص قبل ما نحفظ الملف، عشان ما نخزّن ملفات ما لها مكان.
  const [pre] = await db.query<{ request_status: RequestStatus; n: number }>(
    `SELECT r.status AS request_status, (SELECT count(*)::int FROM order_photos p WHERE p.order_id=o.id AND p.stage=$3) AS n
       FROM orders o JOIN requests r ON r.id=o.request_id WHERE o.id=$1 AND o.provider_id=$2 AND o.state='open'`,
    [orderId, providerId, stage],
  );
  if (!pre) throw new ApiError(404, "not_found");
  if (!allowed[stage].includes(pre.request_status)) throw new ApiError(409, "photo_not_allowed");
  if (pre.n >= maxPerStage) throw new ApiError(409, "photos_limit", undefined, { max: maxPerStage });

  const key = randomUUID();
  await storage.put(key, file.bytes);
  return db.tx(async (t) => {
    const o = await lockProviderOrder(t, orderId, providerId);
    // نعيد الفحص بعد القفل (رفعين بنفس اللحظة).
    if (!allowed[stage].includes(o.request_status)) throw new ApiError(409, "photo_not_allowed");
    const [{ n }] = await t.query<{ n: number }>("SELECT count(*)::int AS n FROM order_photos WHERE order_id=$1 AND stage=$2", [o.id, stage]);
    if (n >= maxPerStage) throw new ApiError(409, "photos_limit", undefined, { max: maxPerStage });
    const [ph] = await t.query<{ id: string }>(
      `INSERT INTO order_photos (order_id, stage, storage_key, mime_type, size_bytes, uploaded_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [o.id, stage, key, file.mime, file.bytes.length, user.id, now],
    );
    await orderEvent(t, { requestId: o.request_id, orderId: o.id, at: now, actor: { id: user.id, role: "provider" }, event: "photo_added", details: { stage, photoId: ph.id } });
    await audit(t, actorOf(user), "order.photo_added", { type: "order", id: o.id }, { stage, photoId: ph.id });
    return { photoId: ph.id, requestId: o.request_id };
  });
}

/**
 * تفاصيل التنفيذ لطلب منفّذ: الصور (بروابط مؤقتة باسم المستخدم اللي يشوف)، وطلبات تعديل السعر، والخط الزمني.
 * المسار اللي يناديها هو اللي يتأكد إن المستخدم له حق يشوف هذا الطلب.
 */
export async function executionDetails(db: Db, secret: string, orderId: string, viewerUserId: string, now: Date) {
  const photos = await db.query<{ id: string; stage: OrderPhotoStage; created_at: Date }>(
    "SELECT id, stage, created_at FROM order_photos WHERE order_id=$1 ORDER BY created_at, id",
    [orderId],
  );
  const changes = await db.query<{
    id: string;
    old_price_halalas: string;
    new_price_halalas: string;
    reason: string;
    status: string;
    requested_at: Date;
    decided_at: Date | null;
  }>(
    "SELECT id, old_price_halalas, new_price_halalas, reason, status, requested_at, decided_at FROM price_changes WHERE order_id=$1 ORDER BY requested_at",
    [orderId],
  );
  const [o] = await db.query<{ request_id: string; auto_confirm_at: Date | null; confirmed_by: string | null }>(
    "SELECT request_id, auto_confirm_at, confirmed_by FROM orders WHERE id=$1",
    [orderId],
  );
  // الخط الزمني: الأحداث بدون هوية الأشخاص (الدور بس)، عشان ما يطلع رقم أو معرّف لطرف ثاني.
  const events = await db.query<{ at: Date; actor_role: string; event: string; details: Record<string, unknown> }>(
    "SELECT at, actor_role, event, details FROM order_events WHERE request_id=$1 ORDER BY at, id",
    [o.request_id],
  );
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return {
    autoConfirmAt: iso(o.auto_confirm_at),
    confirmedBy: o.confirmed_by,
    photos: photos.map((p) => ({ id: p.id, stage: p.stage, createdAt: iso(p.created_at), link: signPhotoLink(secret, p.id, viewerUserId, now) })),
    priceChanges: changes.map((c) => ({
      id: c.id,
      oldPriceHalalas: Number(c.old_price_halalas),
      newPriceHalalas: Number(c.new_price_halalas),
      reason: c.reason,
      status: c.status,
      requestedAt: iso(c.requested_at),
      decidedAt: iso(c.decided_at),
    })),
    timeline: events.map((e) => ({ at: iso(e.at), by: e.actor_role, event: e.event, ...(e.details.stage ? { stage: e.details.stage } : {}) })),
  };
}

/** هل هذا المستخدم يقدر يشوف صور هذا الطلب المنفّذ؟ المزوّد المنفّذ، أو موظف فعّال في المصنع صاحب الطلب. */
export async function canViewOrder(db: Db, userId: string, orderId: string): Promise<boolean> {
  const rows = await db.query(
    `SELECT 1 FROM orders o
      WHERE o.id=$2 AND (
        EXISTS (SELECT 1 FROM providers p WHERE p.id=o.provider_id AND p.user_id=$1)
        OR EXISTS (SELECT 1 FROM factory_members fm WHERE fm.factory_id=o.factory_id AND fm.user_id=$1 AND fm.active)
      )`,
    [userId, orderId],
  );
  return rows.length > 0;
}
