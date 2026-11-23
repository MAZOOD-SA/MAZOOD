// المرحلة ٤، الخطوة ٦: مقارنة العروض، والقبول كعملية وحدة، والموافقة الداخلية، وموظفين المصنع،
// وكشف بيانات التواصل بعد القبول بس.
import { DEFAULT_CANCELLATION_POLICY } from "@mazood/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let factory: { token: string; userId: string; factoryId: string };
let a: { token: string; providerId: string };
let b: { token: string; providerId: string };
const offer = { priceHalalas: 245_000, durationHours: 24, note: "جاهزين" };

const call = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: object, headers: Record<string, string> = {}) =>
  ctx.app.inject({ method, url, headers: { ...auth(token), ...headers }, ...(payload ? { payload } : {}) });

async function requestWithOffers(token = factory.token) {
  const id = (await call("POST", "/v1/requests", token, validRequest)).json().request.id as string;
  const oa = (await call("POST", `/v1/provider/requests/${id}/offers`, a.token, offer)).json().offer.id as string;
  const ob = (await call("POST", `/v1/provider/requests/${id}/offers`, b.token, { ...offer, priceHalalas: 230_000 })).json().offer.id as string;
  return { id, oa, ob };
}

beforeAll(async () => {
  ctx = await createTestCtx();
  factory = await ctx.factory("0522000001", "مصنع القبول التجريبي");
  a = await ctx.verifiedProvider("0562100001");
  b = await ctx.verifiedProvider("0562100002");
});
afterAll(async () => { await ctx.close(); });

describe("مقارنة العروض", () => {
  it("المصنع يشوف العروض: المزوّد وشارة موثّق والسعر غير شامل الضريبة والمدة والصلاحية", async () => {
    const { id, oa } = await requestWithOffers();
    const r = await call("GET", `/v1/requests/${id}`, factory.token);
    expect(r.statusCode).toBe(200);
    const offers = r.json().offers;
    expect(offers).toHaveLength(2);
    const x = offers.find((o: { id: string }) => o.id === oa);
    expect(x).toMatchObject({
      price: { amountHalalas: 245_000, includesVat: false },
      durationHours: 24,
      revised: false,
      provider: { verified: true, rating: null },
    });
    expect(x.provider.tradeName).toBeTruthy();
    // رقم جوال المزوّد ما يطلع قبل القبول.
    expect(r.body).not.toContain("562100001");
    expect(r.json().order).toBeNull();
  });

  it("لما المصنع يفتح العروض، المزوّد يشوف «المصنع شاف عرضك»", async () => {
    const { id, oa } = await requestWithOffers();
    const before = (await call("GET", "/v1/provider/offers", a.token)).json().offers.find((o: { id: string }) => o.id === oa);
    expect(before.seenByFactory).toBe(false);
    await call("GET", `/v1/requests/${id}`, factory.token);
    const after = (await call("GET", "/v1/provider/offers", a.token)).json().offers.find((o: { id: string }) => o.id === oa);
    expect(after.seenByFactory).toBe(true);
  });

  it("العرض المعدّل يبان إنه «تم تعديله»", async () => {
    const { id, oa } = await requestWithOffers();
    await call("PUT", `/v1/provider/offers/${oa}`, a.token, { ...offer, priceHalalas: 240_000 });
    const x = (await call("GET", `/v1/requests/${id}`, factory.token)).json().offers.find((o: { id: string }) => o.id === oa);
    expect(x.revised).toBe(true);
    expect(x.price.amountHalalas).toBe(240_000);
  });
});

