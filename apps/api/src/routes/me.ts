// المستخدم الحالي، وبيانات مصنعه.
import type { FastifyInstance } from "fastify";
import { factoryProfileSchema } from "@mazood/shared";
import type { AppDeps } from "../app.ts";
import { authOf, requireRole } from "../auth/guard.ts";
import { audit } from "../lib/audit.ts";
import { factoryDto, loadMe } from "../lib/me.ts";
import { parse } from "../lib/validate.ts";

export async function meRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db, requireAuth } = deps;

  app.get("/me", { preHandler: [requireAuth] }, async (req) => loadMe(db, authOf(req).userId));

  // ينشئ المصنع أول مرة، ويعدّله بعدها. المصنع دائمًا مصنع المستخدم الحالي (من الجلسة).
  app.put("/factory", { preHandler: [requireAuth, requireRole("factory")] }, async (req) => {
    const { userId } = authOf(req);
    const input = parse(factoryProfileSchema, req.body);
    const data = {
      name: input.name,
      city: input.city,
      contactName: input.contactName,
      commercialRegister: input.commercialRegister ?? null,
      vatNumber: input.vatNumber ?? null,
    };

    const factory = await db.$transaction(async (tx) => {
      // قفل على المستخدم، عشان طلبين بنفس اللحظة ما ينشئون مصنعين.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"factory:" + userId}))`;
      const membership = await tx.factoryMember.findUnique({ where: { userId } });
      if (membership) {
        const f = await tx.factory.update({ where: { id: membership.factoryId }, data });
        await audit(tx, { action: "factory.update", actorUserId: userId, entityType: "factory", entityId: f.id });
        return f;
      }
      const f = await tx.factory.create({ data: { ...data, members: { create: { userId, role: "owner" } } } });
      await audit(tx, { action: "factory.create", actorUserId: userId, entityType: "factory", entityId: f.id });
      return f;
    });
    return factoryDto(factory);
  });
}
