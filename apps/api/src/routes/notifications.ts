// مسارات التنبيهات للمستخدم الداخل (أي نوع حساب): القائمة، و«قرأت»، والتفضيلات، ورمز إشعارات الجهاز.
// كل مستخدم يشوف تنبيهاته بس (user_id من الجلسة).
import { markReadBody, NOTIFICATION_EVENT_IDS, notificationPrefsBody, pushTokenBody } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { actorOf, parse, type Ctx, type Guards } from "../http.ts";
import { audit } from "../audit.ts";

export function notificationRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  app.get("/v1/notifications", async (req) => {
    const user = await g.authenticate(req);
    const rows = await db.query(
      `SELECT id, event, data, read_at AS "readAt", created_at AS "createdAt" FROM notifications
        WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [user.id],
    );
    const [u] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL", [user.id]);
    return { notifications: rows, unread: u.n };
  });

  // «قرأت»: تنبيهات معيّنة، أو كلها لو ما فيه ids.
  app.post("/v1/notifications/read", async (req) => {
    const user = await g.authenticate(req);
    const { ids } = parse(markReadBody, req.body ?? {});
    await db.query(
      `UPDATE notifications SET read_at=$2 WHERE user_id=$1 AND read_at IS NULL AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))`,
      [user.id, ctx.now(), ids ?? null],
    );
    return { ok: true };
  });

  app.get("/v1/notifications/prefs", async (req) => {
    const user = await g.authenticate(req);
    const [p] = await db.query<{ sms: boolean; push: boolean; muted: string[] }>("SELECT sms, push, muted FROM notification_prefs WHERE user_id=$1", [user.id]);
    return { prefs: p ?? { sms: true, push: true, muted: [] }, events: NOTIFICATION_EVENT_IDS };
  });

  app.put("/v1/notifications/prefs", async (req) => {
    const user = await g.authenticate(req);
    const body = parse(notificationPrefsBody, req.body);
    await db.query(
      `INSERT INTO notification_prefs (user_id, sms, push, muted, updated_at) VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id) DO UPDATE SET sms=EXCLUDED.sms, push=EXCLUDED.push, muted=EXCLUDED.muted, updated_at=now()`,
      [user.id, body.sms, body.push, body.muted],
    );
    await audit(db, actorOf(user), "notifications.prefs_updated", { type: "user", id: user.id }, body);
    return { prefs: body };
  });

  // رمز إشعارات الجهاز (من تطبيق الجوال). نفس الرمز لو انتقل لمستخدم ثاني (خروج ودخول بحساب ثاني) ينتقل له.
  app.post("/v1/push-tokens", async (req) => {
    const user = await g.authenticate(req);
    const body = parse(pushTokenBody, req.body);
    await db.query(
      `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1,$2,$3)
       ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id, platform=EXCLUDED.platform, revoked_at=NULL, created_at=now()`,
      [body.token, user.id, body.platform],
    );
    return { ok: true };
  });

  app.post("/v1/push-tokens/revoke", async (req) => {
    const user = await g.authenticate(req);
    const body = parse(pushTokenBody.pick({ token: true }), req.body);
    await db.query("UPDATE push_tokens SET revoked_at=$3 WHERE token=$1 AND user_id=$2", [body.token, user.id, ctx.now()]);
    return { ok: true };
  });
}
