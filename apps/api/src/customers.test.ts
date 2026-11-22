// خطة العميل الفرد والسوق، الخطوة أ: العميل منشأة أو فرد (القرارين ٤١ و٤٢).
// القواعد: التسجيل رسمي للنوعين، رقم هوية الفرد مشفّر وما يطلع كامل إلا لموظف مخوّل (والاطلاع في السجل)،
// والطلب يحتاج بيانات كاملة، والمزوّد يشوف «منشأة» أو «فرد» بس قبل القبول.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, createTestCtx, validRequest, type TestCtx } from "./test-helpers.ts";
import { setSetting } from "./settings.ts";

let ctx: TestCtx;
const SYS = { id: null, role: "system" };
const individual = { kind: "individual", name: "عبدالله محمد السبيعي", idType: "national_id", idNumber: "1012345678" };

const put = (token: string, payload: object) => ctx.app.inject({ method: "PUT", url: "/v1/factory", headers: auth(token), payload });
const me = (token: string) => ctx.app.inject({ method: "GET", url: "/v1/me", headers: auth(token) });
const createRequest = (token: string) => ctx.app.inject({ method: "POST", url: "/v1/requests", headers: auth(token), payload: validRequest });

beforeAll(async () => { ctx = await createTestCtx(); });
afterAll(async () => { await ctx.close(); });

describe("نوع العميل", () => {
  it("العميل الجديد ما اختار نوعه، وما يرفع طلب قبل ما يكمّل بياناته", async () => {
    const { token } = await ctx.signIn("0514000001");
    const m = await me(token);
    expect(m.json().factory).toMatchObject({ kind: null, profileComplete: false });
    const r = await createRequest(token);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("profile_incomplete");
  });

  it("الفرد يسجّل بالاسم والهوية، والرقم ينحفظ مشفّر ويطلع له آخر ٤ أرقام بس", async () => {
    const { token } = await ctx.signIn("0514000002");
    const r = await put(token, individual);
    expect(r.statusCode).toBe(200);
    expect(r.json().factory).toMatchObject({
      kind: "individual",
      name: individual.name,
      idType: "national_id",
      idNumberMasked: "******5678",
      identity: { status: "pending", verifiedAt: null },
      profileComplete: true,
      commercialRegister: null,
    });
    expect(JSON.stringify(r.json())).not.toContain(individual.idNumber);
    const [row] = await ctx.db.query<{ id_number_enc: string }>("SELECT id_number_enc FROM factories WHERE id=$1", [r.json().factory.id]);
    expect(row.id_number_enc).toMatch(/^v1\./);
    expect(row.id_number_enc).not.toContain(individual.idNumber);
    expect((await createRequest(token)).statusCode).toBe(201);
  });

  it("المدخلات الغلط تنرفض: نوع هوية ما يطابق الرقم، وسجل تجاري للفرد، واسم قصير", async () => {
    const { token } = await ctx.signIn("0514000003");
    const mismatch = await put(token, { ...individual, idType: "iqama" });
    expect(mismatch.statusCode).toBe(400);
    expect((await put(token, { ...individual, commercialRegister: "1010000000" })).statusCode).toBe(400);
    expect((await put(token, { ...individual, name: "علي" })).statusCode).toBe(400);
    expect((await put(token, { ...individual, idNumber: "10123" })).statusCode).toBe(400);
    expect((await put(token, { kind: "company", name: "x" })).statusCode).toBe(400);
  });

  it("الشكل القديم بدون kind ينحفظ منشأة (التطبيقات القديمة تشتغل)", async () => {
    const { token } = await ctx.signIn("0514000004");
    const r = await put(token, { name: "مصنع قديم", commercialRegister: "1010000000", vatNumber: "300000000000003" });
    expect(r.statusCode).toBe(200);
    expect(r.json().factory).toMatchObject({ kind: "business", profileComplete: true, idNumberMasked: null, identity: { status: "not_required" } });
  });

  it("تغيير النوع مسموح قبل أول طلب، وبعده ممنوع", async () => {
    const { token } = await ctx.signIn("0514000005");
    await put(token, { kind: "business", name: "ورشة", commercialRegister: "1010000000", vatNumber: "300000000000003" });
    const switched = await put(token, individual);
    expect(switched.statusCode).toBe(200);
    expect(switched.json().factory).toMatchObject({ kind: "individual", commercialRegister: null, vatNumber: null });
    expect((await createRequest(token)).statusCode).toBe(201);
    const back = await put(token, { kind: "business", name: "ورشة", commercialRegister: "1010000000", vatNumber: "300000000000003" });
    expect(back.statusCode).toBe(409);
    expect(back.json().error.code).toBe("kind_locked");
  });

  it("الفرد ما يضيف موظفين (الموظفين للمنشأة بس)", async () => {
    const { token } = await ctx.signIn("0514000006");
    await put(token, individual);
    const r = await ctx.app.inject({ method: "POST", url: "/v1/factory/members", headers: auth(token), payload: { phone: "0514000099", role: "member" } });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("individual_no_members");
  });

  it("موظف المنشأة (مو المدير) ما يعدّل بيانات الحساب", async () => {
    const mgr = await ctx.factory("0514000007");
    await ctx.app.inject({ method: "POST", url: "/v1/factory/members", headers: auth(mgr.token), payload: { phone: "0514000008", role: "member" } });
    const member = await ctx.signIn("0514000008");
    expect((await put(member.token, individual)).statusCode).toBe(403);
  });
});

