// التنفيذ (المرحلة ٤، الخطوة ٧): بدأت، والصور، وتم التنفيذ، وتأكيد الاستلام، والتأكيد التلقائي، وتعديل السعر.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScheduledJobs } from "./jobs.ts";
import { auth, createTestCtx, multipart, PDF, PNG, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let factory: { token: string };
let otherFactory: { token: string };
let p: { token: string; userId: string };
let otherP: { token: string };
const offer = { priceHalalas: 100_000, durationHours: 5 };
const HOUR = 3600_000;

const call = (method: "GET" | "POST", url: string, token: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

/** طلب جديد بعرض مقبول. يرجّع رقم الطلب ورقم الطلب المنفّذ. */
async function acceptedJob(f = factory) {
  const id = (await call("POST", "/v1/requests", f.token, validRequest)).json().request.id as string;
  const o = (await call("POST", `/v1/provider/requests/${id}/offers`, p.token, offer)).json().offer.id as string;
  const acc = await call("POST", `/v1/requests/${id}/offers/${o}/accept`, f.token);
  expect(acc.statusCode).toBe(200);
  return { id, orderId: acc.json().order.id as string };
}

const status = async (id: string, f = factory) => (await call("GET", `/v1/requests/${id}`, f.token)).json().request.status as string;

function uploadPhoto(orderId: string, stage: string, bytes = PNG, token = p.token) {
  const m = multipart({ stage }, { bytes, name: "photo.png", type: "image/png" });
  return ctx.app.inject({ method: "POST", url: `/v1/provider/jobs/${orderId}/photos`, headers: { ...auth(token), ...m.headers }, payload: m.payload });
}

beforeAll(async () => {
  ctx = await createTestCtx();
  factory = await ctx.factory("0525000001");
  otherFactory = await ctx.factory("0525000002");
  p = await ctx.verifiedProvider("0565000001");
  otherP = await ctx.verifiedProvider("0565000002");
});
afterAll(async () => {
  await ctx.close();
});

describe("بدأت التنفيذ، وتم التنفيذ، وتأكيد الاستلام", () => {
  it("الدورة كاملة، وكل خطوة لها وقتها في الخط الزمني", async () => {
    const { id, orderId } = await acceptedJob();

    const start = await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token);
    expect(start.statusCode).toBe(200);
    expect(start.json().job.status).toBe("in_progress");
    expect(await status(id)).toBe("in_progress");

    const deliver = await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token);
    expect(deliver.statusCode).toBe(200);
    const view = (await call("GET", `/v1/requests/${id}`, factory.token)).json();
    expect(view.request.status).toBe("delivered");
    // موعد التأكيد التلقائي: ٧٢ ساعة من «تم التنفيذ» (الإعداد الافتراضي)، ويظهر للمصنع.
    expect(view.execution.autoConfirmAt).toBe(new Date(ctx.clock.now.getTime() + 72 * HOUR).toISOString());

    const confirm = await call("POST", `/v1/requests/${id}/confirm`, factory.token);
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().request.status).toBe("completed");
    expect(confirm.json().execution.confirmedBy).toBe("factory");
    expect(confirm.json().execution.timeline.map((e: { event: string }) => e.event)).toEqual(["accepted", "started", "delivered", "confirmed"]);

    const [order] = await ctx.db.query<{ state: string }>("SELECT state FROM orders WHERE id=$1", [orderId]);
    expect(order.state).toBe("closed");
    // ما يتأكد مرتين.
    expect((await call("POST", `/v1/requests/${id}/confirm`, factory.token)).statusCode).toBe(409);
  });

  it("الترتيب إجباري: ما فيه «تم التنفيذ» قبل «بدأت»، والمصنع ما يأكد قبل «تم التنفيذ»", async () => {
    const { id, orderId } = await acceptedJob();
    expect((await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token)).json().error.code).toBe("invalid_transition");
    expect((await call("POST", `/v1/requests/${id}/confirm`, factory.token)).statusCode).toBe(409);
    await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token);
    expect((await call("POST", `/v1/requests/${id}/confirm`, factory.token)).statusCode).toBe(409);
    // «بدأت» مرتين ما تنفع.
    expect((await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token)).statusCode).toBe(409);
  });

  it("كل طرف على طلباته بس: مزوّد ثاني ما يبدأ، ومصنع ثاني ما يأكد، والمصنع ما يبدأ", async () => {
    const { id, orderId } = await acceptedJob();
    expect((await call("POST", `/v1/provider/jobs/${orderId}/start`, otherP.token)).statusCode).toBe(404);
    expect((await call("GET", `/v1/provider/jobs/${orderId}`, otherP.token)).statusCode).toBe(404);
    expect((await call("POST", `/v1/provider/jobs/${orderId}/start`, factory.token)).statusCode).toBe(403);
    await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token);
    await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token);
    expect((await call("POST", `/v1/requests/${id}/confirm`, otherFactory.token)).statusCode).toBe(404);
  });

  it("المزوّد الموقوف ما يقدر يبدأ (خدمة العملاء تتابع طلباته)", async () => {
    const s = await ctx.verifiedProvider("0565000009");
    const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id as string;
    const o = (await call("POST", `/v1/provider/requests/${id}/offers`, s.token, offer)).json().offer.id as string;
    const orderId = (await call("POST", `/v1/requests/${id}/offers/${o}/accept`, factory.token)).json().order.id as string;
    await ctx.db.query("UPDATE providers SET status='suspended' WHERE id=$1", [s.providerId]);
    expect((await call("POST", `/v1/provider/jobs/${orderId}/start`, s.token)).json().error.code).toBe("provider_suspended");
  });
});

