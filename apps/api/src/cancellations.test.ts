// المرحلة ٤، الخطوة ٨: الإلغاء بعد البدء، ورسوم الإلغاء (صفر الحين)، واعتذار المزوّد، و«اختر عرض ثاني»،
// وإعادة النشر، والبلاغ. وفي كل حالة يوصل لها الطلب: **المصنع عنده زر دائمًا** («ولا مرة طريق مسدود»).
import { DEFAULT_CANCELLATION_POLICY, type CancellationPolicy } from "@mazood/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScheduledJobs } from "./jobs.ts";
import { setSetting } from "./settings.ts";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let factory: { token: string };
let otherFactory: { token: string };
let p: { token: string; providerId: string };
let p2: { token: string; providerId: string };
let support: { token: string };
let verifier: { token: string };
let admin: { token: string };
const HOUR = 3600_000;
const SYS = { id: null, role: "system" };

const call = (method: "GET" | "POST", url: string, token: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

/** تفاصيل الطلب للمصنع، مع التأكد إن فيه زر دائمًا في أي حالة. */
async function view(id: string, f = factory) {
  const r = await call("GET", `/v1/requests/${id}`, f.token);
  expect(r.statusCode).toBe(200);
  const v = r.json();
  expect(v.actions.primary !== null || v.actions.others.length > 0, `ما فيه زر للمصنع في حالة ${v.request.status}`).toBe(true);
  return v;
}

/** طلب جديد عليه عرضين (من p وp2)، وعرض p مقبول. */
async function acceptedJob(f = factory) {
  const id = (await call("POST", "/v1/requests", f.token, validRequest)).json().request.id as string;
  const o1 = (await call("POST", `/v1/provider/requests/${id}/offers`, p.token, { priceHalalas: 100_000, durationHours: 5 })).json().offer.id as string;
  const o2 = (await call("POST", `/v1/provider/requests/${id}/offers`, p2.token, { priceHalalas: 120_000, durationHours: 4 })).json().offer.id as string;
  const acc = await call("POST", `/v1/requests/${id}/offers/${o1}/accept`, f.token);
  expect(acc.statusCode).toBe(200);
  return { id, orderId: acc.json().order.id as string, o1, o2 };
}

async function startedJob() {
  const j = await acceptedJob();
  expect((await call("POST", `/v1/provider/jobs/${j.orderId}/start`, p.token)).statusCode).toBe(200);
  return j;
}

const requestCancel = (id: string, f = factory) => call("POST", `/v1/requests/${id}/cancellation`, f.token, { reason: "تغيّر جدول الإنتاج عندنا" });

beforeAll(async () => {
  ctx = await createTestCtx();
  factory = await ctx.factory("0526000001");
  otherFactory = await ctx.factory("0526000002");
  p = await ctx.verifiedProvider("0566000001");
  p2 = await ctx.verifiedProvider("0566000002");
  support = await ctx.staff("0506000001", "support");
  verifier = await ctx.staff("0506000002", "verification");
  admin = await ctx.staff("0506000003", "general_manager");
});
afterAll(async () => {
  await ctx.close();
});

describe("طلب الإلغاء بعد البدء", () => {
  it("المصنع يطلب، والمزوّد يشوف الطلب والمهلة، و«تم التنفيذ» ينتظر رده، ولو وافق ينلغي الطلب", async () => {
    const { id, orderId } = await startedJob();
    expect((await view(id)).actions.others).toContain("request_cancel");
    // قبل ما يرسل: المبلغ بالضبط (صفر الحين).
    expect((await view(id)).cancellationFee).toMatchObject({ payer: "factory", stage: "after_start", feeHalalas: 0 });

    const r = await requestCancel(id);
    expect(r.statusCode).toBe(201);
    const v = await view(id);
    expect(v.request.status).toBe("in_progress");
    expect(v.cancellationRequest).toMatchObject({ status: "pending", respondBy: new Date(ctx.clock.now.getTime() + 24 * HOUR).toISOString() });
    expect(v.actions).toEqual({ primary: null, others: ["withdraw_cancel_request", "open_dispute"] });
    // طلب ثاني وهو ينتظر: مرفوض.
    expect((await requestCancel(id)).statusCode).toBe(409);

    const job = (await call("GET", `/v1/provider/jobs/${orderId}`, p.token)).json().job;
    expect(job.cancellationRequest).toMatchObject({ status: "pending", reason: "تغيّر جدول الإنتاج عندنا" });
    expect((await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token)).json().error.code).toBe("cancellation_pending");

    const agree = await call("POST", `/v1/provider/jobs/${orderId}/cancellation/respond`, p.token, { decision: "agree" });
    expect(agree.statusCode).toBe(200);
    expect(agree.json().job.status).toBe("cancelled");
    const after = await view(id);
    expect(after.request.status).toBe("cancelled");
    expect(after.actions.primary).toBe("reorder");
    const [c] = await ctx.db.query<{ status: string; fee_halalas: string }>("SELECT status, fee_halalas FROM cancellations WHERE order_id=$1", [orderId]);
    expect({ status: c.status, fee: Number(c.fee_halalas) }).toEqual({ status: "agreed", fee: 0 });
    const [o] = await ctx.db.query<{ state: string }>("SELECT state FROM orders WHERE id=$1", [orderId]);
    expect(o.state).toBe("closed");
  });

  it("المزوّد يرفض: ينفتح بلاغ لخدمة العملاء، والمصنع يشوف رقم البلاغ ويقدر يضيف ملاحظة", async () => {
    const { id, orderId } = await startedJob();
    await requestCancel(id);
    const r = await call("POST", `/v1/provider/jobs/${orderId}/cancellation/respond`, p.token, { decision: "decline", note: "الشغل قرب يخلص" });
    expect(r.statusCode).toBe(200);
    const v = await view(id);
    expect(v.request.status).toBe("disputed");
    expect(v.dispute).toMatchObject({ status: "open", reason: "cancellation_declined", openedBy: "provider" });
    expect(v.dispute.number).toBeGreaterThan(0);
    expect(v.actions.others).toContain("add_note");
    expect(v.cancellationRequest.status).toBe("declined");
  });

  it("المزوّد ما رد خلال المهلة: المهمة الدورية تحوّله بلاغ (مرة وحدة بس)", async () => {
    const { id } = await startedJob();
    await requestCancel(id);
    ctx.clock.advance(23 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    expect((await view(id)).request.status).toBe("in_progress");
    ctx.clock.advance(2 * HOUR);
    expect((await runScheduledJobs(ctx.db, ctx.clock.now)).cancellationTimeouts).toBe(1);
    expect((await runScheduledJobs(ctx.db, ctx.clock.now)).cancellationTimeouts).toBe(0);
    const v = await view(id);
    expect(v.request.status).toBe("disputed");
    expect(v.dispute).toMatchObject({ reason: "cancellation_no_response", openedBy: "system" });
    expect(v.cancellationRequest.status).toBe("timed_out");
  });

  it("المصنع يسحب طلب الإلغاء، والتنفيذ يكمّل عادي", async () => {
    const { id, orderId } = await startedJob();
    await requestCancel(id);
    expect((await call("POST", `/v1/requests/${id}/cancellation/withdraw`, factory.token)).statusCode).toBe(200);
    expect((await view(id)).actions.others).toContain("request_cancel");
    expect((await call("POST", `/v1/provider/jobs/${orderId}/deliver`, p.token)).statusCode).toBe(200);
    // ما يتحوّل بلاغ بعد المهلة لأنه انسحب.
    ctx.clock.advance(30 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    expect((await view(id)).request.status).not.toBe("disputed");
  });

  it("قبل البدء ما فيه «طلب إلغاء» (الإلغاء مباشر)، ومصنع ثاني ما يقدر يطلب على طلب غيره", async () => {
    const { id } = await acceptedJob();
    expect((await requestCancel(id)).statusCode).toBe(409);
    await call("POST", `/v1/provider/jobs/${(await view(id)).order.id}/start`, p.token);
    expect((await requestCancel(id, otherFactory)).statusCode).toBe(404);
  });

  it("سبب الإلغاء فيه رقم جوال: مرفوض", async () => {
    const { id } = await startedJob();
    const r = await call("POST", `/v1/requests/${id}/cancellation`, factory.token, { reason: "كلمني على 0551234567" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("contact_info_not_allowed");
  });
});

describe("رسوم الإلغاء: السياسة اللي وقت القبول هي اللي تنطبق", () => {
  // قيم للتجربة بس (مو قرار المالك): ١٠٪ بعد القبول مع ساعة سماح، و٢٠٠ ريال ثابت بعد البدء، ومهلة رد ساعتين.
  const WITH_FEES: CancellationPolicy = {
    ...DEFAULT_CANCELLATION_POLICY,
    responseHours: 2,
    graceMinutesAfterAccept: 60,
    factory: {
      afterAccept: { fixedHalalas: 0, percentBps: 1_000, minHalalas: 0, maxHalalas: null },
      afterStart: { fixedHalalas: 20_000, percentBps: 0, minHalalas: 0, maxHalalas: null },
    },
    providerShareBps: 7_500,
  };

  it("طلب انقبل قبل تغيير الإعداد: يبقى بدون رسوم وبمهلة ٢٤ ساعة. وطلب بعد التغيير: الرسوم الجديدة", async () => {
    const old = await startedJob();
    await setSetting(ctx.db, SYS, "cancellation", WITH_FEES);
    try {
      await requestCancel(old.id);
      const vOld = await view(old.id);
      expect(vOld.cancellationRequest.fee.feeHalalas).toBe(0);
      expect(vOld.cancellationRequest.respondBy).toBe(new Date(ctx.clock.now.getTime() + 24 * HOUR).toISOString());

      const fresh = await startedJob();
      // قبل ما يضغط: المبلغ بالضبط، وتوزيعه.
      expect((await view(fresh.id)).cancellationFee).toMatchObject({ feeHalalas: 20_000, toProviderHalalas: 15_000, toPlatformHalalas: 5_000 });
      await requestCancel(fresh.id);
      const vNew = await view(fresh.id);
      expect(vNew.cancellationRequest.fee).toEqual({ feeHalalas: 20_000, toProviderHalalas: 15_000, toFactoryHalalas: 0, toPlatformHalalas: 5_000 });
      expect(vNew.cancellationRequest.respondBy).toBe(new Date(ctx.clock.now.getTime() + 2 * HOUR).toISOString());
    } finally {
      await setSetting(ctx.db, SYS, "cancellation", DEFAULT_CANCELLATION_POLICY);
    }
  });

  it("قبل القبول تظهر السياسة الحالية مع العروض، وبعد القبول وقبل البدء: داخل مهلة السماح بدون رسوم، وبعدها تنطبق", async () => {
    await setSetting(ctx.db, SYS, "cancellation", WITH_FEES);
    try {
      const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id as string;
      const o = (await call("POST", `/v1/provider/requests/${id}/offers`, p.token, { priceHalalas: 100_000, durationHours: 5 })).json().offer.id;
      expect((await view(id)).cancellationPolicy).toEqual(WITH_FEES);
      await call("POST", `/v1/requests/${id}/offers/${o}/accept`, factory.token);
      ctx.clock.advance(30 * 60_000);
      expect((await view(id)).cancellationFee).toMatchObject({ feeHalalas: 0, withinGrace: true });
      ctx.clock.advance(60 * 60_000);
      expect((await view(id)).cancellationFee).toMatchObject({ feeHalalas: 10_000, withinGrace: false });
      expect((await call("POST", `/v1/requests/${id}/cancel`, factory.token)).statusCode).toBe(200);
      const [c] = await ctx.db.query<{ kind: string; fee_halalas: string; fee_to_provider: string }>(
        "SELECT kind, fee_halalas, fee_to_provider FROM cancellations WHERE request_id=$1",
        [id],
      );
      expect({ kind: c.kind, fee: Number(c.fee_halalas), toProvider: Number(c.fee_to_provider) }).toEqual({ kind: "before_start", fee: 10_000, toProvider: 7_500 });
    } finally {
      await setSetting(ctx.db, SYS, "cancellation", DEFAULT_CANCELLATION_POLICY);
    }
  });

  it("الإلغاء قبل القبول مجاني دائمًا، حتى مع رسوم في الإعداد", async () => {
    await setSetting(ctx.db, SYS, "cancellation", WITH_FEES);
    try {
      const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id as string;
      expect((await view(id)).cancellationFee).toBeNull();
      expect((await call("POST", `/v1/requests/${id}/cancel`, factory.token)).statusCode).toBe(200);
      expect(await ctx.db.query("SELECT 1 FROM cancellations WHERE request_id=$1", [id])).toHaveLength(0);
    } finally {
      await setSetting(ctx.db, SYS, "cancellation", DEFAULT_CANCELLATION_POLICY);
    }
  });
});

describe("اعتذار المزوّد و«اختر عرض ثاني»", () => {
  it("المزوّد يعتذر قبل البدء: الطلب يرجع مفتوح، والعرض الثاني يرجع فعّال، والمصنع يختاره", async () => {
    const { id, orderId, o2 } = await acceptedJob();
    expect((await call("GET", `/v1/provider/jobs/${orderId}`, p.token)).json().job.withdrawalFee).toMatchObject({ payer: "provider", feeHalalas: 0 });
    const w = await call("POST", `/v1/provider/jobs/${orderId}/withdraw`, p.token, { reason: "تعطّلت السطحة" });
    expect(w.statusCode).toBe(200);

    const v = await view(id);
    expect(v.request.status).toBe("awaiting_offers");
    expect(v.withdrawal).toMatchObject({ reason: "تعطّلت السطحة" });
    expect(v.actions.primary).toBe("choose_other");
    expect(v.offers.map((o: { id: string }) => o.id)).toEqual([o2]);
    expect(v.order).toBeNull();

    // المزوّد اللي اعتذر: الطلب يختفي من «شغلي» ومن الطلبات المتاحة، وما يقدر يرسل عرض جديد عليه.
    expect((await call("GET", "/v1/provider/jobs", p.token)).json().jobs.some((j: { requestId: string }) => j.requestId === id)).toBe(false);
    expect((await call("GET", `/v1/provider/requests/${id}`, p.token)).statusCode).toBe(404);
    expect((await call("POST", `/v1/provider/requests/${id}/offers`, p.token, { priceHalalas: 150_000, durationHours: 5 })).statusCode).toBe(404);

    // «اختر عرض ثاني» = قبول العرض الصالح.
    const acc = await call("POST", `/v1/requests/${id}/offers/${o2}/accept`, factory.token);
    expect(acc.statusCode).toBe(200);
    expect(acc.json().order.provider.tradeName).toBe("مزوّد 0002");
    const events = await ctx.db.query<{ event: string }>("SELECT event FROM order_events WHERE request_id=$1 ORDER BY id", [id]);
    expect(events.map((e) => e.event)).toEqual(["accepted", "provider_withdrew", "accepted"]);
  });

  it("العرض الثاني اللي انتهت صلاحيته ما يرجع: المصنع ينتظر عروض جديدة، ويقدر يلغي", async () => {
    const { id, orderId } = await acceptedJob();
    ctx.clock.advance(49 * HOUR); // صلاحية العروض ٤٨ ساعة
    await call("POST", `/v1/provider/jobs/${orderId}/withdraw`, p.token, { reason: "ظرف طارئ عندنا" });
    const v = await view(id);
    expect(v.request.status).toBe("awaiting_offers");
    expect(v.offers).toEqual([]);
    expect(v.actions).toEqual({ primary: null, others: ["edit", "cancel"] });
    // مدة الطلب تتمدد، فما ينتهي مباشرة.
    expect(new Date(v.request.expiresAt).getTime()).toBeGreaterThan(ctx.clock.now.getTime() + 6 * 24 * HOUR);
  });

  it("ما يعتذر بعد البدء (يفتح بلاغ بداله)، والاعتذار ينحسب في ملفه عند الإدارة", async () => {
    const { orderId } = await startedJob();
    const r = await call("POST", `/v1/provider/jobs/${orderId}/withdraw`, p.token, { reason: "ظرف طارئ عندنا" });
    expect(r.statusCode).toBe(409);
    const prof = (await call("GET", `/v1/admin/providers/${p.providerId}`, admin.token)).json().provider;
    expect(prof.reliability.withdrawals).toBe(2);
    expect(prof.reliability.accepted).toBeGreaterThan(2);
  });

  it("مزوّد ثاني ما يقدر يعتذر عن طلب مو له", async () => {
    const { orderId } = await acceptedJob();
    expect((await call("POST", `/v1/provider/jobs/${orderId}/withdraw`, p2.token, { reason: "ظرف طارئ عندنا" })).statusCode).toBe(404);
  });
});

describe("إعادة النشر", () => {
  it("الطلب المنتهي بدون عروض: «أعد نشر الطلب» مع تعديل، والمزوّدين يشوفونه من جديد", async () => {
    const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id as string;
    ctx.clock.advance(8 * 24 * HOUR);
    const v = await view(id);
    expect(v.request.status).toBe("expired");
    expect(v.actions.primary).toBe("republish");
    expect((await call("GET", `/v1/provider/requests/${id}`, p.token)).statusCode).toBe(404);

    const r = await call("POST", `/v1/requests/${id}/republish`, factory.token, { when: "this_week", details: "نقل ماكينة كبيرة من المصنع إلى الرياض" });
    expect(r.statusCode).toBe(200);
    expect(r.json().request).toMatchObject({ status: "awaiting_offers", when: "this_week", details: "نقل ماكينة كبيرة من المصنع إلى الرياض" });
    expect((await call("GET", `/v1/provider/requests/${id}`, p.token)).statusCode).toBe(200);
    // المفتوح ما يتعاد نشره.
    expect((await call("POST", `/v1/requests/${id}/republish`, factory.token)).statusCode).toBe(409);
  });

  it("تعديل فيه رابط: مرفوض", async () => {
    const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id as string;
    ctx.clock.advance(8 * 24 * HOUR);
    const r = await call("POST", `/v1/requests/${id}/republish`, factory.token, { details: "التفاصيل كاملة على example.com/x" });
    expect(r.statusCode).toBe(400);
  });
});

describe("البلاغ", () => {
  async function deliveredJob() {
    const j = await startedJob();
    expect((await call("POST", `/v1/provider/jobs/${j.orderId}/deliver`, p.token)).statusCode).toBe(200);
    return j;
  }

  it("المصنع يفتح بلاغ بعد «تم التنفيذ»: التأكيد التلقائي ما يصير، وبلاغ ثاني ما ينفتح", async () => {
    const { id } = await deliveredJob();
    const r = await call("POST", `/v1/requests/${id}/dispute`, factory.token, { reason: "quality", details: "اللحام ما هو مطابق للمطلوب" });
    expect(r.statusCode).toBe(201);
    expect(r.json().dispute).toMatchObject({ status: "open", reason: "quality", openedBy: "factory", details: "اللحام ما هو مطابق للمطلوب" });
    ctx.clock.advance(80 * HOUR);
    await runScheduledJobs(ctx.db, ctx.clock.now);
    expect((await view(id)).request.status).toBe("disputed");
    expect((await call("POST", `/v1/requests/${id}/dispute`, factory.token, { reason: "other", details: "مرة ثانية" })).statusCode).toBe(409);
  });

  it("الملاحظات: كل طرف يشوف ملاحظاته وملاحظات خدمة العملاء، وما يشوف ملاحظات الطرف الثاني ولا الداخلية", async () => {
    const { id, orderId } = await deliveredJob();
    await call("POST", `/v1/requests/${id}/dispute`, factory.token, { reason: "quality", details: "الشغل ناقص" });
    await call("POST", `/v1/requests/${id}/dispute/notes`, factory.token, { body: "أرسلنا صور للمشكلة" });
    await call("POST", `/v1/provider/jobs/${orderId}/dispute/notes`, p.token, { body: "الشغل حسب الاتفاق" });
    const list = (await call("GET", "/v1/admin/disputes?status=open", support.token)).json().disputes;
    const d = list.find((x: { requestId: string }) => x.requestId === id);
    expect(d).toBeTruthy();
    await call("POST", `/v1/admin/disputes/${d.id}/notes`, support.token, { body: "المزوّد عليه شكوى قبل", internal: true });
    await call("POST", `/v1/admin/disputes/${d.id}/notes`, support.token, { body: "نراجع الصور ونرد خلال يوم", internal: false });

    const fNotes = (await view(id)).dispute.notes.map((n: { body: string }) => n.body);
    expect(fNotes).toEqual(["أرسلنا صور للمشكلة", "نراجع الصور ونرد خلال يوم"]);
    const pDispute = (await call("GET", `/v1/provider/jobs/${orderId}`, p.token)).json().job.dispute;
    expect(pDispute.notes.map((n: { body: string }) => n.body)).toEqual(["الشغل حسب الاتفاق", "نراجع الصور ونرد خلال يوم"]);
    // تفاصيل البلاغ اللي كتبها المصنع توصل لخدمة العملاء بس.
    expect(pDispute.details).toBeNull();

    const full = (await call("GET", `/v1/admin/disputes/${d.id}`, support.token)).json();
    expect(full.notes).toHaveLength(4);
    expect(full.dispute.details).toBe("الشغل ناقص");
  });

  it("خدمة العملاء تقرر: «يرجع للتنفيذ» ثم «يكتمل». وموظف التوثيق ما له صلاحية", async () => {
    const { id, orderId } = await deliveredJob();
    await call("POST", `/v1/provider/jobs/${orderId}/dispute`, p.token, { reason: "conduct", details: "المصنع ما يرد على الاستلام" });
    const d = (await call("GET", "/v1/admin/disputes", support.token)).json().disputes.find((x: { requestId: string }) => x.requestId === id);
    expect(d.openedBy).toBe("provider");

    expect((await call("GET", "/v1/admin/disputes", verifier.token)).statusCode).toBe(403);
    expect((await call("POST", `/v1/admin/disputes/${d.id}/resolve`, verifier.token, { decision: "complete", note: "تم" })).statusCode).toBe(403);

    expect((await call("POST", `/v1/admin/disputes/${d.id}/resolve`, support.token, { decision: "resume", note: "يكمّل المزوّد الشغل" })).statusCode).toBe(200);
    expect((await view(id)).request.status).toBe("in_progress");
    expect((await call("POST", `/v1/admin/disputes/${d.id}/resolve`, support.token, { decision: "complete", note: "مرة ثانية" })).statusCode).toBe(409);

    await call("POST", `/v1/provider/jobs/${orderId}/dispute`, p.token, { reason: "other", details: "خلاف على الكمية" });
    const d2 = (await call("GET", "/v1/admin/disputes?status=open", support.token)).json().disputes.find((x: { requestId: string }) => x.requestId === id);
    expect((await call("POST", `/v1/admin/disputes/${d2.id}/resolve`, support.token, { decision: "complete", note: "الشغل مطابق حسب الصور" })).statusCode).toBe(200);
    const v = await view(id);
    expect(v.request.status).toBe("completed");
    expect(v.dispute).toMatchObject({ status: "closed", resolution: "complete" });
    expect(v.dispute.notes.at(-1).body).toBe("الشغل مطابق حسب الصور");
    const [o] = await ctx.db.query<{ confirmed_by: string }>("SELECT confirmed_by FROM orders WHERE id=$1", [orderId]);
    expect(o.confirmed_by).toBe("staff");
  });

  it("قرار «ينلغي» يقفل الطلب، والبلاغ ما ينفتح قبل البدء", async () => {
    const { id } = await acceptedJob();
    expect((await call("POST", `/v1/requests/${id}/dispute`, factory.token, { reason: "delay", details: "تأخر عن الموعد" })).statusCode).toBe(409);
    const s = await startedJob();
    await call("POST", `/v1/requests/${s.id}/dispute`, factory.token, { reason: "delay", details: "تأخر عن الموعد" });
    const d = (await call("GET", "/v1/admin/disputes?status=open", support.token)).json().disputes.find((x: { requestId: string }) => x.requestId === s.id);
    await call("POST", `/v1/admin/disputes/${d.id}/resolve`, support.token, { decision: "cancel", note: "الطرفين اتفقوا على الإلغاء" });
    expect((await view(s.id)).request.status).toBe("cancelled");
  });

  it("سجل ملاحظات البلاغ ما ينعدّل ولا ينحذف", async () => {
    await expect(ctx.db.query("DELETE FROM dispute_notes")).rejects.toThrow();
    await expect(ctx.db.query("UPDATE dispute_notes SET body='x'")).rejects.toThrow();
  });
});
