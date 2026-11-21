// بيانات المستخدم الحالي ومصنعه، بالشكل اللي يحتاجه التطبيق (MeDto).
import type { FactoryDto, MeDto } from "@mazood/shared";
import type { Db } from "../db.ts";
import type { Factory } from "../generated/prisma/client.ts";
import { notFound } from "./errors.ts";

export function factoryDto(f: Factory): FactoryDto {
  return {
    id: f.id,
    name: f.name,
    city: f.city,
    contactName: f.contactName,
    commercialRegister: f.commercialRegister,
    vatNumber: f.vatNumber,
  };
}

export async function loadMe(db: Db, userId: string): Promise<MeDto> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { factory: true }, take: 1 } },
  });
  if (!user) throw notFound();
  const membership = user.memberships[0];
  return {
    user: { id: user.id, phone: user.phone, role: user.role, locale: user.locale },
    factory: membership ? factoryDto(membership.factory) : null,
  };
}

/** رقم مصنع المستخدم الحالي من قاعدة البيانات، أو null إذا ما كمّل بياناته. */
export async function factoryIdOf(db: Db, userId: string): Promise<string | null> {
  const m = await db.factoryMember.findUnique({ where: { userId }, select: { factoryId: true } });
  return m?.factoryId ?? null;
}