describe("التأكيد التلقائي", () => {
  it("بعد ٧٢ ساعة بدون تأكيد ولا بلاغ يكتمل، وقبلها لا", async () => {
    const { id, orderId } = await acceptedJob();
    await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token);
    await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token);
    const deliveredAt = ctx.clock.now.getTime();

    ctx.clock.advance(71 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    expect(await status(id)).toBe("delivered");

    ctx.clock.advance(2 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    const view = (await call("GET", `/v1/requests/${id}`, factory.token)).json();
    expect(view.request.status).toBe("completed");
    expect(view.execution.confirmedBy).toBe("system");
    expect(view.execution.timeline.at(-1)).toMatchObject({ event: "auto_confirmed", by: "system" });
    ctx.clock.advance(-(ctx.clock.now.getTime() - deliveredAt));
  });

  it("ما يصير لو الطلب فيه بلاغ", async () => {
    const { id, orderId } = await acceptedJob();
    await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token);
    await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token);
    // البلاغ نفسه ينبني في الخطوة ٨. هنا نحط الحالة مباشرة.
    await ctx.db.query("UPDATE requests SET status='disputed' WHERE id=$1", [id]);
    ctx.clock.advance(100 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    ctx.clock.advance(-100 * HOUR);
    expect(await status(id)).toBe("disputed");
    const [order] = await ctx.db.query<{ state: string }>("SELECT state FROM orders WHERE id=$1", [orderId]);
    expect(order.state).toBe("open");
  });

  it("الموعد ينحفظ وقت «تم التنفيذ»: تغيير الإعداد بعدها ما يغيّره", async () => {
    const { id, orderId } = await acceptedJob();
    await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token);
    await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token);
    const before = (await call("GET", `/v1/requests/${id}`, factory.token)).json().execution.autoConfirmAt;
    await ctx.db.query("INSERT INTO settings (key, value) VALUES ('autoConfirmHours', '1') ON CONFLICT (key) DO UPDATE SET value='1'");
    ctx.clock.advance(2 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    ctx.clock.advance(-2 * HOUR);
    await ctx.db.query("DELETE FROM settings WHERE key='autoConfirmHours'");
    expect(await status(id)).toBe("delivered");
    expect((await call("GET", `/v1/requests/${id}`, factory.token)).json().execution.autoConfirmAt).toBe(before);
  });

  it("المهمة تثبّت حالة الطلبات المنتهية في القاعدة", async () => {
    const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id as string;
    ctx.clock.advance(8 * 24 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    ctx.clock.advance(-8 * 24 * HOUR);
    const [r] = await ctx.db.query<{ status: string }>("SELECT status FROM requests WHERE id=$1", [id]);
    expect(r.status).toBe("expired");
  });
});

describe("صور البدء والانتهاء", () => {
  it("تنحفظ، وتنفتح برابط مؤقت للمصنع صاحب الطلب والمزوّد بس", async () => {
    const { id, orderId } = await acceptedJob();
    const up = await uploadPhoto(orderId, "start");
    expect(up.statusCode).toBe(201);
    const photo = up.json().job.execution.photos[0];
    expect(photo.stage).toBe("start");

    const view = (await call("GET", `/v1/requests/${id}`, factory.token)).json();
    const link = view.execution.photos[0].link.path as string;
    const open = await ctx.app.inject({ method: "GET", url: link });
    expect(open.statusCode).toBe(200);
    expect(open.headers["content-type"]).toBe("image/png");
    expect(open.headers["cache-control"]).toContain("no-store");

    // رابط ينتهي بعد ٥ دقايق.
    ctx.clock.advance(6 * 60_000);
    expect((await ctx.app.inject({ method: "GET", url: link })).statusCode).toBe(403);
    ctx.clock.advance(-6 * 60_000);

    // رابط معدّل باسم مستخدم ثاني: التوقيع ما يطابق.
    const forged = link.replace(/by=[^&]+/, `by=${p.userId}`);
    expect((await ctx.app.inject({ method: "GET", url: forged })).statusCode).toBe(403);
  });

  it("صورة بس (PDF ينرفض)، وحتى ٣ لكل مرحلة، وصور الانتهاء أثناء التنفيذ بس", async () => {
    const { orderId } = await acceptedJob();
    expect((await uploadPhoto(orderId, "start", PDF)).statusCode).toBe(415);
    expect((await uploadPhoto(orderId, "delivery")).json().error.code).toBe("photo_not_allowed");
    for (let i = 0; i < 3; i++) expect((await uploadPhoto(orderId, "start")).statusCode).toBe(201);
    expect((await uploadPhoto(orderId, "start")).json().error.code).toBe("photos_limit");
    await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token);
    expect((await uploadPhoto(orderId, "delivery")).statusCode).toBe(201);
    await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token);
    expect((await uploadPhoto(orderId, "delivery")).json().error.code).toBe("photo_not_allowed");
    // مزوّد ثاني ما يرفع على طلب غيره.
    expect((await uploadPhoto(orderId, "start", PNG, otherP.token)).statusCode).toBe(404);
  });
});

