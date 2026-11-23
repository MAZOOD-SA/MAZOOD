// مسارات المصنع: الحساب والطلبات. كل استعلام مقيّد بمصنع الجلسة.
import { unreadCount } from "../deal-room.ts";
import {
  addFactoryMemberBody,
  createRequestBody,
  factoryActions,
  factoryProfileBody,
  parseCancellationPolicy,
  priceForFactory,
  rateOrderBody,
  uuidSchema,
  type RequestStatus,
} from "@mazood/shared";
import { events } from "../events.ts";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { activeCities, resolveCityId } from "../cities.ts";
import { getSettings } from "../settings.ts";
import { permissionsOf } from "@mazood/shared";
import { liveOffer, rejectContactInfo } from "./offers.ts";
import { actorOf, idempotent, parse, permissionMap, type Ctx, type Guards } from "../http.ts";
import { acceptOffer, effectiveStatus, nominateOffer, providerIsActive, reachFor, withdrawNomination } from "../orders.ts";
import { cancelBeforeStart, disputeForParty, feeFor, latestCancellationRequest, latestWithdrawal } from "../cancellations.ts";
import { executionDetails } from "../execution.ts";
import { publicUser } from "./auth.ts";
import { identityStatus, profileComplete, type CustomerRow } from "../identity.ts";
import { providerRating, rateOrder, ratingForRequest } from "../ratings.ts";
import { providerCommitment } from "../commitment.ts";

export const REQUEST_COLUMNS = `id, category, type_id AS "typeId", details, area, location, city_id AS "cityId",
  needed_when AS "when", status, created_at AS "createdAt", expires_at AS "expiresAt"`;

