// السوق في الخادم التجريبي (النسخة التجريبية للمالك وشريكه). نفس مسارات وشكل ردود apps/api/src/routes/market.ts،
// والقواعد من @mazood/shared نفسها (التحقق، وأزرار المشتري، وسعر الشرائح). كل البيانات وهمية.
// اللي ما يسويه قصدًا: رفع السجل وتوثيقه (البائعين التجريبيين موثّقين ومشتركين من البداية)، والدفعات.
import {
  buyerPurchaseActions,
  containsContactInfo,
  PRODUCT_MAX_IMAGES,
  productBody,
  purchaseNoteBody,
  purchaseQuoteBody,
  purchaseRequestBody,
  rateOrderBody,
  unitPriceFor,
  type ProductUnit,
  type PurchaseStatus,
} from "@mazood/shared";

const DAY = 86400_000;

export type DemoProduct = {
  id: string;
  sellerId: string;
  categoryId: string;
  name: string;
  description: string;
  unit: ProductUnit;
  minOrderQty: number;
  pricing: "fixed" | "quote";
  unitPriceHalalas: number | null;
  priceTiers: { minQty: number; unitPriceHalalas: number }[];
  images: { id: string; url: string }[];
  status: "active" | "hidden" | "removed";
  createdAt: string;
  updatedAt: string;
};
type DemoQuote = { id: string; unitPriceHalalas: number; totalHalalas: number; leadTimeDays: number; deliveryIncluded: boolean; validUntil: string; note: string | null; createdAt: string };
export type DemoPurchase = {
  id: string;
  productId: string;
  sellerId: string;
  buyerId: string;
  buyerPhone: string;
  quantity: number;
  when: string;
  note: string | null;
  status: Exclude<PurchaseStatus, "expired">;
  revisionUsed: boolean;
  revisionNote: string | null;
  decisionNote: string | null;
  quote: DemoQuote | null;
  rated: number | null;
  acceptedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
};
export type MarketState = { sellers: { factoryId: string; enabledAt: string }[]; products: DemoProduct[]; purchases: DemoPurchase[] };

export const CATEGORIES = [
  ["plastics_packaging", "بلاستيك وتغليف", "Plastics & packaging"],
  ["steel_metals", "حديد ومعادن", "Steel & metals"],
  ["wood_pallets", "أخشاب وطبالي", "Wood & pallets"],
  ["cardboard_paper", "كرتون وورق", "Cardboard & paper"],
  ["chemicals_cleaning", "كيماويات ومنظفات", "Chemicals & cleaning"],
  ["building_materials", "مواد بناء", "Building materials"],
  ["food", "مواد غذائية", "Food products"],
  ["other", "منتجات ثانية", "Other products"],
] as const;

