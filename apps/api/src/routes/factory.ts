// مسارات المصنع: الحساب والطلبات. كل استعلام مقيّد بمصنع الجلسة.
import { createRequestBody, factoryProfileBody, uuidSchema } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { activeCities, resolveCityId } from "../cities.ts";
import { actorOf, parse, type Ctx, type Guards } from "../http.ts";
import { publicUser } from "./auth.ts";

export const REQUEST_COLUMNS = `id, category, type_id AS "typeId", details, area, location, city_id AS "cityId",
  needed_when AS "when", status, created_at AS "createdAt"`;

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
    // المدينة: المطلوبة، أو مدينة المصنع، أو المدينة الوحيدة الفعّالة.
    const [f] = await db.query<{ city_id: string | null }>("SELECT city_id FROM factories WHERE id=$1", [factoryId]);
    const cityId = await resolveCityId(db, body.cityId ?? f.city_id);
    const [row] = await db.query(
      `INSERT INTO requests (factory_id, category, type_id, details, area, location, needed_when, city_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${REQUEST_COLUMNS}`,
      [factoryId, body.category, body.typeId, body.details, body.area, body.location, body.when, cityId],
    );
    await audit(db, actorOf(user), "request.created", { type: "request", id: String(row.id) }, { category: body.category });
    return reply.status(201).send({ request: row });
  });

  app.get("/v1/requests", async (req) => {
    const { factoryId } = await g.requireFactory(req);
    const rows = await db.query(`SELECT ${REQUEST_COLUMNS} FROM requests WHERE factory_id = $1 ORDER BY created_at DESC LIMIT 200`, [
      factoryId,
    ]);
    return { requests: rows };
  });

  app.get("/v1/requests/:id", async (req) => {
    const { factoryId } = await g.requireFactory(req);
    return { request: await ownRequest(db, factoryId, (req.params as { id: string }).id) };
  });

  // الإلغاء مسموح قبل قبول أي عرض بس. بعد القبول له سياسة (سؤال ١٥ في PLAN.md).
  app.post("/v1/requests/:id/cancel", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = (req.params as { id: string }).id;
    await ownRequest(db, factoryId, id);
    // الشرط في نفس الأمر (status = awaiting_offers) عشان ما يصير تعارض لو انقبل عرض في نفس اللحظة.
    const rows = await db.query(
      `UPDATE requests SET status='cancelled', updated_at=now()
        WHERE id=$1 AND factory_id=$2 AND status='awaiting_offers' RETURNING ${REQUEST_COLUMNS}`,
      [id, factoryId],
    );
    if (rows.length === 0) throw new ApiError(409, "request_not_cancellable");
    await audit(db, actorOf(user), "request.cancelled", { type: "request", id });
    return { request: rows[0] };
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

/** طلب يخص هذا المصنع بس. لو الطلب لمصنع ثاني نرجّع «غير موجود» (مو «ممنوع») عشان ما نكشف وجوده. */
async function ownRequest(db: Db, factoryId: string, id: string) {
  if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
  const rows = await db.query(`SELECT ${REQUEST_COLUMNS} FROM requests WHERE id=$1 AND factory_id=$2`, [id, factoryId]);
  if (rows.length === 0) throw new ApiError(404, "not_found");
  return rows[0];
}
