// سوق منتجات المصانع (الخطوة ب): التوثيق، والاشتراك، والظهور، وطلب السعر والرد، والإدارة.
// القواعد المهمة اللي نثبتها:
//  - المنتج ما يظهر إلا لبائع موثّق، سجله ساري، وعنده اشتراك يغطي الحين. ولو انتهى واحد منها يختفي تلقائيًا.
//  - مين يشتري حسب الإعداد (المنشآت الحين)، والطلب بدون أرقام أو روابط، والتواصل بعد القبول بس.
//  - كل حالة لطلب الشراء فيها زر للمشتري («ولا مرة طريق مسدود»).
//  - كل عميل يشوف طلبات الشراء الخاصة فيه بس.
import { buyerPurchaseActions, PURCHASE_STATUSES } from "@mazood/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setSetting } from "./settings.ts";
import { auth, createTestCtx, multipart, PDF, PNG, type TestCtx } from "./test-helpers.ts";
import { addMonths } from "./routes/market-admin.ts";

let ctx: TestCtx;
const SYS = { id: null, role: "system" };
const DAY = 86400_000;
type Session = { token: string; factoryId?: string };

const call = (method: "GET" | "POST" | "PUT", url: string, token?: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: token ? auth(token) : {}, payload });

const product = {
  name: "طبالي خشب مستعملة",
  categoryId: "wood_pallets",
  description: "طبالي خشب مقاس ١٢٠×١٠٠ بحالة ممتازة، جاهزة للتحميل.",
  unit: "pallet",
  minOrderQty: 50,
  pricing: "fixed",
  unitPriceHalalas: 3500,
  priceTiers: [{ minQty: 200, unitPriceHalalas: 3000 }],
};

let verifier: { token: string };
let finance: { token: string };
let support: { token: string };

/** مصنع بائع موثّق ومشترك شهر، ومعه منتج ظاهر. */
async function listedSeller(phone: string): Promise<{ s: Session & { factoryId: string }; productId: string }> {
  const s = await ctx.factory(phone, `مصنع بائع ${phone.slice(-4)}`);
  expect((await call("POST", "/v1/market/seller", s.token)).statusCode).toBe(201);
  const m = multipart({ expiresOn: "2030-01-01" }, { bytes: PDF });
  const up = await ctx.app.inject({ method: "POST", url: "/v1/market/seller/documents", headers: { ...auth(s.token), ...m.headers }, payload: m.payload });
  expect(up.statusCode).toBe(201);
  expect((await call("POST", "/v1/market/seller/submit", s.token)).statusCode).toBe(200);
  expect((await call("POST", `/v1/admin/market/sellers/${s.factoryId}/decision`, verifier.token, { decision: "verify" })).statusCode).toBe(200);
  const pay = await call("POST", `/v1/admin/market/sellers/${s.factoryId}/payments`, finance.token, {
    planId: "seller_basic",
    months: 1,
    amountHalalas: 40000,
    paidOn: "2026-11-22",
    reference: "TRX-TEST-1",
  });
  expect(pay.statusCode).toBe(201);
  const p = await call("POST", "/v1/market/seller/products", s.token, product);
  expect(p.statusCode).toBe(201);
  return { s, productId: p.json().product.id };
}

const publicIds = async () => (await call("GET", "/v1/market/products")).json().products.map((x: { id: string }) => x.id) as string[];

beforeAll(async () => {
  ctx = await createTestCtx();
  verifier = await ctx.staff("0551000001", "verification");
  finance = await ctx.staff("0551000002", "finance");
  support = await ctx.staff("0551000003", "support");
});
afterAll(async () => { await ctx.close(); });