describe("القبول", () => {
  it("القبول: العرض مقبول، والباقي مرفوض، والطلب «مقبول»، والسياسة تنحفظ معه", async () => {
    const { id, oa, ob } = await requestWithOffers();
    const r = await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, factory.token);
    expect(r.statusCode).toBe(200);
    expect(r.json().request.status).toBe("accepted");
    const statuses = await ctx.db.query<{ id: string; status: string; rejected_reason: string | null }>(
      "SELECT id, status, rejected_reason FROM offers WHERE request_id=$1",
      [id],
    );
    expect(statuses.find((o) => o.id === oa)!.status).toBe("accepted");
    expect(statuses.find((o) => o.id === ob)).toMatchObject({ status: "rejected", rejected_reason: "other_accepted" });
    const [order] = await ctx.db.query<{ price_halalas: string; cancellation_policy: unknown }>(
      "SELECT price_halalas, cancellation_policy FROM orders WHERE request_id=$1",
      [id],
    );
    expect(Number(order.price_halalas)).toBe(245_000);
    expect(order.cancellation_policy).toEqual(DEFAULT_CANCELLATION_POLICY);
    // خط زمني للطلب
    const events = await ctx.db.query<{ event: string }>("SELECT event FROM order_events WHERE request_id=$1", [id]);
    expect(events.map((e) => e.event)).toContain("accepted");
  });

  it("قبولين بنفس اللحظة: واحد بس ينجح", async () => {
    const { id, oa, ob } = await requestWithOffers();
    const [r1, r2] = await Promise.all([
      call("POST", `/v1/requests/${id}/offers/${oa}/accept`, factory.token),
      call("POST", `/v1/requests/${id}/offers/${ob}/accept`, factory.token),
    ]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 409]);
    const accepted = await ctx.db.query("SELECT 1 FROM offers WHERE request_id=$1 AND status='accepted'", [id]);
    expect(accepted).toHaveLength(1);
    expect(await ctx.db.query("SELECT 1 FROM orders WHERE request_id=$1", [id])).toHaveLength(1);
  });

  it("نفس الضغطة مرتين (نفس مفتاح العملية): ما تتكرر، وترجع نفس الرد", async () => {
    const { id, oa } = await requestWithOffers();
    const key = { "idempotency-key": "accept-test-key-0001" };
    const r1 = await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, factory.token, undefined, key);
    const r2 = await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, factory.token, undefined, key);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r2.json()).toEqual(r1.json());
  });

  it("العرض المنتهي ما ينقبل", async () => {
    const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id;
    const o = (await call("POST", `/v1/provider/requests/${id}/offers`, a.token, { ...offer, validHours: 1 })).json().offer.id;
    ctx.clock.advance(3600_000 + 1000);
    const r = await call("POST", `/v1/requests/${id}/offers/${o}/accept`, factory.token);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("offer_not_active");
    ctx.clock.advance(-(3600_000 + 1000));
  });

  it("المزوّد اللي انتهى توثيقه بعد ما أرسل عرضه: عرضه ما ينقبل", async () => {
    const c = await ctx.verifiedProvider("0562100003");
    const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id;
    const o = (await call("POST", `/v1/provider/requests/${id}/offers`, c.token, offer)).json().offer.id;
    await ctx.db.query("UPDATE providers SET status='suspended' WHERE id=$1", [c.providerId]);
    const r = await call("POST", `/v1/requests/${id}/offers/${o}/accept`, factory.token);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("provider_unavailable");
  });

  it("مصنع ما يشوف ولا يقبل عرض على طلب مصنع ثاني", async () => {
    const { id, oa } = await requestWithOffers();
    const other = await ctx.factory("0522000002");
    expect((await call("GET", `/v1/requests/${id}`, other.token)).statusCode).toBe(404);
    expect((await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, other.token)).statusCode).toBe(404);
    // عرض من طلب ثاني على طلبي: ما ينقبل
    const mine = (await call("POST", "/v1/requests", other.token, validRequest)).json().request.id;
    expect((await call("POST", `/v1/requests/${mine}/offers/${oa}/accept`, other.token)).statusCode).toBe(404);
  });

  it("المزوّد ما يقدر يقبل", async () => {
    const { id, oa } = await requestWithOffers();
    expect((await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, a.token)).statusCode).toBe(403);
  });

  it("بعد القبول: المزوّد يشوف اسم المصنع والموقع بالضبط ورقم التواصل، والمصنع يشوف رقم المزوّد", async () => {
    const { id, oa } = await requestWithOffers();
    // قبل القبول ما يشوف
    expect((await call("GET", "/v1/provider/jobs", a.token)).json().jobs.map((j: { requestId: string }) => j.requestId)).not.toContain(id);
    await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, factory.token);
    const jobs = (await call("GET", "/v1/provider/jobs", a.token)).json().jobs;
    const job = jobs.find((j: { requestId: string }) => j.requestId === id);
    expect(job).toMatchObject({
      status: "accepted",
      location: validRequest.location,
      factory: { name: "مصنع القبول التجريبي" },
      priceHalalas: 245_000,
    });
    // المزوّد الثاني (المرفوض) ما يشوف بيانات المصنع
    const bJobs = (await call("GET", "/v1/provider/jobs", b.token)).json().jobs;
    expect(bJobs.map((j: { requestId: string }) => j.requestId)).not.toContain(id);
    const r = await call("GET", `/v1/requests/${id}`, factory.token);
    expect(r.json().order.provider).toMatchObject({ verified: true });
    // رقم الجوال ما يطلع لأي طرف (القرار ٣٥): التواصل من غرفة الصفقة.
    expect(job.factory.contactPhone).toBeUndefined();
    expect(r.json().order.provider.contactPhone).toBeUndefined();
  });

  it("بعد القبول: المزوّد المقبول ما يقدر يسحب عرضه بالسحب العادي، والطلب يختفي من المتاحة", async () => {
    const { id, oa } = await requestWithOffers();
    await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, factory.token);
    expect((await call("POST", `/v1/provider/offers/${oa}/withdraw`, a.token)).statusCode).toBe(409);
    expect((await call("GET", "/v1/provider/requests", b.token)).json().requests.map((x: { id: string }) => x.id)).not.toContain(id);
  });
});

