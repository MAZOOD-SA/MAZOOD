// مسارات التنفيذ (المرحلة ٤، الخطوة ٧). المنطق كله في execution.ts، وهنا بس قراءة المدخلات والصلاحيات.
//
// المزوّد: بدأت، والصور، وتم التنفيذ، وطلب تعديل السعر أو سحبه. على طلباته المنفّذة بس.
// المصنع: تأكيد الاستلام، والتقييم بعد الاكتمال (الخطوة ٩)، والموافقة على تعديل السعر أو رفضه. على طلباته بس.
// الصور: تنفتح برابط مؤقت موقّع باسم المستخدم، والخادم يتأكد لحظة الفتح إن له حق يشوفها.
import { ORDER_PHOTO_STAGES, ORDER_PHOTOS_PER_STAGE, parseCancellationPolicy, priceChangeBody, rateOrderBody, UPLOAD_MAX_BYTES, uuidSchema } from "@mazood/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.ts";
import { rateOrder } from "../ratings.ts";
import {
  addOrderPhoto,
  canViewOrder,
  confirmReceipt,
  decidePriceChange,
  deliverJob,
  executionDetails,
  providerIdFor,
  requestPriceChange,
  startJob,
  withdrawPriceChange,
} from "../execution.ts";
import { disputeForParty, feeFor, latestCancellationRequest } from "../cancellations.ts";
import { verifyPhotoLink } from "../files.ts";
import { idempotent, parse, type Ctx, type Guards } from "../http.ts";
import { sniffMime } from "../storage.ts";
import { factoryRequestView } from "./factory.ts";
import { rejectContactInfo } from "./offers.ts";

const photoFields = z.object({ stage: z.enum(ORDER_PHOTO_STAGES) }).strict();

export function uuidParam(req: FastifyRequest, name: string): string {
  const v = (req.params as Record<string, string>)[name];
  if (!uuidSchema.safeParse(v).success) throw new ApiError(404, "not_found");
  return v;
}

export function executionRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  const providerJob = (userId: string, orderId: string) => providerJobView(ctx, userId, orderId);

  app.get("/v1/provider/jobs/:orderId", async (req) => {
    const user = await g.requireProviderUser(req);
    return providerJob(user.id, uuidParam(req, "orderId"));
  });

  app.post("/v1/provider/jobs/:orderId/start", async (req) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    return idempotent(ctx, req, `start:${orderId}`, async () => {
      await startJob(db, user, orderId, ctx.now());
      return providerJob(user.id, orderId);
    });
  });

  app.post("/v1/provider/jobs/:orderId/deliver", async (req) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    return idempotent(ctx, req, `deliver:${orderId}`, async () => {
      await deliverJob(db, user, orderId, ctx.now());
      return providerJob(user.id, orderId);
    });
  });

  // رفع صورة بدء أو انتهاء (ملف واحد في كل طلب). صورة بس (JPEG أو PNG)، والنوع من المحتوى.
  app.post("/v1/provider/jobs/:orderId/photos", async (req, reply) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    const fields: Record<string, string> = {};
    let file: Buffer | null = null;
    for await (const part of req.parts({ limits: { fileSize: UPLOAD_MAX_BYTES, files: 1, fields: 3 } })) {
      if (part.type === "file") {
        file = await part.toBuffer();
        if (part.file.truncated) throw new ApiError(413, "file_too_large");
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
    const { stage } = parse(photoFields, fields);
    if (!file || file.length === 0) throw new ApiError(400, "file_required");
    const mime = sniffMime(file);
    if (mime !== "image/jpeg" && mime !== "image/png") throw new ApiError(415, "file_type_not_allowed");
    await addOrderPhoto(db, ctx.storage, user, orderId, stage, { bytes: file, mime }, ORDER_PHOTOS_PER_STAGE, ctx.now());
    return reply.status(201).send(await providerJob(user.id, orderId));
  });

  app.post("/v1/provider/jobs/:orderId/price-change", async (req, reply) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    const body = parse(priceChangeBody, req.body);
    // السبب يظهر للمصنع: نفس قاعدة النصوص قبل القبول، بدون أرقام أو روابط (التواصل داخل المنصة).
    rejectContactInfo({ reason: body.reason });
    await requestPriceChange(db, user, orderId, body, ctx.now());
    return reply.status(201).send(await providerJob(user.id, orderId));
  });

  app.post("/v1/provider/jobs/:orderId/price-change/withdraw", async (req) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    await withdrawPriceChange(db, user, orderId, ctx.now());
    return providerJob(user.id, orderId);
  });

  // المصنع: تأكيد الاستلام. يقبل Idempotency-Key.
  app.post("/v1/requests/:id/confirm", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    return idempotent(ctx, req, `confirm:${id}`, async () => {
      await confirmReceipt(db, user, factoryId, id, ctx.now());
      return factoryRequestView(ctx, factoryId, id, user.id);
    });
  });

  // التقييم بالنجوم: مرة وحدة بعد الاكتمال، واختياري. بدون تعليق مكتوب (القرار ٣٣).
  app.post("/v1/requests/:id/rating", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    const body = parse(rateOrderBody, req.body);
    await rateOrder(db, user, factoryId, id, body.stars, ctx.now());
    return factoryRequestView(ctx, factoryId, id, user.id);
  });

  app.post("/v1/requests/:id/price-changes/:changeId/:decision", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    const changeId = uuidParam(req, "changeId");
    const decision = (req.params as { decision: string }).decision;
    if (decision !== "approve" && decision !== "reject") throw new ApiError(404, "not_found");
    await decidePriceChange(db, user, factoryId, id, changeId, decision, ctx.now());
    return factoryRequestView(ctx, factoryId, id, user.id);
  });

  // فتح صورة برابط مؤقت. ما يحتاج جلسة (الرابط نفسه موقّع)، بس نتأكد إن صاحب الرابط لسا له حق.
  app.get("/v1/order-photos/:id", async (req, reply) => {
    const id = uuidParam(req, "id");
    const by = verifyPhotoLink(ctx.config.authSecret, id, req.query as Record<string, string>, ctx.now());
    if (!by) throw new ApiError(403, "link_invalid_or_expired");
    const [row] = await db.query<{ storage_key: string; mime_type: string; order_id: string }>(
      "SELECT storage_key, mime_type, order_id FROM order_photos WHERE id=$1",
      [id],
    );
    if (!row || !(await canViewOrder(db, by, row.order_id))) throw new ApiError(403, "link_invalid_or_expired");
    const bytes = await ctx.storage.get(row.storage_key);
    if (!bytes) throw new ApiError(404, "not_found");
    return reply
      .header("content-type", row.mime_type)
      .header("content-disposition", `inline; filename="photo.${row.mime_type === "image/png" ? "png" : "jpg"}"`)
      .header("cache-control", "private, no-store")
      .header("content-security-policy", "sandbox; default-src 'none'; img-src 'self'")
      .send(bytes);
  });
}