describe("البائع والظهور في السوق", () => {
  it("المنتج ما يظهر قبل التوثيق والاشتراك، ويظهر بعدهم للزوار بدون دخول", async () => {
    const s = await ctx.factory("0516000001", "مصنع التغليف");
    await call("POST", "/v1/market/seller", s.token);
    const p = await call("POST", "/v1/market/seller/products", s.token, product);
    expect(p.statusCode).toBe(201);
    expect(await publicIds()).not.toContain(p.json().product.id);
    expect((await call("GET", `/v1/market/products/${p.json().product.id}`)).statusCode).toBe(404);

    const { productId } = await listedSeller("0516000002");
    expect(await publicIds()).toContain(productId);
    const one = await call("GET", `/v1/market/products/${productId}`);
    expect(one.statusCode).toBe(200);
    expect(one.json().product).toMatchObject({ pricing: "fixed", unitPriceHalalas: 3500, seller: { verified: true } });
  });

  it("المنتجات تختفي تلقائيًا لما ينتهي الاشتراك، وترجع بعد الدفعة", async () => {
    const { s, productId } = await listedSeller("0516000003");
    // الاشتراك انتهى أمس (بدل ما نقدّم الساعة ٤٠ يوم وتنتهي جلسات الدخول).
    await ctx.db.query("UPDATE subscriptions SET starts_at=$2, ends_at=$3 WHERE subject_id=$1", [
      s.factoryId, new Date(ctx.clock.now.getTime() - 31 * DAY), new Date(ctx.clock.now.getTime() - DAY),
    ]);
    expect(await publicIds()).not.toContain(productId);
    expect((await call("GET", "/v1/market/seller", s.token)).json().seller).toMatchObject({ listed: false, subscription: null });
    const pay = await call("POST", `/v1/admin/market/sellers/${s.factoryId}/payments`, finance.token, {
      planId: "seller_basic", months: 1, amountHalalas: 40000, paidOn: "2026-11-22", reference: "TRX-TEST-2",
    });
    // الدفعة بعد الانتهاء تبدأ من الحين، مو من النهاية القديمة.
    expect(pay.json().startsAt).toBe(ctx.clock.now.toISOString());
    expect(await publicIds()).toContain(productId);
  });

  it("المنتجات تختفي لما ينتهي السجل التجاري المقبول", async () => {
    const { s, productId } = await listedSeller("0516000004");
    await ctx.db.query("UPDATE seller_documents SET expires_on='2026-01-01' WHERE factory_id=$1", [s.factoryId]);
    expect(await publicIds()).not.toContain(productId);
  });

  it("المنتج المخفي من المصنع ما يظهر، ويرجع لما يظهره", async () => {
    const { s, productId } = await listedSeller("0516000005");
    expect((await call("POST", `/v1/market/seller/products/${productId}/hide`, s.token)).json().product.status).toBe("hidden");
    expect(await publicIds()).not.toContain(productId);
    await call("POST", `/v1/market/seller/products/${productId}/show`, s.token);
    expect(await publicIds()).toContain(productId);
  });

  it("الفرد ما يفعّل البيع، والمنشأة بدون بيانات كاملة ما تفعّله، والموظف (مو المدير) ما يضيف منتج", async () => {
    const ind = await ctx.signIn("0516000006");
    await call("PUT", "/v1/factory", ind.token, { kind: "individual", name: "فرد يبيع شي", idType: "national_id", idNumber: "1011111111" });
    expect((await call("POST", "/v1/market/seller", ind.token)).json().error.code).toBe("seller_business_only");
    const empty = await ctx.signIn("0516000007");
    await call("PUT", "/v1/factory", empty.token, { kind: "business", name: "منشأة", commercialRegister: "1010000000", vatNumber: "300000000000003" });
    await ctx.db.query("UPDATE factories SET vat_number=NULL WHERE id=(SELECT factory_id FROM factory_members WHERE user_id=$1)", [empty.userId]);
    expect((await call("POST", "/v1/market/seller", empty.token)).json().error.code).toBe("profile_incomplete");

    const { s } = await listedSeller("0516000008");
    await call("POST", "/v1/factory/members", s.token, { phone: "0516000009", role: "member" });
    const member = await ctx.signIn("0516000009");
    expect((await call("POST", "/v1/market/seller/products", member.token, product)).statusCode).toBe(403);
    expect((await call("GET", "/v1/market/seller/products", member.token)).statusCode).toBe(200);
  });

  it("المدخلات الغلط تنرفض: رقم جوال في الوصف، وشرائح مو تصاعدية، وسعر مع «اطلب سعر»", async () => {
    const { s } = await listedSeller("0516000010");
    const withPhone = await call("POST", "/v1/market/seller/products", s.token, { ...product, description: "للطلب كلمنا على 0551234567 مباشرة" });
    expect(withPhone.json().error.code).toBe("contact_info_not_allowed");
    const badTiers = await call("POST", "/v1/market/seller/products", s.token, { ...product, priceTiers: [{ minQty: 10, unitPriceHalalas: 3000 }] });
    expect(badTiers.statusCode).toBe(400);
    const quoteWithPrice = await call("POST", "/v1/market/seller/products", s.token, { ...product, pricing: "quote" });
    expect(quoteWithPrice.statusCode).toBe(400);
    const quote = await call("POST", "/v1/market/seller/products", s.token, { ...product, pricing: "quote", unitPriceHalalas: null, priceTiers: [] });
    expect(quote.statusCode).toBe(201);
    expect((await call("POST", "/v1/market/seller/products", s.token, { ...product, categoryId: "weapons" })).json().error.code).toBe("category_invalid");
  });

  it("صور المنتج: JPEG أو PNG بس، وحتى ٥، وتنفتح للعامة", async () => {
    const { s, productId } = await listedSeller("0516000011");
    const send = (bytes: Buffer, type = "image/png") => {
      const m = multipart({}, { bytes, name: "p.png", type });
      return ctx.app.inject({ method: "POST", url: `/v1/market/seller/products/${productId}/images`, headers: { ...auth(s.token), ...m.headers }, payload: m.payload });
    };
    expect((await send(PDF, "application/pdf")).statusCode).toBe(415);
    const first = await send(PNG);
    expect(first.statusCode).toBe(201);
    for (let i = 0; i < 4; i++) expect((await send(PNG)).statusCode).toBe(201);
    expect((await send(PNG)).json().error.code).toBe("images_limit");
    const img = await call("GET", first.json().image.url);
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("البحث والتصنيف وصفحة المصنع", async () => {
    const { s, productId } = await listedSeller("0516000012");
    await call("PUT", `/v1/market/seller/products/${productId}`, s.token, { ...product, name: "كراتين شحن مقوّاة", categoryId: "cardboard_paper" });
    const byQ = (await call("GET", `/v1/market/products?q=${encodeURIComponent("كراتين")}`)).json().products;
    expect(byQ.map((x: { id: string }) => x.id)).toContain(productId);
    const byCat = (await call("GET", "/v1/market/products?category=cardboard_paper")).json().products;
    expect(byCat.every((x: { category: { id: string } }) => x.category.id === "cardboard_paper")).toBe(true);
    const wild = (await call("GET", `/v1/market/products?q=${encodeURIComponent("%")}`)).json().products;
    expect(wild.length).toBe(0);
    const page = await call("GET", `/v1/market/sellers/${s.factoryId}`);
    expect(page.statusCode).toBe(200);
    expect(page.json().products.map((x: { id: string }) => x.id)).toContain(productId);
  });

  it("الصفحة العامة «قريبًا» للزوار لين يكتمل العدد، والداخل يشوف المتوفر", async () => {
    await setSetting(ctx.db, SYS, "market", { buyerKinds: ["business"], trialDays: 0, commissionBps: 0, publicMinProducts: 10_000, expiryWarningDays: 7 });
    try {
      const anon = (await call("GET", "/v1/market/products")).json();
      expect(anon).toMatchObject({ comingSoon: true, products: [] });
      const b = await ctx.factory("0516000013");
      expect((await call("GET", "/v1/market/products", b.token)).json().comingSoon).toBe(false);
    } finally {
      await setSetting(ctx.db, SYS, "market", { buyerKinds: ["business"], trialDays: 0, commissionBps: 0, publicMinProducts: 0, expiryWarningDays: 7 });
    }
  });

  it("الفترة المجانية: لو الإعداد مفعّل، تبدأ مع تفعيل البيع مرة وحدة", async () => {
    await setSetting(ctx.db, SYS, "market", { buyerKinds: ["business"], trialDays: 30, commissionBps: 0, publicMinProducts: 0, expiryWarningDays: 7 });
    try {
      const s = await ctx.factory("0516000014");
      const r = await call("POST", "/v1/market/seller", s.token);
      expect(r.json().seller.subscription).toMatchObject({ kind: "trial" });
      await call("POST", "/v1/market/seller", s.token);
      const [n] = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM subscriptions WHERE subject_id=$1", [s.factoryId]);
      expect(n.n).toBe(1);
    } finally {
      await setSetting(ctx.db, SYS, "market", { buyerKinds: ["business"], trialDays: 0, commissionBps: 0, publicMinProducts: 0, expiryWarningDays: 7 });
    }
  });
});

describe("طلب السعر والرد", () => {
  let seller: Session & { factoryId: string };
  let productId: string;
  let buyer: Session;
  beforeAll(async () => {
    ({ s: seller, productId } = await listedSeller("0517000001"));
    buyer = await ctx.factory("0517000002", "مصنع مشتري");
  });

  const request = (token = buyer.token, payload: object = { quantity: 250, when: "this_week", note: "نبيها على دفعتين" }) =>
    call("POST", `/v1/market/products/${productId}/purchase-requests`, token, payload);

  it("الدورة كاملة: طلب ← رد ← تعديل مرة وحدة ← قبول ← التواصل يظهر ← استلام ← تقييم", async () => {
    const r = await request();
    expect(r.statusCode).toBe(201);
    // ٢٥٠ وحدة تدخل في شريحة ٢٠٠+ (٣٠ ريال)، فالتقدير ٧٥٠٠ ريال.
    expect(r.json().estimateHalalas).toBe(250 * 3000);
    const id = r.json().purchaseRequest.id;
    expect(r.json().purchaseRequest).toMatchObject({ status: "pending", actions: ["cancel"], contact: null });

    // البائع يشوف «منشأة» بدون اسم المشتري قبل الاتفاق.
    const inbox = (await call("GET", "/v1/market/seller/purchase-requests", seller.token)).json().purchaseRequests;
    const mine = inbox.find((x: { id: string }) => x.id === id);
    expect(mine.buyer).toEqual({ kind: "business", name: null });
    expect(mine.actions).toEqual(["quote", "decline"]);

    const quote = { unitPriceHalalas: 2900, leadTimeDays: 5, deliveryIncluded: true, validDays: 3 };
    const q1 = await call("POST", `/v1/market/seller/purchase-requests/${id}/quote`, seller.token, quote);
    expect(q1.json().purchaseRequest.quote).toMatchObject({ unitPriceHalalas: 2900, totalHalalas: 2900 * 250 });

    let v = (await call("GET", `/v1/market/purchase-requests/${id}`, buyer.token)).json().purchaseRequest;
    expect(v.actions).toEqual(["accept", "request_revision", "reject", "cancel"]);
    expect((await call("POST", `/v1/market/purchase-requests/${id}/revision`, buyer.token, { note: "نبي سعر أقل شوي" })).statusCode).toBe(200);
    await call("POST", `/v1/market/seller/purchase-requests/${id}/quote`, seller.token, { ...quote, unitPriceHalalas: 2800 });
    v = (await call("GET", `/v1/market/purchase-requests/${id}`, buyer.token)).json().purchaseRequest;
    // التعديل مرة وحدة بس.
    expect(v.actions).toEqual(["accept", "reject", "cancel"]);
    expect((await call("POST", `/v1/market/purchase-requests/${id}/revision`, buyer.token)).statusCode).toBe(409);

    const acc = await call("POST", `/v1/market/purchase-requests/${id}/accept`, buyer.token);
    expect(acc.json().purchaseRequest).toMatchObject({ status: "accepted", contact: { phone: "+966517000001" }, actions: ["confirm_received"] });
    const sv = (await call("GET", `/v1/market/seller/purchase-requests/${id}`, seller.token)).json().purchaseRequest;
    expect(sv.contact).toMatchObject({ name: "مصنع مشتري", phone: "+966517000002" });
    expect(sv.quote.unitPriceHalalas).toBe(2800);

    await call("POST", `/v1/market/purchase-requests/${id}/received`, buyer.token);
    const rated = await call("POST", `/v1/market/purchase-requests/${id}/rating`, buyer.token, { stars: 5 });
    expect(rated.json().purchaseRequest.actions).toEqual(["order_again"]);
    expect((await call("POST", `/v1/market/purchase-requests/${id}/rating`, buyer.token, { stars: 4 })).json().error.code).toBe("already_rated");
    expect((await call("GET", `/v1/market/products/${productId}`)).json().product.seller.rating).toEqual({ average: 5, count: 1 });
  });

  it("الرد اللي عدّت صلاحيته يصير «انتهى»، والقبول عليه ممنوع", async () => {
    const id = (await request()).json().purchaseRequest.id;
    await call("POST", `/v1/market/seller/purchase-requests/${id}/quote`, seller.token, { unitPriceHalalas: 3000, leadTimeDays: 2, deliveryIncluded: false, validDays: 1 });
    ctx.clock.advance(2 * DAY);
    try {
      const v = (await call("GET", `/v1/market/purchase-requests/${id}`, buyer.token)).json().purchaseRequest;
      expect(v.status).toBe("expired");
      expect(v.actions).toEqual(["request_revision", "cancel"]);
      expect((await call("POST", `/v1/market/purchase-requests/${id}/accept`, buyer.token)).statusCode).toBe(409);
    } finally {
      ctx.clock.advance(-2 * DAY);
    }
  });

  it("المدخلات والقواعد: أقل من الحد الأدنى، ورقم في الملاحظة، ومنتجه نفسه، والفرد ما يشتري (الإعداد)", async () => {
    expect((await request(buyer.token, { quantity: 10, when: "this_week" })).json().error.code).toBe("below_min_order");
    expect((await request(buyer.token, { quantity: 60, when: "this_week", note: "واتساب 0551234567" })).json().error.code).toBe("contact_info_not_allowed");
    expect((await request(seller.token)).json().error.code).toBe("own_product");
    const ind = await ctx.signIn("0517000003");
    await call("PUT", "/v1/factory", ind.token, { kind: "individual", name: "مشتري فرد", idType: "iqama", idNumber: "2011111111" });
    expect((await request(ind.token)).json().error.code).toBe("market_buyer_not_allowed");
    await setSetting(ctx.db, SYS, "market", { buyerKinds: ["business", "individual"], trialDays: 0, commissionBps: 0, publicMinProducts: 0, expiryWarningDays: 7 });
    try {
      expect((await request(ind.token)).statusCode).toBe(201);
    } finally {
      await setSetting(ctx.db, SYS, "market", { buyerKinds: ["business"], trialDays: 0, commissionBps: 0, publicMinProducts: 0, expiryWarningDays: 7 });
    }
  });

  it("كل عميل يشوف طلبات الشراء حقته بس، والبائع الثاني ما يرد على طلب غيره", async () => {
    const id = (await request()).json().purchaseRequest.id;
    const other = await ctx.factory("0517000004");
    expect((await call("GET", `/v1/market/purchase-requests/${id}`, other.token)).statusCode).toBe(404);
    expect((await call("POST", `/v1/market/purchase-requests/${id}/cancel`, other.token)).statusCode).toBe(404);
    const { s: otherSeller } = await listedSeller("0517000005");
    expect((await call("POST", `/v1/market/seller/purchase-requests/${id}/quote`, otherSeller.token, { unitPriceHalalas: 1, leadTimeDays: 1, deliveryIncluded: true, validDays: 1 })).statusCode).toBe(404);
  });

  it("البائع يعتذر، والمشتري يشوف «اطلب من جديد»", async () => {
    const id = (await request()).json().purchaseRequest.id;
    await call("POST", `/v1/market/seller/purchase-requests/${id}/decline`, seller.token, { note: "الكمية مو متوفرة الحين" });
    const v = (await call("GET", `/v1/market/purchase-requests/${id}`, buyer.token)).json().purchaseRequest;
    expect(v).toMatchObject({ status: "declined", decisionNote: "الكمية مو متوفرة الحين", actions: ["order_again"] });
  });

  it("كل حالة لطلب الشراء فيها زر للمشتري (ولا مرة طريق مسدود)", () => {
    for (const status of PURCHASE_STATUSES) {
      for (const revisionUsed of [false, true]) {
        for (const rated of [false, true]) expect(buyerPurchaseActions(status, { revisionUsed, rated }).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("لوحة الإدارة للسوق", () => {
  it("رفض البائع مع السبب، وبعد التجديد يتوثّق", async () => {
    const s = await ctx.factory("0518000001");
    await call("POST", "/v1/market/seller", s.token);
    const m = multipart({ expiresOn: "2030-01-01" }, { bytes: PDF });
    await ctx.app.inject({ method: "POST", url: "/v1/market/seller/documents", headers: { ...auth(s.token), ...m.headers }, payload: m.payload });
    await call("POST", "/v1/market/seller/submit", s.token);
    expect((await call("POST", `/v1/admin/market/sellers/${s.factoryId}/decision`, verifier.token, { decision: "reject" })).statusCode).toBe(400);
    await call("POST", `/v1/admin/market/sellers/${s.factoryId}/decision`, verifier.token, { decision: "reject", reason: "الصورة مو واضحة" });
    const state = (await call("GET", "/v1/market/seller", s.token)).json().seller;
    expect(state).toMatchObject({ status: "rejected", statusReason: "الصورة مو واضحة", document: { status: "rejected" } });
  });

  it("رابط السجل المؤقت: يفتح لموظف التوثيق، والفتح ينكتب في السجل، وخدمة العملاء ما توصل له", async () => {
    const { s } = await listedSeller("0518000002");
    const detail = (await call("GET", `/v1/admin/market/sellers/${s.factoryId}`, verifier.token)).json().seller;
    expect((await call("GET", `/v1/admin/market/sellers/${s.factoryId}`, support.token)).statusCode).toBe(403);
    const link = (await call("GET", `/v1/admin/market/seller-documents/${detail.document.id}/link`, verifier.token)).json();
    const file = await call("GET", link.url);
    expect(file.statusCode).toBe(200);
    expect(file.body).toContain("%PDF");
    const logs = await ctx.db.query("SELECT 1 FROM audit_log WHERE action='seller.document_viewed' AND entity_id=$1", [detail.document.id]);
    expect(logs.length).toBe(1);
    expect((await call("GET", link.url.replace(/sig=[a-f0-9]+/, `sig=${"0".repeat(64)}`))).statusCode).toBe(403);
  });

  it("إخفاء منتج مخالف مع السبب: يختفي، والمصنع يشوف السبب وما يقدر يرجّعه", async () => {
    const { s, productId } = await listedSeller("0518000003");
    expect((await call("POST", `/v1/admin/market/products/${productId}/remove`, finance.token, { reason: "منتج ممنوع" })).statusCode).toBe(403);
    expect((await call("POST", `/v1/admin/market/products/${productId}/remove`, support.token, { reason: "منتج ممنوع" })).statusCode).toBe(200);
    expect(await publicIds()).not.toContain(productId);
    const mine = (await call("GET", "/v1/market/seller/products", s.token)).json().products[0];
    expect(mine).toMatchObject({ status: "removed", removedReason: "منتج ممنوع" });
    expect((await call("POST", `/v1/market/seller/products/${productId}/show`, s.token)).json().error.code).toBe("product_removed");
  });

  it("الدفعات تمد الاشتراك من نهايته، وسجل الدفعات ما ينمسح ولا ينعدّل", async () => {
    const { s } = await listedSeller("0518000004");
    const before = (await call("GET", "/v1/market/seller", s.token)).json().seller.subscription.endsAt;
    const r = await call("POST", `/v1/admin/market/sellers/${s.factoryId}/payments`, finance.token, {
      planId: "seller_basic", months: 2, amountHalalas: 80000, paidOn: "2026-11-23", reference: "TRX-TEST-3",
    });
    expect(r.json()).toMatchObject({ startsAt: before, expectedHalalas: 80000 });
    expect((await call("GET", "/v1/market/seller", s.token)).json().seller.subscription.endsAt).toBe(r.json().endsAt);
    await expect(ctx.db.query("UPDATE subscription_payments SET amount_halalas=1")).rejects.toThrow(/append-only/);
    await expect(ctx.db.query("DELETE FROM subscription_payments")).rejects.toThrow(/append-only/);
    expect((await call("POST", `/v1/admin/market/sellers/${s.factoryId}/payments`, support.token, {
      planId: "seller_basic", months: 1, amountHalalas: 1, paidOn: "2026-11-23", reference: "x1",
    })).statusCode).toBe(403);
  });

  it("سعر الباقة يتغيّر من اللوحة للمدير العام بس، وينكتب في السجل", async () => {
    const gm = await ctx.staff("0551000009", "general_manager");
    expect((await call("PUT", "/v1/admin/market/plans/seller_basic", finance.token, { monthlyPriceHalalas: 45000, maxProducts: 100 })).statusCode).toBe(403);
    expect((await call("PUT", "/v1/admin/market/plans/seller_basic", gm.token, { monthlyPriceHalalas: 45000, maxProducts: 100 })).statusCode).toBe(200);
    const plans = (await call("GET", "/v1/admin/market/plans", finance.token)).json().plans;
    expect(plans.find((p: { id: string }) => p.id === "seller_basic").monthlyPriceHalalas).toBe(45000);
    await call("PUT", "/v1/admin/market/plans/seller_basic", gm.token, { monthlyPriceHalalas: 40000, maxProducts: 100 });
  });

  it("الأرقام شهر بشهر: دخل الاشتراكات وطلبات الشراء", async () => {
    const stats = (await call("GET", "/v1/admin/market/stats", finance.token)).json().months;
    expect(stats).toHaveLength(12);
    const nov = stats.find((m: { month: string }) => m.month === "2026-11");
    expect(nov.subscriptionIncomeHalalas).toBeGreaterThan(0);
    expect(nov.purchaseRequests).toBeGreaterThan(0);
    expect(nov.subscribedSellers).toBeGreaterThan(0);
  });

  it("إضافة الأشهر تمسك آخر يوم في الشهر القصير", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonths(new Date("2026-11-22T10:00:00Z"), 2).toISOString()).toBe("2027-01-22T10:00:00.000Z");
  });
});
