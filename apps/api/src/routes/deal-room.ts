// مسارات غرفة الصفقة (القرار ٣٥ والقرار ٥٢). المنطق في deal-room.ts، وهنا المدخلات والصلاحيات.
//
// العميل:  GET/POST /v1/requests/:id/messages        (أي موظف فعّال في المنشأة، أو الفرد)
// المزوّد:  GET/POST /v1/provider/jobs/:orderId/messages
// الإدارة:  GET /v1/admin/disputes/:id/messages       (disputes.manage، بس لطلب فيه بلاغ، وكل قراءة تنسجل)
//
// GET يسجّل «قرأت» تلقائيًا (الشاشة تحمّل المحادثة لما تنفتح، وتعيد كل MESSAGE_POLL_SECONDS ثانية).
import { MESSAGES_PER_MINUTE, sendMessageBody } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { chatView, customerChatOrder, markChatRead, providerChatOrder, sendChatMessage, staffDisputeChat } from "../deal-room.ts";
import { idempotent, parse, type Ctx, type Guards } from "../http.ts";
import { uuidParam } from "./execution.ts";
import { rejectContactInfo } from "./offers.ts";

export function dealRoomRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;
  // حد خاص للإرسال، فوق الحد العام (app.ts): ما يقدر أحد يغرق المحادثة.
  const sendLimit = { config: { rateLimit: { max: ctx.strictRateLimits ? MESSAGES_PER_MINUTE : 100_000, timeWindow: "1 minute" } } };

  app.get("/v1/requests/:id/messages", async (req) => {
    const { user, factoryId } = await g.requireFactory(req);
    const orderId = await customerChatOrder(db, factoryId, uuidParam(req, "id"));
    await markChatRead(db, orderId, user.id, ctx.now());
    return chatView(ctx, orderId, { userId: user.id });
  });

  app.post("/v1/requests/:id/messages", sendLimit, async (req, reply) => {
    const { user, factoryId } = await g.requireFactory(req);
    const id = uuidParam(req, "id");
    const body = parse(sendMessageBody, req.body);
    rejectContactInfo({ body: body.body });
    const orderId = await customerChatOrder(db, factoryId, id);
    const view = await idempotent(ctx, req, `message:${orderId}`, async () => {
      await sendChatMessage(ctx, orderId, user, "customer", body.body);
      return chatView(ctx, orderId, { userId: user.id });
    });
    return reply.status(201).send(view);
  });

  app.get("/v1/provider/jobs/:orderId/messages", async (req) => {
    const user = await g.requireProviderUser(req);
    const orderId = await providerChatOrder(db, user.id, uuidParam(req, "orderId"));
    await markChatRead(db, orderId, user.id, ctx.now());
    return chatView(ctx, orderId, { userId: user.id });
  });

  app.post("/v1/provider/jobs/:orderId/messages", sendLimit, async (req, reply) => {
    const user = await g.requireProviderUser(req);
    const body = parse(sendMessageBody, req.body);
    rejectContactInfo({ body: body.body });
    const orderId = await providerChatOrder(db, user.id, uuidParam(req, "orderId"));
    const view = await idempotent(ctx, req, `message:${orderId}`, async () => {
      await sendChatMessage(ctx, orderId, user, "provider", body.body);
      return chatView(ctx, orderId, { userId: user.id });
    });
    return reply.status(201).send(view);
  });

  app.get("/v1/admin/disputes/:id/messages", async (req) => {
    const staff = await g.requireStaff(req, "disputes.manage");
    return staffDisputeChat(ctx, staff, uuidParam(req, "id"));
  });
}