/** بيانات أولية: المصنعين الوهميين (f1 وf2) بائعين موثّقين ومشتركين، ولكل واحد منتجات. */
export function seedMarket(t: number, iso: (ms: number) => string): MarketState {
  const p = (id: string, sellerId: string, categoryId: string, name: string, description: string, unit: ProductUnit, minOrderQty: number, price: number | null, tiers: [number, number][] = []): DemoProduct => ({
    id, sellerId, categoryId, name, description, unit, minOrderQty,
    pricing: price ? "fixed" : "quote",
    unitPriceHalalas: price,
    priceTiers: tiers.map(([minQty, unitPriceHalalas]) => ({ minQty, unitPriceHalalas })),
    images: [], status: "active", createdAt: iso(t - 10 * DAY), updatedAt: iso(t - 2 * DAY),
  });
  return {
    sellers: [{ factoryId: "f1", enabledAt: iso(t - 20 * DAY) }, { factoryId: "f2", enabledAt: iso(t - 30 * DAY) }],
    products: [
      p("mp1", "f2", "steel_metals", "حديد تسليح ١٢ ملم", "أسياخ حديد تسليح مطابقة للمواصفات السعودية، طول ١٢ متر.", "ton", 5, 285000, [[20, 278000], [50, 270000]]),
      p("mp2", "f2", "steel_metals", "صفائح حديد مجلفن", "صفائح مجلفنة سماكة ٠٫٥ إلى ٢ ملم، تقص حسب الطلب.", "piece", 100, null),
      p("mp3", "f2", "building_materials", "شبك حديد للخرسانة", "شبك ملحوم ٢×٦ متر، فتحة ١٥ سم.", "piece", 50, 9500, [[300, 8800]]),
      p("mp4", "f1", "plastics_packaging", "أكياس نايلون صناعية", "أكياس بولي إيثيلين للتعبئة، مقاسات من ٣٠ إلى ٩٠ سم، طباعة حسب الطلب.", "carton", 20, 6500, [[100, 5900]]),
      p("mp5", "f1", "plastics_packaging", "استرتش تغليف طبالي", "رول استرتش شفاف ٥٠ سم، ٢٣ ميكرون، مناسب للتغليف اليدوي والآلي.", "roll", 30, 3800),
      p("mp6", "f1", "plastics_packaging", "عبوات بلاستيك ٢٠ لتر", "جالونات بلاستيك بغطاء محكم، مناسبة للمواد الكيماوية والغذائية.", "piece", 200, null),
    ],
    purchases: [
      // طلب شراء من f2 على منتج f1، ينتظر رد f1 (يظهر في «متجري» للمنشأة التجريبية).
      { id: "pr1", productId: "mp4", sellerId: "f1", buyerId: "f2", buyerPhone: "+966500000003", quantity: 120, when: "this_week", note: "نبيها مطبوعة بشعارنا.", status: "pending", revisionUsed: false, revisionNote: null, decisionNote: null, quote: null, rated: null, acceptedAt: null, receivedAt: null, createdAt: iso(t - 3 * 3600_000) },
      // طلب شراء من f1 على منتج f2، وصل رده (يظهر في «طلباتي ← الشراء»).
      { id: "pr2", productId: "mp1", sellerId: "f2", buyerId: "f1", buyerPhone: "+966500000001", quantity: 25, when: "this_month", note: null, status: "quoted", revisionUsed: false, revisionNote: null, decisionNote: null,
        quote: { id: "q1", unitPriceHalalas: 276000, totalHalalas: 276000 * 25, leadTimeDays: 4, deliveryIncluded: true, validUntil: iso(t + 2 * DAY), note: "السعر يشمل التحميل.", createdAt: iso(t - 5 * 3600_000) },
        rated: null, acceptedAt: null, receivedAt: null, createdAt: iso(t - 26 * 3600_000) },
    ],
  };
}

type Factory = { id: string; kind?: "business" | "individual" | null; name: string | null };
type User = { id: string; phone: string; role: string; factoryId: string | null };
type Handler = (c: { u: () => User; body: unknown; params: string[]; query: URLSearchParams }) => unknown;

/** أدوات الخادم التجريبي اللي يحتاجها السوق (من server.ts). */
export type DemoHost = {
  on: (method: string, pattern: string, h: Handler) => void;
  market: () => MarketState;
  factories: () => Factory[];
  phoneOf: (factoryId: string) => string;
  fail: (status: number, code: string) => never;
  id: (prefix: string) => string;
  now: () => number;
  iso: (ms: number) => string;
};

