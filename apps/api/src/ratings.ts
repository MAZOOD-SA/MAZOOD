// التقييم (المرحلة ٤، الخطوة ٩): المصنع صاحب الطلب يقيّم المزوّد مرة وحدة، بعد ما يكتمل الطلب بس.
// «مكتمل» = الطلب في حالة completed، والطلب المنفّذ اتأكّد (من المصنع، أو تلقائيًا، أو بقرار خدمة العملاء).
import { ratingSummary, type RatingSummary } from "@mazood/shared";
import { audit } from "./audit.ts";
import type { SessionUser } from "./auth.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { actorOf } from "./http.ts";
import { lockFactoryRequest, orderEvent } from "./orders.ts";

export async function rateOrder(db: Db, user: SessionUser, factoryId: string, requestId: string, stars: number, now: Date) {
  return db.tx(async (t) => {
    // الطلب لازم يكون لنفس المصنع، وإلا «غير موجود» (ما نكشف إنه موجود لمصنع ثاني).
    const r = await lockFactoryRequest(t, requestId, factoryId);
    if (r.status !== "completed") throw new ApiError(409, "not_completed");
    const [o] = await t.query<{ id: string; provider_id: string }>(
      `SELECT id, provider_id FROM orders WHERE request_id=$1 AND state='closed' AND confirmed_at IS NOT NULL
        ORDER BY accepted_at DESC LIMIT 1`,
      [requestId],
    );
    if (!o) throw new ApiError(409, "not_completed");
    // مرة وحدة: القاعدة تضمنها (order_id فريد)، حتى لو وصل تقييمين بنفس اللحظة.
    const inserted = await t.query<{ id: string }>(
      `INSERT INTO ratings (order_id, request_id, provider_id, factory_id, stars, rated_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (order_id) DO NOTHING RETURNING id`,
      [o.id, requestId, o.provider_id, factoryId, stars, user.id, now],
    );
    if (!inserted.length) throw new ApiError(409, "already_rated");
    await orderEvent(t, { requestId, orderId: o.id, at: now, actor: { id: user.id, role: "factory" }, event: "rated", details: { stars } });
    await audit(t, actorOf(user), "order.rated", { type: "order", id: o.id }, { requestId, stars });
    return { stars, createdAt: now.toISOString() };
  });
}

/** تقييم المصنع لهذا الطلب (لو قيّم). */
export async function ratingForRequest(db: Db, requestId: string) {
  const [r] = await db.query<{ stars: number; created_at: Date }>(
    "SELECT stars, created_at FROM ratings WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1",
    [requestId],
  );
  return r ? { stars: Number(r.stars), createdAt: new Date(r.created_at).toISOString() } : null;
}

/** متوسط تقييم المزوّد وعدده (كل التقييمات). */
export async function providerRating(db: Db, providerId: string): Promise<RatingSummary> {
  const [r] = await db.query<{ total: string | null; count: number }>(
    "SELECT sum(stars)::bigint AS total, count(*)::int AS count FROM ratings WHERE provider_id=$1",
    [providerId],
  );
  return ratingSummary(Number(r.total ?? 0), r.count);
}