describe("تعديل السعر (العرض المقبول هو السعر النهائي)", () => {
  async function inProgress(f = factory) {
    const j = await acceptedJob(f);
    await call("POST", `/v1/provider/jobs/${j.orderId}/start`, p.token);
    return j;
  }

  it("المزوّد يطلب مع السبب، والمصنع يوافق، فيتغيّر السعر المتفق عليه", async () => {
    const { id, orderId } = await inProgress();
    const req = await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 120_000, reason: "طلع الحمل أثقل من المذكور" });
    expect(req.statusCode).toBe(201);
    const change = req.json().job.execution.priceChanges[0];
    expect(change).toMatchObject({ oldPriceHalalas: 100_000, newPriceHalalas: 120_000, status: "pending" });

    // ما يقدر «تم التنفيذ» والسعر ما انحسم.
    expect((await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token)).json().error.code).toBe("price_change_pending");

    const ok = await call("POST", `/v1/requests/${id}/price-changes/${change.id}/approve`, factory.token);
    expect(ok.statusCode).toBe(200);
    const [order] = await ctx.db.query<{ price_halalas: string }>("SELECT price_halalas FROM orders WHERE id=$1", [orderId]);
    expect(Number(order.price_halalas)).toBe(120_000);
    expect((await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token)).statusCode).toBe(200);
  });

  it("الرفض يخلي السعر كما هو، والسحب ممكن قبل القرار", async () => {
    const { id, orderId } = await inProgress();
    const c1 = (await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 150_000, reason: "زيادة ساعات العمل" })).json().job
      .execution.priceChanges[0].id;
    // طلب ثاني وهو ينتظر: ممنوع.
    expect((await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 130_000, reason: "تعديل ثاني" })).json().error.code).toBe(
      "price_change_pending",
    );
    await call("POST", `/v1/requests/${id}/price-changes/${c1}/reject`, factory.token);
    const [order] = await ctx.db.query<{ price_halalas: string }>("SELECT price_halalas FROM orders WHERE id=$1", [orderId]);
    expect(Number(order.price_halalas)).toBe(100_000);
    // القرار ما يتعاد.
    expect((await call("POST", `/v1/requests/${id}/price-changes/${c1}/approve`, factory.token)).json().error.code).toBe("price_change_not_pending");

    await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 110_000, reason: "قطعة إضافية" });
    const w = await call("POST", `/v1/provider/jobs/${orderId}/price-change/withdraw`, p.token);
    expect(w.json().job.execution.priceChanges.map((c: { status: string }) => c.status)).toEqual(["rejected", "withdrawn"]);
  });

  it("قبل البدء ما فيه تعديل سعر، والسبب ما يقبل أرقام تواصل، ونفس السعر ينرفض", async () => {
    const { orderId } = await acceptedJob();
    expect((await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 120_000, reason: "سبب واضح هنا" })).json().error.code).toBe(
      "price_change_not_allowed",
    );
    await call("POST", `/v1/provider/jobs/${orderId}/start`, p.token);
    expect((await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 120_000, reason: "كلمني على 0551234567" })).json().error.code).toBe(
      "contact_info_not_allowed",
    );
    expect((await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 100_000, reason: "نفس السعر بالضبط" })).json().error.code).toBe(
      "price_unchanged",
    );
    expect((await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 120_000.5, reason: "كسور هللة" })).statusCode).toBe(400);
  });

  it("في مصنع فيه أكثر من مستخدم: المدير بس يقرر", async () => {
    const mgr = await ctx.factory("0525000010");
    await call("POST", "/v1/factory/members", mgr.token, { phone: "0525000011", role: "member" });
    const member = await ctx.signIn("0525000011");
    const { id, orderId } = await inProgress(mgr);
    const c = (await call("POST", `/v1/provider/jobs/${orderId}/price-change`, p.token, { newPriceHalalas: 90_000, reason: "الشغل أقل من المتوقع" })).json().job
      .execution.priceChanges[0].id;
    expect((await call("POST", `/v1/requests/${id}/price-changes/${c}/approve`, member.token)).json().error.code).toBe("manager_approval_required");
    expect((await call("POST", `/v1/requests/${id}/price-changes/${c}/approve`, otherFactory.token)).statusCode).toBe(404);
    expect((await call("POST", `/v1/requests/${id}/price-changes/${c}/approve`, mgr.token)).statusCode).toBe(200);
  });
});
