// مسارات الإلغاء والبديل والبلاغ (المرحلة ٤، الخطوة ٨). المنطق كله في cancellations.ts، وهنا بس المدخلات والصلاحيات.
//
// المصنع:   طلب الإلغاء بعد البدء وسحبه، وإعادة نشر الطلب المنتهي، وفتح بلاغ، وملاحظة على البلاغ.
//           («اختر عرض ثاني» بعد اعتذار المزوّد = نفس مسار القبول، لأن العروض الصالحة ترجع فعّالة.)
// المزوّد:  الرد على طلب الإلغاء، والاعتذار قبل البدء، وفتح بلاغ، وملاحظة على البلاغ.
// الإدارة:  قائمة البلاغات وتفاصيلها، والملاحظات (منها الداخلية)، والقرار. بصلاحية disputes.manage.
//
// النصوص اللي يكتبها المستخدم توصل للطرف الثاني أو لخدمة العملاء: ممنوع فيها أرقام أو روابط (التواصل داخل المنصة).
import { events, requestOfOrder } from "../events.ts";
import {
  cancelRequestBody,
  cancelResponseBody,
  disputeNoteBody,
  openDisputeBody,
  providerWithdrawBody,
  republishBody,
  resolveDisputeBody,
  staffDisputeNoteBody,
} from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addPartyDisputeNote,
  addStaffDisputeNote,
  factoryOpenDispute,
  providerOpenDispute,
  providerWithdraw,
  republishRequest,
  requestCancellation,
  resolveDispute,
  respondToCancellation,
  withdrawCancellationRequest,
} from "../cancellations.ts";
import { ApiError } from "../errors.ts";
import { providerIdFor } from "../execution.ts";
import { idempotent, parse, type Ctx, type Guards } from "../http.ts";
import { providerJobView, uuidParam } from "./execution.ts";
import { factoryRequestView } from "./factory.ts";
import { rejectContactInfo } from "./offers.ts";

const disputeListQuery = z.object({ status: z.enum(["open", "closed"]).optional() }).strict();

