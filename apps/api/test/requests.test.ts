// اختبارات الطلبات: الصلاحيات (المصنع ما يشوف طلبات غيره)، ومسار الطلب، وسياسة الإلغاء.
import { describe, expect, it } from "vitest";
import { DEMO_PROVIDERS } from "../src/demo";
import { providerRespondToCancel, providerStartWork, providerSubmitOffer } from "../src/services/requests";
import { setCancelPolicy } from "../src/settings";
import { makeTestApp, validRequest } from "./helpers";

const t = await makeTestApp();

/** ينشئ طلب ويوصّل له العروض الوهمية. */
async function requestWithOffers(token: string) {
  const created = await t.call("POST", "/requests", { token, body: validRequest });
  expect(created.status).toBe(201);
  await t.scheduler.runAll();
  const r = await t.call("GET", `/requests/${created.body.id}`, { token });
  expect(r.body.offers).toHaveLength(2);
  return r.body;
}

async function acceptedRequest(token: string) {
  const r = await requestWithOffers(token);
  const a = await t.call("POST", `/requests/${r.id}/accept`, { token, body: { offerId: r.offers[0].id } });
  expect(a.status).toBe(200);
  // بدء التنفيذ الوهمي (بعد دقيقة) ما نشغّله هنا، نتحكم فيه يدويًا في كل اختبار.
  t.scheduler.tasks = [];
  return a.body;
}

/** طلب قبل فيه المصنع عرض، والمزوّد ضغط «بدأت التنفيذ». */
async function startedRequest(token: string) {
  const r = await acceptedRequest(token);
  expect(await providerStartWork(t.db, r.acceptedOffer.provider.id, r.id, t.clock.now())).toBe(true);
  return (await t.call("GET", `/requests/${r.id}`, { token })).body;
}

describe("الصلاحيات", () => {
  it("بدون دخول: ٤٠١", async () => {
    expect((await t.call("GET", "/requests")).status).toBe(401);
    expect((await t.call("POST", "/requests", { body: validRequest })).status).toBe(401);
  });

  it("مصنع ما كمّل بياناته ما يقدر يرفع طلب", async () => {
    const s = await t.signIn();
    const r = await t.call("POST", "/requests", { token: s.token, body: validRequest });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("factory_profile_required");
  });

  it("المزوّد أو موظف الإدارة ما يقدر يستخدم مسارات المصنع", async () => {
    for (const role of ["provider", "staff"] as const) {
      const s = await t.signIn();
      await t.db.user.update({ where: { id: s.me.id }, data: { role } });
      expect((await t.call("GET", "/requests", { token: s.token })).status).toBe(403);
      expect((await t.call("PUT", "/factory", { token: s.token, body: { name: "x y", location: "سدير" } })).status).toBe(403);
    }
  });

  it("المصنع ما يشوف ولا يلمس طلبات مصنع ثاني", async () => {
    const a = await t.factoryUser("مصنع أ");
    const b = await t.factoryUser("مصنع ب");
    const req = await requestWithOffers(a.token);

    // القائمة: طلبات المصنع نفسه بس.
    const listB = await t.call("GET", "/requests", { token: b.token });
    expect(listB.body.map((r: { id: string }) => r.id)).not.toContain(req.id);
    const listA = await t.call("GET", "/requests", { token: a.token });
    expect(listA.body.map((r: { id: string }) => r.id)).toContain(req.id);

    // أي محاولة على طلب المصنع الثاني ترجع «غير موجود»، مو «ممنوع».
    const attempts = [
      t.call("GET", `/requests/${req.id}`, { token: b.token }),
      t.call("POST", `/requests/${req.id}/seen`, { token: b.token }),
      t.call("POST", `/requests/${req.id}/accept`, { token: b.token, body: { offerId: req.offers[0].id } }),
      t.call("POST", `/requests/${req.id}/cancel`, { token: b.token }),
      t.call("POST", `/requests/${req.id}/cancel-request`, { token: b.token }),
      t.call("POST", `/requests/${req.id}/confirm-receipt`, { token: b.token }),
      t.call("POST", `/requests/${req.id}/dispute`, { token: b.token }),
    ];
    for (const r of await Promise.all(attempts)) {
      expect(r.status).toBe(404);
      expect(r.body.error).toBe("not_found");
    }
    // والطلب ما تغيّر.
    const after = await t.call("GET", `/requests/${req.id}`, { token: a.token });
    expect(after.body.status).toBe("awaiting_offers");
    expect(after.body.offers).toHaveLength(2);
  });

  it("رقم طلب غلط يرجع ٤٠٤ بدون خطأ في الخادم", async () => {
    const a = await t.factoryUser();
    expect((await t.call("GET", "/requests/not-a-uuid", { token: a.token })).status).toBe(404);
    expect((await t.call("GET", "/requests/00000000-0000-4000-8000-00000000ffff", { token: a.token })).status).toBe(404);
  });
});

