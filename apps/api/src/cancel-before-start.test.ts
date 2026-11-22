// «ولا مرة طريق مسدود»: المصنع يلغي مجانًا في أي حالة قبل ما يبدأ المزوّد (سؤال ١٥)،
// حسب جدول الانتقالات. (طلب الإلغاء بعد البدء في الخطوة ٨.)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
let manager: { token: string };
let member: { token: string };
let p: { token: string };
const offer = { priceHalalas: 100_000, durationHours: 5 };
const call = (method: "GET" | "POST", url: string, token: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: auth(token), ...(payload ? { payload } : {}) });

async function withOffer() {
  const id = (await call("POST", "/v1/requests", manager.token, validRequest)).json().request.id as string;
  const o = (await call("POST", `/v1/provider/requests/${id}/offers`, p.token, offer)).json().offer.id as string;
  return { id, o };
}

beforeAll(async () => {
  ctx = await createTestCtx();
  manager = await ctx.factory("0524000001");
  await call("POST", "/v1/factory/members", manager.token, { phone: "0524000002", role: "member" });
  member = await ctx.signIn("0524000002");
  p = await ctx.verifiedProvider("0564000001");
});
afterAll(async () => { await ctx.close(); });

describe("الإلغاء المجاني قبل البدء", () => {
  it("وهو ينتظر موافقة المدير: ينلغي، والترشيح ينسحب", async () => {
    const { id, o } = await withOffer();
    await call("POST", `/v1/requests/${id}/offers/${o}/nominate`, member.token);
    const r = await call("POST", `/v1/requests/${id}/cancel`, member.token);
    expect(r.statusCode).toBe(200);
    expect(r.json().request.status).toBe("cancelled");
    const [ap] = await ctx.db.query<{ decision: string }>("SELECT decision FROM approvals_internal WHERE request_id=$1", [id]);
    expect(ap.decision).toBe("withdrawn");
    const [of] = await ctx.db.query<{ status: string; rejected_reason: string }>("SELECT status, rejected_reason FROM offers WHERE id=$1", [o]);
    expect(of).toEqual({ status: "rejected", rejected_reason: "request_closed" });
  });

  it("بعد القبول وقبل البدء: ينلغي مجانًا، والطلب المنفّذ ينقفل، والمزوّد يشوف إنه انلغى", async () => {
    const { id, o } = await withOffer();
    await call("POST", `/v1/requests/${id}/offers/${o}/accept`, manager.token);
    const r = await call("POST", `/v1/requests/${id}/cancel`, manager.token);
    expect(r.statusCode).toBe(200);
    expect(r.json().request.status).toBe("cancelled");
    const [order] = await ctx.db.query<{ state: string; cancelled_at: Date | null }>("SELECT state, cancelled_at FROM orders WHERE request_id=$1", [id]);
    expect(order.state).toBe("closed");
    expect(order.cancelled_at).not.toBeNull();
    const events = await ctx.db.query<{ event: string }>("SELECT event FROM order_events WHERE request_id=$1 ORDER BY id", [id]);
    expect(events.map((e) => e.event)).toEqual(["accepted", "cancelled"]);
    const job = (await call("GET", "/v1/provider/jobs", p.token)).json().jobs.find((j: { requestId: string }) => j.requestId === id);
    expect(job.status).toBe("cancelled");
  });

  it("الطلب المنتهي ينلغي، والملغي ما ينلغي مرتين", async () => {
    const id = (await call("POST", "/v1/requests", manager.token, validRequest)).json().request.id;
    ctx.clock.advance(8 * 86400_000);
    expect((await call("POST", `/v1/requests/${id}/cancel`, manager.token)).statusCode).toBe(200);
    ctx.clock.advance(-8 * 86400_000);
    const again = await call("POST", `/v1/requests/${id}/cancel`, manager.token);
    expect(again.statusCode).toBe(409);
  });
});
