// مسارات المصنع: الحساب والطلبات. كل استعلام مقيّد بمصنع الجلسة.
import { addFactoryMemberBody, createRequestBody, factoryProfileBody, priceForFactory, uuidSchema } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { activeCities, resolveCityId } from "../cities.ts";
import { getSettings } from "../settings.ts";
import { rejectContactInfo } from "./offers.ts";
import { actorOf, idempotent, parse, type Ctx, type Guards } from "../http.ts";
import { acceptOffer, cancelBeforeStart, effectiveStatus, nominateOffer, providerIsActive, withdrawNomination } from "../orders.ts";
import { publicUser } from "./auth.ts";

export const REQUEST_COLUMNS = `id, category, type_id AS "typeId", details, area, location, city_id AS "cityId",
  needed_when AS "when", status, created_at AS "createdAt", expires_at AS "expiresAt"`;

export function factoryRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  // المدن الفعّالة (عامة: ما فيها بيانات شخصية). الواجهة تبيّن اختيار المدينة لو صارت أكثر من وحدة.
  app.get("/v1/cities", async () => ({ cities: await activeCities(db) }));

  app.get("/v1/me", async (req) => {
    const user = await g.authenticate(req);
    const factory = user.factoryId ? await loadFactory(db, user.factoryId) : null;
    return { user: publicUser(user), factory };
  });

  app.put("/v1/factory", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const body = parse(factoryProfileBody, req.body);
    const cityId = await resolveCityId(db, body.cityId);
    await db.query(
      `UPDATE factories SET name=$2, city_id=$3, commercial_register=$4, vat_number=$5, updated_at=now() WHERE id=$1`,
      [factoryId, body.name, cityId, body.commercialRegister, body.vatNumber],
    );
    // في السجل نكتب أن الحساب تحدّث، بدون أرقام السجل والضريبة.
    await audit(db, actorOf(user), "factory.profile_updated", { type: "factory", id: factoryId });
    return { factory: await loadFactory(db, factoryId) };
  });

  app.post("/v1/requests", async (req, reply) => {
    const { user, factoryId } = await g.requireFactory(req);
    const body = parse(createRequestBody, req.body);
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
    return reply.status(201).send({ request: row });
  });

  app.get("/v1/requests", async (req) => {
    const { factoryId } = await g.requireFactory(req);
    const rows = await db.query<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM requests WHERE factory_id = $1 ORDER BY created_at DESC LIMIT 200`, [
      factoryId,
    ]);
    return { requests: rows.map((r) => withStatus(r, ctx.now())) };
  });

  // تفاصيل الطلب للمصنع: الطلب، والعروض للمقارنة، والترشيح (لو فيه)، والطلب المنفّذ بعد القبول.
  app.get("/v1/requests/:id", async (req) => {
    const { factoryId } = await g.requireFactory(req);
    const id = (req.params as { id: string }).id;
    const request = withStatus(await ownRequest(db, factoryId, id), ctx.now());
    return { request, ...(await requestDetails(db, id, ctx.now())) };
  });

  const params2 = (req: { params: unknown }) => {
    const p = req.params as { id: string; offerId: string };
    if (!uuidSchema.safeParse(p.id).success || !uuidSchema.safeParse(p.offerId).success) throw new ApiError(404, "not_found");
    return p;
  };
  const detailsResponse = async (factoryId: string, id: string) => ({
    request: withStatus(await ownRequest(db, factoryId, id), ctx.now()),
    ...(await requestDetails(db, id, ctx.now())),
  });

  // قبول عرض (للمدير، أو للمصنع اللي فيه مستخدم واحد). عملية وحدة: شوف orders.ts.
  app.post("/v1/requests/:id/offers/:offerId/accept", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const { id, offerId } = params2(req);
    return idempotent(ctx, req, `accept:${id}`, async () => {
      await acceptOffer(db, user, factoryId, id, offerId, ctx.now());
      return detailsResponse(factoryId, id);
    });
  });

  // ترشيح عرض للمدير (لموظف المصنع).
  app.post("/v1/requests/:id/offers/:offerId/nominate", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const { id, offerId } = params2(req);
    await nominateOffer(db, user, factoryId, id, offerId, ctx.now());
    return detailsResponse(factoryId, id);
  });

  // سحب الترشيح (الموظف) أو رفضه (المدير).
  app.post("/v1/requests/:id/nomination/withdraw", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = (req.params as { id: string }).id;
    await ownRequest(db, factoryId, id);
    await withdrawNomination(db, user, factoryId, id, ctx.now());
    return detailsResponse(factoryId, id);
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
      return { request: withStatus(await ownRequest(db, factoryId, id), ctx.now()) };
    });
  });
}

async function loadFactory(db: Db, factoryId: string) {
  const [f] = await db.query<{
    id: string;
    name: string | null;
    cityId: string | null;
    cityAr: string | null;
    cityEn: string | null;
    commercialRegister: string | null;
    vatNumber: string | null;
  }>(
    `SELECT f.id, f.name, f.city_id AS "cityId", c.name_ar AS "cityAr", c.name_en AS "cityEn",
            f.commercial_register AS "commercialRegister", f.vat_number AS "vatNumber"
       FROM factories f LEFT JOIN cities c ON c.id = f.city_id WHERE f.id=$1`,
    [factoryId],
  );
  const { cityAr, cityEn, ...rest } = f;
  return {
    ...rest,
    city: f.cityId ? { ar: cityAr!, en: cityEn! } : null,
    profileComplete: !!(f.name && f.cityId && f.commercialRegister && f.vatNumber),
  };
}

type RequestRow = Record<string, unknown> & { status: string; expiresAt: Date };

/** الحالة الفعلية (الطلب المفتوح اللي عدّت مدته = منتهي). */
function withStatus(r: RequestRow, now: Date) {
  return { ...r, status: effectiveStatus({ status: r.status, expires_at: r.expiresAt }, now) };
}

/**
 * العروض والترشيح والطلب المنفّذ لطلب معيّن (للمصنع صاحبه).
 * فتح التفاصيل يسجّل «المصنع شاف العروض» على العروض الجديدة (يظهر للمزوّد).
 * بيانات تواصل المزوّد ما تطلع إلا بعد القبول.
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
  const offerViews = [];
  for (const o of offers) {
    offerViews.push({
      id: o.id,
      provider: { tradeName: o.trade_name, verified: await providerIsActive(db, o.provider_id, now), rating: null },
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
    provider_phone: string;
    accepted_at: Date;
    started_at: Date | null;
    delivered_at: Date | null;
    confirmed_at: Date | null;
    cancellation_policy: unknown;
  }>(
    `SELECT o.id, o.state, o.price_halalas, o.provider_id, p.trade_name, u.phone AS provider_phone, o.accepted_at, o.started_at,
            o.delivered_at, o.confirmed_at, o.cancellation_policy
       FROM orders o JOIN providers p ON p.id = o.provider_id JOIN users u ON u.id = p.user_id
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
          cancellationPolicy: order.cancellation_policy,
          provider: { tradeName: order.trade_name, contactPhone: order.provider_phone, verified: await providerIsActive(db, order.provider_id, now) },
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
