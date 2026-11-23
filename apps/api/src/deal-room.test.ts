// غرفة الصفقة (القرار ٣٥ والقرار ٥٠): المحادثة بين العميل والمزوّد بعد القبول.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let factory: { token: string; userId: string };
let member: { token: string; userId: string };
let otherFactory: { token: string };
let p: { token: string; userId: string };
let other: { token: string };
let support: { token: string };
let finance: { token: string };

const call = (method: "GET" | "POST", url: string, token: string, payload?: object, headers: object = {}) =>
  ctx.app.inject({ method, url, headers: { ...auth(token), ...headers }, ...(payload ? { payload } : {}) });

/** طلب للمصنع، عرض من p، والمصنع قبله. */
async function accepted() {
  const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id as string;
  const o = (await call("POST", `/v1/provider/requests/${id}/offers`, p.token, { priceHalalas: 100_000, durationHours: 5 })).json().offer.id;
  const acc = await call("POST", `/v1/requests/${id}/offers/${o}/accept`, factory.token);
  expect(acc.statusCode).toBe(200);
  return { id, orderId: acc.json().order.id as string };
}

const say = (j: { id: string }, body: string, token = factory.token) => call("POST", `/v1/requests/${j.id}/messages`, token, { body });
const reply = (j: { orderId: string }, body: string, token = p.token) => call("POST", `/v1/provider/jobs/${j.orderId}/messages`, token, { body });
const notesFor = async (userId: string, linkId?: string) =>
  ctx.db.query<{ event: string; data: { link?: { screen: string; id: string }; title?: string } }>(
    "SELECT event, data FROM notifications WHERE user_id=$1 AND event='new_message' AND ($2::text IS NULL OR data->'link'->>'id' = $2) ORDER BY created_at",
    [userId, linkId ?? null],
  );

beforeAll(async () => {
  ctx = await createTestCtx();
  factory = await ctx.factory("0528000001", "مصنع المحادثة");
  const inv = await call("POST", "/v1/factory/members", factory.token, { phone: "0528000003", role: "member" });
  expect(inv.statusCode).toBe(201);
  member = await ctx.signIn("0528000003");
  otherFactory = await ctx.factory("0528000002");
  p = await ctx.verifiedProvider("0568000001");
  other = await ctx.verifiedProvider("0568000002");
  support = await ctx.staff("0558000001", "support");
  finance = await ctx.staff("0558000002", "finance");
});
afterAll(async () => {
  await ctx.close();
});

describe("المحادثة بين الطرفين", () => {
  it("العميل يكتب والمزوّد يرد، وكل واحد يشوف رسالته «مني»", async () => {
    const j = await accepted();
    expect((await say(j, "متى توصلون؟")).statusCode).toBe(201);
    const r = await reply(j, "بكرة الصبح إن شاء الله");
    expect(r.statusCode).toBe(201);
    const pv = r.json();
    expect(pv.writable).toBe(true);
    const msgs = pv.items.filter((i: { kind: string }) => i.kind === "message");
    expect(msgs.map((m: { body: string; mine: boolean; from: string }) => [m.from, m.mine, m.body])).toEqual([
      ["customer", false, "متى توصلون؟"],
      ["provider", true, "بكرة الصبح إن شاء الله"],
    ]);
    // سطر النظام «انقبل العرض» من الخط الزمني
    expect(pv.items[0]).toMatchObject({ kind: "event", event: "accepted" });
    const fv = (await call("GET", `/v1/requests/${j.id}/messages`, factory.token)).json();
    expect(fv.items.filter((i: { kind: string }) => i.kind === "message").map((m: { mine: boolean }) => m.mine)).toEqual([true, false]);
  });

  it("موظف ثاني في نفس المنشأة يشوف المحادثة ويكتب فيها", async () => {
    const j = await accepted();
    await say(j, "أهلًا");
    expect((await say(j, "وأنا من نفس المصنع", member.token)).statusCode).toBe(201);
    const v = (await call("GET", `/v1/requests/${j.id}/messages`, member.token)).json();
    expect(v.items.filter((i: { kind: string }) => i.kind === "message")).toHaveLength(2);
  });

  it("طرف ثالث ما يشوف ولا يكتب: «غير موجود»", async () => {
    const j = await accepted();
    await say(j, "خاص");
    expect((await call("GET", `/v1/requests/${j.id}/messages`, otherFactory.token)).statusCode).toBe(404);
    expect((await say(j, "تجربة", otherFactory.token)).statusCode).toBe(404);
    expect((await call("GET", `/v1/provider/jobs/${j.orderId}/messages`, other.token)).statusCode).toBe(404);
    expect((await reply(j, "تجربة", other.token)).statusCode).toBe(404);
    // المزوّد ما يدخل من مسار العميل، والعكس
    expect((await call("GET", `/v1/requests/${j.id}/messages`, p.token)).statusCode).toBe(403);
    expect((await call("GET", `/v1/provider/jobs/${j.orderId}/messages`, factory.token)).statusCode).toBe(403);
  });

  it("قبل القبول ما فيه محادثة", async () => {
    const id = (await call("POST", "/v1/requests", factory.token, validRequest)).json().request.id;
    expect((await call("GET", `/v1/requests/${id}/messages`, factory.token)).statusCode).toBe(404);
  });

  it("أرقام الجوال والروابط والإيميلات ممنوعة", async () => {
    const j = await accepted();
    for (const body of ["كلمني ٠٥٥ ١٢٣ ٤٥٦٧", "شوف www.example.com", "ايميلي a@b.co", "تابعني @someone_here"]) {
      const r = await say(j, body);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe("contact_info_not_allowed");
    }
    expect((await reply(j, "رقمي 0551234567")).json().error.code).toBe("contact_info_not_allowed");
  });

  it("رسالة فاضية أو أطول من ١٠٠٠ حرف تنرفض", async () => {
    const j = await accepted();
    expect((await say(j, "   ")).statusCode).toBe(400);
    expect((await say(j, "ا".repeat(1001))).statusCode).toBe(400);
    expect((await say(j, "ا".repeat(1000))).statusCode).toBe(201);
  });

  it("نفس مفتاح التكرار ما يطلع رسالتين", async () => {
    const j = await accepted();
    const h = { "idempotency-key": "msg-key-12345" };
    await call("POST", `/v1/requests/${j.id}/messages`, factory.token, { body: "مرة وحدة" }, h);
    await call("POST", `/v1/requests/${j.id}/messages`, factory.token, { body: "مرة وحدة" }, h);
    const v = (await call("GET", `/v1/requests/${j.id}/messages`, factory.token)).json();
    expect(v.items.filter((i: { kind: string }) => i.kind === "message")).toHaveLength(1);
  });
});