describe("موظفين المصنع والموافقة الداخلية", () => {
  let manager: { token: string; factoryId: string };
  let member: { token: string };

  beforeAll(async () => {
    manager = await ctx.factory("0523000001", "مصنع الموافقات");
    const inv = await call("POST", "/v1/factory/members", manager.token, { phone: "0523000002", role: "member" });
    expect(inv.statusCode).toBe(201);
    member = await ctx.signIn("0523000002");
  });

  it("الموظف المدعو يدخل على نفس المصنع، ويشوف طلباته", async () => {
    const me = (await call("GET", "/v1/me", member.token)).json();
    expect(me.factory.id).toBe(manager.factoryId);
    expect(me.user.factoryRole).toBe("member");
    const members = (await call("GET", "/v1/factory/members", manager.token)).json().members;
    expect(members.map((m: { phone: string; role: string }) => [m.phone, m.role]).sort()).toEqual([
      ["+966523000001", "manager"],
      ["+966523000002", "member"],
    ]);
  });

  it("الموظف ما يقدر يدعو موظفين", async () => {
    expect((await call("POST", "/v1/factory/members", member.token, { phone: "0523000003", role: "member" })).statusCode).toBe(403);
  });

  it("رقم مسجّل كمزوّد أو في مصنع ثاني ما ينضاف", async () => {
    const r = await call("POST", "/v1/factory/members", manager.token, { phone: "0562100001", role: "member" });
    expect(r.statusCode).toBe(409);
    const r2 = await call("POST", "/v1/factory/members", manager.token, { phone: "0522000001", role: "member" });
    expect(r2.statusCode).toBe(409);
  });

  it("الموظف ما يقدر يقبل لو المصنع فيه مدير: يرشّح، والمدير يوافق فيصير قبول", async () => {
    const { id, oa } = await requestWithOffers(manager.token);
    const direct = await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, member.token);
    expect(direct.statusCode).toBe(403);
    expect(direct.json().error.code).toBe("manager_approval_required");

    const nom = await call("POST", `/v1/requests/${id}/offers/${oa}/nominate`, member.token);
    expect(nom.statusCode).toBe(200);
    expect(nom.json().request.status).toBe("pending_approval");
    const view = (await call("GET", `/v1/requests/${id}`, manager.token)).json();
    expect(view.approval).toMatchObject({ offerId: oa, nominatedBy: { phone: "+966523000002" } });
    // العرض المرشّح ما ينسحب وهو ينتظر المدير
    expect((await call("POST", `/v1/provider/offers/${oa}/withdraw`, a.token)).statusCode).toBe(409);

    const ok = await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, manager.token);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().request.status).toBe("accepted");
    const [ap] = await ctx.db.query<{ decision: string }>("SELECT decision FROM approvals_internal WHERE request_id=$1", [id]);
    expect(ap.decision).toBe("approved");
  });

  it("الموظف يسحب ترشيحه، والمدير يرفض الترشيح ويختار عرض ثاني", async () => {
    const { id, oa, ob } = await requestWithOffers(manager.token);
    await call("POST", `/v1/requests/${id}/offers/${oa}/nominate`, member.token);
    const w = await call("POST", `/v1/requests/${id}/nomination/withdraw`, member.token);
    expect(w.json().request.status).toBe("awaiting_offers");

    await call("POST", `/v1/requests/${id}/offers/${oa}/nominate`, member.token);
    // المدير يقبل عرض ثاني مباشرة: الترشيح ينرفض تلقائيًا
    const r = await call("POST", `/v1/requests/${id}/offers/${ob}/accept`, manager.token);
    expect(r.statusCode).toBe(200);
    const aps = await ctx.db.query<{ decision: string }>("SELECT decision FROM approvals_internal WHERE request_id=$1 ORDER BY nominated_at", [id]);
    expect(aps.map((x) => x.decision)).toEqual(["withdrawn", "rejected"]);
  });

  it("المصنع اللي فيه مستخدم واحد: يقبل مباشرة بدون موافقة", async () => {
    const { id, oa } = await requestWithOffers();
    expect((await call("POST", `/v1/requests/${id}/offers/${oa}/nominate`, factory.token)).statusCode).toBe(409);
    expect((await call("POST", `/v1/requests/${id}/offers/${oa}/accept`, factory.token)).statusCode).toBe(200);
  });

  it("المدير يوقف موظف: جلسته ما تشتغل على المصنع", async () => {
    const extra = await call("POST", "/v1/factory/members", manager.token, { phone: "0523000009", role: "member" });
    const u = await ctx.signIn("0523000009");
    const stop = await call("POST", `/v1/factory/members/${extra.json().member.userId}/suspend`, manager.token);
    expect(stop.statusCode).toBe(200);
    // جلساته تنلغي فورًا
    expect((await call("GET", "/v1/requests", u.token)).statusCode).toBe(401);
    // المدير ما يوقف نفسه
    const meId = (await call("GET", "/v1/factory/members", manager.token)).json().members.find((m: { role: string }) => m.role === "manager").userId;
    expect((await call("POST", `/v1/factory/members/${meId}/suspend`, manager.token)).statusCode).toBe(409);
  });
});