describe("التحقق من الهوية (نفاذ لاحقًا)", () => {
  it("لو الإعداد مفعّل: الفرد ما يرفع طلب قبل التحقق، وبعد ما يأكّده موظف مخوّل يرفع", async () => {
    const { token } = await ctx.signIn("0514000010");
    const f = (await put(token, { ...individual, idNumber: "2098765432", idType: "iqama" })).json().factory;
    await setSetting(ctx.db, SYS, "individualRequiresVerifiedIdentity", true);
    try {
      const blocked = await createRequest(token);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.code).toBe("identity_unverified");

      const support = await ctx.staff("0550000010", "support");
      const denied = await ctx.app.inject({ method: "POST", url: `/v1/admin/customers/${f.id}/verify-identity`, headers: auth(support.token) });
      expect(denied.statusCode).toBe(403);

      const verifier = await ctx.staff("0550000011", "verification");
      const ok = await ctx.app.inject({ method: "POST", url: `/v1/admin/customers/${f.id}/verify-identity`, headers: auth(verifier.token) });
      expect(ok.statusCode).toBe(200);
      expect((await me(token)).json().factory.identity.status).toBe("verified");
      expect((await createRequest(token)).statusCode).toBe(201);
    } finally {
      await setSetting(ctx.db, SYS, "individualRequiresVerifiedIdentity", false);
    }
  });

  it("تغيير رقم الهوية يلغي التحقق السابق، وتعديل الاسم بنفس الرقم ما يلغيه", async () => {
    const { token } = await ctx.signIn("0514000011");
    const f = (await put(token, individual)).json().factory;
    await ctx.db.query("UPDATE factories SET identity_verified_at=now(), identity_method='manual' WHERE id=$1", [f.id]);
    await put(token, { ...individual, name: "عبدالله محمد السبيعي الثاني" });
    expect((await me(token)).json().factory.identity.status).toBe("verified");
    await put(token, { ...individual, idNumber: "1099999999" });
    expect((await me(token)).json().factory.identity.status).toBe("pending");
  });
});

describe("المزوّد والإدارة", () => {
  it("المزوّد يشوف إن الطلب من «فرد» بدون اسمه، وبعد القبول يشوف النوع مع الاسم", async () => {
    const c = await ctx.signIn("0514000020");
    await put(c.token, individual);
    const requestId = (await createRequest(c.token)).json().request.id;
    const p = await ctx.verifiedProvider("0564000020", ["transport"]);
    const list = await ctx.app.inject({ method: "GET", url: "/v1/provider/requests", headers: auth(p.token) });
    const item = list.json().requests.find((x: { id: string }) => x.id === requestId);
    expect(item.customerKind).toBe("individual");
    expect(JSON.stringify(item)).not.toContain(individual.name);
    const biz = await ctx.factory("0514000021");
    const bizReq = (await createRequest(biz.token)).json().request.id;
    const list2 = await ctx.app.inject({ method: "GET", url: "/v1/provider/requests", headers: auth(p.token) });
    expect(list2.json().requests.find((x: { id: string }) => x.id === bizReq).customerKind).toBe("business");
  });

  it("خدمة العملاء تشوف الرقم مخفي، وموظف التوثيق يشوفه كامل والاطلاع ينكتب في السجل", async () => {
    const c = await ctx.signIn("0514000030");
    const f = (await put(c.token, individual)).json().factory;
    const support = await ctx.staff("0550000030", "support");
    const s = await ctx.app.inject({ method: "GET", url: `/v1/admin/customers/${f.id}`, headers: auth(support.token) });
    expect(s.statusCode).toBe(200);
    expect(s.json().customer.idNumber).toBe("******5678");
    const verifier = await ctx.staff("0550000031", "verification");
    const v = await ctx.app.inject({ method: "GET", url: `/v1/admin/customers/${f.id}`, headers: auth(verifier.token) });
    expect(v.json().customer.idNumber).toBe(individual.idNumber);
    const logs = await ctx.db.query("SELECT 1 FROM audit_log WHERE action='customer.id_number_viewed' AND entity_id=$1", [f.id]);
    expect(logs.length).toBe(1);
    const list = await ctx.app.inject({ method: "GET", url: "/v1/admin/customers?kind=individual", headers: auth(support.token) });
    expect(list.json().customers.every((x: { kind: string }) => x.kind === "individual")).toBe(true);
    expect(JSON.stringify(list.json())).not.toContain(individual.idNumber);
  });

  it("المصنع ما يقدر يفتح مسارات العملاء في اللوحة", async () => {
    const f = await ctx.factory("0514000040");
    const r = await ctx.app.inject({ method: "GET", url: "/v1/admin/customers", headers: auth(f.token) });
    expect(r.statusCode).toBe(403);
  });
});
