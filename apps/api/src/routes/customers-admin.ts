// مسارات لوحة الإدارة للعملاء (منشآت وأفراد، القرار ٤١).
// رقم هوية الفرد ما يطلع كامل إلا لصلاحية customers.identity، وكل اطلاع ينكتب في السجل (PDPL).
import { uuidSchema } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import { ApiError } from "../errors.ts";
import { actorOf, parse, type Ctx, type Guards } from "../http.ts";
import { identityStatus, markIdentityVerified, profileComplete, type CustomerRow } from "../identity.ts";
import { can } from "@mazood/shared";

const listQuery = z
  .object({ kind: z.enum(["business", "individual"]).optional(), identity: z.enum(["pending", "verified"]).optional() })
  .strict();

const idParam = (req: { params: unknown }) => {
  const id = (req.params as { id: string }).id;
  if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
};

export function customerAdminRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  // قائمة العملاء: الأحدث أول. بدون أرقام الهوية.
  app.get("/v1/admin/customers", async (req) => {
    await g.requireStaff(req, "customers.view");
    const q = parse(listQuery, req.query);
    const rows = await db.query<CustomerRow & { created_at: Date; request_count: number }>(
      `SELECT f.*, (SELECT count(*)::int FROM requests r WHERE r.factory_id = f.id) AS request_count
         FROM factories f
        WHERE ($1::text IS NULL OR f.kind = $1::text)
          AND ($2::text IS NULL OR (f.kind = 'individual' AND (($2 = 'verified') = (f.identity_verified_at IS NOT NULL))))
        ORDER BY f.created_at DESC LIMIT 500`,
      [q.kind ?? null, q.identity ?? null],
    );
    return {
      customers: rows.map((f) => ({
        id: f.id,
        kind: f.kind,
        name: f.name,
        cityId: f.city_id,
        profileComplete: profileComplete(f),
        identity: identityStatus(f),
        requestCount: f.request_count,
        createdAt: f.created_at,
      })),
    };
  });

  app.get("/v1/admin/customers/:id", async (req) => {
    const u = await g.requireStaff(req, "customers.view");
    const id = idParam(req);
    const [f] = await db.query<CustomerRow & { created_at: Date }>("SELECT * FROM factories WHERE id=$1", [id]);
    if (!f) throw new ApiError(404, "not_found");
    const members = await db.query(
      `SELECT u.phone, fm.role, fm.active FROM factory_members fm JOIN users u ON u.id = fm.user_id WHERE fm.factory_id=$1 ORDER BY fm.created_at`,
      [id],
    );
    const canSeeId = can(u.staffRole, "customers.identity") && !!f.id_number_enc;
    if (canSeeId) await audit(db, actorOf(u), "customer.id_number_viewed", { type: "factory", id });
    return {
      customer: {
        id: f.id,
        kind: f.kind,
        name: f.name,
        cityId: f.city_id,
        commercialRegister: f.commercial_register,
        vatNumber: f.vat_number,
        idType: f.id_type,
        idNumber: f.id_number_enc ? (canSeeId ? ctx.box.decrypt(f.id_number_enc) : `******${f.id_number_last4}`) : null,
        identity: { status: identityStatus(f), verifiedAt: f.identity_verified_at, method: f.identity_method },
        profileComplete: profileComplete(f),
        members,
        createdAt: f.created_at,
      },
    };
  });

  // تأكيد هوية الفرد يدويًا (مثلًا الموظف شاف الهوية الأصلية). مؤقت لين يجهز نفاذ، وينكتب في السجل.
  app.post("/v1/admin/customers/:id/verify-identity", async (req) => {
    const u = await g.requireStaff(req, "customers.identity");
    const ok = await markIdentityVerified(db, actorOf(u), idParam(req), "manual", ctx.now());
    if (!ok) throw new ApiError(409, "not_individual");
    return { ok: true };
  });
}