export function factoryRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  // المدن الفعّالة (عامة: ما فيها بيانات شخصية). الواجهة تبيّن اختيار المدينة لو صارت أكثر من وحدة.
  app.get("/v1/cities", async () => ({ cities: await activeCities(db) }));

  app.get("/v1/me", async (req) => {
    const user = await g.authenticate(req);
    const factory = user.factoryId ? await loadFactory(db, user.factoryId) : null;
    // الموظف: صلاحياته الفعلية (بعد تعديلات المالك) عشان الواجهة تخفي اللي ما يخصه. الخادم يفحص كل طلب بنفسه.
    const staffPermissions = user.role === "staff" && user.staffRole ? permissionsOf(user.staffRole, await permissionMap(db)) : null;
    return { user: { ...publicUser(user), staffPermissions }, factory };
  });

  // حفظ بيانات العميل حسب نوعه (منشأة أو فرد، القرار ٤١). تغيير النوع مسموح لين يرفع أول طلب.
  app.put("/v1/factory", async (req) => {
    const { user, factoryId, factoryRole } = await g.requireFactory(req);
    if (factoryRole !== "manager") throw new ApiError(403, "forbidden");
    const body = parse(factoryProfileBody, req.body);
    const cityId = await resolveCityId(db, body.cityId);
    await db.tx(async (t) => {
      const [cur] = await t.query<CustomerRow & { has_requests: boolean }>(
        `SELECT f.*, EXISTS (SELECT 1 FROM requests r WHERE r.factory_id=f.id) AS has_requests FROM factories f WHERE f.id=$1 FOR UPDATE`,
        [factoryId],
      );
      if (cur.kind && cur.kind !== body.kind && cur.has_requests) throw new ApiError(409, "kind_locked");
      if (body.kind === "individual") {
        // فرد بموظفين ما يصير: الموظفين للمنشأة بس.
        const [m] = await t.query<{ n: number }>("SELECT count(*)::int AS n FROM factory_members WHERE factory_id=$1", [factoryId]);
        if (m.n > 1) throw new ApiError(409, "individual_no_members");
        // رقم الهوية ينحفظ مشفّر. لو تغيّر الرقم، التحقق السابق ينلغي (لازم يتأكد من جديد).
        const sameId = cur.id_number_enc && cur.id_type === body.idType && ctx.box.decrypt(cur.id_number_enc) === body.idNumber;
        await t.query(
          `UPDATE factories SET kind='individual', name=$2, city_id=$3, commercial_register=NULL, vat_number=NULL,
             id_type=$4, id_number_enc=$5, id_number_last4=$6,
             identity_verified_at=CASE WHEN $7 THEN identity_verified_at END,
             identity_method=CASE WHEN $7 THEN identity_method END,
             updated_at=now() WHERE id=$1`,
          [factoryId, body.name, cityId, body.idType, sameId ? cur.id_number_enc : ctx.box.encrypt(body.idNumber), body.idNumber.slice(-4), !!sameId],
        );
      } else {
        await t.query(
          `UPDATE factories SET kind='business', name=$2, city_id=$3, commercial_register=$4, vat_number=$5,
             id_type=NULL, id_number_enc=NULL, id_number_last4=NULL, identity_verified_at=NULL, identity_method=NULL,
             updated_at=now() WHERE id=$1`,
          [factoryId, body.name, cityId, body.commercialRegister, body.vatNumber],
        );
      }
      // في السجل نكتب أن الحساب تحدّث ونوعه، بدون أرقام السجل والضريبة والهوية.
      await audit(t, actorOf(user), "factory.profile_updated", { type: "factory", id: factoryId }, { kind: body.kind });
    });
    return { factory: await loadFactory(db, factoryId) };
  });

  app.post("/v1/requests", async (req, reply) => {
    const { user, factoryId } = await g.requireFactory(req);
    const body = parse(createRequestBody, req.body);
    await assertCanRequest(db, factoryId);
    // التفاصيل والمنطقة تظهر للمزوّدين قبل القبول: ممنوع فيها أرقام أو روابط (الإضافة ٨).
    rejectContactInfo({ details: body.details, area: body.area });
    // المدينة: المطلوبة، أو مدينة المصنع، أو المدينة الوحيدة الفعّالة.
    const [f] = await db.query<{ city_id: string | null }>("SELECT city_id FROM factories WHERE id=$1", [factoryId]);
    const cityId = await resolveCityId(db, body.cityId ?? f.city_id);
    // الطلب يبقى مفتوح للعروض مدة محددة (إعداد requestOpenDays)، وبعدها «انتهى بدون عروض».
    const { requestOpenDays } = await getSettings(db);
    const expiresAt = new Date(ctx.now().getTime() + requestOpenDays * 86400_000);
    const [row] = await db.query(
      `INSERT INTO requests (factory_id, category, type_id, details, area, location, needed_when, city_id, expires_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING ${REQUEST_COLUMNS}`,
      [factoryId, body.category, body.typeId, body.details, body.area, body.location, body.when, cityId, expiresAt, ctx.now()],
    );
    await audit(db, actorOf(user), "request.created", { type: "request", id: String(row.id) }, { category: body.category });
    await events.requestCreated(db, String(row.id), ctx.now());
    // المكافأة الفورية: كم مزوّد موثّق وصله الطلب (رقم حقيقي، docs/product.md القسم ٢).
    return reply.status(201).send({ request: row, reach: await reachFor(db, body.category, cityId, ctx.now()) });
  });

  app.get("/v1/requests", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    // مع كل طلب: عدد العروض الصالحة، وكم واحد منها ما انفتح للحين (الرئيسية ترفع الطلبات اللي فيها عروض جديدة فوق).
    const rows = await db.query<RequestRow>(
      `SELECT ${REQUEST_COLUMNS},
              (SELECT count(*)::int FROM offers o WHERE o.request_id = requests.id AND ${liveOffer("$2")}) AS "offerCount",
              (SELECT count(*)::int FROM offers o WHERE o.request_id = requests.id AND ${liveOffer("$2")} AND o.first_seen_at IS NULL) AS "newOfferCount",
              -- غرفة الصفقة: رسائل المزوّد اللي ما قرأها هذا المستخدم، في الطلب المنفّذ الحالي.
              (SELECT count(*)::int FROM orders od JOIN order_messages m ON m.order_id = od.id
                WHERE od.request_id = requests.id AND od.state <> 'withdrawn' AND m.sender_role = 'provider'
                  AND m.seq > COALESCE((SELECT last_seq FROM order_message_reads rd WHERE rd.order_id = od.id AND rd.user_id = $3), 0)) AS "unreadMessages"
         FROM requests WHERE factory_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [factoryId, ctx.now(), user.id],
    );
    return { requests: rows.map((r) => withStatus(r, ctx.now())) };
  });

  // تفاصيل الطلب للمصنع: الطلب، والعروض للمقارنة، والترشيح (لو فيه)، والطلب المنفّذ بعد القبول.
  app.get("/v1/requests/:id", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    return factoryRequestView(ctx, factoryId, (req.params as { id: string }).id, user.id);
  });

  const params2 = (req: { params: unknown }) => {
    const p = req.params as { id: string; offerId: string };
    if (!uuidSchema.safeParse(p.id).success || !uuidSchema.safeParse(p.offerId).success) throw new ApiError(404, "not_found");
    return p;
  };

  // قبول عرض (للمدير، أو للمصنع اللي فيه مستخدم واحد). عملية وحدة: شوف orders.ts.
  app.post("/v1/requests/:id/offers/:offerId/accept", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const { id, offerId } = params2(req);
    return idempotent(ctx, req, `accept:${id}`, async () => {
      await acceptOffer(db, user, factoryId, id, offerId, ctx.now());
      await events.accepted(db, id, ctx.now());
      return factoryRequestView(ctx, factoryId, id, user.id);
    });
  });

  // ترشيح عرض للمدير (لموظف المصنع).
  app.post("/v1/requests/:id/offers/:offerId/nominate", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const { id, offerId } = params2(req);
    await nominateOffer(db, user, factoryId, id, offerId, ctx.now());
    await events.nominated(db, id, ctx.now());
    return factoryRequestView(ctx, factoryId, id, user.id);
  });

  // سحب الترشيح (الموظف) أو رفضه (المدير).
  app.post("/v1/requests/:id/nomination/withdraw", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = (req.params as { id: string }).id;
    await ownRequest(db, factoryId, id);
    await withdrawNomination(db, user, factoryId, id, ctx.now());
    return factoryRequestView(ctx, factoryId, id, user.id);
  });

  // موظفين المصنع: الكل يشوف القائمة، والمدير بس يضيف ويوقف (سؤال ١٦).
  app.get("/v1/factory/members", async (req) => {
    const { factoryId } = await g.requireFactory(req);
    const members = await db.query(
      `SELECT u.id AS "userId", u.phone, fm.role, fm.active, u.last_login_at IS NOT NULL AS "joined"
         FROM factory_members fm JOIN users u ON u.id = fm.user_id
        WHERE fm.factory_id=$1 ORDER BY fm.created_at`,
      [factoryId],
    );
    return { members };
  });

  app.post("/v1/factory/members", async (req, reply) => {
    const { user, factoryId, factoryRole } = await g.requireFactory(req);
    if (factoryRole !== "manager") throw new ApiError(403, "forbidden");
    const body = parse(addFactoryMemberBody, req.body);
    // الموظفين للمنشأة بس. الفرد حسابه شخصي.
    const [k] = await db.query<{ kind: string | null }>("SELECT kind FROM factories WHERE id=$1", [factoryId]);
    if (k.kind !== "business") throw new ApiError(409, "individual_no_members");
    const member = await db.tx(async (t) => {
      // رقم مسجّل من قبل (مصنع ثاني، أو مزوّد، أو موظف إدارة) ما ينضاف: كل رقم لحساب واحد.
      const existing = await t.query("SELECT 1 FROM users WHERE phone=$1", [body.phone]);
      if (existing.length) throw new ApiError(409, "phone_in_use");
      const [u] = await t.query<{ id: string }>("INSERT INTO users (phone, role) VALUES ($1,'factory') RETURNING id", [body.phone]);
      await t.query("INSERT INTO factory_members (user_id, factory_id, role, added_by) VALUES ($1,$2,$3,$4)", [u.id, factoryId, body.role, user.id]);
      await audit(t, actorOf(user), "factory.member_added", { type: "user", id: u.id }, { factoryId, role: body.role });
      return { userId: u.id, phone: body.phone, role: body.role, active: true, joined: false };
    });
    return reply.status(201).send({ member });
  });

  app.post("/v1/factory/members/:userId/:action", async (req) => {
    const { user, factoryId, factoryRole } = await g.requireFactory(req);
    if (factoryRole !== "manager") throw new ApiError(403, "forbidden");
    const { userId, action } = req.params as { userId: string; action: string };
    if (!uuidSchema.safeParse(userId).success || !["suspend", "activate"].includes(action)) throw new ApiError(404, "not_found");
    if (userId === user.id) throw new ApiError(409, "cannot_change_self");
    const active = action === "activate";
    const rows = await db.query("UPDATE factory_members SET active=$3 WHERE user_id=$1 AND factory_id=$2 RETURNING user_id", [userId, factoryId, active]);
    if (rows.length === 0) throw new ApiError(404, "not_found");
    // الموقوف: نلغي جلساته المفتوحة فورًا.
    if (!active) await db.query("UPDATE sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL", [userId, ctx.now()]);
    await audit(db, actorOf(user), active ? "factory.member_activated" : "factory.member_suspended", { type: "user", id: userId }, { factoryId });
    return { ok: true };
  });

  // الإلغاء المجاني: أي وقت قبل ما يبدأ المزوّد (جدول الانتقالات، سؤال ١٥). يقبل Idempotency-Key.
  app.post("/v1/requests/:id/cancel", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = (req.params as { id: string }).id;
    await ownRequest(db, factoryId, id);
    return idempotent(ctx, req, `cancel:${id}`, async () => {
      await cancelBeforeStart(db, user, factoryId, id, ctx.now());
      await events.toProvider(db, id, "order_cancelled", ctx.now());
      return { request: withStatus(await ownRequest(db, factoryId, id), ctx.now()) };
    });
  });
}

/** بيانات العميل كما تطلع له في /v1/me. رقم الهوية ما يطلع كامل أبدًا: آخر ٤ أرقام بس. */
export async function loadFactory(db: Db, factoryId: string) {
  const [f] = await db.query<CustomerRow & { city_ar: string | null; city_en: string | null }>(
    `SELECT f.*, c.name_ar AS city_ar, c.name_en AS city_en FROM factories f LEFT JOIN cities c ON c.id = f.city_id WHERE f.id=$1`,
    [factoryId],
  );
  return {
    id: f.id,
    kind: f.kind,
    name: f.name,
    cityId: f.city_id,
    city: f.city_id ? { ar: f.city_ar!, en: f.city_en! } : null,
    commercialRegister: f.commercial_register,
    vatNumber: f.vat_number,
    idType: f.id_type,
    idNumberMasked: f.id_number_last4 ? `******${f.id_number_last4}` : null,
    identity: { status: identityStatus(f), verifiedAt: f.identity_verified_at },
    profileComplete: profileComplete(f),
  };
}

/** يرفع طلب بس العميل اللي كمّل بياناته، والفرد بعد التحقق لو الإعداد مفعّل (القرار ٤٢). */
async function assertCanRequest(db: Db, factoryId: string) {
  const [f] = await db.query<CustomerRow>("SELECT * FROM factories WHERE id=$1", [factoryId]);
  if (!profileComplete(f)) throw new ApiError(409, "profile_incomplete");
  if (f.kind === "individual" && identityStatus(f) !== "verified") {
    const { individualRequiresVerifiedIdentity } = await getSettings(db);
    if (individualRequiresVerifiedIdentity) throw new ApiError(409, "identity_unverified");
  }
}

type RequestRow = Record<string, unknown> & { status: string; expiresAt: Date };

/**
 * تفاصيل الطلب كاملة للمصنع صاحبه: الطلب، والعروض، والترشيح، والطلب المنفّذ وتفاصيل تنفيذه
 * (الصور بروابط مؤقتة باسم viewerId، وطلبات تعديل السعر، والخط الزمني).
 */
export async function factoryRequestView(ctx: Ctx, factoryId: string, id: string, viewerId: string) {
  const { db } = ctx;
  const now = ctx.now();
  const request = withStatus(await ownRequest(db, factoryId, id), now);
  const status = request.status as RequestStatus;
  const details = await requestDetails(db, id, now);
  const orderId = details.order?.id ?? null;
  const execution = orderId ? await executionDetails(db, ctx.config.authSecret, orderId, viewerId, now) : null;
  const cancellationRequest = orderId ? await latestCancellationRequest(db, orderId) : null;
  const withdrawal = status === "awaiting_offers" ? await latestWithdrawal(db, id) : null;
  // الإلغاء الحين بكم؟ المصنع يشوف المبلغ بالضبط في نافذة التأكيد قبل ما يضغط (صفر الحين).
  // قبل القبول مجاني دائمًا (ما فيه طلب منفّذ). بعد البدء: هذي رسوم «طلب الإلغاء» لو وافق المزوّد.
  const cancellationFee =
    orderId && status === "accepted"
      ? await feeFor(db, orderId, "factory", "after_accept", now)
      : orderId && status === "in_progress"
        ? await feeFor(db, orderId, "factory", "after_start", now)
        : null;
  // قبل القبول: سياسة الإلغاء الحالية، عشان تظهر في بطاقة العرض (الرسوم واضحة قبل ما يقبل).
  const currentPolicy = details.order ? null : (await getSettings(db)).cancellation;
  const rating = status === "completed" ? await ratingForRequest(db, id) : null;
  const actions = factoryActions(status, {
    hasLiveOffers: details.offers.some((o) => o.status === "active"),
    reopenedAfterWithdrawal: !!withdrawal,
    cancellationPending: cancellationRequest?.status === "pending",
    alreadyRated: !!rating,
  });
  return {
    request,
    // كم مزوّد موثّق وصله الطلب. يظهر للمصنع وهو ينتظر العروض.
    reach: await reachFor(db, String((request as Record<string, unknown>).category), String((request as Record<string, unknown>).cityId), now),
    ...details,
    execution,
    actions,
    cancellationPolicy: currentPolicy,
    cancellationFee,
    cancellationRequest,
    withdrawal,
    dispute: orderId ? await disputeForParty(db, orderId, "factory") : null,
    rating,
    // غرفة الصفقة: كم رسالة من المزوّد ما قرأها هذا المستخدم.
    unreadMessages: orderId ? await unreadCount(db, orderId, viewerId) : 0,
  };
}

/** الحالة الفعلية (الطلب المفتوح اللي عدّت مدته = منتهي). */
function withStatus(r: RequestRow, now: Date) {
  return { ...r, status: effectiveStatus({ status: r.status, expires_at: r.expiresAt }, now) };
}

/**
 * العروض والترشيح والطلب المنفّذ لطلب معيّن (للمصنع صاحبه).
 * فتح التفاصيل يسجّل «المصنع شاف العروض» على العروض الجديدة (يظهر للمزوّد).
 * رقم جوال المزوّد ما يطلع أبدًا (القرار ٣٥): التواصل بعد القبول من غرفة الصفقة.
 */
async function requestDetails(db: Db, requestId: string, now: Date) {
  await db.query("UPDATE offers SET first_seen_at=$2 WHERE request_id=$1 AND first_seen_at IS NULL AND status='active'", [requestId, now]);
  const offers = await db.query<{
    id: string;
    provider_id: string;
    trade_name: string;
    price_halalas: string;
    duration_hours: number;
    note: string | null;
    valid_until: Date;
    status: string;
    revision: number;
    created_at: Date;
  }>(
    `SELECT o.id, o.provider_id, p.trade_name, o.price_halalas, o.duration_hours, o.note, o.valid_until, o.status, o.revision, o.created_at
       FROM offers o JOIN providers p ON p.id = o.provider_id
      WHERE o.request_id=$1 AND ((o.status='active' AND o.valid_until > $2) OR o.status='accepted')
      ORDER BY o.price_halalas ASC, o.created_at ASC`,
    [requestId, now],
  );
  const { commitment: commitmentSettings } = await getSettings(db);
  const offerViews = [];
  for (const o of offers) {
    offerViews.push({
      id: o.id,
      provider: {
        tradeName: o.trade_name,
        verified: await providerIsActive(db, o.provider_id, now),
        rating: await providerRating(db, o.provider_id),
        // «التزم بـ X من Y طلب» أو «جديد على المنصة»، وnull لو الميزة موقوفة (القرار ٣٣).
        commitment: await providerCommitment(db, o.provider_id, commitmentSettings, now),
      },
      price: priceForFactory(Number(o.price_halalas)),
      durationHours: o.duration_hours,
      note: o.note,
      validUntil: new Date(o.valid_until).toISOString(),
      status: o.status,
      revised: o.revision > 1,
      createdAt: new Date(o.created_at).toISOString(),
    });
  }
  const [ap] = await db.query<{ offer_id: string; nominated_at: Date; phone: string; user_id: string }>(
    `SELECT a.offer_id, a.nominated_at, u.phone, u.id AS user_id FROM approvals_internal a JOIN users u ON u.id = a.nominated_by
      WHERE a.request_id=$1 AND a.decision IS NULL`,
    [requestId],
  );
  const [order] = await db.query<{
    id: string;
    state: string;
    price_halalas: string;
    provider_id: string;
    trade_name: string;
    accepted_at: Date;
    started_at: Date | null;
    delivered_at: Date | null;
    confirmed_at: Date | null;
    cancellation_policy: unknown;
  }>(
    `SELECT o.id, o.state, o.price_halalas, o.provider_id, p.trade_name, o.accepted_at, o.started_at,
            o.delivered_at, o.confirmed_at, o.cancellation_policy
       FROM orders o JOIN providers p ON p.id = o.provider_id
      WHERE o.request_id=$1 AND o.state <> 'withdrawn' ORDER BY o.accepted_at DESC LIMIT 1`,
    [requestId],
  );
  return {
    offers: offerViews,
    approval: ap ? { offerId: ap.offer_id, nominatedAt: new Date(ap.nominated_at).toISOString(), nominatedBy: { userId: ap.user_id, phone: ap.phone } } : null,
    order: order
      ? {
          id: order.id,
          state: order.state,
          price: priceForFactory(Number(order.price_halalas)),
          acceptedAt: new Date(order.accepted_at).toISOString(),
          startedAt: order.started_at && new Date(order.started_at).toISOString(),
          deliveredAt: order.delivered_at && new Date(order.delivered_at).toISOString(),
          confirmedAt: order.confirmed_at && new Date(order.confirmed_at).toISOString(),
          cancellationPolicy: parseCancellationPolicy(order.cancellation_policy),
          provider: { tradeName: order.trade_name, verified: await providerIsActive(db, order.provider_id, now) },
        }
      : null,
  };
}

/** طلب يخص هذا المصنع بس. لو الطلب لمصنع ثاني نرجّع «غير موجود» (مو «ممنوع») عشان ما نكشف وجوده. */
async function ownRequest(db: Db, factoryId: string, id: string): Promise<RequestRow> {
  if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
  const rows = await db.query<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM requests WHERE id=$1 AND factory_id=$2`, [id, factoryId]);
  if (rows.length === 0) throw new ApiError(404, "not_found");
  return rows[0];
}
