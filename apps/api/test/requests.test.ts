// الطلبات والصلاحيات: المصنع يشوف طلباته بس، ويرفع ويلغي حسب القواعد.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearer, factoryUser, json, login, sampleRequest, setupApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeAll(async () => {
  t = await setupApp();
});
afterAll(async () => t.close());

const createRequest = (token: string, payload: object = sampleRequest) =>
  t.app.inject({ method: "POST", url: "/requests", headers: bearer(token), payload });

describe("الصلاحيات", () => {
  it("كل مسارات الطلبات تحتاج دخول", async () => {
    for (const [method, url] of [
      ["GET", "/requests"],
      ["POST", "/requests"],
      ["GET", "/requests/00000000-0000-4000-8000-000000000000"],
      ["POST", "/requests/00000000-0000-4000-8000-000000000000/cancel"],
      ["PUT", "/factory"],
    ] as const) {
      const r = await t.app.inject({ method, url, payload: method === "GET" ? undefined : {} });
      expect(r.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("دور غير «مصنع» ما يقدر يرفع طلب (الصلاحية في الخادم)", async () => {
    const u = await login(t);
    await t.db.user.update({ where: { id: u.userId }, data: { role: "provider" } });
    const r = await createRequest(u.accessToken);
    expect(r.statusCode).toBe(403);
    expect(json(r).error).toBe("forbidden");
  });

  it("المصنع (أ) ما يقدر يقرأ أو يلغي طلب المصنع (ب)، والرد 404 مو 403", async () => {
    const a = await factoryUser(t, "مصنع أ");
    const b = await factoryUser(t, "مصنع ب");
    const created = json(await createRequest(b.accessToken));

    const read = await t.app.inject({ method: "GET", url: `/requests/${created.id}`, headers: bearer(a.accessToken) });
    expect(read.statusCode).toBe(404);
    const cancel = await t.app.inject({ method: "POST", url: `/requests/${created.id}/cancel`, headers: bearer(a.accessToken) });
    expect(cancel.statusCode).toBe(404);

    const listA = json(await t.app.inject({ method: "GET", url: "/requests", headers: bearer(a.accessToken) }));
    expect(listA.items.map((x: { id: string }) => x.id)).not.toContain(created.id);

    // ومؤشّر الصفحات من مصنع ثاني مرفوض.
    const cursor = await t.app.inject({ method: "GET", url: `/requests?cursor=${created.id}`, headers: bearer(a.accessToken) });
    expect(cursor.statusCode).toBe(400);

    // الطلب نفسه ما تغيّر.
    expect((await t.db.serviceRequest.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("awaiting_offers");
  });

  it("المصنع يُعرف من الجلسة: حقل factoryId في الطلب مرفوض", async () => {
    const a = await factoryUser(t);
    const b = await factoryUser(t);
    const r = await createRequest(a.accessToken, { ...sampleRequest, factoryId: b.factoryId });
    expect(r.statusCode).toBe(400);
  });
});

describe("إكمال بيانات المصنع", () => {
  it("ما يقدر يرفع طلب قبل ما يكمّل بيانات المصنع", async () => {
    const u = await login(t);
    const r = await createRequest(u.accessToken);
    expect(r.statusCode).toBe(409);
    expect(json(r).error).toBe("profile_incomplete");
  });

  it("الإكمال أول مرة ينشئ المصنع، والمرة الثانية تعدّله (ما ينشئ مصنع ثاني)", async () => {
    const u = await factoryUser(t, "الاسم الأول");
    const r = await t.app.inject({
      method: "PUT",
      url: "/factory",
      headers: bearer(u.accessToken),
      payload: { name: "الاسم الجديد", city: "سدير", contactName: "أحمد", vatNumber: "٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣" },
    });
    expect(r.statusCode).toBe(200);
    expect(json(r).id).toBe(u.factoryId);
    expect(json(r).vatNumber).toBe("300000000000003");
    const me = json(await t.app.inject({ method: "GET", url: "/me", headers: bearer(u.accessToken) }));
    expect(me.factory.name).toBe("الاسم الجديد");
    expect(await t.db.factoryMember.count({ where: { userId: u.userId } })).toBe(1);
  });

  it("يرفض رقم ضريبي بصيغة غلط", async () => {
    const u = await login(t);
    const r = await t.app.inject({
      method: "PUT",
      url: "/factory",
      headers: bearer(u.accessToken),
      payload: { name: "مصنع", city: "سدير", contactName: "أحمد", vatNumber: "123" },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe("رفع الطلبات وقراءتها", () => {
  it("يرفع طلب وينحفظ، ويلقاه في قائمته وبرقمه", async () => {
    const u = await factoryUser(t);
    const r = await createRequest(u.accessToken);
    expect(r.statusCode).toBe(201);
    const created = json(r);
    expect(created).toMatchObject({ ...sampleRequest, status: "awaiting_offers" });

    const one = await t.app.inject({ method: "GET", url: `/requests/${created.id}`, headers: bearer(u.accessToken) });
    expect(json(one).id).toBe(created.id);
    const list = json(await t.app.inject({ method: "GET", url: "/requests", headers: bearer(u.accessToken) }));
    expect(list.items[0].id).toBe(created.id);

    const logged = await t.db.auditLog.findFirst({ where: { action: "request.create", entityId: created.id } });
    expect(logged?.actorUserId).toBe(u.userId);
  });

  it("يرفض المدخلات الغلط", async () => {
    const u = await factoryUser(t);
    const bad = [
      { ...sampleRequest, typeId: "ac" }, // نوع من قسم ثاني
      { ...sampleRequest, category: "food" },
      { ...sampleRequest, details: "قصير" },
      { ...sampleRequest, details: "ط".repeat(1001) },
      { ...sampleRequest, when: "yesterday" },
      { ...sampleRequest, status: "completed" }, // ما يقدر يحدد الحالة بنفسه
    ];
    for (const payload of bad) {
      const r = await createRequest(u.accessToken, payload);
      expect(r.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect(json(r).error).toBe("invalid_input");
    }
    const notJson = await t.app.inject({
      method: "POST",
      url: "/requests",
      headers: { ...bearer(u.accessToken), "content-type": "application/json" },
      payload: "{not json",
    });
    expect(notJson.statusCode).toBe(400);
    expect(await t.db.serviceRequest.count({ where: { factoryId: u.factoryId } })).toBe(0);
  });

  it("رقم طلب بصيغة غلط يرجع 404", async () => {
    const u = await factoryUser(t);
    const r = await t.app.inject({ method: "GET", url: "/requests/../../etc", headers: bearer(u.accessToken) });
    expect(r.statusCode).toBe(404);
    const r2 = await t.app.inject({ method: "GET", url: "/requests/123", headers: bearer(u.accessToken) });
    expect(r2.statusCode).toBe(404);
  });

  it("القائمة مقسّمة صفحات، الأحدث أول، بدون تكرار", async () => {
    const u = await factoryUser(t);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(json(await createRequest(u.accessToken)).id);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/requests?limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const page = json(await t.app.inject({ method: "GET", url, headers: bearer(u.accessToken) }));
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((x: { id: string }) => x.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual([...ids].reverse());
  });
});

describe("إلغاء الطلب", () => {
  it("مسموح والطلب «بانتظار العروض»، وينكتب في السجل", async () => {
    const u = await factoryUser(t);
    const created = json(await createRequest(u.accessToken));
    const r = await t.app.inject({ method: "POST", url: `/requests/${created.id}/cancel`, headers: bearer(u.accessToken) });
    expect(r.statusCode).toBe(200);
    expect(json(r).status).toBe("cancelled");
    expect(json(r).cancelledAt).not.toBeNull();
    expect(await t.db.auditLog.count({ where: { action: "request.cancel", entityId: created.id } })).toBe(1);
  });

  it("ممنوع على طلب ملغي أو قيد التنفيذ", async () => {
    const u = await factoryUser(t);
    const a = json(await createRequest(u.accessToken));
    await t.app.inject({ method: "POST", url: `/requests/${a.id}/cancel`, headers: bearer(u.accessToken) });
    const again = await t.app.inject({ method: "POST", url: `/requests/${a.id}/cancel`, headers: bearer(u.accessToken) });
    expect(again.statusCode).toBe(409);
    expect(json(again).error).toBe("invalid_state");

    const b = json(await createRequest(u.accessToken));
    await t.db.serviceRequest.update({ where: { id: b.id }, data: { status: "in_progress" } });
    const r = await t.app.inject({ method: "POST", url: `/requests/${b.id}/cancel`, headers: bearer(u.accessToken) });
    expect(r.statusCode).toBe(409);
    expect((await t.db.serviceRequest.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("in_progress");
  });
});