describe("التشفير وحماية السجل", () => {
  it("النص محفوظ مشفّر في القاعدة، مو نص عادي", async () => {
    const j = await accepted();
    await say(j, "سر الصفقة");
    const [row] = await ctx.db.query<{ body_enc: string }>("SELECT body_enc FROM order_messages WHERE order_id=$1", [j.orderId]);
    expect(row.body_enc.startsWith("v1.")).toBe(true);
    expect(row.body_enc).not.toContain("سر الصفقة");
  });

  it("الرسالة ما تتعدّل ولا تنحذف (القاعدة نفسها ترفض)", async () => {
    const j = await accepted();
    await say(j, "ثابتة");
    await expect(ctx.db.query("UPDATE order_messages SET body_enc='x' WHERE order_id=$1", [j.orderId])).rejects.toThrow();
    await expect(ctx.db.query("DELETE FROM order_messages WHERE order_id=$1", [j.orderId])).rejects.toThrow();
  });
});

describe("بعد الاكتمال أو الإلغاء: قراءة بس", () => {
  it("بعد تأكيد الاستلام ما ينكتب فيها، والقراءة تبقى مع السبب", async () => {
    const j = await accepted();
    await say(j, "قبل البدء");
    await call("POST", `/v1/provider/jobs/${j.orderId}/start`, p.token);
    expect((await reply(j, "بدأنا")).statusCode).toBe(201);
    await call("POST", `/v1/provider/jobs/${j.orderId}/deliver`, p.token);
    expect((await say(j, "وصل؟")).statusCode).toBe(201);
    expect((await call("POST", `/v1/requests/${j.id}/confirm`, factory.token)).statusCode).toBe(200);
    const r = await say(j, "شكرًا");
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("chat_closed");
    expect((await reply(j, "العفو")).json().error.code).toBe("chat_closed");
    const v = (await call("GET", `/v1/requests/${j.id}/messages`, factory.token)).json();
    expect(v).toMatchObject({ writable: false, closedReason: "completed" });
    expect(v.items.filter((i: { kind: string }) => i.kind === "message")).toHaveLength(3);
    expect(v.items.map((i: { event?: string }) => i.event).filter(Boolean)).toEqual(["accepted", "started", "delivered", "confirmed"]);
  });

  it("بعد الإلغاء قبل البدء: مقفولة", async () => {
    const j = await accepted();
    await say(j, "بلغي");
    expect((await call("POST", `/v1/requests/${j.id}/cancel`, factory.token, { reason: "تغيّر الموعد" })).statusCode).toBe(200);
    const v = (await call("GET", `/v1/provider/jobs/${j.orderId}/messages`, p.token)).json();
    expect(v).toMatchObject({ writable: false, closedReason: "cancelled" });
    expect((await reply(j, "تمام")).json().error.code).toBe("chat_closed");
  });
});

