// «طلب حذف الحساب» (قرار المالك، 22 نوفمبر 2026): المصنع أو المزوّد يطلبه من «حسابي»، والطلب يوصل
// للوحة الإدارة (الخطوة ١٢) وينفّذه موظف: البيانات الشخصية تنمسح، والفواتير والسجل تنحفظ.
// هنا تسجيل الطلب وقراءة حالته بس. ما ينمسح شي تلقائيًا.
import { accountDeletionBody } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.ts";
import { ApiError } from "../errors.ts";
import { actorOf, parse, type Ctx, type Guards } from "../http.ts";
import { rejectContactInfo } from "./offers.ts";

type DeletionRow = { id: string; status: string; requested_at: Date; note?: string | null };
// note: سبب الرفض لو رفضت الإدارة الطلب (يشوفه صاحب الطلب في «حسابي» عشان يعرف وش يسوي).
const view = (r: DeletionRow) => ({ id: r.id, status: r.status, requestedAt: new Date(r.requested_at).toISOString(), note: r.note ?? null });

export function accountRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  const partyUser = async (req: Parameters<Guards["authenticate"]>[0]) => {
    const user = await g.authenticate(req);
    // موظفين الإدارة حساباتهم يديرها المالك والمدير العام من اللوحة، مو من هنا.
    if (user.role !== "factory" && user.role !== "provider") throw new ApiError(403, "forbidden");
    return user;
  };

  app.get("/v1/account/deletion", async (req) => {
    const user = await partyUser(req);
    const [r] = await db.query<DeletionRow>(
      "SELECT id, status, requested_at, handled_note AS note FROM account_deletion_requests WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 1",
      [user.id],
    );
    return { request: r ? view(r) : null };
  });

  app.post("/v1/account/deletion", async (req, reply) => {
    const user = await partyUser(req);
    const body = parse(accountDeletionBody, req.body ?? {});
    rejectContactInfo({ reason: body.reason });
    const now = ctx.now();
    const row = await db.tx(async (t) => {
      const pending = await t.query("SELECT 1 FROM account_deletion_requests WHERE user_id=$1 AND status='pending'", [user.id]);
      if (pending.length) throw new ApiError(409, "deletion_pending");
      const [r] = await t.query<DeletionRow>(
        "INSERT INTO account_deletion_requests (user_id, role, reason, requested_at) VALUES ($1,$2,$3,$4) RETURNING id, status, requested_at",
        [user.id, user.role, body.reason || null, now],
      );
      // السبب ما ينكتب في السجل (ممكن فيه بيانات شخصية). ينحفظ في الطلب نفسه بس.
      await audit(t, actorOf(user), "account.deletion_requested", { type: "user", id: user.id });
      return r;
    });
    return reply.status(201).send({ request: view(row) });
  });
}
