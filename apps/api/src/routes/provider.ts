// مسارات المزوّد: التسجيل، ورفع المستندات، وإرسالها للتوثيق، ومتابعة الحالة.
// المزوّد يُحدَّد من الجلسة. ما يقدر يشوف أو يغيّر مستندات مزوّد ثاني.
import { DOC_TYPES, isoDateSchema, providerProfileBody, requiredDocsFor, UPLOAD_MAX_BYTES } from "@mazood/shared";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import { ApiError } from "../errors.ts";
import { actorOf, parse, todayRiyadh, type Ctx, type Guards } from "../http.ts";
import { loadDocs, slotView, summarize, type ProviderRow } from "../providers.ts";
import { sniffMime } from "../storage.ts";

const uploadFields = z.object({ docType: z.enum(DOC_TYPES), expiresOn: isoDateSchema }).strict();

export function providerRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;

  async function myProvider(userId: string): Promise<ProviderRow | null> {
    const rows = await db.query<ProviderRow>("SELECT * FROM providers WHERE user_id = $1", [userId]);
    return rows[0] ?? null;
  }

  async function view(p: ProviderRow) {
    const today = todayRiyadh(ctx.now());
    const s = summarize(p, await loadDocs(db, p.id), today);
    return {
      id: p.id,
      tradeName: p.trade_name,
      ownerName: p.owner_name,
      idType: p.id_type,
      // للمزوّد نفسه نعرض آخر ٤ أرقام بس. الرقم الكامل ما يرجع من الخادم إلا لموظف التوثيق.
      idNumberMasked: `******${p.id_number_last4}`,
      commercialRegister: p.commercial_register,
      categories: p.categories,
      status: p.status,
      statusReason: p.status_reason,
      verified: s.effectiveVerified,
      readyToSubmit: s.readyToSubmit,
      documents: s.slots.map(slotView),
      expiring: s.expiringSoon,
    };
  }

  app.get("/v1/provider/me", async (req) => {
    const user = await g.requireProviderUser(req);
    const p = await myProvider(user.id);
    return { provider: p ? await view(p) : null };
  });

  // التسجيل أو تعديل البيانات. بعد ما يرسلها للتوثيق تنقفل لين يرجع له قرار.
  app.put("/v1/provider/profile", async (req) => {
    const user = await g.requireProviderUser(req);
    const body = parse(providerProfileBody, req.body);
    const existing = await myProvider(user.id);
    if (existing && !["draft", "rejected"].includes(existing.status)) throw new ApiError(409, "profile_locked");
    const enc = ctx.box.encrypt(body.idNumber);
    const values = [user.id, body.tradeName, body.ownerName, body.idType, enc, body.idNumber.slice(-4), body.commercialRegister, body.categories];
    const [row] = existing
      ? await db.query<ProviderRow>(
          `UPDATE providers SET trade_name=$2, owner_name=$3, id_type=$4, id_number_enc=$5, id_number_last4=$6,
             commercial_register=$7, categories=$8, updated_at=now() WHERE user_id=$1 RETURNING *`,
          values,
        )
      : await db.query<ProviderRow>(
          `INSERT INTO providers (user_id, trade_name, owner_name, id_type, id_number_enc, id_number_last4, commercial_register, categories)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          values,
        );
    await audit(db, actorOf(user), existing ? "provider.profile_updated" : "provider.registered", { type: "provider", id: row.id }, {
      categories: body.categories,
    });
    return { provider: await view(row) };
  });

  // رفع مستند (ملف واحد). نتأكد من نوع الملف من محتواه، وحجمه، ونحفظه باسم عشوائي في التخزين الخاص.
  app.post("/v1/provider/documents", async (req, reply) => {
    const user = await g.requireProviderUser(req);
    const p = await myProvider(user.id);
    if (!p) throw new ApiError(409, "profile_required");
    if (p.status === "suspended") throw new ApiError(403, "provider_suspended");

    const fields: Record<string, string> = {};
    let file: Buffer | null = null;
    for await (const part of req.parts({ limits: { fileSize: UPLOAD_MAX_BYTES, files: 1, fields: 5 } })) {
      if (part.type === "file") {
        file = await part.toBuffer();
        if (part.file.truncated) throw new ApiError(413, "file_too_large");
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
    const { docType, expiresOn } = parse(uploadFields, fields);
    if (!requiredDocsFor(p.categories).includes(docType)) throw new ApiError(400, "doc_not_required");
    if (expiresOn < todayRiyadh(ctx.now())) throw new ApiError(400, "doc_expired");
    if (!file || file.length === 0) throw new ApiError(400, "file_required");
    const mime = sniffMime(file);
    if (!mime) throw new ApiError(415, "file_type_not_allowed");

    const key = randomUUID();
    await ctx.storage.put(key, file);
    const id = await db.tx(async (t) => {
      // النسخ القديمة اللي تنتظر أو مرفوضة تنشال. المقبولة تبقى لين تنقبل الجديدة.
      await t.query(
        `UPDATE provider_documents SET status='replaced' WHERE provider_id=$1 AND doc_type=$2 AND status IN ('pending','rejected')`,
        [p.id, docType],
      );
      const [row] = await t.query<{ id: string }>(
        `INSERT INTO provider_documents (provider_id, doc_type, storage_key, mime_type, size_bytes, expires_on)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [p.id, docType, key, mime, file!.length, expiresOn],
      );
      await audit(t, actorOf(user), "document.uploaded", { type: "provider_document", id: row.id }, { docType, providerId: p.id });
      return row.id;
    });
    return reply.status(201).send({ documentId: id, provider: await view(p) });
  });

  // إرسال الطلب للتوثيق: لازم كل المستندات المطلوبة مرفوعة.
  app.post("/v1/provider/submit", async (req) => {
    const user = await g.requireProviderUser(req);
    const p = await myProvider(user.id);
    if (!p) throw new ApiError(409, "profile_required");
    if (!["draft", "rejected"].includes(p.status)) throw new ApiError(409, "already_submitted");
    const s = summarize(p, await loadDocs(db, p.id), todayRiyadh(ctx.now()));
    if (!s.readyToSubmit) throw new ApiError(409, "documents_missing");
    const [row] = await db.query<ProviderRow>(
      `UPDATE providers SET status='pending', status_reason=NULL, submitted_at=$2, updated_at=now() WHERE id=$1 RETURNING *`,
      [p.id, ctx.now()],
    );
    await audit(db, actorOf(user), "provider.submitted", { type: "provider", id: p.id });
    return { provider: await view(row) };
  });
}
