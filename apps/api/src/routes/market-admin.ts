// مسارات لوحة الإدارة للسوق (الخطوة ب):
//  - توثيق البائعين (sellers.review): القائمة، والتفاصيل، ورابط مؤقت للسجل، والقرار.
//  - إخفاء منتج مخالف أو إرجاعه (market.moderate)، وإيقاف بائع (providers.suspend).
//  - الاشتراكات ودفعاتها اليدوية (subscriptions.manage)، والباقات (plans.manage)، والأرقام شهر بشهر (market.reports).
// كل إجراء ينكتب في سجل الإجراءات.
import { createHmac } from "node:crypto";
import { can, planUpdateBody, productModerationBody, sellerDecisionBody, subscriptionPaymentBody, type StaffRole } from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import { ApiError } from "../errors.ts";
import { FILE_LINK_TTL_SECONDS } from "../files.ts";
import { actorOf, parse, permissionMap, type Ctx, type Guards } from "../http.ts";
import { lastSubscriptionEnd, sellerState } from "../market.ts";
import { safeEqualHex } from "../security.ts";
import { getSettings } from "../settings.ts";
import { idParam } from "./market.ts";

// رابط مؤقت لسجل البائع: نفس فكرة files.ts، ببادئة مختلفة («sellerdoc») عشان رابط مستند مزوّد ما ينفع هنا.
const signSellerDoc = (secret: string, id: string, exp: number, by: string) =>
  createHmac("sha256", secret).update(`sellerdoc:${id}:${exp}:${by}`).digest("hex");

const statusQuery = z.object({ status: z.enum(["draft", "pending", "verified", "rejected", "suspended"]).optional() }).strict();

