// مسارات المزوّد للطلبات المتاحة والعروض.
//
// القواعد (docs/plans/phase-4.md):
//  - مزوّد موثّق فعليًا بس (provider-access.ts).
//  - يشوف الطلبات المفتوحة في أقسامه ومدنه بس. كل مزوّد مؤهّل يشوف الطلب بنفس اللحظة (عدالة: ما نبيع أولوية).
//  - قبل القبول: القسم والنوع والتفاصيل والمدينة والمنطقة والموعد. **ما يطلع اسم المصنع ولا الموقع بالضبط**.
//  - يشوف **عدد** العروض بس، مو أسعار غيره (سؤال ٤-٢).
import { CATEGORY_IDS, uuidSchema } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { parse, type Ctx, type Guards } from "../http.ts";
import { requireActiveProvider, type ActiveProvider } from "../provider-access.ts";
import { getSettings } from "../settings.ts";

const listQuery = z.object({ category: z.enum(CATEGORY_IDS as [string, ...string[]]).optional() }).strict();

/** الأعمدة اللي تطلع للمزوّد قبل القبول. ممنوع نضيف هنا factory_id أو location. */
const OPEN_REQUEST_COLUMNS = `r.id, r.category, r.type_id AS "typeId", r.details, r.area, r.city_id AS "cityId",
  r.needed_when AS "when", r.created_at AS "createdAt", r.expires_at AS "expiresAt"`;

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

export function offerRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

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
}
