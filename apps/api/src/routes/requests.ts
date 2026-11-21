// طلبات المصنع. كل استعلام مقيّد بمصنع المستخدم الحالي (من الجلسة).
// طلب مصنع ثاني يرجع 404 (مو 403)، عشان ما نبيّن إن الطلب موجود أصلًا.
import type { FastifyInstance } from "fastify";
import { idParamSchema, listRequestsQuerySchema, newRequestSchema, type RequestDto, type RequestListDto } from "@mazood/shared";
import type { AppDeps } from "../app.ts";
import { authOf, requireRole } from "../auth/guard.ts";
import type { ServiceRequest } from "../generated/prisma/client.ts";
import { audit } from "../lib/audit.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { factoryIdOf } from "../lib/me.ts";
import { parse } from "../lib/validate.ts";

function requestDto(r: ServiceRequest): RequestDto {
  return {
    id: r.id,
    category: r.category as RequestDto["category"],
    typeId: r.typeId,
    details: r.details,
    location: r.location,
    when: r.when,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
  };
}

/** رقم الطلب من الرابط. أي رقم مو بصيغة صحيحة يُعامل كأنه مو موجود. */
function requestIdFrom(params: unknown): string {
  const r = idParamSchema.safeParse(params);
  if (!r.success) throw notFound();
  return r.data.id;
}

export async function requestRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db, requireAuth } = deps;
  const factoryOnly = { preHandler: [requireAuth, requireRole("factory")] };

  app.post("/requests", factoryOnly, async (req, reply) => {
    const { userId } = authOf(req);
    const input = parse(newRequestSchema, req.body);
    const factoryId = await factoryIdOf(db, userId);
    if (!factoryId) throw new HttpError(409, "profile_incomplete");

    const created = await db.$transaction(async (tx) => {
      const r = await tx.serviceRequest.create({
        data: { ...input, factoryId, createdById: userId },
      });
      await audit(tx, {
        action: "request.create",
        actorUserId: userId,
        entityType: "request",
        entityId: r.id,
        metadata: { factoryId, category: r.category, typeId: r.typeId },
      });
      return r;
    });
    return reply.code(201).send(requestDto(created));
  });

  app.get("/requests", factoryOnly, async (req): Promise<RequestListDto> => {
    const { userId } = authOf(req);
    const { limit, cursor } = parse(listRequestsQuerySchema, req.query);
    const factoryId = await factoryIdOf(db, userId);
    if (!factoryId) return { items: [], nextCursor: null };

    // الترتيب: الأحدث أول. المؤشّر (cursor) هو آخر طلب في الصفحة اللي قبل،
    // ولازم يكون من نفس المصنع.
    let after: { createdAt: Date; id: string } | null = null;
    if (cursor) {
      after = await db.serviceRequest.findFirst({ where: { id: cursor, factoryId }, select: { createdAt: true, id: true } });
      if (!after) throw new HttpError(400, "invalid_input", { issues: [{ path: "cursor", message: "cursor_invalid" }] });
    }

    const rows = await db.serviceRequest.findMany({
      where: {
        factoryId,
        ...(after && {
          OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return { items: page.map(requestDto), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
  });

  app.get("/requests/:id", factoryOnly, async (req) => {
    const { userId } = authOf(req);
    const id = requestIdFrom(req.params);
    const factoryId = await factoryIdOf(db, userId);
    const r = factoryId ? await db.serviceRequest.findFirst({ where: { id, factoryId } }) : null;
    if (!r) throw notFound();
    return requestDto(r);
  });

  // الإلغاء مسموح بس والطلب «بانتظار العروض». بعد قبول عرض، الإلغاء يمر بخطوات (المرحلة 4).
  app.post("/requests/:id/cancel", factoryOnly, async (req) => {
    const { userId } = authOf(req);
    const id = requestIdFrom(req.params);
    const factoryId = await factoryIdOf(db, userId);
    if (!factoryId) throw notFound();

    const updated = await db.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.serviceRequest.updateMany({
        where: { id, factoryId, status: "awaiting_offers" },
        data: { status: "cancelled", cancelledAt: now },
      });
      const r = await tx.serviceRequest.findFirst({ where: { id, factoryId } });
      if (!r) throw notFound();
      if (changed.count === 0) throw new HttpError(409, "invalid_state");
      await audit(tx, { action: "request.cancel", actorUserId: userId, entityType: "request", entityId: r.id, metadata: { factoryId } });
      return r;
    });
    return requestDto(updated);
  });
}