export function marketAdminRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;
  const now = () => ctx.now();

  // ───────── توثيق البائعين ─────────

  app.get("/v1/admin/market/sellers", async (req) => {
    await g.requireStaff(req, "sellers.review");
    const q = parse(statusQuery, req.query);
    const rows = await db.query(
      `SELECT s.factory_id AS id, f.name, s.status, s.submitted_at AS "submittedAt", s.verified_at AS "verifiedAt",
              (SELECT count(*)::int FROM products p WHERE p.seller_id = s.factory_id AND p.status <> 'removed') AS "productCount"
         FROM sellers s JOIN factories f ON f.id = s.factory_id
        WHERE ($1::text IS NULL OR s.status = $1::text)
        -- اللي ينتظر التوثيق: الأقدم أول (مثل قائمة توثيق المزوّدين).
        ORDER BY (s.status = 'pending') DESC, s.submitted_at ASC NULLS LAST, s.created_at DESC
        LIMIT 500`,
      [q.status ?? null],
    );
    return { sellers: rows };
  });

  app.get("/v1/admin/market/sellers/:id", async (req) => {
    await g.requireStaff(req, "sellers.review");
    const id = idParam(req);
    const { expiryWarningDays } = (await getSettings(db)).market;
    const state = await sellerState(db, id, now(), expiryWarningDays);
    if (!state) throw new ApiError(404, "not_found");
    const [f] = await db.query<{ name: string; commercial_register: string; vat_number: string }>(
      "SELECT name, commercial_register, vat_number FROM factories WHERE id=$1",
      [id],
    );
    const payments = await db.query(
      `SELECT p.amount_halalas::bigint AS "amountHalalas", p.paid_on AS "paidOn", p.reference, p.created_at AS "recordedAt"
         FROM subscription_payments p JOIN subscriptions s ON s.id = p.subscription_id
        WHERE s.subject_type='factory' AND s.subject_id=$1 ORDER BY p.created_at DESC LIMIT 50`,
      [id],
    );
    return {
      seller: { id, name: f.name, commercialRegister: f.commercial_register, vatNumber: f.vat_number, ...state },
      payments: payments.map((p) => ({ ...p, amountHalalas: Number(p.amountHalalas) })),
    };
  });

  // رابط مؤقت (٥ دقايق) لملف السجل. الفتح نفسه ينكتب في السجل.
  app.get("/v1/admin/market/seller-documents/:id/link", async (req) => {
    const u = await g.requireStaff(req, "sellers.review");
    const id = idParam(req);
    const [doc] = await db.query("SELECT 1 FROM seller_documents WHERE id=$1", [id]);
    if (!doc) throw new ApiError(404, "not_found");
    const exp = Math.floor(now().getTime() / 1000) + FILE_LINK_TTL_SECONDS;
    const sig = signSellerDoc(ctx.config.authSecret, id, exp, u.id);
    return { url: `/v1/seller-files/${id}?exp=${exp}&by=${u.id}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
  });

  app.get("/v1/seller-files/:id", async (req, reply) => {
    const id = idParam(req);
    const q = req.query as { exp?: string; by?: string; sig?: string };
    const exp = Number(q.exp);
    const ok =
      !!q.by && !!q.sig && /^[a-f0-9]{64}$/.test(q.sig) && Number.isInteger(exp) && exp >= Math.floor(now().getTime() / 1000) &&
      safeEqualHex(q.sig, signSellerDoc(ctx.config.authSecret, id, exp, q.by));
    if (!ok) throw new ApiError(403, "link_invalid_or_expired");
    // الموظف لازم يكون فعّال وعنده الصلاحية لحظة الفتح.
    const [st] = await db.query<{ role: StaffRole }>("SELECT role FROM staff WHERE user_id=$1 AND active", [q.by]);
    if (!st || !can(st.role, "sellers.review", await permissionMap(db))) throw new ApiError(403, "link_invalid_or_expired");
    const [row] = await db.query<{ storage_key: string; mime_type: string; factory_id: string }>(
      "SELECT storage_key, mime_type, factory_id FROM seller_documents WHERE id=$1",
      [id],
    );
    const bytes = row ? await ctx.storage.get(row.storage_key) : null;
    if (!row || !bytes) throw new ApiError(404, "not_found");
    await audit(db, { id: q.by!, role: st.role }, "seller.document_viewed", { type: "seller_document", id }, { factoryId: row.factory_id });
    return reply
      .header("content-type", row.mime_type)
      .header("content-disposition", "inline")
      .header("content-security-policy", "sandbox; default-src 'none'; img-src 'self'; object-src 'self'")
      .send(bytes);
  });

  // القرار: التوثيق يقبل السجل اللي ينتظر، والرفض يرفضه مع السبب (يوصل للمصنع).
  app.post("/v1/admin/market/sellers/:id/decision", async (req) => {
    const u = await g.requireStaff(req, "sellers.review");
    const id = idParam(req);
    const body = parse(sellerDecisionBody, req.body);
    await db.tx(async (t) => {
      const [s] = await t.query<{ status: string }>("SELECT status FROM sellers WHERE factory_id=$1 FOR UPDATE", [id]);
      if (!s) throw new ApiError(404, "not_found");
      if (s.status !== "pending") throw new ApiError(409, "not_pending");
      const [doc] = await t.query<{ id: string }>("SELECT id FROM seller_documents WHERE factory_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1", [id]);
      if (!doc) throw new ApiError(409, "documents_missing");
      if (body.decision === "verify") {
        // السجل الجديد يحل محل القديم المقبول.
        await t.query("UPDATE seller_documents SET status='replaced' WHERE factory_id=$1 AND status='approved'", [id]);
        await t.query("UPDATE seller_documents SET status='approved', reviewed_by=$2, reviewed_at=$3 WHERE id=$1", [doc.id, u.id, now()]);
        await t.query("UPDATE sellers SET status='verified', status_reason=NULL, verified_at=COALESCE(verified_at,$2), decided_by=$3, updated_at=now() WHERE factory_id=$1", [id, now(), u.id]);
      } else {
        await t.query("UPDATE seller_documents SET status='rejected', reject_reason=$2, reviewed_by=$3, reviewed_at=$4 WHERE id=$1", [doc.id, body.reason, u.id, now()]);
        // لو كان موثّق ويجدد سجله، يبقى موثّق بسجله القديم (لين ينتهي)، والرفض يخص السجل الجديد بس.
        const [approved] = await t.query("SELECT 1 FROM seller_documents WHERE factory_id=$1 AND status='approved'", [id]);
        await t.query("UPDATE sellers SET status=$2, status_reason=$3, decided_by=$4, updated_at=now() WHERE factory_id=$1", [
          id,
          approved ? "verified" : "rejected",
          body.reason,
          u.id,
        ]);
      }
      await audit(t, actorOf(u), body.decision === "verify" ? "seller.verified" : "seller.rejected", { type: "factory", id }, { reason: body.reason ?? null });
    });
    return { ok: true };
  });

  app.post("/v1/admin/market/sellers/:id/:action", async (req) => {
    const action = (req.params as { action: string }).action;
    if (action !== "suspend" && action !== "reinstate") throw new ApiError(404, "not_found");
    const u = await g.requireStaff(req, "providers.suspend");
    const id = idParam(req);
    const body = parse(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), req.body);
    const rows = await db.query(
      action === "suspend"
        ? "UPDATE sellers SET status='suspended', status_reason=$2, updated_at=now() WHERE factory_id=$1 AND status <> 'suspended' RETURNING factory_id"
        : `UPDATE sellers SET status=CASE WHEN EXISTS (SELECT 1 FROM seller_documents d WHERE d.factory_id=$1 AND d.status='approved') THEN 'verified' ELSE 'draft' END,
             status_reason=$2, updated_at=now() WHERE factory_id=$1 AND status='suspended' RETURNING factory_id`,
      [id, body.reason],
    );
    if (!rows.length) throw new ApiError(409, "invalid_transition");
    await audit(db, actorOf(u), action === "suspend" ? "seller.suspended" : "seller.reinstated", { type: "factory", id }, { reason: body.reason });
    return { ok: true };
  });

  // ───────── المنتجات المخالفة ─────────

  // قائمة المنتجات للمراجعة: بحث بالاسم، والمخالفة (removed) تقدر تطلع لحالها.
  app.get("/v1/admin/market/products", async (req) => {
    await g.requireStaff(req, "market.moderate");
    const q = parse(
      z.object({ q: z.string().trim().min(2).max(60).optional(), status: z.enum(["active", "hidden", "removed"]).optional() }).strict(),
      req.query,
    );
    const rows = await db.query(
      `SELECT p.id, p.name, p.status, p.category_id AS "categoryId", p.removed_reason AS "removedReason", p.updated_at AS "updatedAt",
              f.name AS "sellerName", p.seller_id AS "sellerId"
         FROM products p JOIN factories f ON f.id = p.seller_id
        WHERE ($1::text IS NULL OR p.name ILIKE '%' || $1 || '%' OR f.name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR p.status = $2::text)
        ORDER BY p.updated_at DESC LIMIT 200`,
      [q.q ?? null, q.status ?? null],
    );
    return { products: rows };
  });

  app.post("/v1/admin/market/products/:id/remove", async (req) => {
    const u = await g.requireStaff(req, "market.moderate");
    const id = idParam(req);
    const { reason } = parse(productModerationBody, req.body);
    const rows = await db.query("UPDATE products SET status='removed', removed_reason=$2, updated_at=now() WHERE id=$1 AND status <> 'removed' RETURNING id", [id, reason]);
    if (!rows.length) throw new ApiError(409, "invalid_transition");
    await audit(db, actorOf(u), "product.removed", { type: "product", id }, { reason });
    return { ok: true };
  });

  app.post("/v1/admin/market/products/:id/restore", async (req) => {
    const u = await g.requireStaff(req, "market.moderate");
    const id = idParam(req);
    const { reason } = parse(productModerationBody, req.body);
    // يرجع مخفي، والمصنع يظهره بنفسه بعد ما يتأكد إنه عدّله.
    const rows = await db.query("UPDATE products SET status='hidden', removed_reason=NULL, updated_at=now() WHERE id=$1 AND status='removed' RETURNING id", [id]);
    if (!rows.length) throw new ApiError(409, "invalid_transition");
    await audit(db, actorOf(u), "product.restored", { type: "product", id }, { reason });
    return { ok: true };
  });

  // ───────── الاشتراكات والدفعات ─────────

  app.get("/v1/admin/market/subscriptions", async (req) => {
    await g.requireStaff(req, "subscriptions.manage");
    const rows = await db.query<{ id: string; name: string; status: string; ends_at: Date | null; last_paid: string | null }>(
      `SELECT s.factory_id AS id, f.name, s.status,
              (SELECT max(sub.ends_at) FROM subscriptions sub WHERE sub.subject_type='factory' AND sub.subject_id=s.factory_id) AS ends_at,
              (SELECT max(p.paid_on)::text FROM subscription_payments p JOIN subscriptions sub ON sub.id=p.subscription_id
                WHERE sub.subject_type='factory' AND sub.subject_id=s.factory_id) AS last_paid
         FROM sellers s JOIN factories f ON f.id = s.factory_id ORDER BY ends_at ASC NULLS FIRST LIMIT 500`,
    );
    return {
      subscriptions: rows.map((r) => ({
        sellerId: r.id,
        name: r.name,
        sellerStatus: r.status,
        endsAt: r.ends_at,
        active: !!r.ends_at && new Date(r.ends_at) > now(),
        lastPaidOn: r.last_paid,
      })),
    };
  });

  // دفعة يدوية (تحويل بنكي): تمد الاشتراك من نهايته الحالية (أو من الحين لو انتهى) بعدد الأشهر.
  app.post("/v1/admin/market/sellers/:id/payments", async (req, reply) => {
    const u = await g.requireStaff(req, "subscriptions.manage");
    const id = idParam(req);
    const body = parse(subscriptionPaymentBody, req.body);
    const [seller] = await db.query("SELECT 1 FROM sellers WHERE factory_id=$1", [id]);
    if (!seller) throw new ApiError(404, "not_found");
    const [plan] = await db.query<{ monthly_price_halalas: string }>("SELECT monthly_price_halalas FROM subscription_plans WHERE id=$1 AND audience='seller'", [body.planId]);
    if (!plan) throw new ApiError(400, "plan_invalid");
    const result = await db.tx(async (t) => {
      const last = await lastSubscriptionEnd(t, "factory", id);
      const start = last && last > now() ? last : now();
      const end = addMonths(start, body.months);
      const [sub] = await t.query<{ id: string }>(
        `INSERT INTO subscriptions (subject_type, subject_id, plan_id, kind, starts_at, ends_at, created_by) VALUES ('factory',$1,$2,'paid',$3,$4,$5) RETURNING id`,
        [id, body.planId, start, end, u.id],
      );
      await t.query(
        "INSERT INTO subscription_payments (subscription_id, amount_halalas, paid_on, reference, recorded_by) VALUES ($1,$2,$3,$4,$5)",
        [sub.id, body.amountHalalas, body.paidOn, body.reference, u.id],
      );
      await audit(t, actorOf(u), "subscription.payment_recorded", { type: "factory", id }, { amountHalalas: body.amountHalalas, months: body.months, planId: body.planId });
      return { startsAt: start, endsAt: end };
    });
    // المبلغ المتوقع حسب الباقة، عشان موظف المالية يشوف لو فيه فرق (خصم أو خطأ).
    return reply.status(201).send({ ...result, expectedHalalas: Number(plan.monthly_price_halalas) * body.months });
  });

  // ───────── الباقات ─────────

  app.get("/v1/admin/market/plans", async (req) => {
    await g.requireStaff(req, "subscriptions.manage");
    const rows = await db.query(
      `SELECT id, audience, name_ar AS "nameAr", name_en AS "nameEn", monthly_price_halalas::bigint AS "monthlyPriceHalalas",
              max_products AS "maxProducts", featured, active FROM subscription_plans ORDER BY audience, monthly_price_halalas`,
    );
    return { plans: rows.map((p) => ({ ...p, monthlyPriceHalalas: Number(p.monthlyPriceHalalas) })) };
  });

  app.put("/v1/admin/market/plans/:planId", async (req) => {
    const u = await g.requireStaff(req, "plans.manage");
    const planId = (req.params as { planId: string }).planId;
    if (!/^[a-z_]{2,40}$/.test(planId)) throw new ApiError(404, "not_found");
    const body = parse(planUpdateBody, req.body);
    const [before] = await db.query<{ monthly_price_halalas: string; max_products: number | null }>("SELECT * FROM subscription_plans WHERE id=$1", [planId]);
    if (!before) throw new ApiError(404, "not_found");
    await db.query("UPDATE subscription_plans SET monthly_price_halalas=$2, max_products=$3, updated_at=now() WHERE id=$1", [planId, body.monthlyPriceHalalas, body.maxProducts]);
    await audit(db, actorOf(u), "plan.updated", { type: "plan", id: planId }, {
      from: { monthlyPriceHalalas: Number(before.monthly_price_halalas), maxProducts: before.max_products },
      to: body,
    });
    return { ok: true };
  });

  // ───────── الأرقام شهر بشهر (للوحة المالك) ─────────

  app.get("/v1/admin/market/stats", async (req) => {
    await g.requireStaff(req, "market.reports");
    // آخر ١٢ شهر بتوقيت السعودية.
    const rows = await db.query<{ month: string; income: string; requests: number; accepted: number; accepted_value: string; subscribed: number }>(
      `WITH months AS (
         SELECT to_char(date_trunc('month', ($1::timestamptz AT TIME ZONE 'Asia/Riyadh')) - (n || ' month')::interval, 'YYYY-MM') AS month
           FROM generate_series(0, 11) AS n
       )
       SELECT m.month,
              COALESCE((SELECT sum(p.amount_halalas) FROM subscription_payments p WHERE to_char(p.paid_on, 'YYYY-MM') = m.month), 0)::text AS income,
              (SELECT count(*)::int FROM purchase_requests r WHERE to_char(r.created_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = m.month) AS requests,
              (SELECT count(*)::int FROM purchase_requests r WHERE r.accepted_at IS NOT NULL AND to_char(r.accepted_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = m.month) AS accepted,
              COALESCE((SELECT sum(q.total_halalas) FROM purchase_requests r JOIN purchase_quotes q ON q.id = r.accepted_quote_id
                         WHERE to_char(r.accepted_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = m.month), 0)::text AS accepted_value,
              (SELECT count(DISTINCT s.subject_id)::int FROM subscriptions s
                WHERE s.subject_type='factory' AND to_char(s.starts_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') <= m.month
                  AND to_char((s.ends_at - interval '1 second') AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') >= m.month) AS subscribed
         FROM months m ORDER BY m.month`,
      [now()],
    );
    return {
      months: rows.map((r) => ({
        month: r.month,
        subscriptionIncomeHalalas: Number(r.income),
        subscribedSellers: r.subscribed,
        purchaseRequests: r.requests,
        acceptedPurchases: r.accepted,
        acceptedValueHalalas: Number(r.accepted_value),
      })),
    };
  });
}

/** يضيف أشهر للتاريخ (نفس اليوم في الشهر، ولو ما فيه مثل ٣١ يرجع لآخر يوم). */
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}
