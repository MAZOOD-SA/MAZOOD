// لوحة الإدارة (المرحلة ٣): قائمة التوثيق، ومراجعة المستندات، وقرار التوثيق، والإيقاف، والموظفين، والسجل.
// كل مسار يفحص صلاحية دور الموظف في الخادم (جدول PERMISSIONS في الحزمة المشتركة).
import {
  addStaffBody,
  can,
  canManageRole,
  DOC_CHECKLISTS,
  documentReviewBody,
  PERMISSIONS,
  providerDecisionBody,
  reasonBody,
  uuidSchema,
  type Permission,
  type StaffRole,
} from "@mazood/shared";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.ts";
import { providerReliability } from "../cancellations.ts";
import { ApiError } from "../errors.ts";
import { signFileLink, verifyFileLink } from "../files.ts";
import { actorOf, addDays, parse, todayRiyadh, type Ctx, type Guards } from "../http.ts";
import { loadDoc, loadDocs, slotView, summarize, type ProviderRow } from "../providers.ts";

const idParam = (req: { params: unknown }) => {
  const id = (req.params as { id: string }).id;
  if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
};

export function adminRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;
  const today = () => todayRiyadh(ctx.now());

  async function providerById(id: string): Promise<ProviderRow> {
    const rows = await db.query<ProviderRow>("SELECT * FROM providers WHERE id = $1", [id]);
    if (!rows[0]) throw new ApiError(404, "not_found");
    return rows[0];
  }

  app.get("/v1/admin/me", async (req) => {
    const u = await g.requireStaff(req);
    const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(u.staffRole, p));
    return { staffRole: u.staffRole, permissions };
  });

  // قائمة التوثيق: مزوّدين ينتظرون التوثيق، أو عندهم مستند جديد (تجديد) ينتظر. الأقدم أول.
  app.get("/v1/admin/queue", async (req) => {
    await g.requireStaff(req, "providers.review");
    const rows = await db.query(
      `SELECT p.id, p.trade_name AS "tradeName", p.categories, p.status,
              LEAST(p.submitted_at, MIN(d.created_at)) AS "waitingSince",
              COUNT(d.id)::int AS "pendingDocs"
         FROM providers p
         LEFT JOIN provider_documents d ON d.provider_id = p.id AND d.status = 'pending'
        WHERE p.status = 'pending' OR (p.status = 'verified' AND d.id IS NOT NULL)
        GROUP BY p.id
        ORDER BY "waitingSince" ASC NULLS LAST
        LIMIT 200`,
    );
    return { queue: rows };
  });

  // مستندات تنتهي خلال ٣٠ يوم أو انتهت، للمزوّدين الموثّقين.
  app.get("/v1/admin/expiring", async (req) => {
    await g.requireStaff(req, "providers.review");
    const rows = await db.query(
      `SELECT d.id AS "documentId", d.doc_type AS "docType", to_char(d.expires_on, 'YYYY-MM-DD') AS "expiresOn",
              p.id AS "providerId", p.trade_name AS "tradeName"
         FROM provider_documents d JOIN providers p ON p.id = d.provider_id
        WHERE d.status = 'approved' AND p.status = 'verified' AND d.expires_on <= $1::date
        ORDER BY d.expires_on ASC LIMIT 500`,
      [addDays(today(), 30)],
    );
    return { expiring: rows.map((r) => ({ ...r, expired: String(r.expiresOn) < today() })) };
  });

  app.get("/v1/admin/providers", async (req) => {
    await g.requireStaff(req, "providers.view");
    const status = (req.query as { status?: string }).status;
    const rows = await db.query(
      `SELECT id, trade_name AS "tradeName", categories, status, submitted_at AS "submittedAt", verified_at AS "verifiedAt"
         FROM providers WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT 500`,
      [status && /^[a-z]+$/.test(status) ? status : null],
    );
    return { providers: rows };
  });

  app.get("/v1/admin/providers/:id", async (req) => {
    const u = await g.requireStaff(req, "providers.view");
    const p = await providerById(idParam(req));
    const s = summarize(p, await loadDocs(db, p.id), today());
    const canSeeId = can(u.staffRole, "documents.view");
    const [owner] = await db.query<{ phone: string }>("SELECT phone FROM users WHERE id = $1", [p.user_id]);
    if (canSeeId) {
      // الاطلاع على رقم الهوية الكامل ينكتب في السجل (PDPL: مين اطلع على بيانات شخصية ومتى).
      await audit(db, actorOf(u), "provider.id_number_viewed", { type: "provider", id: p.id });
    }
    return {
      provider: {
        id: p.id,
        tradeName: p.trade_name,
        ownerName: p.owner_name,
        phone: owner?.phone,
        idType: p.id_type,
        idNumber: canSeeId ? ctx.box.decrypt(p.id_number_enc) : `******${p.id_number_last4}`,
        commercialRegister: p.commercial_register,
        categories: p.categories,
        status: p.status,
        statusReason: p.status_reason,
        submittedAt: p.submitted_at,
        verifiedAt: p.verified_at,
        verified: s.effectiveVerified,
        allApprovedValid: s.allApprovedValid,
        documents: s.slots.map(slotView),
        // كم مرة انقبل عرضه، وكم مرة اعتذر بعد القبول (قرار الإيقاف عند الإدارة: إجراء «إيقاف مزوّد مخالف»).
        reliability: await providerReliability(db, p.id),
      },
      checklists: DOC_CHECKLISTS,
    };
  });

  // رابط مؤقت لفتح ملف مستند.
  app.get("/v1/admin/documents/:id/link", async (req) => {
    const u = await g.requireStaff(req, "documents.view");
    const doc = await loadDoc(db, idParam(req));
    if (!doc) throw new ApiError(404, "not_found");
    return signFileLink(ctx.config.authSecret, doc.id, u.id, ctx.now());
  });

  // فتح الملف نفسه بالرابط المؤقت (بدون توكن: التوقيع هو الإذن).
  app.get("/v1/files/:id", async (req, reply) => {
    const id = idParam(req);
    const by = verifyFileLink(ctx.config.authSecret, id, req.query as Record<string, string>, ctx.now());
    if (!by) throw new ApiError(403, "link_invalid_or_expired");
    // نتأكد إن الموظف ما زال فعّال وعنده الصلاحية لحظة الفتح.
    const [st] = await db.query<{ role: StaffRole }>("SELECT role FROM staff WHERE user_id = $1 AND active", [by]);
    if (!st || !can(st.role, "documents.view")) throw new ApiError(403, "link_invalid_or_expired");
    const [row] = await db.query<{ storage_key: string; mime_type: string; provider_id: string }>(
      "SELECT storage_key, mime_type, provider_id FROM provider_documents WHERE id = $1",
      [id],
    );
    const bytes = row ? await ctx.storage.get(row.storage_key) : null;
    if (!row || !bytes) throw new ApiError(404, "not_found");
    await audit(db, { id: by, role: st.role }, "document.viewed", { type: "provider_document", id }, { providerId: row.provider_id });
    const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }[row.mime_type] ?? "bin";
    return reply
      .header("content-type", row.mime_type)
      .header("content-disposition", `inline; filename="document.${ext}"`)
      .header("content-security-policy", "sandbox; default-src 'none'; img-src 'self'; object-src 'self'")
      .send(bytes);
  });

  // مراجعة مستند: قبول (بعد التأشير على كل بنود قائمة التحقق) أو رفض مع السبب.
  app.post("/v1/admin/documents/:id/review", async (req) => {
    const u = await g.requireStaff(req, "providers.review");
    const body = parse(documentReviewBody, req.body);
    const doc = await loadDoc(db, idParam(req));
    if (!doc) throw new ApiError(404, "not_found");
    if (doc.status !== "pending") throw new ApiError(409, "document_not_pending");
    if (body.decision === "approve") {
      const missing = DOC_CHECKLISTS[doc.doc_type].filter((i) => !body.checklist.includes(i.id));
      if (missing.length) throw new ApiError(400, "checklist_incomplete", undefined, { missing: missing.map((m) => m.id) });
      if (doc.expires_on < today()) throw new ApiError(409, "doc_expired");
    }
    await db.tx(async (t) => {
      if (body.decision === "approve") {
        // النسخة المقبولة القديمة (لو كان هذا تجديد) تنشال.
        await t.query(
          `UPDATE provider_documents SET status='replaced' WHERE provider_id=$1 AND doc_type=$2 AND status='approved' AND id<>$3`,
          [doc.provider_id, doc.doc_type, doc.id],
        );
      }
      const updated = await t.query(
        `UPDATE provider_documents SET status=$2, checklist=$3, rejection_reason=$4, reviewed_by=$5, reviewed_at=$6
          WHERE id=$1 AND status='pending' RETURNING id`,
        [doc.id, body.decision === "approve" ? "approved" : "rejected", JSON.stringify(body.checklist), body.decision === "reject" ? body.reason!.trim() : null, u.id, ctx.now()],
      );
      if (updated.length === 0) throw new ApiError(409, "document_not_pending");
      await audit(t, actorOf(u), body.decision === "approve" ? "document.approved" : "document.rejected", { type: "provider_document", id: doc.id }, {
        providerId: doc.provider_id,
        docType: doc.doc_type,
        ...(body.decision === "reject" ? { reason: body.reason!.trim() } : {}),
      });
    });
    return { ok: true };
  });

  // قرار التوثيق للمزوّد كامل.
  app.post("/v1/admin/providers/:id/decision", async (req) => {
    const u = await g.requireStaff(req, "providers.review");
    const body = parse(providerDecisionBody, req.body);
    const p = await providerById(idParam(req));
    if (p.status !== "pending") throw new ApiError(409, "provider_not_pending");
    if (body.decision === "verify") {
      const s = summarize(p, await loadDocs(db, p.id), today());
      if (!s.allApprovedValid) throw new ApiError(409, "documents_not_approved");
      await db.query(`UPDATE providers SET status='verified', status_reason=NULL, verified_at=$2, verified_by=$3, updated_at=now() WHERE id=$1`, [
        p.id,
        ctx.now(),
        u.id,
      ]);
      await audit(db, actorOf(u), "provider.verified", { type: "provider", id: p.id });
    } else {
      await db.query(`UPDATE providers SET status='rejected', status_reason=$2, updated_at=now() WHERE id=$1`, [p.id, body.reason!.trim()]);
      await audit(db, actorOf(u), "provider.rejected", { type: "provider", id: p.id }, { reason: body.reason!.trim() });
    }
    return { ok: true };
  });

  app.post("/v1/admin/providers/:id/suspend", async (req) => {
    const u = await g.requireStaff(req, "providers.suspend");
    const { reason } = parse(reasonBody, req.body);
    const p = await providerById(idParam(req));
    if (p.status === "suspended") throw new ApiError(409, "already_suspended");
    await db.query(`UPDATE providers SET status='suspended', status_reason=$2, updated_at=now() WHERE id=$1`, [p.id, reason]);
    await audit(db, actorOf(u), "provider.suspended", { type: "provider", id: p.id }, { reason, previousStatus: p.status });
    return { ok: true };
  });

  // رفع الإيقاف: يرجع «موثّق» إذا مستنداته سليمة، وإلا يرجع لقائمة التوثيق.
  app.post("/v1/admin/providers/:id/reinstate", async (req) => {
    const u = await g.requireStaff(req, "providers.suspend");
    const { reason } = parse(reasonBody, req.body);
    const p = await providerById(idParam(req));
    if (p.status !== "suspended") throw new ApiError(409, "not_suspended");
    const s = summarize(p, await loadDocs(db, p.id), today());
    const next = s.allApprovedValid && p.verified_at ? "verified" : "pending";
    await db.query(`UPDATE providers SET status=$2, status_reason=NULL, updated_at=now() WHERE id=$1`, [p.id, next]);
    await audit(db, actorOf(u), "provider.reinstated", { type: "provider", id: p.id }, { reason, newStatus: next });
    return { ok: true, status: next };
  });

  // ---------- الموظفين ----------
  app.get("/v1/admin/staff", async (req) => {
    await g.requireStaff(req, "staff.manage");
    const rows = await db.query(
      `SELECT s.user_id AS "userId", u.display_name AS name, u.phone, s.role, s.active, s.created_at AS "createdAt"
         FROM staff s JOIN users u ON u.id = s.user_id ORDER BY s.active DESC, s.created_at ASC`,
    );
    return { staff: rows };
  });

  app.post("/v1/admin/staff", async (req, reply) => {
    const u = await g.requireStaff(req, "staff.manage");
    const body = parse(addStaffBody, req.body);
    if (!canManageRole(u.staffRole, body.role)) throw new ApiError(403, "forbidden");
    const userId = await db.tx(async (t) => {
      const existing = await t.query<{ id: string; role: string }>("SELECT id, role FROM users WHERE phone = $1", [body.phone]);
      // فصل الحسابات: رقم مسجّل كمصنع أو مزوّد ما يصير موظف (يحتاج رقم ثاني).
      if (existing[0] && existing[0].role !== "staff") throw new ApiError(409, "phone_used_by_customer");
      const [user] = existing[0]
        ? await t.query<{ id: string }>("UPDATE users SET display_name=$2 WHERE id=$1 RETURNING id", [existing[0].id, body.name])
        : await t.query<{ id: string }>("INSERT INTO users (phone, role, display_name) VALUES ($1,'staff',$2) RETURNING id", [body.phone, body.name]);
      const prev = await t.query<{ role: StaffRole }>("SELECT role FROM staff WHERE user_id = $1", [user.id]);
      if (prev[0] && !canManageRole(u.staffRole, prev[0].role)) throw new ApiError(403, "forbidden");
      await t.query(
        `INSERT INTO staff (user_id, role, active, added_by) VALUES ($1,$2,true,$3)
         ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role, active=true, added_by=EXCLUDED.added_by, updated_at=now()`,
        [user.id, body.role, u.id],
      );
      await audit(t, actorOf(u), "staff.added", { type: "user", id: user.id }, { role: body.role });
      return user.id;
    });
    return reply.status(201).send({ userId });
  });

  app.post("/v1/admin/staff/:id/deactivate", async (req) => {
    const u = await g.requireStaff(req, "staff.manage");
    const id = idParam(req);
    if (id === u.id) throw new ApiError(409, "cannot_deactivate_self");
    const [target] = await db.query<{ role: StaffRole }>("SELECT role FROM staff WHERE user_id = $1 AND active", [id]);
    if (!target) throw new ApiError(404, "not_found");
    if (!canManageRole(u.staffRole, target.role)) throw new ApiError(403, "forbidden");
    await db.tx(async (t) => {
      await t.query("UPDATE staff SET active=false, updated_at=now() WHERE user_id=$1", [id]);
      // سحب الصلاحية فوري: كل جلساته تنلغي.
      await t.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [id]);
      await audit(t, actorOf(u), "staff.deactivated", { type: "user", id }, { role: target.role });
    });
    return { ok: true };
  });

  // ---------- سجل الإجراءات ----------
  app.get("/v1/admin/audit", async (req) => {
    await g.requireStaff(req, "audit.view");
    const q = req.query as { before?: string; entityId?: string };
    const before = q.before && /^\d+$/.test(q.before) ? q.before : null;
    const rows = await db.query(
      `SELECT a.id::text, a.at, a.actor_role AS "actorRole", u.display_name AS "actorName", a.action, a.entity, a.entity_id AS "entityId", a.details
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        WHERE ($1::bigint IS NULL OR a.id < $1::bigint) AND ($2::text IS NULL OR a.entity_id = $2)
        ORDER BY a.id DESC LIMIT 100`,
      [before, q.entityId && q.entityId.length <= 64 ? q.entityId : null],
    );
    return { entries: rows };
  });
}
