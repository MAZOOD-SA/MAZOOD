// بيانات المصنع. أول مرة يدخل المستخدم يكمّل اسم المصنع وموقعه، وبعدها يقدر يعدّلها.
import { factoryProfileSchema, type FactoryDto, type Me } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit";
import { requirePermission } from "../auth";
import type { AppContext } from "../context";
import { parse } from "../errors";
import { withFactoryScope } from "../scope";
import type { Factory } from "../generated/prisma/client";
import { loadMe } from "./auth";

export function factoryDto(f: Factory): FactoryDto {
  return {
    id: f.id,
    name: f.name,
    location: f.location,
    commercialRegister: f.commercialRegister,
    vatNumber: f.vatNumber,
  };
}

export async function factoryRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  /** ينشئ المصنع أول مرة، أو يعدّل بياناته. */
  app.put("/factory", async (req): Promise<Me> => {
    const u = requirePermission(req, "factory.profile.edit");
    const input = parse(factoryProfileSchema, req.body);
    const data = {
      name: input.name,
      location: input.location,
      commercialRegister: input.commercialRegister || null,
      vatNumber: input.vatNumber || null,
    };

    if (u.factoryId) {
      const factoryId = u.factoryId;
      await withFactoryScope(db, factoryId, (tx) => tx.factory.update({ where: { id: factoryId }, data }));
      await audit(db, { actorUserId: u.id, action: "factory.updated", entityType: "factory", entityId: u.factoryId, ip: req.ip });
    } else {
      const factory = await db.factory.create({ data: { ...data, members: { create: { userId: u.id, role: "owner" } } } });
      await audit(db, { actorUserId: u.id, action: "factory.created", entityType: "factory", entityId: factory.id, ip: req.ip });
    }
    return loadMe(ctx, u.id);
  });
}
