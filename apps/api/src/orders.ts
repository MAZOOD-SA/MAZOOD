// منطق الطلب بعد العروض: الحالة الفعلية، والخط الزمني، والقبول.
//
// ⚠️ القبول عملية وحدة في قاعدة البيانات (كلها أو ولا شي): نقفل الطلب، ونتأكد إنه لسا مفتوح والعرض
// لسا صالح والمزوّد لسا موثّق، ثم نقبل العرض ونرفض الباقي ونفتح الطلب المنفّذ. لو ضغط اثنين «قبول»
// بنفس اللحظة، القفل يخلي واحد بس ينجح، والثاني يلقى الحالة تغيّرت فيرجع له invalid_transition.
import { nextStatus, type RequestStatus } from "@mazood/shared";
import { audit } from "./audit.ts";
import type { SessionUser } from "./auth.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { actorOf, todayRiyadh } from "./http.ts";
import { loadDocs, summarize, type ProviderRow } from "./providers.ts";
import { getSettings } from "./settings.ts";

/**
 * الحالة الفعلية للطلب: الطلب المفتوح اللي عدّت مدته «منتهي» حتى لو المهمة اللي تحدّث الحالة
 * ما اشتغلت للحين. كذا الحالة صحيحة دائمًا وقت القراءة.
 */
export function effectiveStatus(r: { status: string; expires_at: Date | string }, now: Date): RequestStatus {
  if (r.status === "awaiting_offers" && new Date(r.expires_at) <= now) return "expired";
  return r.status as RequestStatus;
}

export async function orderEvent(
  db: Db,
  e: { requestId: string; orderId?: string | null; at: Date; actor: { id: string | null; role: string }; event: string; details?: Record<string, unknown> },
) {
  await db.query(
    "INSERT INTO order_events (request_id, order_id, at, actor_id, actor_role, event, details) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [e.requestId, e.orderId ?? null, e.at, e.actor.id, e.actor.role, e.event, JSON.stringify(e.details ?? {})],
  );
}

/** المزوّد لسا يقدر يشتغل؟ (موثّق ومستنداته سارية، مو موقوف) */
export async function providerIsActive(db: Db, providerId: string, now: Date): Promise<boolean> {
  const [p] = await db.query<ProviderRow>("SELECT * FROM providers WHERE id=$1", [providerId]);
  if (!p) return false;
  return summarize(p, await loadDocs(db, p.id), todayRiyadh(now)).effectiveVerified;
}

/**
 * كم مزوّد موثّق فعليًا يوصله طلب في هذا القسم وهذي المدينة («وصل طلبك لـ ٨ مزوّدين موثّقين»).
 * رقم حقيقي، والموثّق اللي انتهى مستنده ما ينحسب (نفس providerIsActive).
 */
export async function reachFor(db: Db, category: string, cityId: string, now: Date): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `SELECT p.id FROM providers p
      WHERE p.status = 'verified' AND $1 = ANY(p.categories)
        AND EXISTS (SELECT 1 FROM provider_cities pc WHERE pc.provider_id = p.id AND pc.city_id = $2)`,
    [category, cityId],
  );
  let n = 0;
  for (const r of rows) if (await providerIsActive(db, r.id, now)) n++;
  return n;
}

type LockedRequest = { id: string; factory_id: string; status: string; expires_at: Date };

/** يقفل طلب المصنع للتعديل. طلب مصنع ثاني: «غير موجود». */
export async function lockFactoryRequest(t: Db, requestId: string, factoryId: string): Promise<LockedRequest> {
  const [r] = await t.query<LockedRequest>("SELECT id, factory_id, status, expires_at FROM requests WHERE id=$1 AND factory_id=$2 FOR UPDATE", [
    requestId,
    factoryId,
  ]);
  if (!r) throw new ApiError(404, "not_found");
  return r;
}

/** عرض صالح للقبول أو الترشيح على هذا الطلب. */
async function lockLiveOffer(t: Db, requestId: string, offerId: string, now: Date) {
  const [o] = await t.query<{ id: string; provider_id: string; price_halalas: string; status: string; valid_until: Date }>(
    "SELECT id, provider_id, price_halalas, status, valid_until FROM offers WHERE id=$1 AND request_id=$2 FOR UPDATE",
    [offerId, requestId],
  );
  if (!o) throw new ApiError(404, "not_found");
  if (o.status !== "active" || new Date(o.valid_until) <= now) throw new ApiError(409, "offer_not_active");
  if (!(await providerIsActive(t, o.provider_id, now))) throw new ApiError(409, "provider_unavailable");
  return o;
}

/** كم موظف فعّال في المصنع. لو أكثر من واحد، الموظف (member) يرشّح والمدير يوافق. */
export async function activeMemberCount(db: Db, factoryId: string): Promise<number> {
  const [{ n }] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM factory_members WHERE factory_id=$1 AND active", [factoryId]);
  return n;
}