export function cancellationRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  /** الطلب المنفّذ الشغّال لطلب المصنع (للملاحظات). طلب مصنع ثاني: «غير موجود». */
  async function factoryOpenOrder(factoryId: string, requestId: string): Promise<string> {
    const [o] = await db.query<{ id: string }>(
      "SELECT o.id FROM orders o WHERE o.request_id=$1 AND o.factory_id=$2 AND o.state='open'",
      [requestId, factoryId],
    );
    if (!o) throw new ApiError(404, "not_found");
    return o.id;
  }

  // ── المصنع ──

  // «اطلب الإلغاء» بعد البدء. يقبل Idempotency-Key.
  app.post("/v1/requests/:id/cancellation", async (req, reply) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    const body = parse(cancelRequestBody, req.body);
    rejectContactInfo({ reason: body.reason });
    const view = await idempotent(ctx, req, `cancellation:${id}`, async () => {
      await requestCancellation(db, user, factoryId, id, body.reason, ctx.now());
      await events.toProvider(db, id, "cancellation_requested", ctx.now());
      return factoryRequestView(ctx, factoryId, id, user.id);
    });
    return reply.status(201).send(view);
  });

  app.post("/v1/requests/:id/cancellation/withdraw", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    await withdrawCancellationRequest(db, user, factoryId, id, ctx.now());
    return factoryRequestView(ctx, factoryId, id, user.id);
  });

  // «أعد نشر الطلب» بعد ما انتهت مدته بدون قبول، مع تعديل اختياري.
  app.post("/v1/requests/:id/republish", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    const body = parse(republishBody, req.body ?? {});
    rejectContactInfo({ details: body.details, area: body.area });
    return idempotent(ctx, req, `republish:${id}`, async () => {
      await republishRequest(db, user, factoryId, id, body, ctx.now());
      return factoryRequestView(ctx, factoryId, id, user.id);
    });
  });

  app.post("/v1/requests/:id/dispute", async (req, reply) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    const body = parse(openDisputeBody, req.body);
    rejectContactInfo({ details: body.details });
    const view = await idempotent(ctx, req, `dispute:${id}`, async () => {
      await factoryOpenDispute(db, user, factoryId, id, body.reason, body.details, ctx.now());
      await events.disputeOpened(db, id, "factory", ctx.now());
      return factoryRequestView(ctx, factoryId, id, user.id);
    });
    return reply.status(201).send(view);
  });

  app.post("/v1/requests/:id/dispute/notes", async (req, reply) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    const body = parse(disputeNoteBody, req.body);
    rejectContactInfo({ body: body.body });
    await addPartyDisputeNote(db, user, "factory", await factoryOpenOrder(factoryId, id), body.body, ctx.now());
    return reply.status(201).send(await factoryRequestView(ctx, factoryId, id, user.id));
  });

  // ── المزوّد ──

  app.post("/v1/provider/jobs/:orderId/cancellation/respond", async (req) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    const body = parse(cancelResponseBody, req.body);
    rejectContactInfo({ note: body.note });
    return idempotent(ctx, req, `cancellation-respond:${orderId}`, async () => {
      await respondToCancellation(db, user, orderId, body.decision, body.note, ctx.now());
      return providerJobView(ctx, user.id, orderId);
    });
  });

  // «اعتذر عن الطلب» قبل البدء. بعده الطلب يختفي من «شغلي» (يرجع مفتوح للمصنع).
  app.post("/v1/provider/jobs/:orderId/withdraw", async (req) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    const body = parse(providerWithdrawBody, req.body);
    rejectContactInfo({ reason: body.reason });
    return idempotent(ctx, req, `provider-withdraw:${orderId}`, async () => {
      await providerWithdraw(db, user, orderId, body.reason, ctx.now());
      await events.toCustomer(db, await requestOfOrder(db, orderId), "provider_withdrew", ctx.now());
      return { ok: true as const };
    });
  });

  app.post("/v1/provider/jobs/:orderId/dispute", async (req, reply) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    const body = parse(openDisputeBody, req.body);
    rejectContactInfo({ details: body.details });
    const view = await idempotent(ctx, req, `provider-dispute:${orderId}`, async () => {
      await providerOpenDispute(db, user, orderId, body.reason, body.details, ctx.now());
      await events.disputeOpened(db, await requestOfOrder(db, orderId), "provider", ctx.now());
      return providerJobView(ctx, user.id, orderId);
    });
    return reply.status(201).send(view);
  });

  app.post("/v1/provider/jobs/:orderId/dispute/notes", async (req, reply) => {
    const user = await g.requireProviderUser(req);
    const orderId = uuidParam(req, "orderId");
    const body = parse(disputeNoteBody, req.body);
    rejectContactInfo({ body: body.body });
    const providerId = await providerIdFor(db, user.id);
    const [o] = await db.query("SELECT 1 FROM orders WHERE id=$1 AND provider_id=$2", [orderId, providerId]);
    if (!o) throw new ApiError(404, "not_found");
    await addPartyDisputeNote(db, user, "provider", orderId, body.body, ctx.now());
    return reply.status(201).send(await providerJobView(ctx, user.id, orderId));
  });

  // ── الإدارة (خدمة العملاء) ──

  // البلاغات: المفتوحة أول، الأقدم أول (اللي ينتظر من زمان يتعالج قبل).
  app.get("/v1/admin/disputes", async (req) => {
    await g.requireStaff(req, "disputes.manage");
    const q = parse(disputeListQuery, req.query);
    const rows = await db.query(
      `SELECT d.id, d.number::int AS number, d.request_id AS "requestId", d.reason, d.opened_by_role AS "openedBy", d.status,
              d.resolution, d.opened_at AS "openedAt", d.closed_at AS "closedAt", r.category, f.name AS "factoryName", p.trade_name AS "providerName"
         FROM disputes d
         JOIN requests r ON r.id = d.request_id
         JOIN orders o ON o.id = d.order_id
         JOIN factories f ON f.id = o.factory_id
         JOIN providers p ON p.id = o.provider_id
        WHERE ($1::text IS NULL OR d.status = $1::text)
        ORDER BY (d.status = 'open') DESC, d.opened_at ASC
        LIMIT 200`,
      [q.status ?? null],
    );
    return { disputes: rows };
  });

  // تفاصيل البلاغ لخدمة العملاء: كل الملاحظات (منها الداخلية)، وطلب الإلغاء المرتبط، والخط الزمني للطلب.
  app.get("/v1/admin/disputes/:id", async (req) => {
    await g.requireStaff(req, "disputes.manage");
    const id = uuidParam(req, "id");
    const [d] = await db.query<Record<string, unknown> & { request_id: string; order_id: string; cancellation_id: string | null }>(
      `SELECT d.id, d.number::int AS number, d.request_id, d.order_id, d.cancellation_id, d.reason, d.details, d.opened_by_role,
              d.status_before, d.status, d.resolution, d.opened_at, d.closed_at, f.name AS factory_name, p.trade_name AS provider_name,
              uf.phone AS factory_phone, up.phone AS provider_phone, o.price_halalas::bigint AS price_halalas
         FROM disputes d JOIN orders o ON o.id = d.order_id
         JOIN factories f ON f.id = o.factory_id JOIN users uf ON uf.id = o.accepted_by
         JOIN providers p ON p.id = o.provider_id JOIN users up ON up.id = p.user_id
        WHERE d.id=$1`,
      [id],
    );
    if (!d) throw new ApiError(404, "not_found");
    const notes = await db.query(
      `SELECT author_role AS "by", body, internal, created_at AS "at" FROM dispute_notes WHERE dispute_id=$1 ORDER BY created_at, id`,
      [id],
    );
    const cancellation = d.cancellation_id
      ? (await db.query("SELECT kind, status, reason, requested_at AS \"requestedAt\", respond_by AS \"respondBy\", response_note AS \"responseNote\", fee_halalas::bigint AS \"feeHalalas\" FROM cancellations WHERE id=$1", [d.cancellation_id]))[0]
      : null;
    const timeline = await db.query(
      `SELECT at, actor_role AS "by", event FROM order_events WHERE request_id=$1 ORDER BY at, id`,
      [d.request_id],
    );
    return {
      dispute: {
        id: d.id,
        number: d.number,
        requestId: d.request_id,
        reason: d.reason,
        details: d.details,
        openedBy: d.opened_by_role,
        statusBefore: d.status_before,
        status: d.status,
        resolution: d.resolution,
        openedAt: d.opened_at,
        closedAt: d.closed_at,
        priceHalalas: Number(d.price_halalas),
        factory: { name: d.factory_name, contactPhone: d.factory_phone },
        provider: { tradeName: d.provider_name, contactPhone: d.provider_phone },
      },
      cancellation,
      notes,
      timeline,
    };
  });

  app.post("/v1/admin/disputes/:id/notes", async (req, reply) => {
    const user = await g.requireStaff(req, "disputes.manage");
    const id = uuidParam(req, "id");
    const body = parse(staffDisputeNoteBody, req.body);
    await addStaffDisputeNote(db, user, id, body.body, body.internal, ctx.now());
    return reply.status(201).send({ ok: true });
  });

  app.post("/v1/admin/disputes/:id/resolve", async (req) => {
    const user = await g.requireStaff(req, "disputes.manage");
    const id = uuidParam(req, "id");
    const body = parse(resolveDisputeBody, req.body);
    await resolveDispute(db, user, id, body.decision, body.note, ctx.now());
    return { ok: true };
  });
}
