// مسارات المزوّد للطلبات المتاحة والعروض.
//
// القواعد (docs/plans/phase-4.md):
//  - مزوّد موثّق فعليًا بس (provider-access.ts).
//  - يشوف الطلبات المفتوحة في أقسامه ومدنه بس. كل مزوّد مؤهّل يشوف الطلب بنفس اللحظة (عدالة: ما نبيع أولوية).
//  - قبل القبول: القسم والنوع والتفاصيل والمدينة والمنطقة والموعد. **ما يطلع اسم المصنع ولا الموقع بالضبط**.
//  - يشوف **عدد** العروض بس، مو أسعار غيره (سؤال ٤-٢).
import { CATEGORY_IDS, containsContactInfo, offerBody, uuidSchema, type OfferStatus } from "@mazood/shared";
import { events } from "../events.ts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { actorOf, parse, type Ctx, type Guards } from "../http.ts";
import { requireActiveProvider, type ActiveProvider } from "../provider-access.ts";
import { getSettings } from "../settings.ts";

const listQuery = z.object({ category: z.enum(CATEGORY_IDS as [string, ...string[]]).optional() }).strict();

/**
 * الأعمدة اللي تطلع للمزوّد قبل القبول. ممنوع نضيف هنا factory_id أو location أو اسم العميل.
 * customerKind: «منشأة» أو «فرد» بس (القرار ٤١)، عشان المزوّد يعرف وين بيشتغل (موقع شغل أو بيت).
 */
const OPEN_REQUEST_COLUMNS = `r.id, r.category, r.type_id AS "typeId", r.details, r.area, r.city_id AS "cityId",
  r.needed_when AS "when", r.created_at AS "createdAt", r.expires_at AS "expiresAt",
  COALESCE((SELECT f.kind FROM factories f WHERE f.id = r.factory_id), 'business') AS "customerKind"`;

/** شرط SQL للعروض اللي تنحسب: فعّالة وصلاحيتها ما انتهت. nowParam: رقم المعامل اللي فيه الوقت (مثل $1). */
export const liveOffer = (nowParam: string) => `o.status = 'active' AND o.valid_until > ${nowParam}`;

async function openRequestsFor(db: Db, p: ActiveProvider, now: Date, maxOffers: number, opts: { id?: string; category?: string }) {
  return db.query(
    `SELECT ${OPEN_REQUEST_COLUMNS},
            (SELECT count(*)::int FROM offers o WHERE o.request_id = r.id AND ${liveOffer("$1")}) AS "offerCount",
            (SELECT o.id FROM offers o WHERE o.request_id = r.id AND o.provider_id = $2 AND o.status = 'active' LIMIT 1) AS "myOfferId"
       FROM requests r
      WHERE r.status = 'awaiting_offers' AND r.expires_at > $1
        AND r.category = ANY($3::text[]) AND r.city_id = ANY($4::text[])
        -- المزوّد اللي اعتذر عن الطلب ما يشوفه مرة ثانية (عشان ما يعتذر ويرجع بسعر أعلى).
        AND NOT EXISTS (SELECT 1 FROM orders w WHERE w.request_id = r.id AND w.provider_id = $2 AND w.state = 'withdrawn')
        AND ($5::uuid IS NULL OR r.id = $5::uuid)
        AND ($6::text IS NULL OR r.category = $6::text)
      ORDER BY r.created_at DESC
      LIMIT 200`,
    [now, p.id, p.categories, p.cityIds, opts.id ?? null, opts.category ?? null],
  ).then((rows) =>
    rows
      // بعد ما يكتمل العدد (الافتراضي ١٠) الطلب يختفي، إلا عن المزوّد اللي عنده عرض عليه.
      .filter((r) => (r.offerCount as number) < maxOffers || r.myOfferId)
      .map(({ myOfferId, ...r }) => ({ ...r, myOffer: myOfferId ? { id: myOfferId } : null })),
  );
}

