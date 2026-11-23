// لوحة الإدارة (الخطوة هـ-٢، docs/plans/admin-panel.md): «بانتظارك»، والإعدادات، والصلاحيات، وطلبات حذف الحساب، والأرقام.
// كل مسار يفحص الصلاحية في الخادم بالجدول الفعلي (بعد تعديلات المالك). والواجهة تخفي الأزرار بس.
//
//   GET  /v1/admin/overview                 عدد اللي ينتظر كل قسم، حسب صلاحيات الموظف
//   GET  /v1/admin/settings                 الإعدادات الحالية (settings.manage)
//   PUT  /v1/admin/settings/:key            تعديل إعداد واحد. العمولة للمالك بس (settings.commission)
//   GET  /v1/admin/permissions              جدول الصلاحيات: الافتراضي والفعلي والمقفول (permissions.manage)
//   PUT  /v1/admin/permissions              تعديل الجدول (المالك بس)
//   GET  /v1/admin/deletions                طلبات حذف الحساب (accounts.delete)
//   POST /v1/admin/deletions/:id/complete   تنفيذ الحذف: مسح البيانات الشخصية، والفواتير والسجل تبقى
//   POST /v1/admin/deletions/:id/reject     رفض مع السبب
//   GET  /v1/admin/stats                    أرقام الخدمات آخر ١٢ شهر، والعرض والطلب في كل قسم (reports.view)
import {
  can,
  LOCKED_PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSIONS,
  reasonBody,
  resolvePermissions,
  rolePermissionsSchema,
  SETTING_KEYS,
  SETTINGS_SCHEMA,
  STAFF_ROLES,
  uuidSchema,
  type RolePermissions,
  type SettingKey,
} from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { actorOf, parse, type Ctx, type Guards } from "../http.ts";
import { getSettings, setSetting } from "../settings.ts";

/** حالات الطلب اللي تعتبر «جارية»: ما ينحذف الحساب وعنده منها (لازم يخلص أو ينلغي أول). */
export const ACTIVE_REQUEST_STATUSES = ["awaiting_offers", "pending_approval", "accepted", "in_progress", "delivered", "disputed"];

/** إعدادات ما تتعدّل من شاشة الإعدادات: الصلاحيات لها شاشتها وصلاحيتها (permissions.manage). */
const NOT_EDITABLE_HERE: SettingKey[] = ["rolePermissions"];

const idParam = (req: { params: unknown }) => {
  const id = (req.params as { id: string }).id;
  if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
};

const settingBody = z.object({ value: z.unknown() }).strict();
const permissionsBody = z.object({ rolePermissions: rolePermissionsSchema }).strict();
const deletionsQuery = z.object({ status: z.enum(["pending", "done", "rejected"]).optional() }).strict();