/**
 * الطلب المنفّذ للمزوّد مع تفاصيل التنفيذ. هنا يشوف اسم المصنع والموقع ورقم التواصل لأن عرضه انقبل.
 * ومعه: طلب الإلغاء (لو المصنع طلب)، والبلاغ، ورسوم الاعتذار لو اعتذر الحين (قبل البدء).
 */
export async function providerJobView(ctx: Ctx, userId: string, orderId: string) {
  const { db } = ctx;
  const providerId = await providerIdFor(db, userId);
  const [j] = await db.query<Record<string, unknown> & { status: string; price_halalas: string; factory_name: string | null; factory_phone: string; cancellationPolicy: unknown }>(
    `SELECT o.id AS "orderId", o.request_id AS "requestId", r.status, r.category, r.type_id AS "typeId", r.details, r.area,
            r.location, r.needed_when AS "when", o.price_halalas, o.accepted_at AS "acceptedAt", o.started_at AS "startedAt",
            o.delivered_at AS "deliveredAt", o.confirmed_at AS "confirmedAt", o.cancellation_policy AS "cancellationPolicy",
            f.name AS factory_name, u.phone AS factory_phone
       FROM orders o JOIN requests r ON r.id = o.request_id JOIN factories f ON f.id = o.factory_id JOIN users u ON u.id = o.accepted_by
      WHERE o.id=$1 AND o.provider_id=$2 AND o.state <> 'withdrawn'`,
    [orderId, providerId],
  );
  if (!j) throw new ApiError(404, "not_found");
  const { price_halalas, factory_name, factory_phone, cancellationPolicy, ...rest } = j;
  const now = ctx.now();
  return {
    job: {
      ...rest,
      priceHalalas: Number(price_halalas),
      cancellationPolicy: parseCancellationPolicy(cancellationPolicy),
      factory: { name: factory_name, contactPhone: factory_phone },
      execution: await executionDetails(db, ctx.config.authSecret, orderId, userId, now),
      cancellationRequest: await latestCancellationRequest(db, orderId),
      // قبل البدء يقدر يعتذر: نبيّن له الرسوم بالضبط قبل ما يضغط (صفر الحين).
      withdrawalFee: j.status === "accepted" ? await feeFor(db, orderId, "provider", "after_accept", now) : null,
      dispute: await disputeForParty(db, orderId, "provider"),
    },
  };
}
