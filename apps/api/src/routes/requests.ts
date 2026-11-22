// مسارات طلبات المصنع. كلها تحتاج مستخدم مصنع كمّل بيانات مصنعه (requireFactory)،
// وكل البيانات مفلترة برقم مصنعه داخل services/requests.ts.
import { createRequestSchema, type ConfigDto } from "@mazood/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireFactory } from "../auth";
import type { AppContext } from "../context";
import { onCancelRequested, onOfferAccepted, onRequestCreated } from "../demo";
import { parse } from "../errors";
import * as svc from "../services/requests";
import { getCancelPolicy } from "../settings";

const acceptSchema = z.object({ offerId: z.string().max(64, "invalid_input") });

export async function requestRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, clock } = ctx;
  const actor = (req: FastifyRequest): svc.Actor => {
    const u = requireFactory(req);
    return { userId: u.id, factoryId: u.factoryId, ip: req.ip };
  };
  const idOf = (req: FastifyRequest) => (req.params as { id: string }).id;

  app.get("/config", async (): Promise<ConfigDto> => ({ cancelPolicy: await getCancelPolicy(db), demoMode: ctx.config.DEMO_MODE }));

  app.get("/requests", async (req) => svc.listRequests(db, actor(req).factoryId, await getCancelPolicy(db)));

  app.post("/requests", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req, reply) => {
    const a = actor(req);
    const input = parse(createRequestSchema, req.body);
    const created = await svc.createRequest(db, a, input, await getCancelPolicy(db));
    onRequestCreated(ctx, { id: created.id, category: created.category, typeId: created.typeId });
    return reply.status(201).send(created);
  });

  app.get("/requests/:id", async (req) => svc.getRequest(db, actor(req).factoryId, idOf(req), await getCancelPolicy(db)));

  app.post("/requests/:id/seen", async (req) => {
    await svc.markOffersSeen(db, actor(req), idOf(req), clock.now());
    return { ok: true };
  });

  app.post("/requests/:id/accept", async (req) => {
    const { offerId } = parse(acceptSchema, req.body);
    const r = await svc.acceptOffer(db, actor(req), idOf(req), offerId, await getCancelPolicy(db), clock.now());
    if (r.acceptedOffer) onOfferAccepted(ctx, r.id, r.acceptedOffer.provider.id);
    return r;
  });

  app.post("/requests/:id/cancel", async (req) => svc.cancelRequest(db, actor(req), idOf(req), await getCancelPolicy(db), clock.now()));

  app.post("/requests/:id/cancel-request", async (req) => {
    const r = await svc.requestCancellation(db, actor(req), idOf(req), await getCancelPolicy(db));
    if (r.acceptedOffer) onCancelRequested(ctx, r.id, r.acceptedOffer.provider.id);
    return r;
  });

  app.post("/requests/:id/cancel-request/withdraw", async (req) => svc.withdrawCancellation(db, actor(req), idOf(req), await getCancelPolicy(db)));

  app.post("/requests/:id/confirm-receipt", async (req) => svc.confirmReceipt(db, actor(req), idOf(req), await getCancelPolicy(db), clock.now()));

  app.post("/requests/:id/dispute", async (req) => svc.openDispute(db, actor(req), idOf(req), await getCancelPolicy(db), clock.now()));
}