describe("رفع الطلب", () => {
  it("يتحقق من المدخلات ويرجع اسم الحقل الغلط", async () => {
    const a = await t.factoryUser();
    const bad = await t.call("POST", "/requests", { token: a.token, body: { ...validRequest, typeId: "ac" } });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ error: "type_invalid", field: "typeId" });
    const short = await t.call("POST", "/requests", { token: a.token, body: { ...validRequest, details: "قصير" } });
    expect(short.body).toMatchObject({ error: "details_invalid", field: "details" });
    const cat = await t.call("POST", "/requests", { token: a.token, body: { ...validRequest, category: "x" } });
    expect(cat.body.field).toBe("category");
  });

  it("الطلب ينحفظ، ويسجَّل في سجل الإجراءات", async () => {
    const a = await t.factoryUser();
    const r = await t.call("POST", "/requests", { token: a.token, body: validRequest });
    expect(r.body).toMatchObject({ status: "awaiting_offers", actions: ["cancel"], pendingOffers: 0 });
    const log = await t.db.auditLog.findFirst({ where: { entityId: r.body.id, action: "request.created" } });
    expect(log?.actorUserId).toBe(a.userId);
  });

  it("وضع التجربة: يوصل عرضين، والعروض الجديدة محسوبة كغير مقروءة لين يفتحها", async () => {
    const a = await t.factoryUser();
    const r = await requestWithOffers(a.token);
    expect(r.unseenOffers).toBe(2);
    expect(r.actions).toEqual(["accept_offer", "cancel"]);
    expect(r.offers[0].priceHalalas).toBeLessThan(r.offers[1].priceHalalas);
    expect(r.offers[0].provider.verified).toBe(true);
    await t.call("POST", `/requests/${r.id}/seen`, { token: a.token });
    expect((await t.call("GET", `/requests/${r.id}`, { token: a.token })).body.unseenOffers).toBe(0);
  });

  it("بدون وضع التجربة: ما يوصل أي عرض وهمي", async () => {
    const t2 = await makeTestApp({ DEMO_MODE: "false" });
    const a = await t2.factoryUser();
    await t2.call("POST", "/requests", { token: a.token, body: validRequest });
    expect(t2.scheduler.tasks).toHaveLength(0);
  });
});

