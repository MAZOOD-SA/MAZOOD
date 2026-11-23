// مسارات سوق منتجات المصانع (الخطوة ب، docs/plans/customers-and-market.md القسم ٤):
//  - عامة بدون دخول: التصنيفات، والمنتجات، وصفحة المنتج، وصفحة المصنع البائع، وصور المنتجات.
//  - المصنع البائع: تفعيل البيع، ورفع السجل للتوثيق، والمنتجات وصورها، والرد على طلبات الشراء.
//  - المشتري: طلب سعر، وقبول الرد أو رفضه أو طلب تعديله مرة وحدة، وتأكيد الاستلام، والتقييم.
// كل مسار يحدد العميل من الجلسة (مو من اللي يرسله)، وطلب شراء عميل ثاني يرجّع 404.
import { events } from "../events.ts";
import { randomUUID } from "node:crypto";
import {
  buyerPurchaseActions,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_MAX_IMAGES,
  productBody,
  purchaseNoteBody,
  purchaseQuoteBody,
  purchaseRequestBody,
  rateOrderBody,
  unitPriceFor,
  uuidSchema,
  type PurchaseStatus,
} from "@mazood/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import { resolveCityId } from "../cities.ts";
import { requireActiveProvider } from "../provider-access.ts";
import type { Db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { actorOf, parse, todayRiyadh, type Ctx, type Guards } from "../http.ts";
import { profileComplete, type CustomerRow } from "../identity.ts";
import { lastSubscriptionEnd, productListedSql, sellerListedSql, sellerRating, sellerState } from "../market.ts";
import { getSettings } from "../settings.ts";
import { sniffMime } from "../storage.ts";
import { rejectContactInfo } from "./offers.ts";

const PAGE_SIZE = 30;

const listQuery = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: z.string().regex(/^[a-z_]{2,40}$/).optional(),
    seller: z.string().uuid().optional(),
    page: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .strict();

const uploadFields = z.object({ expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_invalid") }).strict();

export const idParam = (req: { params: unknown }, key = "id") => {
  const id = (req.params as Record<string, string>)[key];
  if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "not_found");
  return id;
};

/** نص البحث داخل LIKE: نهرّب % و_ عشان ما تصير أنماط. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

type ProductRow = {
  id: string;
  seller_id: string;
  category_id: string;
  name: string;
  description: string;
  unit: string;
  min_order_qty: number;
  pricing: "fixed" | "quote";
  unit_price_halalas: string | number | null;
  price_tiers: { minQty: number; unitPriceHalalas: number }[];
  status: "active" | "hidden" | "removed";
  removed_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

export const imageUrl = (id: string) => `/v1/market/images/${id}`;

/** المنتج كما يطلع للناس. الصور روابط عامة، والبائع اسمه بس (التواصل بعد قبول الرد). */
async function productViews(db: Db, rows: (ProductRow & { seller_name?: string | null; featured?: boolean })[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const images = await db.query<{ id: string; product_id: string }>(
    "SELECT id, product_id FROM product_images WHERE product_id = ANY($1::uuid[]) ORDER BY sort, created_at",
    [ids],
  );
  const cats = await db.query<{ id: string; name_ar: string; name_en: string }>("SELECT id, name_ar, name_en FROM product_categories");
  return rows.map((r) => {
    const cat = cats.find((c) => c.id === r.category_id);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      category: { id: r.category_id, name: cat ? { ar: cat.name_ar, en: cat.name_en } : null },
      unit: r.unit,
      minOrderQty: r.min_order_qty,
      pricing: r.pricing,
      unitPriceHalalas: r.unit_price_halalas === null ? null : Number(r.unit_price_halalas),
      priceTiers: r.price_tiers ?? [],
      images: images.filter((i) => i.product_id === r.id).map((i) => ({ id: i.id, url: imageUrl(i.id) })),
      seller: { id: r.seller_id, name: r.seller_name ?? null },
      featured: !!r.featured,
      status: r.status,
      removedReason: r.removed_reason,
      updatedAt: r.updated_at,
    };
  });
}

type PurchaseRow = {
  id: string;
  product_id: string;
  seller_id: string;
  /** المشتري واحد بس: عميل أو مزوّد (قيد في قاعدة البيانات، الترحيل 017). */
  buyer_factory_id: string | null;
  buyer_provider_id: string | null;
  buyer_user_id: string;
  quantity: number;
  city_id: string;
  needed_when: string;
  note: string | null;
  status: Exclude<PurchaseStatus, "expired">;
  revision_used: boolean;
  revision_note: string | null;
  decision_note: string | null;
  accepted_quote_id: string | null;
  seller_user_id: string | null;
  accepted_at: Date | null;
  received_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type QuoteRow = {
  id: string;
  unit_price_halalas: string | number;
  total_halalas: string | number;
  lead_time_days: number;
  delivery_included: boolean;
  valid_until: Date;
  note: string | null;
  created_by: string;
  created_at: Date;
};

/** الحالة الفعلية: الرد اللي عدّت صلاحيته يُحسب «انتهى» وقت القراءة (بدون مهمة دورية). */
function effectivePurchaseStatus(p: PurchaseRow, quote: QuoteRow | null, now: Date): PurchaseStatus {
  if (p.status === "quoted" && quote && new Date(quote.valid_until) <= now) return "expired";
  return p.status;
}

const quoteView = (q: QuoteRow | null) =>
  q && {
    id: q.id,
    unitPriceHalalas: Number(q.unit_price_halalas),
    totalHalalas: Number(q.total_halalas),
    leadTimeDays: q.lead_time_days,
    deliveryIncluded: q.delivery_included,
    validUntil: q.valid_until,
    note: q.note,
    createdAt: q.created_at,
  };

/** طلب الشراء كما يشوفه طرف من الطرفين. التواصل (الاسم والجوال) يظهر بعد القبول بس. */
async function purchaseView(db: Db, p: PurchaseRow, viewer: "buyer" | "seller", now: Date) {
  const [quote] = await db.query<QuoteRow>(
    "SELECT * FROM purchase_quotes WHERE purchase_request_id=$1 AND (status='active' OR id=$2) ORDER BY created_at DESC LIMIT 1",
    [p.id, p.accepted_quote_id],
  );
  const [prod] = await db.query<{ name: string; unit: string; image_id: string | null }>(
    `SELECT pr.name, pr.unit, (SELECT i.id FROM product_images i WHERE i.product_id = pr.id ORDER BY i.sort, i.created_at LIMIT 1) AS image_id
       FROM products pr WHERE pr.id=$1`,
    [p.product_id],
  );
  const [seller] = await db.query<{ name: string | null }>("SELECT name FROM factories WHERE id=$1", [p.seller_id]);
  // المشتري مزوّد: البائع يشوف «مزوّد» قبل الاتفاق، والاسم التجاري بعده.
  const [buyer] = p.buyer_provider_id
    ? await db.query<{ name: string | null; kind: string | null }>("SELECT trade_name AS name, 'provider' AS kind FROM providers WHERE id=$1", [p.buyer_provider_id])
    : await db.query<{ name: string | null; kind: string | null }>("SELECT name, kind FROM factories WHERE id=$1", [p.buyer_factory_id]);
  const [rated] = await db.query("SELECT 1 FROM seller_ratings WHERE purchase_request_id=$1", [p.id]);
  const status = effectivePurchaseStatus(p, quote ?? null, now);
  const agreed = p.status === "accepted" || p.status === "received";
  let contact: { name: string | null; phone: string } | null = null;
  if (agreed) {
    const userId = viewer === "buyer" ? p.seller_user_id : p.buyer_user_id;
    const [u] = await db.query<{ phone: string }>("SELECT phone FROM users WHERE id=$1", [userId]);
    contact = { name: viewer === "buyer" ? seller?.name ?? null : buyer?.name ?? null, phone: u?.phone ?? "" };
  }
  return {
    id: p.id,
    product: { id: p.product_id, name: prod?.name ?? "", unit: prod?.unit ?? "", imageUrl: prod?.image_id ? imageUrl(prod.image_id) : null },
    seller: { id: p.seller_id, name: seller?.name ?? null },
    // البائع يشوف نوع المشتري ومدينته قبل الاتفاق، والاسم بعده (نفس قاعدة الخدمات).
    buyer: viewer === "seller" ? { kind: buyer?.kind ?? "business", name: agreed ? buyer?.name ?? null : null } : undefined,
    quantity: p.quantity,
    cityId: p.city_id,
    when: p.needed_when,
    note: p.note,
    status,
    revisionUsed: p.revision_used,
    revisionNote: p.revision_note,
    decisionNote: p.decision_note,
    quote: quoteView(quote ?? null),
    contact,
    rated: !!rated,
    actions: viewer === "buyer" ? buyerPurchaseActions(status, { revisionUsed: p.revision_used, rated: !!rated }) : sellerActions(status),
    acceptedAt: p.accepted_at,
    receivedAt: p.received_at,
    createdAt: p.created_at,
  };
}

/** أزرار البائع: يرد أو يعتذر لما الطلب ينتظره، وغير كذا ينتظر المشتري. */
function sellerActions(status: PurchaseStatus): ("quote" | "decline")[] {
  return status === "pending" || status === "revision_requested" ? ["quote", "decline"] : [];
}

export function marketRoutes(app: FastifyInstance, ctx: Ctx, g: Guards) {
  const { db } = ctx;
  const now = () => ctx.now();
  const settings = async () => (await getSettings(db)).market;

  // ───────── عامة (بدون دخول) ─────────

  app.get("/v1/market/categories", async () => {
    const rows = await db.query<{ id: string; name_ar: string; name_en: string }>(
      "SELECT id, name_ar, name_en FROM product_categories WHERE active ORDER BY sort, id",
    );
    return { categories: rows.map((c) => ({ id: c.id, name: { ar: c.name_ar, en: c.name_en } })) };
  });

  /** عدد المنتجات الظاهرة، عشان الصفحة العامة ما تنفتح فاضية (إعداد publicMinProducts). */
  async function listedCount(): Promise<number> {
    const [r] = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM products p JOIN sellers s ON s.factory_id = p.seller_id WHERE ${productListedSql("$1", "$2")}`,
      [now(), todayRiyadh(now())],
    );
    return r.n;
  }

  app.get("/v1/market/products", async (req) => {
    const q = parse(listQuery, req.query);
    const { publicMinProducts } = await settings();
    // قبل ما يكتمل العدد: الزائر بدون دخول يشوف «قريبًا»، والعملاء الداخلين يشوفون المتوفر.
    if (publicMinProducts > 0) {
      const signedIn = await g.authenticate(req).then(() => true, () => false);
      if (!signedIn && (await listedCount()) < publicMinProducts) return { products: [], comingSoon: true, page: 0, hasMore: false };
    }
    const page = q.page ?? 0;
    const rows = await db.query<ProductRow & { seller_name: string | null; featured: boolean }>(
      `SELECT p.*, f.name AS seller_name,
              EXISTS (SELECT 1 FROM subscriptions sub JOIN subscription_plans pl ON pl.id = sub.plan_id
                       WHERE sub.subject_type='factory' AND sub.subject_id=s.factory_id AND sub.starts_at <= $1 AND sub.ends_at > $1 AND pl.featured) AS featured
         FROM products p JOIN sellers s ON s.factory_id = p.seller_id JOIN factories f ON f.id = s.factory_id
        WHERE ${productListedSql("$1", "$2")}
          AND ($3::text IS NULL OR p.category_id = $3::text)
          AND ($4::uuid IS NULL OR p.seller_id = $4::uuid)
          AND ($5::text IS NULL OR p.name ILIKE $5::text ESCAPE '\\' OR p.description ILIKE $5::text ESCAPE '\\' OR f.name ILIKE $5::text ESCAPE '\\')
        ORDER BY featured DESC, p.updated_at DESC
        LIMIT ${PAGE_SIZE + 1} OFFSET $6`,
      [now(), todayRiyadh(now()), q.category ?? null, q.seller ?? null, q.q ? `%${likeEscape(q.q)}%` : null, page * PAGE_SIZE],
    );
    return { products: await productViews(db, rows.slice(0, PAGE_SIZE)), comingSoon: false, page, hasMore: rows.length > PAGE_SIZE };
  });

  app.get("/v1/market/products/:id", async (req) => {
    const id = idParam(req);
    const [row] = await db.query<ProductRow & { seller_name: string | null }>(
      `SELECT p.*, f.name AS seller_name FROM products p JOIN sellers s ON s.factory_id = p.seller_id JOIN factories f ON f.id = s.factory_id
        WHERE p.id=$3 AND ${productListedSql("$1", "$2")}`,
      [now(), todayRiyadh(now()), id],
    );
    if (!row) throw new ApiError(404, "not_found");
    const [view] = await productViews(db, [row]);
    return { product: { ...view, seller: { ...view.seller, verified: true, rating: await sellerRating(db, row.seller_id) } } };
  });

  // صفحة المصنع البائع: اسمه ومدينته وتقييمه ومنتجاته الظاهرة.
  app.get("/v1/market/sellers/:id", async (req) => {
    const id = idParam(req);
    const [s] = await db.query<{ factory_id: string; name: string | null; city_ar: string | null; city_en: string | null; verified_at: Date }>(
      `SELECT s.factory_id, f.name, c.name_ar AS city_ar, c.name_en AS city_en, s.verified_at
         FROM sellers s JOIN factories f ON f.id = s.factory_id LEFT JOIN cities c ON c.id = f.city_id
        WHERE s.factory_id=$3 AND ${sellerListedSql("$1", "$2")}`,
      [now(), todayRiyadh(now()), id],
    );
    if (!s) throw new ApiError(404, "not_found");
    const rows = await db.query<ProductRow>(
      `SELECT p.* FROM products p JOIN sellers s ON s.factory_id = p.seller_id WHERE p.seller_id=$3 AND ${productListedSql("$1", "$2")}
        ORDER BY p.updated_at DESC LIMIT 200`,
      [now(), todayRiyadh(now()), id],
    );
    return {
      seller: {
        id: s.factory_id,
        name: s.name,
        city: s.city_ar ? { ar: s.city_ar, en: s.city_en } : null,
        verified: true,
        verifiedAt: s.verified_at,
        rating: await sellerRating(db, s.factory_id),
      },
      products: await productViews(db, rows.map((r) => ({ ...r, seller_name: s.name }))),
    };
  });

  // صور المنتجات: عامة (للعرض والظهور في محركات البحث)، إلا صور المنتج اللي شالته الإدارة.
  app.get("/v1/market/images/:id", async (req, reply) => {
    const id = idParam(req);
    const [img] = await db.query<{ storage_key: string; mime_type: string }>(
      `SELECT i.storage_key, i.mime_type FROM product_images i JOIN products p ON p.id = i.product_id WHERE i.id=$1 AND p.status <> 'removed'`,
      [id],
    );
    const bytes = img ? await ctx.storage.get(img.storage_key) : null;
    if (!img || !bytes) throw new ApiError(404, "not_found");
    return reply
      .header("content-type", img.mime_type)
      .header("cache-control", "public, max-age=86400")
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox")
      .send(bytes);
  });

  // ───────── المصنع البائع ─────────

  /** منشأة بس، والكتابة للمدير بس (السعر التزام تجاري). */
  async function requireSellerAccount(req: FastifyRequest, opts: { write: boolean }) {
    const s = await g.requireFactory(req);
    const [f] = await db.query<CustomerRow>("SELECT * FROM factories WHERE id=$1", [s.factoryId]);
    if (f.kind !== "business") throw new ApiError(403, "seller_business_only");
    if (opts.write && s.factoryRole !== "manager") throw new ApiError(403, "forbidden");
    return { ...s, factory: f };
  }
  async function requireSeller(req: FastifyRequest, opts: { write: boolean }) {
    const s = await requireSellerAccount(req, opts);
    const [row] = await db.query<{ status: string }>("SELECT status FROM sellers WHERE factory_id=$1", [s.factoryId]);
    if (!row) throw new ApiError(409, "seller_not_enabled");
    if (opts.write && row.status === "suspended") throw new ApiError(403, "seller_suspended");
    return s;
  }
  const stateFor = async (factoryId: string) => sellerState(db, factoryId, now(), (await settings()).expiryWarningDays);

  app.get("/v1/market/seller", async (req) => {
    const { factoryId } = await requireSellerAccount(req, { write: false });
    const [plan] = await db.query<{ id: string; name_ar: string; name_en: string; monthly_price_halalas: string; max_products: number | null }>(
      "SELECT * FROM subscription_plans WHERE audience='seller' AND active ORDER BY monthly_price_halalas LIMIT 1",
    );
    return {
      seller: await stateFor(factoryId),
      plan: plan && { id: plan.id, name: { ar: plan.name_ar, en: plan.name_en }, monthlyPriceHalalas: Number(plan.monthly_price_halalas), maxProducts: plan.max_products },
      trialDays: (await settings()).trialDays,
    };
  });

  // تفعيل البيع: المنشأة اللي كمّلت بياناتها. لو فيه فترة مجانية (الإعداد trialDays)، تبدأ الحين.
  app.post("/v1/market/seller", async (req, reply) => {
    const { user, factoryId, factory } = await requireSellerAccount(req, { write: true });
    if (!profileComplete(factory)) throw new ApiError(409, "profile_incomplete");
    const { trialDays } = await settings();
    await db.tx(async (t) => {
      const created = await t.query("INSERT INTO sellers (factory_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING factory_id", [factoryId]);
      if (!created.length) return;
      if (trialDays > 0) {
        const [plan] = await t.query<{ id: string }>("SELECT id FROM subscription_plans WHERE audience='seller' AND active ORDER BY monthly_price_halalas LIMIT 1");
        if (plan) {
          await t.query(
            `INSERT INTO subscriptions (subject_type, subject_id, plan_id, kind, starts_at, ends_at) VALUES ('factory',$1,$2,'trial',$3,$4)
             ON CONFLICT DO NOTHING`,
            [factoryId, plan.id, now(), new Date(now().getTime() + trialDays * 86400_000)],
          );
        }
      }
      await audit(t, actorOf(user), "seller.enabled", { type: "factory", id: factoryId }, { trialDays });
    });
    return reply.status(201).send({ seller: await stateFor(factoryId) });
  });

  // رفع السجل التجاري (ملف واحد مع تاريخ الانتهاء). نتأكد من النوع من المحتوى، ونحفظه في التخزين الخاص.
  app.post("/v1/market/seller/documents", async (req, reply) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const fields: Record<string, string> = {};
    let file: Buffer | null = null;
    for await (const part of req.parts({ limits: { files: 1, fields: 3 } })) {
      if (part.type === "file") {
        file = await part.toBuffer();
        if (part.file.truncated) throw new ApiError(413, "file_too_large");
      } else fields[part.fieldname] = String(part.value);
    }
    const { expiresOn } = parse(uploadFields, fields);
    if (expiresOn < todayRiyadh(now())) throw new ApiError(400, "doc_expired");
    if (!file || file.length === 0) throw new ApiError(400, "file_required");
    const mime = sniffMime(file);
    if (!mime) throw new ApiError(415, "file_type_not_allowed");
    const key = randomUUID();
    await ctx.storage.put(key, file);
    await db.tx(async (t) => {
      // النسخة اللي تنتظر أو المرفوضة تنشال. المقبولة تبقى لين تنقبل الجديدة (المنتجات ما تختفي وقت التجديد).
      await t.query("UPDATE seller_documents SET status='replaced' WHERE factory_id=$1 AND status IN ('pending','rejected')", [factoryId]);
      const [row] = await t.query<{ id: string }>(
        `INSERT INTO seller_documents (factory_id, storage_key, mime_type, size_bytes, expires_on) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [factoryId, key, mime, file!.length, expiresOn],
      );
      await audit(t, actorOf(user), "seller.document_uploaded", { type: "seller_document", id: row.id }, { factoryId });
    });
    return reply.status(201).send({ seller: await stateFor(factoryId) });
  });

  // إرسال البائع للتوثيق: لازم سجل مرفوع ينتظر المراجعة.
  app.post("/v1/market/seller/submit", async (req) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const [doc] = await db.query("SELECT 1 FROM seller_documents WHERE factory_id=$1 AND status='pending'", [factoryId]);
    if (!doc) throw new ApiError(409, "documents_missing");
    const rows = await db.query(
      `UPDATE sellers SET status='pending', status_reason=NULL, submitted_at=$2, updated_at=now()
        WHERE factory_id=$1 AND status IN ('draft','rejected','verified') RETURNING factory_id`,
      [factoryId, now()],
    );
    // البائع الموثّق اللي يجدد سجله يبقى موثّق (ومنتجاته ظاهرة) لين يراجع الموظف السجل الجديد.
    if (!rows.length) throw new ApiError(409, "already_submitted");
    await audit(db, actorOf(user), "seller.submitted", { type: "factory", id: factoryId });
    return { seller: await stateFor(factoryId) };
  });

  // منتجاتي: كل المنتجات (الظاهرة والمخفية والمشالة مع السبب).
  app.get("/v1/market/seller/products", async (req) => {
    const { factoryId } = await requireSeller(req, { write: false });
    const rows = await db.query<ProductRow>("SELECT * FROM products WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 500", [factoryId]);
    return { products: await productViews(db, rows) };
  });

  async function ownProduct(factoryId: string, productId: string): Promise<ProductRow> {
    const [p] = await db.query<ProductRow>("SELECT * FROM products WHERE id=$1 AND seller_id=$2", [productId, factoryId]);
    if (!p) throw new ApiError(404, "not_found");
    return p;
  }
  async function checkCategory(categoryId: string) {
    const [c] = await db.query("SELECT 1 FROM product_categories WHERE id=$1 AND active", [categoryId]);
    if (!c) throw new ApiError(400, "category_invalid");
  }

  app.post("/v1/market/seller/products", async (req, reply) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const body = parse(productBody, req.body);
    rejectContactInfo({ name: body.name, description: body.description });
    await checkCategory(body.categoryId);
    // أقصى عدد منتجات حسب الباقة (المنتجات المشالة من الإدارة ما تنحسب).
    const [limit] = await db.query<{ max_products: number | null }>(
      "SELECT max_products FROM subscription_plans WHERE audience='seller' AND active ORDER BY monthly_price_halalas LIMIT 1",
    );
    const [count] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM products WHERE seller_id=$1 AND status <> 'removed'", [factoryId]);
    if (limit?.max_products && count.n >= limit.max_products) throw new ApiError(409, "products_limit", undefined, { max: limit.max_products });
    const [row] = await db.query<ProductRow>(
      `INSERT INTO products (seller_id, category_id, name, description, unit, min_order_qty, pricing, unit_price_halalas, price_tiers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [factoryId, body.categoryId, body.name, body.description, body.unit, body.minOrderQty, body.pricing,
        body.pricing === "fixed" ? body.unitPriceHalalas : null, JSON.stringify(body.pricing === "fixed" ? body.priceTiers ?? [] : [])],
    );
    await audit(db, actorOf(user), "product.created", { type: "product", id: row.id }, { factoryId });
    const [view] = await productViews(db, [row]);
    return reply.status(201).send({ product: view });
  });

  app.put("/v1/market/seller/products/:id", async (req) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const p = await ownProduct(factoryId, idParam(req));
    if (p.status === "removed") throw new ApiError(409, "product_removed");
    const body = parse(productBody, req.body);
    rejectContactInfo({ name: body.name, description: body.description });
    await checkCategory(body.categoryId);
    const [row] = await db.query<ProductRow>(
      `UPDATE products SET category_id=$2, name=$3, description=$4, unit=$5, min_order_qty=$6, pricing=$7, unit_price_halalas=$8,
              price_tiers=$9, updated_at=now() WHERE id=$1 RETURNING *`,
      [p.id, body.categoryId, body.name, body.description, body.unit, body.minOrderQty, body.pricing,
        body.pricing === "fixed" ? body.unitPriceHalalas : null, JSON.stringify(body.pricing === "fixed" ? body.priceTiers ?? [] : [])],
    );
    await audit(db, actorOf(user), "product.updated", { type: "product", id: p.id });
    const [view] = await productViews(db, [row]);
    return { product: view };
  });

  // إخفاء المنتج مؤقتًا أو إظهاره (بدون حذف). المنتج اللي شالته الإدارة ما يرجّعه إلا الإدارة.
  app.post("/v1/market/seller/products/:id/:action", async (req) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const action = (req.params as { action: string }).action;
    if (action !== "hide" && action !== "show") throw new ApiError(404, "not_found");
    const p = await ownProduct(factoryId, idParam(req));
    if (p.status === "removed") throw new ApiError(409, "product_removed");
    const [row] = await db.query<ProductRow>("UPDATE products SET status=$2, updated_at=now() WHERE id=$1 RETURNING *", [
      p.id,
      action === "hide" ? "hidden" : "active",
    ]);
    await audit(db, actorOf(user), action === "hide" ? "product.hidden" : "product.shown", { type: "product", id: p.id });
    const [view] = await productViews(db, [row]);
    return { product: view };
  });

  // صورة للمنتج (JPEG أو PNG، حتى ٣ ميجا، وحتى ٥ صور). الواجهة تضغطها قبل الرفع (القرار ٤٦).
  app.post("/v1/market/seller/products/:id/images", async (req, reply) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const p = await ownProduct(factoryId, idParam(req));
    if (p.status === "removed") throw new ApiError(409, "product_removed");
    let file: Buffer | null = null;
    for await (const part of req.parts({ limits: { files: 1, fields: 0, fileSize: PRODUCT_IMAGE_MAX_BYTES } })) {
      if (part.type === "file") {
        file = await part.toBuffer();
        if (part.file.truncated) throw new ApiError(413, "file_too_large");
      }
    }
    if (!file || file.length === 0) throw new ApiError(400, "file_required");
    const mime = sniffMime(file);
    if (mime !== "image/jpeg" && mime !== "image/png") throw new ApiError(415, "file_type_not_allowed");
    const key = randomUUID();
    const id = await db.tx(async (t) => {
      const [c] = await t.query<{ n: number; next: number }>(
        "SELECT count(*)::int AS n, COALESCE(max(sort), -1)::int + 1 AS next FROM product_images WHERE product_id=$1",
        [p.id],
      );
      if (c.n >= PRODUCT_MAX_IMAGES) throw new ApiError(409, "images_limit", undefined, { max: PRODUCT_MAX_IMAGES });
      await ctx.storage.put(key, file!);
      const [row] = await t.query<{ id: string }>(
        "INSERT INTO product_images (product_id, storage_key, mime_type, size_bytes, sort) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [p.id, key, mime, file!.length, c.next],
      );
      await t.query("UPDATE products SET updated_at=now() WHERE id=$1", [p.id]);
      await audit(t, actorOf(user), "product.image_added", { type: "product", id: p.id });
      return row.id;
    });
    return reply.status(201).send({ image: { id, url: imageUrl(id) } });
  });

  app.post("/v1/market/seller/products/:id/images/:imageId/delete", async (req) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const p = await ownProduct(factoryId, idParam(req));
    const rows = await db.query("DELETE FROM product_images WHERE id=$1 AND product_id=$2 RETURNING id", [idParam(req, "imageId"), p.id]);
    if (!rows.length) throw new ApiError(404, "not_found");
    await audit(db, actorOf(user), "product.image_removed", { type: "product", id: p.id });
    return { ok: true };
  });

  // طلبات الشراء الواصلة للبائع: اللي تنتظر رده أول.
  app.get("/v1/market/seller/purchase-requests", async (req) => {
    const { factoryId } = await requireSeller(req, { write: false });
    const rows = await db.query<PurchaseRow>(
      `SELECT * FROM purchase_requests WHERE seller_id=$1
        ORDER BY (status IN ('pending','revision_requested')) DESC, created_at DESC LIMIT 200`,
      [factoryId],
    );
    return { purchaseRequests: await Promise.all(rows.map((r) => purchaseView(db, r, "seller", now()))) };
  });

  async function sellerPurchase(factoryId: string, id: string): Promise<PurchaseRow> {
    const [p] = await db.query<PurchaseRow>("SELECT * FROM purchase_requests WHERE id=$1 AND seller_id=$2", [id, factoryId]);
    if (!p) throw new ApiError(404, "not_found");
    return p;
  }

  app.get("/v1/market/seller/purchase-requests/:id", async (req) => {
    const { factoryId } = await requireSeller(req, { write: false });
    return { purchaseRequest: await purchaseView(db, await sellerPurchase(factoryId, idParam(req)), "seller", now()) };
  });

  // رد البائع: السعر النهائي للوحدة، والإجمالي = السعر × الكمية (بالهللة، بدون كسور).
  app.post("/v1/market/seller/purchase-requests/:id/quote", async (req) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const p = await sellerPurchase(factoryId, idParam(req));
    const body = parse(purchaseQuoteBody, req.body);
    rejectContactInfo({ note: body.note });
    await db.tx(async (t) => {
      const moved = await t.query(
        "UPDATE purchase_requests SET status='quoted', updated_at=now() WHERE id=$1 AND status IN ('pending','revision_requested') RETURNING id",
        [p.id],
      );
      if (!moved.length) throw new ApiError(409, "invalid_transition");
      await t.query("UPDATE purchase_quotes SET status='superseded' WHERE purchase_request_id=$1 AND status='active'", [p.id]);
      const [q] = await t.query<{ id: string }>(
        `INSERT INTO purchase_quotes (purchase_request_id, unit_price_halalas, total_halalas, lead_time_days, delivery_included, valid_until, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [p.id, body.unitPriceHalalas, body.unitPriceHalalas * p.quantity, body.leadTimeDays, body.deliveryIncluded,
          new Date(now().getTime() + body.validDays * 86400_000), body.note || null, user.id],
      );
      await audit(t, actorOf(user), "purchase.quoted", { type: "purchase_request", id: p.id }, { quoteId: q.id });
    });
    await events.purchaseQuoted(db, p.id, now());
    return { purchaseRequest: await purchaseView(db, await sellerPurchase(factoryId, p.id), "seller", now()) };
  });

  // اعتذار البائع عن الطلب (ما يقدر يوفّره)، مع سبب اختياري يوصل للمشتري.
  app.post("/v1/market/seller/purchase-requests/:id/decline", async (req) => {
    const { user, factoryId } = await requireSeller(req, { write: true });
    const p = await sellerPurchase(factoryId, idParam(req));
    const body = parse(purchaseNoteBody, req.body ?? {});
    rejectContactInfo({ note: body.note });
    const moved = await db.query(
      "UPDATE purchase_requests SET status='declined', decision_note=$2, updated_at=now() WHERE id=$1 AND status IN ('pending','revision_requested') RETURNING id",
      [p.id, body.note || null],
    );
    if (!moved.length) throw new ApiError(409, "invalid_transition");
    await audit(db, actorOf(user), "purchase.declined", { type: "purchase_request", id: p.id });
    return { purchaseRequest: await purchaseView(db, await sellerPurchase(factoryId, p.id), "seller", now()) };
  });

  // ───────── المشتري ─────────

  /**
   * المشتري من الجلسة: عميل (منشأة أو فرد) أو مزوّد (قرار ٥٦). يرجّع اسم العمود اللي يربط الطلب فيه،
   * وكل استعلام بعدها يقيّد بهذا العمود عشان ما أحد يشوف طلب غيره (404).
   * العمود من قيمتين ثابتة هنا، مو من المستخدم، فإدخاله في نص الاستعلام آمن.
   */
  async function buyerSession(req: FastifyRequest) {
    const user = await g.authenticate(req);
    if (user.role === "provider") {
      // القراءة والأزرار لأي مزوّد عنده طلبات، حتى لو انوقف بعدها (ولا مرة طريق مسدود).
      // إنشاء طلب جديد يحتاج توثيق فعّال (requireBuyer تحت).
      const [pr] = await db.query<{ id: string }>("SELECT id FROM providers WHERE user_id=$1", [user.id]);
      // بدون ملف = ما توثّق بعد (نفس رسالة requireActiveProvider، والتطبيق يوجّهه لإكمال التوثيق).
      if (!pr) throw new ApiError(403, "provider_not_verified");
      return { user, column: "buyer_provider_id" as const, buyerId: pr.id };
    }
    const { factoryId } = await g.requireFactory(req);
    return { user, column: "buyer_factory_id" as const, buyerId: factoryId };
  }
  type BuyerSession = Awaited<ReturnType<typeof buyerSession>>;

  /**
   * اللي يقدر يطلب طلب جديد: نوعه في إعداد buyerKinds.
   *  - العميل: بياناته مكتملة.
   *  - المزوّد: موثّق فعليًا (مستنداته مقبولة وما انتهت، ومو موقوف)، مثل شرط إرسال العروض.
   */
  async function requireBuyer(req: FastifyRequest) {
    const b = await buyerSession(req);
    const { buyerKinds } = await settings();
    if (b.column === "buyer_provider_id") {
      if (!buyerKinds.includes("provider")) throw new ApiError(403, "market_buyer_not_allowed");
      const provider = await requireActiveProvider(db, b.user.id, now());
      return { ...b, defaultCityId: provider.cityIds[0] ?? null };
    }
    const [f] = await db.query<CustomerRow>("SELECT * FROM factories WHERE id=$1", [b.buyerId]);
    if (!f.kind || !buyerKinds.includes(f.kind)) throw new ApiError(403, "market_buyer_not_allowed");
    if (!profileComplete(f)) throw new ApiError(409, "profile_incomplete");
    return { ...b, defaultCityId: f.city_id };
  }

  app.post("/v1/market/products/:id/purchase-requests", async (req, reply) => {
    const buyer = await requireBuyer(req);
    const body = parse(purchaseRequestBody, req.body);
    rejectContactInfo({ note: body.note });
    const [p] = await db.query<ProductRow>(
      `SELECT p.* FROM products p JOIN sellers s ON s.factory_id = p.seller_id WHERE p.id=$3 AND ${productListedSql("$1", "$2")}`,
      [now(), todayRiyadh(now()), idParam(req)],
    );
    if (!p) throw new ApiError(404, "not_found");
    if (buyer.column === "buyer_factory_id" && p.seller_id === buyer.buyerId) throw new ApiError(409, "own_product");
    if (body.quantity < p.min_order_qty) throw new ApiError(400, "below_min_order", undefined, { min: p.min_order_qty });
    const cityId = await resolveCityId(db, body.cityId ?? buyer.defaultCityId);
    const [row] = await db.query<PurchaseRow>(
      `INSERT INTO purchase_requests (product_id, seller_id, ${buyer.column}, buyer_user_id, quantity, city_id, needed_when, note, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [p.id, p.seller_id, buyer.buyerId, buyer.user.id, body.quantity, cityId, body.when, body.note || null, now()],
    );
    await audit(db, actorOf(buyer.user), "purchase.requested", { type: "purchase_request", id: row.id }, { productId: p.id });
    await events.purchaseRequested(db, row.id, now());
    // تقدير السعر من السعر المعلن (لو فيه)، عشان المشتري يشوف رقم مبدئي لين يرد المصنع.
    const estimate = unitPriceFor({ pricing: p.pricing, unitPriceHalalas: p.unit_price_halalas === null ? null : Number(p.unit_price_halalas), priceTiers: p.price_tiers }, body.quantity);
    return reply.status(201).send({
      purchaseRequest: await purchaseView(db, row, "buyer", now()),
      estimateHalalas: estimate === null ? null : estimate * body.quantity,
    });
  });

  app.get("/v1/market/purchase-requests", async (req) => {
    const b = await buyerSession(req);
    const rows = await db.query<PurchaseRow>(`SELECT * FROM purchase_requests WHERE ${b.column}=$1 ORDER BY created_at DESC LIMIT 200`, [b.buyerId]);
    return { purchaseRequests: await Promise.all(rows.map((r) => purchaseView(db, r, "buyer", now()))) };
  });

  async function buyerPurchase(b: BuyerSession, id: string): Promise<PurchaseRow> {
    const [p] = await db.query<PurchaseRow>(`SELECT * FROM purchase_requests WHERE id=$1 AND ${b.column}=$2`, [id, b.buyerId]);
    if (!p) throw new ApiError(404, "not_found");
    return p;
  }

  app.get("/v1/market/purchase-requests/:id", async (req) => {
    const b = await buyerSession(req);
    return { purchaseRequest: await purchaseView(db, await buyerPurchase(b, idParam(req)), "buyer", now()) };
  });

  /** ينفّذ زر من أزرار المشتري بعد ما يتأكد إنه مسموح في الحالة الفعلية (نفس جدول buyerPurchaseActions). */
  async function buyerAction(req: FastifyRequest, action: "accept" | "reject" | "request_revision" | "cancel" | "confirm_received") {
    const b = await buyerSession(req);
    const { user } = b;
    const p = await buyerPurchase(b, idParam(req));
    const view = await purchaseView(db, p, "buyer", now());
    if (!(view.actions as string[]).includes(action)) throw new ApiError(409, "invalid_transition");
    const body = parse(purchaseNoteBody, req.body ?? {});
    rejectContactInfo({ note: body.note });
    // التواصل بعد القبول: رقم الشخص اللي رد بالسعر من جهة المصنع (مثل الخدمات: رقم اللي قبل العرض).
    const quotedBy = action === "accept" && view.quote
      ? (await db.query<{ created_by: string }>("SELECT created_by FROM purchase_quotes WHERE id=$1", [view.quote.id]))[0]?.created_by
      : null;
    await db.tx(async (t) => {
      // كل تغيير مشروط بالحالة اللي شفناها، عشان ضغطتين بنفس اللحظة ما يغيّرون مرتين.
      const sql: Record<typeof action, [string, unknown[]]> = {
        accept: [
          `UPDATE purchase_requests SET status='accepted', accepted_quote_id=$2, seller_user_id=$3, accepted_at=$4, updated_at=now()
            WHERE id=$1 AND status='quoted' RETURNING id`,
          [p.id, view.quote?.id ?? null, quotedBy, now()],
        ],
        reject: ["UPDATE purchase_requests SET status='rejected', decision_note=$2, updated_at=now() WHERE id=$1 AND status='quoted' RETURNING id", [p.id, body.note || null]],
        request_revision: [
          `UPDATE purchase_requests SET status='revision_requested', revision_used=true, revision_note=$2, updated_at=now()
            WHERE id=$1 AND status='quoted' AND NOT revision_used RETURNING id`,
          [p.id, body.note || null],
        ],
        cancel: [
          "UPDATE purchase_requests SET status='cancelled', decision_note=$2, updated_at=now() WHERE id=$1 AND status IN ('pending','quoted','revision_requested') RETURNING id",
          [p.id, body.note || null],
        ],
        confirm_received: ["UPDATE purchase_requests SET status='received', received_at=$2, updated_at=now() WHERE id=$1 AND status='accepted' RETURNING id", [p.id, now()]],
      };
      const [q, params] = sql[action];
      const moved = await t.query(q, params);
      if (!moved.length) throw new ApiError(409, "invalid_transition");
      await audit(t, actorOf(user), `purchase.${action}`, { type: "purchase_request", id: p.id });
    });
    if (action === "accept") await events.purchaseAccepted(db, p.id, now());
    return { purchaseRequest: await purchaseView(db, await buyerPurchase(b, p.id), "buyer", now()) };
  }

  app.post("/v1/market/purchase-requests/:id/accept", (req) => buyerAction(req, "accept"));
  app.post("/v1/market/purchase-requests/:id/reject", (req) => buyerAction(req, "reject"));
  app.post("/v1/market/purchase-requests/:id/revision", (req) => buyerAction(req, "request_revision"));
  app.post("/v1/market/purchase-requests/:id/cancel", (req) => buyerAction(req, "cancel"));
  app.post("/v1/market/purchase-requests/:id/received", (req) => buyerAction(req, "confirm_received"));

  // تقييم البائع بالنجوم بعد الاستلام، مرة وحدة.
  app.post("/v1/market/purchase-requests/:id/rating", async (req) => {
    const b = await buyerSession(req);
    const { user } = b;
    const p = await buyerPurchase(b, idParam(req));
    const { stars } = parse(rateOrderBody, req.body);
    if (p.status !== "received") throw new ApiError(409, "not_completed");
    const rows = await db.query(
      "INSERT INTO seller_ratings (purchase_request_id, seller_id, stars) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING purchase_request_id",
      [p.id, p.seller_id, stars],
    );
    if (!rows.length) throw new ApiError(409, "already_rated");
    await audit(db, actorOf(user), "purchase.rated", { type: "purchase_request", id: p.id }, { stars });
    return { purchaseRequest: await purchaseView(db, p, "buyer", now()) };
  });

  // لوحة المصنع: كم طلب شراء ينتظر رده (للشارة في «متجري»).
  app.get("/v1/market/seller/summary", async (req) => {
    const { factoryId } = await requireSeller(req, { write: false });
    const [r] = await db.query<{ waiting: number }>(
      "SELECT count(*)::int AS waiting FROM purchase_requests WHERE seller_id=$1 AND status IN ('pending','revision_requested')",
      [factoryId],
    );
    return { waiting: r.waiting, nextSubscriptionEnd: await lastSubscriptionEnd(db, "factory", factoryId) };
  });
}