export function registerMarketDemo(h: DemoHost) {
  const { on, fail } = h;
  const factoryOf = (u: User) => (u.role === "factory" && u.factoryId ? u.factoryId : fail(403, "forbidden"));
  const factory = (id: string) => h.factories().find((f) => f.id === id);
  const parse = <T,>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, body: unknown): T => {
    const r = schema.safeParse(body);
    return r.success ? r.data : fail(400, "validation");
  };
  const noContact = (...v: (string | undefined | null)[]) => v.some((x) => containsContactInfo(x ?? undefined)) && fail(400, "contact_info_not_allowed");
  const cats = () => CATEGORIES.map(([id, ar, en]) => ({ id, name: { ar, en } }));
  const listed = (p: DemoProduct) => p.status === "active" && h.market().sellers.some((s) => s.factoryId === p.sellerId);
  const view = (p: DemoProduct) => ({
    id: p.id, name: p.name, description: p.description,
    category: { id: p.categoryId, name: cats().find((c) => c.id === p.categoryId)?.name ?? null },
    unit: p.unit, minOrderQty: p.minOrderQty, pricing: p.pricing, unitPriceHalalas: p.unitPriceHalalas, priceTiers: p.priceTiers,
    images: p.images, seller: { id: p.sellerId, name: factory(p.sellerId)?.name ?? null }, featured: false,
    status: p.status, removedReason: null, updatedAt: p.updatedAt,
  });
  const rating = (sellerId: string) => {
    const r = h.market().purchases.filter((x) => x.sellerId === sellerId && x.rated);
    return r.length ? { average: Math.round((r.reduce((s, x) => s + x.rated!, 0) / r.length) * 100) / 100, count: r.length } : null;
  };
  const effective = (p: DemoPurchase): PurchaseStatus => (p.status === "quoted" && p.quote && Date.parse(p.quote.validUntil) <= h.now() ? "expired" : p.status);
  const purchaseView = (p: DemoPurchase, viewer: "buyer" | "seller") => {
    const prod = h.market().products.find((x) => x.id === p.productId)!;
    const status = effective(p);
    const agreed = p.status === "accepted" || p.status === "received";
    const buyer = factory(p.buyerId);
    return {
      id: p.id,
      product: { id: prod.id, name: prod.name, unit: prod.unit, imageUrl: prod.images[0]?.url ?? null },
      seller: { id: p.sellerId, name: factory(p.sellerId)?.name ?? null },
      buyer: viewer === "seller" ? { kind: buyer?.kind ?? "business", name: agreed ? buyer?.name ?? null : null } : undefined,
      quantity: p.quantity, cityId: "sudair", when: p.when, note: p.note, status,
      revisionUsed: p.revisionUsed, revisionNote: p.revisionNote, decisionNote: p.decisionNote, quote: p.quote,
      contact: agreed ? { name: viewer === "buyer" ? factory(p.sellerId)?.name ?? null : buyer?.name ?? null, phone: viewer === "buyer" ? h.phoneOf(p.sellerId) : p.buyerPhone } : null,
      rated: !!p.rated,
      actions: viewer === "buyer" ? buyerPurchaseActions(status, { revisionUsed: p.revisionUsed, rated: !!p.rated }) : status === "pending" || status === "revision_requested" ? ["quote", "decline"] : [],
      acceptedAt: p.acceptedAt, receivedAt: p.receivedAt, createdAt: p.createdAt,
    };
  };
  const touch = (p: DemoProduct) => (p.updatedAt = h.iso(h.now()));

  on("GET", "/v1/market/categories", () => ({ categories: cats() }));
  on("GET", "/v1/market/products", ({ query }) => {
    const q = (query.get("q") ?? "").trim();
    const cat = query.get("category");
    const seller = query.get("seller");
    const products = h.market().products
      .filter(listed)
      .filter((p) => (!cat || p.categoryId === cat) && (!seller || p.sellerId === seller))
      .filter((p) => !q || [p.name, p.description, factory(p.sellerId)?.name ?? ""].some((s) => s.includes(q)))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return { products: products.map(view), comingSoon: false, page: 0, hasMore: false };
  });
  on("GET", "/v1/market/products/:id", ({ params }) => {
    const p = h.market().products.find((x) => x.id === params[0] && listed(x)) ?? fail(404, "not_found");
    const v = view(p);
    return { product: { ...v, seller: { ...v.seller, verified: true, rating: rating(p.sellerId) } } };
  });
  on("GET", "/v1/market/sellers/:id", ({ params }) => {
    const s = h.market().sellers.find((x) => x.factoryId === params[0]) ?? fail(404, "not_found");
    return {
      seller: { id: s.factoryId, name: factory(s.factoryId)?.name ?? null, city: { ar: "سدير", en: "Sudair" }, verified: true, verifiedAt: s.enabledAt, rating: rating(s.factoryId) },
      products: h.market().products.filter((p) => p.sellerId === s.factoryId && listed(p)).map(view),
    };
  });

  // ───── المصنع البائع ─────
  const sellerState = (fid: string) => {
    const s = h.market().sellers.find((x) => x.factoryId === fid);
    if (!s) return null;
    const mine = h.market().products.filter((p) => p.sellerId === fid && p.status !== "removed");
    return {
      status: "verified", statusReason: null, submittedAt: s.enabledAt, verifiedAt: s.enabledAt,
      document: { id: `doc-${fid}`, status: "approved", expiresOn: "2030-01-01", rejectReason: null },
      documentValid: true,
      subscription: { planId: "seller_basic", kind: "paid", startsAt: s.enabledAt, endsAt: h.iso(Date.parse(s.enabledAt) + 60 * DAY) },
      listed: true, warnings: { subscriptionEndingSoon: false, documentExpiringSoon: false },
      products: { total: mine.length, active: mine.filter((p) => p.status === "active").length },
    };
  };
  const requireSeller = (u: User) => {
    const fid = factoryOf(u);
    if (factory(fid)?.kind !== "business") fail(403, "seller_business_only");
    if (!h.market().sellers.some((s) => s.factoryId === fid)) fail(409, "seller_not_enabled");
    return fid;
  };
  const own = (fid: string, id: string) => h.market().products.find((p) => p.id === id && p.sellerId === fid) ?? fail(404, "not_found");

  on("GET", "/v1/market/seller", ({ u }) => {
    const fid = factoryOf(u());
    if (factory(fid)?.kind !== "business") fail(403, "seller_business_only");
    return { seller: sellerState(fid), plan: { id: "seller_basic", name: { ar: "باقة البائع", en: "Seller plan" }, monthlyPriceHalalas: 40000, maxProducts: 100 }, trialDays: 0 };
  });
  // في النسخة التجريبية: تفعيل البيع يوثّق المصنع ويشترك له مباشرة، عشان تجرّب «متجري» كامل.
  on("POST", "/v1/market/seller", ({ u }) => {
    const fid = factoryOf(u());
    if (factory(fid)?.kind !== "business") fail(403, "seller_business_only");
    if (!h.market().sellers.some((s) => s.factoryId === fid)) h.market().sellers.push({ factoryId: fid, enabledAt: h.iso(h.now()) });
    return { seller: sellerState(fid) };
  });
  on("GET", "/v1/market/seller/summary", ({ u }) => {
    const fid = requireSeller(u());
    return { waiting: h.market().purchases.filter((p) => p.sellerId === fid && (p.status === "pending" || p.status === "revision_requested")).length, nextSubscriptionEnd: null };
  });
  on("GET", "/v1/market/seller/products", ({ u }) => {
    const fid = requireSeller(u());
    return { products: h.market().products.filter((p) => p.sellerId === fid).map(view) };
  });
  on("POST", "/v1/market/seller/products", ({ u, body }) => {
    const fid = requireSeller(u());
    const b = parse(productBody, body);
    noContact(b.name, b.description);
    const t = h.iso(h.now());
    const p: DemoProduct = {
      id: h.id("mp"), sellerId: fid, categoryId: b.categoryId, name: b.name, description: b.description, unit: b.unit, minOrderQty: b.minOrderQty,
      pricing: b.pricing, unitPriceHalalas: b.pricing === "fixed" ? b.unitPriceHalalas ?? null : null, priceTiers: b.pricing === "fixed" ? b.priceTiers ?? [] : [],
      images: [], status: "active", createdAt: t, updatedAt: t,
    };
    h.market().products.push(p);
    return { product: view(p) };
  });
  on("PUT", "/v1/market/seller/products/:id", ({ u, body, params }) => {
    const p = own(requireSeller(u()), params[0]);
    const b = parse(productBody, body);
    noContact(b.name, b.description);
    Object.assign(p, { categoryId: b.categoryId, name: b.name, description: b.description, unit: b.unit, minOrderQty: b.minOrderQty, pricing: b.pricing,
      unitPriceHalalas: b.pricing === "fixed" ? b.unitPriceHalalas ?? null : null, priceTiers: b.pricing === "fixed" ? b.priceTiers ?? [] : [] });
    touch(p);
    return { product: view(p) };
  });
  on("POST", "/v1/market/seller/products/:id/:action", ({ u, params }) => {
    const p = own(requireSeller(u()), params[0]);
    if (params[1] !== "hide" && params[1] !== "show") fail(404, "not_found");
    p.status = params[1] === "hide" ? "hidden" : "active";
    touch(p);
    return { product: view(p) };
  });
  on("POST", "/v1/market/seller/products/:id/images/:imageId/delete", ({ u, params }) => {
    const p = own(requireSeller(u()), params[0]);
    p.images = p.images.filter((i) => i.id !== params[1]);
    return { ok: true };
  });
  on("GET", "/v1/market/seller/purchase-requests", ({ u }) => {
    const fid = requireSeller(u());
    const list = h.market().purchases.filter((p) => p.sellerId === fid).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { purchaseRequests: list.map((p) => purchaseView(p, "seller")) };
  });
  const sellerPurchase = (fid: string, id: string) => h.market().purchases.find((p) => p.id === id && p.sellerId === fid) ?? fail(404, "not_found");
  on("GET", "/v1/market/seller/purchase-requests/:id", ({ u, params }) => ({ purchaseRequest: purchaseView(sellerPurchase(requireSeller(u()), params[0]), "seller") }));
  on("POST", "/v1/market/seller/purchase-requests/:id/quote", ({ u, body, params }) => {
    const p = sellerPurchase(requireSeller(u()), params[0]);
    if (p.status !== "pending" && p.status !== "revision_requested") fail(409, "invalid_transition");
    const b = parse(purchaseQuoteBody, body);
    noContact(b.note);
    p.quote = { id: h.id("q"), unitPriceHalalas: b.unitPriceHalalas, totalHalalas: b.unitPriceHalalas * p.quantity, leadTimeDays: b.leadTimeDays, deliveryIncluded: b.deliveryIncluded, validUntil: h.iso(h.now() + b.validDays * DAY), note: b.note || null, createdAt: h.iso(h.now()) };
    p.status = "quoted";
    return { purchaseRequest: purchaseView(p, "seller") };
  });
  on("POST", "/v1/market/seller/purchase-requests/:id/decline", ({ u, body, params }) => {
    const p = sellerPurchase(requireSeller(u()), params[0]);
    if (p.status !== "pending" && p.status !== "revision_requested") fail(409, "invalid_transition");
    const b = parse(purchaseNoteBody, body ?? {});
    noContact(b.note);
    Object.assign(p, { status: "declined", decisionNote: b.note || null });
    return { purchaseRequest: purchaseView(p, "seller") };
  });

  // ───── المشتري ─────
  on("POST", "/v1/market/products/:id/purchase-requests", ({ u, body, params }) => {
    const user = u();
    const fid = factoryOf(user);
    if (factory(fid)?.kind !== "business") fail(403, "market_buyer_not_allowed");
    const prod = h.market().products.find((x) => x.id === params[0] && listed(x)) ?? fail(404, "not_found");
    if (prod.sellerId === fid) fail(409, "own_product");
    const b = parse(purchaseRequestBody, body);
    noContact(b.note);
    if (b.quantity < prod.minOrderQty) fail(400, "below_min_order");
    const p: DemoPurchase = { id: h.id("pr"), productId: prod.id, sellerId: prod.sellerId, buyerId: fid, buyerPhone: user.phone, quantity: b.quantity, when: b.when, note: b.note || null,
      status: "pending", revisionUsed: false, revisionNote: null, decisionNote: null, quote: null, rated: null, acceptedAt: null, receivedAt: null, createdAt: h.iso(h.now()) };
    h.market().purchases.push(p);
    const est = unitPriceFor(prod, b.quantity);
    return { purchaseRequest: purchaseView(p, "buyer"), estimateHalalas: est === null ? null : est * b.quantity };
  });
  on("GET", "/v1/market/purchase-requests", ({ u }) => {
    const fid = factoryOf(u());
    const list = h.market().purchases.filter((p) => p.buyerId === fid).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { purchaseRequests: list.map((p) => purchaseView(p, "buyer")) };
  });
  const buyerPurchase = (fid: string, id: string) => h.market().purchases.find((p) => p.id === id && p.buyerId === fid) ?? fail(404, "not_found");
  on("GET", "/v1/market/purchase-requests/:id", ({ u, params }) => ({ purchaseRequest: purchaseView(buyerPurchase(factoryOf(u()), params[0]), "buyer") }));
  const act = (action: "accept" | "reject" | "request_revision" | "cancel" | "confirm_received", next: (p: DemoPurchase, note: string | null) => void) =>
    ({ u, body, params }: { u: () => User; body: unknown; params: string[] }) => {
      const p = buyerPurchase(factoryOf(u()), params[0]);
      if (!(purchaseView(p, "buyer").actions as string[]).includes(action)) fail(409, "invalid_transition");
      const b = parse(purchaseNoteBody, body ?? {});
      noContact(b.note);
      next(p, b.note || null);
      return { purchaseRequest: purchaseView(p, "buyer") };
    };
  on("POST", "/v1/market/purchase-requests/:id/accept", act("accept", (p) => Object.assign(p, { status: "accepted", acceptedAt: h.iso(h.now()) })));
  on("POST", "/v1/market/purchase-requests/:id/reject", act("reject", (p, n) => Object.assign(p, { status: "rejected", decisionNote: n })));
  on("POST", "/v1/market/purchase-requests/:id/revision", act("request_revision", (p, n) => Object.assign(p, { status: "revision_requested", revisionUsed: true, revisionNote: n })));
  on("POST", "/v1/market/purchase-requests/:id/cancel", act("cancel", (p, n) => Object.assign(p, { status: "cancelled", decisionNote: n })));
  on("POST", "/v1/market/purchase-requests/:id/received", act("confirm_received", (p) => Object.assign(p, { status: "received", receivedAt: h.iso(h.now()) })));
  on("POST", "/v1/market/purchase-requests/:id/rating", ({ u, body, params }) => {
    const p = buyerPurchase(factoryOf(u()), params[0]);
    const { stars } = parse(rateOrderBody, body);
    if (p.status !== "received") fail(409, "not_completed");
    if (p.rated) fail(409, "already_rated");
    p.rated = stars;
    return { purchaseRequest: purchaseView(p, "buyer") };
  });
}

/** صورة منتج في النسخة التجريبية: رابط مؤقت من المتصفح (ما ينحفظ بعد تحديث الصفحة). */
export function demoProductImage(h: DemoHost, user: User, productId: string, file: Blob | null) {
  const fid = factoryOf2(h, user);
  const p = h.market().products.find((x) => x.id === productId && x.sellerId === fid) ?? h.fail(404, "not_found");
  if (p.images.length >= PRODUCT_MAX_IMAGES) h.fail(409, "images_limit");
  const url = file && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "";
  const image = { id: h.id("img"), url };
  p.images.push(image);
  return { image };
}
const factoryOf2 = (h: DemoHost, u: User) => (u.role === "factory" && u.factoryId ? u.factoryId : h.fail(403, "forbidden"));