type OfferRow = {
  id: string;
  request_id: string;
  provider_id: string;
  price_halalas: string | number;
  duration_hours: number;
  note: string | null;
  valid_until: Date;
  status: OfferStatus;
  revision: number;
  first_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/** شكل العرض للمزوّد صاحبه. «فعّال» وصلاحيته انتهت يطلع «منتهي». */
export function offerView(o: OfferRow, now: Date) {
  const expired = o.status === "active" && new Date(o.valid_until) <= now;
  return {
    id: o.id,
    requestId: o.request_id,
    // bigint يرجع من القاعدة كنص أحيانًا. الحد الأقصى (١٠٠ مليار هللة) أقل من حدود الأرقام الصحيحة في JS.
    priceHalalas: Number(o.price_halalas),
    durationHours: o.duration_hours,
    note: o.note,
    validUntil: new Date(o.valid_until).toISOString(),
    status: expired ? ("expired" as const) : o.status,
    revision: o.revision,
    seenByFactory: !!o.first_seen_at,
    createdAt: new Date(o.created_at).toISOString(),
    updatedAt: new Date(o.updated_at).toISOString(),
  };
}

/** يرفض أي حقل فيه رقم جوال أو رابط أو إيميل (الإضافة ٨)، ويقول وش الحقل عشان الواجهة توضّح. */
export function rejectContactInfo(fields: Record<string, string | undefined>) {
  for (const [field, value] of Object.entries(fields)) {
    if (containsContactInfo(value)) throw new ApiError(400, "contact_info_not_allowed", undefined, { field });
  }
}

export function offerRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  /** صلاحية العرض: اختيار المزوّد، أو الإعداد. أكثر من الإعداد ممنوع. */
  async function validityHours(requested: number | undefined): Promise<number> {
    const { offerValidityHours } = await getSettings(db);
    if (requested !== undefined && requested > offerValidityHours) throw new ApiError(400, "validity_too_long", undefined, { max: offerValidityHours });
    return requested ?? offerValidityHours;
  }

  /** عرض يخص هذا المزوّد (مقفول للتعديل)، مع حالة طلبه. عرض مزوّد ثاني: «غير موجود». */
  async function ownOfferForUpdate(t: Db, offerId: string, providerId: string) {
    if (!uuidSchema.safeParse(offerId).success) throw new ApiError(404, "not_found");
    const [o] = await t.query<OfferRow & { request_status: string }>(
      `SELECT o.*, r.status AS request_status FROM offers o JOIN requests r ON r.id = o.request_id
        WHERE o.id=$1 AND o.provider_id=$2 FOR UPDATE OF o`,
      [offerId, providerId],
    );
    if (!o) throw new ApiError(404, "not_found");
    return o;
  }

  app.get("/v1/provider/requests", async (req) => {
    const user = await g.requireProviderUser(req);
    const q = parse(listQuery, req.query);
    const p = await requireActiveProvider(db, user.id, ctx.now());
    const { maxOffersPerRequest } = await getSettings(db);
    return { requests: await openRequestsFor(db, p, ctx.now(), maxOffersPerRequest, { category: q.category }) };
  });

  app.get("/v1/provider/requests/:id", async (req) => {
    const user = await g.requireProviderUser(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
    const p = await requireActiveProvider(db, user.id, ctx.now());
    const { maxOffersPerRequest } = await getSettings(db);
    const [row] = await openRequestsFor(db, p, ctx.now(), maxOffersPerRequest, { id });
    // طلب برّا أقسامه أو مدنه، أو مقفل: «غير موجود» عشان ما نكشف شي عنه.
    if (!row) throw new ApiError(404, "not_found");
    return { request: row };
  });

  // إرسال عرض. كل الفحوص داخل معاملة وحدة مع قفل الطلب، عشان ما يعدّي الحد لو وصلت عروض بنفس اللحظة.
  app.post("/v1/provider/requests/:id/offers", async (req, reply) => {
    const user = await g.requireProviderUser(req);
    const id = (req.params as { id: string }).id;
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
    const body = parse(offerBody, req.body);
    rejectContactInfo({ note: body.note });
    const now = ctx.now();
    const p = await requireActiveProvider(db, user.id, now);
    const hours = await validityHours(body.validHours);
    const { maxOffersPerRequest } = await getSettings(db);

    const row = await db.tx(async (t) => {
      const [r] = await t.query<{ category: string; city_id: string; status: string; expires_at: Date }>(
        "SELECT category, city_id, status, expires_at FROM requests WHERE id=$1 FOR UPDATE",
        [id],
      );
      const visible = r && r.status === "awaiting_offers" && new Date(r.expires_at) > now && p.categories.includes(r.category) && p.cityIds.includes(r.city_id);
      if (!visible) throw new ApiError(404, "not_found");
      const withdrew = await t.query("SELECT 1 FROM orders WHERE request_id=$1 AND provider_id=$2 AND state='withdrawn'", [id, p.id]);
      if (withdrew.length) throw new ApiError(404, "not_found");
      // عرضه القديم اللي انتهت صلاحيته ما يمنعه يرسل جديد.
      await t.query(
        "UPDATE offers SET status='expired', updated_at=$3 WHERE request_id=$1 AND provider_id=$2 AND status='active' AND valid_until <= $3",
        [id, p.id, now],
      );
      const mine = await t.query("SELECT 1 FROM offers WHERE request_id=$1 AND provider_id=$2 AND status='active'", [id, p.id]);
      if (mine.length) throw new ApiError(409, "offer_exists");
      const [{ n }] = await t.query<{ n: number }>(`SELECT count(*)::int AS n FROM offers o WHERE o.request_id=$1 AND ${liveOffer("$2")}`, [id, now]);
      if (n >= maxOffersPerRequest) throw new ApiError(409, "offers_full");
      const [o] = await t.query<OfferRow>(
        `INSERT INTO offers (request_id, provider_id, price_halalas, duration_hours, note, valid_until, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
        [id, p.id, body.priceHalalas, body.durationHours, body.note || null, new Date(now.getTime() + hours * 3600_000), now],
      );
      // في السجل: بدون السعر (سري بين المزوّد والمصنع)، يكفي إنه أرسل عرض.
      await audit(t, actorOf(user), "offer.submitted", { type: "offer", id: o.id }, { requestId: id });
      return o;
    });
    await events.offerSent(db, id, now);
    return reply.status(201).send({ offer: offerView(row, now) });
  });

  // تعديل العرض: قبل القبول بس. النسخة القديمة تنحفظ، والمصنع يشوف «تم تعديل العرض».
  app.put("/v1/provider/offers/:id", async (req) => {
    const user = await g.requireProviderUser(req);
    const body = parse(offerBody, req.body);
    rejectContactInfo({ note: body.note });
    const now = ctx.now();
    const p = await requireActiveProvider(db, user.id, now);
    const hours = await validityHours(body.validHours);
    const row = await db.tx(async (t) => {
      const o = await ownOfferForUpdate(t, (req.params as { id: string }).id, p.id);
      if (o.status !== "active" || new Date(o.valid_until) <= now) throw new ApiError(409, "offer_not_active");
      if (o.request_status !== "awaiting_offers") throw new ApiError(409, "offer_locked");
      await t.query(
        `INSERT INTO offer_revisions (offer_id, revision, price_halalas, duration_hours, note, valid_until, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [o.id, o.revision, o.price_halalas, o.duration_hours, o.note, o.valid_until, now],
      );
      const [u] = await t.query<OfferRow>(
        `UPDATE offers SET price_halalas=$2, duration_hours=$3, note=$4, valid_until=$5, revision=revision+1, updated_at=$6
          WHERE id=$1 RETURNING *`,
        [o.id, body.priceHalalas, body.durationHours, body.note || null, new Date(now.getTime() + hours * 3600_000), now],
      );
      await audit(t, actorOf(user), "offer.revised", { type: "offer", id: o.id }, { requestId: o.request_id, revision: u.revision });
      return u;
    });
    return { offer: offerView(row, now) };
  });

  // سحب العرض: قبل القبول بس.
  app.post("/v1/provider/offers/:id/withdraw", async (req) => {
    const user = await g.requireProviderUser(req);
    const [p] = await db.query<{ id: string }>("SELECT id FROM providers WHERE user_id=$1", [user.id]);
    if (!p) throw new ApiError(404, "not_found");
    const now = ctx.now();
    const row = await db.tx(async (t) => {
      const o = await ownOfferForUpdate(t, (req.params as { id: string }).id, p.id);
      if (o.status !== "active") throw new ApiError(409, "offer_not_active");
      if (!["awaiting_offers", "pending_approval"].includes(o.request_status)) throw new ApiError(409, "offer_locked");
      // العرض المرشّح ينتظر موافقة مدير المصنع: ما ينسحب في هذي اللحظة.
      const nominated = await t.query("SELECT 1 FROM approvals_internal WHERE offer_id=$1 AND decision IS NULL", [o.id]);
      if (nominated.length) throw new ApiError(409, "offer_locked");
      const [u] = await t.query<OfferRow>("UPDATE offers SET status='withdrawn', updated_at=$2 WHERE id=$1 RETURNING *", [o.id, now]);
      await audit(t, actorOf(user), "offer.withdrawn", { type: "offer", id: o.id }, { requestId: o.request_id });
      return u;
    });
    return { offer: offerView(row, now) };
  });

  // «عروضي»: عروض المزوّد نفسه بس، مع ملخص الطلب (بدون اسم المصنع وموقعه قبل القبول).
  app.get("/v1/provider/offers", async (req) => {
    const user = await g.requireProviderUser(req);
    const [p] = await db.query<{ id: string }>("SELECT id FROM providers WHERE user_id=$1", [user.id]);
    if (!p) return { offers: [] };
    const now = ctx.now();
    const rows = await db.query<OfferRow & { r_category: string; r_type_id: string; r_area: string | null; r_when: string; r_status: string }>(
      `SELECT o.*, r.category AS r_category, r.type_id AS r_type_id, r.area AS r_area, r.needed_when AS r_when, r.status AS r_status
         FROM offers o JOIN requests r ON r.id = o.request_id
        WHERE o.provider_id = $1 ORDER BY o.created_at DESC LIMIT 200`,
      [p.id],
    );
    return {
      offers: rows.map((o) => ({
        ...offerView(o, now),
        request: { id: o.request_id, category: o.r_category, typeId: o.r_type_id, area: o.r_area, when: o.r_when, status: o.r_status },
      })),
    };
  });
  // «شغلي»: الطلبات اللي انقبل فيها عرض المزوّد. هنا بس يشوف اسم المصنع والموقع بالضبط ورقم التواصل
  // (رقم الشخص اللي قبل العرض)، لأن العرض انقبل (سؤال ٤-٤).
  app.get("/v1/provider/jobs", async (req) => {
    const user = await g.requireProviderUser(req);
    const [p] = await db.query<{ id: string }>("SELECT id FROM providers WHERE user_id=$1", [user.id]);
    if (!p) return { jobs: [] };
    const rows = await db.query<Record<string, unknown> & { price_halalas: string; factory_name: string | null; factory_kind: string; factory_phone: string }>(
      `SELECT o.id AS "orderId", o.request_id AS "requestId", r.status, r.category, r.type_id AS "typeId", r.details, r.area,
              r.location, r.needed_when AS "when", o.price_halalas, o.accepted_at AS "acceptedAt", o.started_at AS "startedAt",
              o.delivered_at AS "deliveredAt", o.cancellation_policy AS "cancellationPolicy",
              f.name AS factory_name, COALESCE(f.kind, 'business') AS factory_kind, u.phone AS factory_phone
         FROM orders o
         JOIN requests r ON r.id = o.request_id
         JOIN factories f ON f.id = o.factory_id
         JOIN users u ON u.id = o.accepted_by
        WHERE o.provider_id = $1 AND o.state <> 'withdrawn'
        ORDER BY o.accepted_at DESC LIMIT 200`,
      [p.id],
    );
    return {
      jobs: rows.map(({ price_halalas, factory_name, factory_kind, factory_phone, ...j }) => ({
        ...j,
        priceHalalas: Number(price_halalas),
        factory: { name: factory_name, kind: factory_kind, contactPhone: factory_phone },
      })),
    };
  });
}