describe("قبول العرض", () => {
  it("يقبل عرض واحد، والباقي ينرفض", async () => {
    const a = await t.factoryUser();
    const r = await requestWithOffers(a.token);
    const res = await t.call("POST", `/requests/${r.id}/accept`, { token: a.token, body: { offerId: r.offers[1].id } });
    expect(res.body.status).toBe("accepted");
    expect(res.body.acceptedOffer.id).toBe(r.offers[1].id);
    const offers = await t.db.offer.findMany({ where: { requestId: r.id } });
    expect(offers.map((o) => o.status).sort()).toEqual(["accepted", "declined"]);
  });

  it("ما ينفع يقبل عرض ثاني بعد القبول", async () => {
    const a = await t.factoryUser();
    const r = await requestWithOffers(a.token);
    await t.call("POST", `/requests/${r.id}/accept`, { token: a.token, body: { offerId: r.offers[0].id } });
    const second = await t.call("POST", `/requests/${r.id}/accept`, { token: a.token, body: { offerId: r.offers[1].id } });
    expect(second.status).toBe(409);
  });

  it("لو ضغط قبول عرضين بنفس اللحظة، ينقبل واحد بس", async () => {
    const a = await t.factoryUser();
    const r = await requestWithOffers(a.token);
    const results = await Promise.all(
      r.offers.map((o: { id: string }) => t.call("POST", `/requests/${r.id}/accept`, { token: a.token, body: { offerId: o.id } })),
    );
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
    const accepted = await t.db.offer.count({ where: { requestId: r.id, status: "accepted" } });
    expect(accepted).toBe(1);
  });

  it("عرض من طلب ثاني ما ينقبل على هذا الطلب", async () => {
    const a = await t.factoryUser();
    const r1 = await requestWithOffers(a.token);
    const r2 = await requestWithOffers(a.token);
    const res = await t.call("POST", `/requests/${r1.id}/accept`, { token: a.token, body: { offerId: r2.offers[0].id } });
    expect(res.status).toBe(404);
  });
});

describe("الإلغاء (ولا مرة طريق مسدود)", () => {
  it("قبل وصول العروض: إلغاء مباشر", async () => {
    const a = await t.factoryUser();
    const r = await t.call("POST", "/requests", { token: a.token, body: validRequest });
    const c = await t.call("POST", `/requests/${r.body.id}/cancel`, { token: a.token });
    expect(c.body).toMatchObject({ status: "cancelled", actions: ["reorder"] });
    // العروض اللي توصل بعد الإلغاء تنتجاهل.
    await t.scheduler.runAll();
    expect(await t.db.offer.count({ where: { requestId: r.body.id } })).toBe(0);
  });

  it("السياسة المعتمدة: بعد القبول وقبل البدء، إلغاء مجاني", async () => {
    const a = await t.factoryUser();
    const r = await acceptedRequest(a.token);
    expect(r.actions).toEqual(["confirm_receipt", "cancel"]);
    const c = await t.call("POST", `/requests/${r.id}/cancel`, { token: a.token });
    expect(c.body.status).toBe("cancelled");
  });

  it("بعد بدء التنفيذ: الإلغاء المباشر ممنوع، و«طلب الإلغاء» يروح للمزوّد", async () => {
    const a = await t.factoryUser();
    const r = await startedRequest(a.token);
    expect(r.status).toBe("in_progress");
    expect(r.actions).toEqual(["confirm_receipt", "request_cancel"]);
    expect((await t.call("POST", `/requests/${r.id}/cancel`, { token: a.token })).status).toBe(409);

    const cr = await t.call("POST", `/requests/${r.id}/cancel-request`, { token: a.token });
    expect(cr.body).toMatchObject({ cancelRequestStatus: "pending", actions: ["confirm_receipt", "withdraw_cancel_request"] });

    // المزوّد يوافق: الطلب ينلغي.
    expect(await providerRespondToCancel(t.db, r.acceptedOffer.provider.id, r.id, true, t.clock.now())).toBe(true);
    const done = await t.call("GET", `/requests/${r.id}`, { token: a.token });
    expect(done.body).toMatchObject({ status: "cancelled", actions: ["reorder"] });
  });

  it("المصنع يقدر يسحب طلب الإلغاء", async () => {
    const a = await t.factoryUser();
    const r = await startedRequest(a.token);
    await t.call("POST", `/requests/${r.id}/cancel-request`, { token: a.token });
    const w = await t.call("POST", `/requests/${r.id}/cancel-request/withdraw`, { token: a.token });
    expect(w.body).toMatchObject({ cancelRequestStatus: null, actions: ["confirm_receipt", "request_cancel"] });
  });

  it("المزوّد رفض الإلغاء: المصنع يفتح بلاغ، ويقدر يأكد الاستلام", async () => {
    const a = await t.factoryUser();
    const r = await startedRequest(a.token);
    await t.call("POST", `/requests/${r.id}/cancel-request`, { token: a.token });
    expect(await providerRespondToCancel(t.db, r.acceptedOffer.provider.id, r.id, false, t.clock.now())).toBe(true);
    const d = await t.call("GET", `/requests/${r.id}`, { token: a.token });
    expect(d.body).toMatchObject({ cancelRequestStatus: "declined", actions: ["confirm_receipt", "open_dispute"] });
    const disp = await t.call("POST", `/requests/${r.id}/dispute`, { token: a.token });
    expect(disp.body).toMatchObject({ disputeOpened: true, actions: ["confirm_receipt"] });
  });

  it("مزوّد ثاني ما يقدر يبدأ أو يرد على طلب مو له", async () => {
    const a = await t.factoryUser();
    const r = await acceptedRequest(a.token);
    const other = DEMO_PROVIDERS.find((p) => p.id !== r.acceptedOffer.provider.id)!;
    expect(await providerStartWork(t.db, other.id, r.id, t.clock.now())).toBe(false);
  });

  it("لو تغيّرت السياسة: بعد القبول يصير «طلب إلغاء» بدل الإلغاء المباشر", async () => {
    const t2 = await makeTestApp();
    await setCancelPolicy(t2.db, { freeCancelUntil: "offer_accepted" });
    try {
      const a = await t2.factoryUser();
      const created = await t2.call("POST", "/requests", { token: a.token, body: validRequest });
      await t2.scheduler.runAll();
      const d = await t2.call("GET", `/requests/${created.body.id}`, { token: a.token });
      const acc = await t2.call("POST", `/requests/${d.body.id}/accept`, { token: a.token, body: { offerId: d.body.offers[0].id } });
      expect(acc.body.actions).toEqual(["confirm_receipt", "request_cancel"]);
      expect((await t2.call("POST", `/requests/${d.body.id}/cancel`, { token: a.token })).status).toBe(409);
      const cfg = await t2.call("GET", "/config");
      expect(cfg.body.cancelPolicy.freeCancelUntil).toBe("offer_accepted");
    } finally {
      await setCancelPolicy(t2.db, { freeCancelUntil: "provider_starts" });
    }
  });
});

