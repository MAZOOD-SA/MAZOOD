// مسارات طلبات المصنع. كلها تحتاج مستخدم مصنع كمّل بيانات مصنعه (requireFactory)،
// وكل البيانات مفلترة برقم مصنعه مرتين: في الكود (services/requests.ts)، وفي قاعدة البيانات (scope.ts).
import { createRequestSchema, type CancelPolicy, type ConfigDto, type Permission } from "@mazood/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireFactory } from "../auth";
import type { AppContext } from "../context";
import { onCancelRequested, onOfferAccepted, onRequestCreated } from "../demo";
import { parse } from "../errors";
import { withFactoryScope } from "../scope";
import * as svc from "../services/requests";
import { getCancelPolicy } from "../settings";

const acceptSchema = z.object({ offerId: z.string().max(64, "invalid_input") });

export async function requestRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, clock } = ctx;
  const idOf = (req: FastifyRequest) => (req.params as { id: string }).id;

  /**
   * يشغّل عملية للمصنع داخل معاملة محددة بمصنعه (طبقة RLS، شوف scope.ts).
   * الصلاحية تنفحص أول: لازم يكون مستخدم مصنع كمّل بياناته.
   */
  async function asFactory<T>(
    req: FastifyRequest,
    fn: (tx: svc.Tx, a: svc.Actor, policy: CancelPolicy) => Promise<T>,
    permission: Permission = "request.manage_own",
  ): Promise<T> {
    const u = requireFactory(req, permission);
    const a: svc.Actor = { userId: u.id, factoryId: u.factoryId, ip: req.ip };
    return withFactoryScope(db, a.factoryId, async (tx) => fn(tx, a, await getCancelPolicy(tx)));
  }

  app.get("/config", async (): Promise<ConfigDto> => ({ cancelPolicy: await getCancelPolicy(db), demoMode: ctx.config.DEMO_MODE }));

  app.get("/requests", async (req) => asFactory(req, (tx, a, policy) => svc.listRequests(tx, a.factoryId, policy), "request.view_own"));

  app.post("/requests", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req, reply) => {
    // الصلاحية قبل التحقق من المدخلات: اللي ما له صلاحية ما يعرف حتى شكل المدخل المطلوب.
    requireFactory(req, "request.create");
    const input = parse(createRequestSchema, req.body);
    const created = await asFactory(req, (tx, a, policy) => svc.createRequest(tx, a, input, policy), "request.create");
    // المهام الجانبية (العروض الوهمية) بعد ما تنحفظ المعاملة، مو داخلها.
    onRequestCreated(ctx, { id: created.id, category: created.category, typeId: created.typeId });
    return reply.status(201).send(created);
  });

  app.get("/requests/:id", async (req) => asFactory(req, (tx, a, policy) => svc.getRequest(tx, a.factoryId, idOf(req), policy), "request.view_own"));

  app.post("/requests/:id/seen", async (req) => {
    await asFactory(req, (tx, a) => svc.markOffersSeen(tx, a, idOf(req), clock.now()));
    return { ok: true };
  });

  app.post("/requests/:id/accept", async (req) => {
    requireFactory(req, "request.manage_own");
    const { offerId } = parse(acceptSchema, req.body);
    const r = await asFactory(req, (tx, a, policy) => svc.acceptOffer(tx, a, idOf(req), offerId, policy, clock.now()));
    if (r.acceptedOffer) onOfferAccepted(ctx, r.id, r.acceptedOffer.provider.id);
    return r;
  });

  app.post("/requests/:id/cancel", async (req) => asFactory(req, (tx, a, policy) => svc.cancelRequest(tx, a, idOf(req), policy, clock.now())));

  app.post("/requests/:id/cancel-request", async (req) => {
    const r = await asFactory(req, (tx, a, policy) => svc.requestCancellation(tx, a, idOf(req), policy));
    if (r.acceptedOffer) onCancelRequested(ctx, r.id, r.acceptedOffer.provider.id);
    return r;
  });

  app.post("/requests/:id/cancel-request/withdraw", async (req) => asFactory(req, (tx, a, policy) => svc.withdrawCancellation(tx, a, idOf(req), policy)));

  app.post("/requests/:id/confirm-receipt", async (req) => asFactory(req, (tx, a, policy) => svc.confirmReceipt(tx, a, idOf(req), policy, clock.now())));

  app.post("/requests/:id/dispute", async (req) => asFactory(req, (tx, a, policy) => svc.openDispute(tx, a, idOf(req), policy, clock.now())));
}