describe("غير مقروء والتنبيه", () => {
  it("الرقم يزيد بالرسائل الجديدة من الطرف الثاني، ويصير صفر بعد الفتح", async () => {
    const j = await accepted();
    await reply(j, "واحد");
    await reply(j, "اثنين");
    expect((await call("GET", `/v1/requests/${j.id}`, factory.token)).json().unreadMessages).toBe(2);
    const list = (await call("GET", "/v1/requests", factory.token)).json().requests;
    expect(list.find((x: { id: string }) => x.id === j.id).unreadMessages).toBe(2);
    // رسالة المصنع نفسه ما تنحسب عليه
    expect((await call("GET", `/v1/provider/jobs/${j.orderId}`, p.token)).json().job.unreadMessages).toBe(0);
    await call("GET", `/v1/requests/${j.id}/messages`, factory.token);
    expect((await call("GET", `/v1/requests/${j.id}`, factory.token)).json().unreadMessages).toBe(0);
    // الموظف الثاني ما فتحها: باقي عنده
    expect((await call("GET", `/v1/requests/${j.id}`, member.token)).json().unreadMessages).toBe(2);
    await say(j, "رد");
    const jobs = (await call("GET", "/v1/provider/jobs", p.token)).json().jobs;
    expect(jobs.find((x: { orderId: string }) => x.orderId === j.orderId).unreadMessages).toBe(1);
  });

  it("تنبيه واحد كل ١٠ دقايق مهما كثرت الرسائل، وبدون نص الرسالة", async () => {
    const j = await accepted();
    await say(j, "أولى");
    await say(j, "ثانية");
    await say(j, "ثالثة");
    let notes = await notesFor(p.userId, j.orderId);
    expect(notes.length).toBe(1);
    expect(notes.at(-1)!.data.link).toEqual({ screen: "provider_job", id: j.orderId });
    expect(JSON.stringify(notes.at(-1)!.data)).not.toContain("أولى");
    ctx.clock.advance(11 * 60_000);
    await say(j, "بعد شوي");
    notes = await notesFor(p.userId, j.orderId);
    expect(notes.length).toBe(2);
  });

  it("اللي فاتح المحادثة الحين ما يوصله تنبيه، والتنبيه يوصل لكل موظفين المنشأة", async () => {
    const j = await accepted();
    ctx.clock.advance(11 * 60_000);
    await call("GET", `/v1/requests/${j.id}/messages`, factory.token);
    await reply(j, "وصلنا");
    expect(await notesFor(factory.userId, j.id)).toHaveLength(0);
    const m = await notesFor(member.userId, j.id);
    expect(m).toHaveLength(1);
    expect(m.at(-1)!.data.link).toEqual({ screen: "request", id: j.id });
  });
});

describe("خدمة العملاء", () => {
  it("تقرأ المحادثة بس لطلب فيه بلاغ، وكل قراءة تنسجل", async () => {
    const j = await accepted();
    await say(j, "الشغل ما خلص");
    await call("POST", `/v1/provider/jobs/${j.orderId}/start`, p.token);
    const d = await call("POST", `/v1/requests/${j.id}/dispute`, factory.token, { reason: "quality", details: "التنفيذ ناقص" });
    expect(d.statusCode).toBe(201);
    const [dispute] = await ctx.db.query<{ id: string }>("SELECT id FROM disputes WHERE order_id=$1", [j.orderId]);
    // صلاحية ثانية (مالية): ممنوع
    expect((await call("GET", `/v1/admin/disputes/${dispute.id}/messages`, finance.token)).statusCode).toBe(403);
    const v = await call("GET", `/v1/admin/disputes/${dispute.id}/messages`, support.token);
    expect(v.statusCode).toBe(200);
    const items = v.json().items;
    expect(items.find((i: { kind: string }) => i.kind === "message")).toMatchObject({ body: "الشغل ما خلص", from: "customer", mine: false });
    expect(items.map((i: { event?: string }) => i.event).filter(Boolean)).toContain("dispute_opened");
    const logs = await ctx.db.query<{ entity_id: string }>("SELECT entity_id FROM audit_log WHERE action='dispute.chat_viewed'");
    expect(logs.map((l) => l.entity_id)).toContain(dispute.id);
    // وقت البلاغ الطرفين يكتبون عادي
    expect((await reply(j, "بنكمّل بكرة")).statusCode).toBe(201);
  });

  it("ما فيه مسار يقرأ محادثة طلب بدون بلاغ", async () => {
    expect((await call("GET", `/v1/admin/disputes/00000000-0000-4000-8000-000000000000/messages`, support.token)).statusCode).toBe(404);
  });
});