describe("تأكيد الاستلام", () => {
  it("يكمّل الطلب، ويصير «اطلب مرة ثانية» متاح", async () => {
    const a = await t.factoryUser();
    const r = await startedRequest(a.token);
    const c = await t.call("POST", `/requests/${r.id}/confirm-receipt`, { token: a.token });
    expect(c.body).toMatchObject({ status: "completed", actions: ["view_invoice", "reorder"] });
    expect(c.body.completedAt).not.toBeNull();
    expect((await t.call("POST", `/requests/${r.id}/confirm-receipt`, { token: a.token })).status).toBe(409);
  });
});

describe("حدود المحاولات لكل مستخدم", () => {
  it("موظفين من نفس شبكة المصنع (نفس العنوان) ما ينحجبون بسبب بعض", async () => {
    const t2 = await makeTestApp();
    const a = await t2.factoryUser("مصنع الشبكة المشتركة");
    const b = await t2.factoryUser("مصنع الشبكة المشتركة ٢");
    const ip = "10.99.99.99";
    // المستخدم الأول يستهلك حده كامل (٣٠ طلب بالساعة)...
    for (let i = 0; i < 30; i++) {
      expect((await t2.call("POST", "/requests", { token: a.token, body: validRequest, ip })).status).toBe(201);
    }
    expect((await t2.call("POST", "/requests", { token: a.token, body: validRequest, ip })).status).toBe(429);
    // ...والثاني من نفس العنوان يقدر يرفع طلبه عادي.
    expect((await t2.call("POST", "/requests", { token: b.token, body: validRequest, ip })).status).toBe(201);
  });
});