export async function acceptOffer(db: Db, user: SessionUser, factoryId: string, requestId: string, offerId: string, now: Date) {
  if (user.factoryRole !== "manager" && (await activeMemberCount(db, factoryId)) > 1) {
    throw new ApiError(403, "manager_approval_required");
  }
  const { cancellation } = await getSettings(db);
  return db.tx(async (t) => {
    const r = await lockFactoryRequest(t, requestId, factoryId);
    const to = nextStatus(effectiveStatus(r, now), "accept", "factory");
    const o = await lockLiveOffer(t, requestId, offerId, now);

    await t.query("UPDATE offers SET status='accepted', updated_at=$2 WHERE id=$1", [o.id, now]);
    await t.query(
      `UPDATE offers SET status='rejected', rejected_reason='other_accepted', updated_at=$3
        WHERE request_id=$1 AND id<>$2 AND status='active'`,
      [requestId, o.id, now],
    );
    await t.query("UPDATE requests SET status=$2, updated_at=$3 WHERE id=$1", [requestId, to, now]);
    const [order] = await t.query<{ id: string }>(
      `INSERT INTO orders (request_id, offer_id, provider_id, factory_id, price_halalas, cancellation_policy, accepted_by, accepted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [requestId, o.id, o.provider_id, factoryId, o.price_halalas, JSON.stringify(cancellation), user.id, now],
    );
    // لو فيه ترشيح ينتظر: نفس العرض = موافقة المدير، عرض ثاني = المدير اختار غيره.
    await t.query(
      `UPDATE approvals_internal SET decision = CASE WHEN offer_id=$2 THEN 'approved' ELSE 'rejected' END, decided_by=$3, decided_at=$4
        WHERE request_id=$1 AND decision IS NULL`,
      [requestId, o.id, user.id, now],
    );
    await orderEvent(t, { requestId, orderId: order.id, at: now, actor: { id: user.id, role: "factory" }, event: "accepted", details: { offerId: o.id } });
    await audit(t, actorOf(user), "request.accepted", { type: "request", id: requestId }, { offerId: o.id, orderId: order.id });
    return order.id;
  });
}

export async function nominateOffer(db: Db, user: SessionUser, factoryId: string, requestId: string, offerId: string, now: Date) {
  // الترشيح للموظف بس، في مصنع فيه أكثر من مستخدم. المدير (أو المصنع بمستخدم واحد) يقبل مباشرة.
  if (user.factoryRole !== "member" || (await activeMemberCount(db, factoryId)) < 2) throw new ApiError(409, "nomination_not_needed");
  await db.tx(async (t) => {
    const r = await lockFactoryRequest(t, requestId, factoryId);
    const to = nextStatus(effectiveStatus(r, now), "nominate", "factory");
    await lockLiveOffer(t, requestId, offerId, now);
    await t.query("UPDATE requests SET status=$2, updated_at=$3 WHERE id=$1", [requestId, to, now]);
    await t.query("INSERT INTO approvals_internal (request_id, offer_id, nominated_by, nominated_at) VALUES ($1,$2,$3,$4)", [
      requestId,
      offerId,
      user.id,
      now,
    ]);
    await orderEvent(t, { requestId, at: now, actor: { id: user.id, role: "factory" }, event: "nominated", details: { offerId } });
    await audit(t, actorOf(user), "request.nominated", { type: "request", id: requestId }, { offerId });
  });
}

/** الموظف يسحب ترشيحه، أو المدير يرفضه. الطلب يرجع مفتوح للعروض. */
export async function withdrawNomination(db: Db, user: SessionUser, factoryId: string, requestId: string, now: Date) {
  await db.tx(async (t) => {
    const r = await lockFactoryRequest(t, requestId, factoryId);
    const to = nextStatus(effectiveStatus(r, now), "withdraw_nomination", "factory");
    const decision = user.factoryRole === "manager" ? "rejected" : "withdrawn";
    await t.query("UPDATE approvals_internal SET decision=$2, decided_by=$3, decided_at=$4 WHERE request_id=$1 AND decision IS NULL", [
      requestId,
      decision,
      user.id,
      now,
    ]);
    await t.query("UPDATE requests SET status=$2, updated_at=$3 WHERE id=$1", [requestId, to, now]);
    await orderEvent(t, { requestId, at: now, actor: { id: user.id, role: "factory" }, event: `nomination_${decision}` });
    await audit(t, actorOf(user), `request.nomination_${decision}`, { type: "request", id: requestId });
  });
}

// الإلغاء (قبل البدء وبعده)، واعتذار المزوّد، والبلاغ: في cancellations.ts.
