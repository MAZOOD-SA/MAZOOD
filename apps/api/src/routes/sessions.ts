// «أجهزتي»: المستخدم يشوف الأجهزة اللي داخل منها حسابه، ويطلّع أي جهاز، أو كل الأجهزة الثانية.
// مفيد لو ضاع جوال، أو ترك موظف المصنع الشغل وحسابه مفتوح على جهازه.
import type { SessionDto } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit";
import { requireUser } from "../auth";
import type { AppContext } from "../context";
import { notFound } from "../errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sessionRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, clock } = ctx;

  app.get("/sessions", async (req): Promise<SessionDto[]> => {
    const u = requireUser(req);
    const rows = await db.session.findMany({
      where: { userId: u.id, revokedAt: null, expiresAt: { gt: clock.now() } },
      orderBy: { lastUsedAt: "desc" },
      take: 50,
    });
    return rows.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      channel: s.channel === "web" ? "web" : "app",
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === u.sessionId,
    }));
  });

  /** يطلّع جهاز واحد. الجلسة لازم تكون للمستخدم نفسه، وإلا «غير موجود». */
  app.post("/sessions/:id/revoke", async (req) => {
    const u = requireUser(req);
    const id = (req.params as { id: string }).id;
    if (!UUID.test(id)) throw notFound();
    const res = await db.session.updateMany({ where: { id, userId: u.id, revokedAt: null }, data: { revokedAt: clock.now() } });
    if (res.count === 0) throw notFound();
    await audit(db, { actorUserId: u.id, action: "auth.session_revoked", entityType: "session", entityId: id, ip: req.ip });
    return { ok: true };
  });

  /** يطلّع كل الأجهزة إلا الجهاز الحالي. */
  app.post("/sessions/revoke-others", async (req) => {
    const u = requireUser(req);
    const res = await db.session.updateMany({
      where: { userId: u.id, revokedAt: null, id: { not: u.sessionId } },
      data: { revokedAt: clock.now() },
    });
    await audit(db, { actorUserId: u.id, action: "auth.other_sessions_revoked", entityType: "user", entityId: u.id, metadata: { count: res.count }, ip: req.ip });
    return { revoked: res.count };
  });
}