export function platformAdminRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  // ───────── «بانتظارك»: أول صفحة في اللوحة ─────────
  // كل رقم يرجع بس لو الموظف عنده صلاحية القسم. الباقي null (الواجهة ما تعرضه).
  app.get("/v1/admin/overview", async (req) => {
    const u = await g.requireStaff(req);
    const has = (p: Parameters<typeof can>[1]) => can(u.staffRole, p, u.perms);
    const count = async (sql: string) => (await db.query<{ n: number }>(sql))[0].n;
    return {
      providersQueue: has("providers.review")
        ? await count(
            `SELECT count(DISTINCT p.id)::int AS n FROM providers p
               LEFT JOIN provider_documents d ON d.provider_id = p.id AND d.status = 'pending'
              WHERE p.status = 'pending' OR (p.status = 'verified' AND d.id IS NOT NULL)`,
          )
        : null,
      sellersQueue: has("sellers.review") ? await count("SELECT count(*)::int AS n FROM sellers WHERE status = 'pending'") : null,
      identityPending: has("customers.identity")
        ? await count("SELECT count(*)::int AS n FROM factories WHERE kind = 'individual' AND id_number_enc IS NOT NULL AND identity_verified_at IS NULL")
        : null,
      openDisputes: has("disputes.manage") ? await count("SELECT count(*)::int AS n FROM disputes WHERE status = 'open'") : null,
      pendingDeletions: has("accounts.delete") ? await count("SELECT count(*)::int AS n FROM account_deletion_requests WHERE status = 'pending'") : null,
      // اشتراكات تنتهي خلال ٧ أيام أو انتهت لبائعين موثّقين: المالية تتابع الدفع.
      subscriptionsDue: has("subscriptions.manage")
        ? (
            await db.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM sellers s
                WHERE s.status = 'verified'
                  AND COALESCE((SELECT max(sub.ends_at) FROM subscriptions sub WHERE sub.subject_type='factory' AND sub.subject_id=s.factory_id), '-infinity')
                      < $1::timestamptz + interval '7 days'`,
              [ctx.now()],
            )
          )[0].n
        : null,
    };
  });

  // ───────── الإعدادات ─────────

  app.get("/v1/admin/settings", async (req) => {
    const u = await g.requireStaff(req, "settings.manage");
    const settings = await getSettings(db);
    const { rolePermissions: _hidden, ...editable } = settings;
    return { settings: editable, canEditCommission: can(u.staffRole, "settings.commission", u.perms) };
  });

  app.put("/v1/admin/settings/:key", async (req) => {
    const u = await g.requireStaff(req, "settings.manage");
    const key = (req.params as { key: string }).key as SettingKey;
    if (!(SETTING_KEYS as string[]).includes(key) || NOT_EDITABLE_HERE.includes(key)) throw new ApiError(404, "not_found");
    const { value } = parse(settingBody, req.body);
    const parsed = SETTINGS_SCHEMA.shape[key].safeParse(value);
    if (!parsed.success) throw new ApiError(400, "validation");
    // العمولة قرار المالك بس (CLAUDE.md): أي تغيير فيها، حتى لو جا داخل كائن market كامل، يُرفض لغيره.
    if (key === "market") {
      const before = (await getSettings(db)).market.commissionBps;
      const after = (parsed.data as { commissionBps: number }).commissionBps;
      if (before !== after && !can(u.staffRole, "settings.commission", u.perms)) throw new ApiError(403, "owner_only");
    }
    const settings = await setSetting(db, actorOf(u), key, parsed.data as never);
    const { rolePermissions: _hidden, ...editable } = settings;
    return { settings: editable };
  });

  // ───────── الصلاحيات (المالك بس) ─────────
  // المالك يقرر مين يشوف وش، بدون مبرمج. المالك عنده كل شي دائمًا، والمقفولة ما تتغيّر.

  app.get("/v1/admin/permissions", async (req) => {
    const u = await g.requireStaff(req, "permissions.manage");
    return {
      roles: STAFF_ROLES,
      permissions: PERMISSION_KEYS,
      defaults: PERMISSIONS,
      current: u.perms,
      locked: LOCKED_PERMISSIONS,
    };
  });

  app.put("/v1/admin/permissions", async (req) => {
    const u = await g.requireStaff(req, "permissions.manage");
    const body = parse(permissionsBody, req.body);
    const overrides = body.rolePermissions as RolePermissions;
    for (const p of Object.keys(overrides) as (keyof typeof PERMISSIONS)[]) {
      if (LOCKED_PERMISSIONS.includes(p)) throw new ApiError(400, "permission_locked");
    }
    // نحفظ بس اللي يختلف عن الافتراضي، عشان أي تعديل على الافتراضي في الكود يوصل للباقي.
    const clean: RolePermissions = {};
    for (const p of Object.keys(overrides) as (keyof typeof PERMISSIONS)[]) {
      const roles = STAFF_ROLES.filter((r) => r === "owner" || overrides[p]!.includes(r));
      const base = STAFF_ROLES.filter((r) => (PERMISSIONS[p] as readonly string[]).includes(r));
      if (roles.join() !== base.join()) clean[p] = roles;
    }
    await setSetting(db, actorOf(u), "rolePermissions", clean);
    return { current: resolvePermissions(clean) };
  });

  // ───────── طلبات حذف الحساب ─────────

  app.get("/v1/admin/deletions", async (req) => {
    await g.requireStaff(req, "accounts.delete");
    const q = parse(deletionsQuery, req.query);
    const rows = await db.query(
      `SELECT d.id, d.role, d.reason, d.status, d.requested_at AS "requestedAt", d.handled_at AS "handledAt", d.handled_note AS "note",
              u.phone, u.status AS "userStatus",
              COALESCE(p.trade_name, f.name) AS name, f.kind AS "customerKind"
         FROM account_deletion_requests d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN providers p ON p.user_id = d.user_id
         LEFT JOIN factory_members fm ON fm.user_id = d.user_id
         LEFT JOIN factories f ON f.id = fm.factory_id
        WHERE ($1::text IS NULL OR d.status = $1::text)
        ORDER BY (d.status = 'pending') DESC, d.requested_at ASC
        LIMIT 500`,
      [q.status ?? null],
    );
    return { deletions: rows };
  });

  app.post("/v1/admin/deletions/:id/complete", async (req) => {
    const u = await g.requireStaff(req, "accounts.delete");
    const id = idParam(req);
    const purgedKeys = await db.tx((t) => completeDeletion(t, actorOf(u), id, ctx.now()));
    // ملفات الهوية تنمسح من التخزين بعد ما ينحفظ القرار. لو فشل مسح ملف، السطر معلّم ونعيد المحاولة يدويًا.
    for (const key of purgedKeys) await ctx.storage.remove(key);
    return { ok: true };
  });

  app.post("/v1/admin/deletions/:id/reject", async (req) => {
    const u = await g.requireStaff(req, "accounts.delete");
    const id = idParam(req);
    const { reason } = parse(reasonBody, req.body);
    const rows = await db.query<{ user_id: string }>(
      `UPDATE account_deletion_requests SET status='rejected', handled_at=$2, handled_by=$3, handled_note=$4
        WHERE id=$1 AND status='pending' RETURNING user_id`,
      [id, ctx.now(), u.id, reason],
    );
    if (!rows[0]) throw new ApiError(409, "deletion_not_pending");
    await audit(db, actorOf(u), "account.deletion_rejected", { type: "user", id: rows[0].user_id }, { requestId: id, reason });
    return { ok: true };
  });

  // ───────── الأرقام ─────────

  app.get("/v1/admin/stats", async (req) => {
    await g.requireStaff(req, "reports.view");
    return serviceStats(db, ctx.now());
  });
}

/**
 * تنفيذ طلب الحذف (داخل معاملة). يمسح البيانات الشخصية، ويبقي الفواتير والطلبات والسجل والرسائل بدون الاسم.
 * يرجّع مفاتيح ملفات الهوية اللي لازم تنمسح من التخزين.
 * ما ينفّذ لو عند المستخدم طلب جاري أو بلاغ مفتوح: لازم يخلص أو ينلغي أول (والموظف يشوف السبب).
 */
export async function completeDeletion(t: Db, actor: { id: string; role: string }, requestId: string, now: Date): Promise<string[]> {
  const [d] = await t.query<{ user_id: string; role: "factory" | "provider"; status: string }>(
    "SELECT user_id, role, status FROM account_deletion_requests WHERE id=$1 FOR UPDATE",
    [requestId],
  );
  if (!d) throw new ApiError(404, "not_found");
  if (d.status !== "pending") throw new ApiError(409, "deletion_not_pending");
  const userId = d.user_id;
  const purged: string[] = [];

  if (d.role === "provider") {
    const [p] = await t.query<{ id: string }>("SELECT id FROM providers WHERE user_id=$1", [userId]);
    if (p) {
      const [busy] = await t.query<{ n: number }>("SELECT count(*)::int AS n FROM orders WHERE provider_id=$1 AND state='open'", [p.id]);
      if (busy.n > 0) throw new ApiError(409, "deletion_has_active_orders");
      // العروض المفتوحة تنسحب، والمزوّد يوقف (ما يظهر ولا يستقبل طلبات).
      await t.query("UPDATE offers SET status='withdrawn', updated_at=$2 WHERE provider_id=$1 AND status='active'", [p.id, now]);
      await t.query(
        `UPDATE providers SET owner_name=NULL, id_number_enc=NULL, id_number_last4=NULL,
                status='suspended', status_reason='account_deleted', updated_at=$2 WHERE id=$1`,
        [p.id, now],
      );
      const docs = await t.query<{ storage_key: string }>(
        "UPDATE provider_documents SET purged_at=$2 WHERE provider_id=$1 AND doc_type='id_document' AND purged_at IS NULL RETURNING storage_key",
        [p.id, now],
      );
      purged.push(...docs.map((r) => r.storage_key));
    }
  } else {
    const [m] = await t.query<{ factory_id: string; kind: string | null; others: number }>(
      `SELECT fm.factory_id, f.kind,
              (SELECT count(*)::int FROM factory_members o WHERE o.factory_id = fm.factory_id AND o.user_id <> fm.user_id AND o.active) AS others
         FROM factory_members fm JOIN factories f ON f.id = fm.factory_id WHERE fm.user_id=$1`,
      [userId],
    );
    if (m) {
      // آخر شخص في المنشأة (أو فرد): طلباته الجارية لازم تخلص أول. موظف من منشأة فيها غيره: الطلبات تبقى لهم.
      if (m.others === 0) {
        const [busy] = await t.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM requests WHERE factory_id=$1 AND status = ANY($2::text[])",
          [m.factory_id, ACTIVE_REQUEST_STATUSES],
        );
        if (busy.n > 0) throw new ApiError(409, "deletion_has_active_orders");
      }
      await t.query("UPDATE factory_members SET active=false WHERE user_id=$1", [userId]);
      // الفرد: اسمه وهويته بيانات شخصية تنمسح. المنشأة: اسمها وسجلها بيانات منشأة تبقى للفواتير.
      if (m.kind === "individual") {
        await t.query(
          "UPDATE factories SET name=NULL, id_number_enc=NULL, id_number_last4=NULL, updated_at=$2 WHERE id=$1",
          [m.factory_id, now],
        );
      }
    }
  }

  await t.query("UPDATE users SET phone=NULL, display_name=NULL, status='deleted', deleted_at=$2 WHERE id=$1", [userId, now]);
  await t.query("UPDATE sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL", [userId, now]);
  await t.query("UPDATE push_tokens SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL", [userId, now]);
  await t.query("UPDATE account_deletion_requests SET status='done', handled_at=$2, handled_by=$3 WHERE id=$1", [requestId, now, actor.id]);
  await audit(t, actor, "account.deleted", { type: "user", id: userId }, { requestId, role: d.role, filesPurged: purged.length });
  return purged;
}

type MonthRow = {
  month: string;
  requests: number;
  customers: number;
  providers: number;
  offers: number;
  first_offer_minutes: string | null;
  completed: number;
  completed_cohort: number;
  completed_value: string;
  cancelled: number;
  disputed: number;
  new_providers: number;
};

/**
 * أرقام الخدمات لآخر ١٢ شهر بتوقيت السعودية.
 * - «صحة المنصة» (متوسط العروض، والوقت لأول عرض، ونسب الإكمال والإلغاء والبلاغات) تنحسب على الطلبات اللي انرفعت في الشهر.
 * - «المكتمل وقيمته» على الطلبات اللي تأكد استلامها في الشهر.
 * - «النشطين»: عملاء رفعوا طلب، ومزوّدين أرسلوا عرض، في الشهر.
 * - إيراد العمولة صفر لين تنبني العمولة (المرحلة ٥، القرار ٥٠).
 */
export async function serviceStats(db: Db, now: Date) {
  const rows = await db.query<MonthRow>(
    `WITH months AS (
       SELECT to_char(date_trunc('month', ($1::timestamptz AT TIME ZONE 'Asia/Riyadh')) - (n || ' month')::interval, 'YYYY-MM') AS month
         FROM generate_series(0, 11) AS n
     ),
     req AS (
       SELECT r.id, r.factory_id, r.status, to_char(r.created_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') AS month,
              (SELECT count(*) FROM offers o WHERE o.request_id = r.id) AS offers,
              (SELECT extract(epoch FROM min(o.created_at) - r.created_at) / 60 FROM offers o WHERE o.request_id = r.id) AS first_offer_minutes,
              EXISTS (SELECT 1 FROM disputes d WHERE d.request_id = r.id) AS disputed
         FROM requests r
     )
     SELECT m.month,
            (SELECT count(*)::int FROM req WHERE req.month = m.month) AS requests,
            (SELECT count(DISTINCT req.factory_id)::int FROM req WHERE req.month = m.month) AS customers,
            (SELECT count(DISTINCT o.provider_id)::int FROM offers o WHERE to_char(o.created_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = m.month) AS providers,
            (SELECT COALESCE(sum(req.offers), 0)::int FROM req WHERE req.month = m.month) AS offers,
            (SELECT avg(req.first_offer_minutes)::text FROM req WHERE req.month = m.month) AS first_offer_minutes,
            (SELECT count(*)::int FROM orders o WHERE o.confirmed_at IS NOT NULL AND to_char(o.confirmed_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = m.month) AS completed,
            (SELECT COALESCE(sum(o.price_halalas), 0)::text FROM orders o WHERE o.confirmed_at IS NOT NULL AND to_char(o.confirmed_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = m.month) AS completed_value,
            (SELECT count(*)::int FROM req WHERE req.month = m.month AND req.status = 'completed') AS completed_cohort,
            (SELECT count(*)::int FROM req WHERE req.month = m.month AND req.status = 'cancelled') AS cancelled,
            (SELECT count(*)::int FROM req WHERE req.month = m.month AND req.disputed) AS disputed,
            (SELECT count(*)::int FROM providers p WHERE p.verified_at IS NOT NULL AND to_char(p.verified_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM') = m.month) AS new_providers
       FROM months m ORDER BY m.month`,
    [now],
  );
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

  // العرض والطلب في كل قسم: طلبات آخر ٩٠ يوم مقابل المزوّدين الموثّقين في القسم. «فرصة» = طلبات كثير ومزوّدين قليل.
  const categories = await db.query<{ category: string; requests: number; providers: number }>(
    `WITH c AS (SELECT DISTINCT category FROM requests UNION SELECT DISTINCT unnest(categories) FROM providers WHERE status = 'verified')
     SELECT c.category,
            (SELECT count(*)::int FROM requests r WHERE r.category = c.category AND r.created_at > $1::timestamptz - interval '90 days') AS requests,
            (SELECT count(*)::int FROM providers p WHERE p.status = 'verified' AND c.category = ANY(p.categories)) AS providers
       FROM c ORDER BY requests DESC, c.category`,
    [now],
  );

  const [totals] = await db.query<{ providers: number; customers: number }>(
    `SELECT (SELECT count(*)::int FROM providers WHERE status = 'verified') AS providers,
            (SELECT count(*)::int FROM factories f WHERE EXISTS (SELECT 1 FROM factory_members fm JOIN users u ON u.id = fm.user_id
                                                                 WHERE fm.factory_id = f.id AND fm.active AND u.status = 'active')) AS customers`,
  );

  return {
    months: rows.map((r) => ({
      month: r.month,
      requests: r.requests,
      activeCustomers: r.customers,
      activeProviders: r.providers,
      newVerifiedProviders: r.new_providers,
      avgOffersPerRequest: r.requests > 0 ? Math.round((r.offers / r.requests) * 10) / 10 : null,
      avgMinutesToFirstOffer: r.first_offer_minutes == null ? null : Math.round(Number(r.first_offer_minutes)),
      completed: r.completed,
      completedValueHalalas: Number(r.completed_value),
      commissionHalalas: 0,
      completionRatePct: pct(r.completed_cohort, r.requests),
      cancelRatePct: pct(r.cancelled, r.requests),
      disputeRatePct: pct(r.disputed, r.requests),
    })),
    categories: categories.map((c) => ({ ...c, requestsPerProvider: c.providers > 0 ? Math.round((c.requests / c.providers) * 10) / 10 : null })),
    totals: { verifiedProviders: totals.providers, customers: totals.customers },
  };
}
