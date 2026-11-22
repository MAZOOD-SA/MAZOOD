// المرحلة ٤، الخطوة ١: المدن (القرار ٢٠) والقسم السابع (مكافحة الحشرات والقوارض).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb } from "./db.ts";
import { migrate } from "./migrate.ts";
import { auth, createTestCtx, providerProfile, validRequest, type TestCtx } from "./test-helpers.ts";

describe("نقل البيانات القديمة للمدن", () => {
  it("المصانع والطلبات القديمة تصير في سدير، والحقل النصي ينشال", async () => {
    const db = await createPgliteDb();
    await migrate(db, () => {}, { until: "002_providers_staff.sql" });
    const [f] = await db.query<{ id: string }>("INSERT INTO factories (name, city) VALUES ('مصنع قديم','سدير') RETURNING id");
    const [f2] = await db.query<{ id: string }>("INSERT INTO factories DEFAULT VALUES RETURNING id");
    await db.query(
      `INSERT INTO requests (factory_id, category, type_id, details, location, needed_when)
       VALUES ($1,'transport','flatbed','طلب قديم قبل المدن','سدير','today')`,
      [f.id],
    );
    await migrate(db);
    const factories = await db.query<{ id: string; city_id: string | null }>("SELECT id, city_id FROM factories");
    expect(factories.find((x) => x.id === f.id)!.city_id).toBe("sudair");
    expect(factories.find((x) => x.id === f2.id)!.city_id).toBe("sudair");
    const [r] = await db.query<{ city_id: string }>("SELECT city_id FROM requests");
    expect(r.city_id).toBe("sudair");
    const cols = await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='factories' AND column_name='city'");
    expect(cols).toHaveLength(0);
    await db.close();
  });
});

describe("المدن والقسم السابع", () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await createTestCtx(); });
  afterAll(async () => { await ctx.close(); });

  it("قائمة المدن الفعّالة فيها سدير", async () => {
    const r = await ctx.app.inject({ method: "GET", url: "/v1/cities" });
    expect(r.statusCode).toBe(200);
    expect(r.json().cities).toEqual([{ id: "sudair", ar: "سدير", en: "Sudair" }]);
  });

  it("طلب في قسم المكافحة ينحفظ، ومعه المدينة والمنطقة", async () => {
    const { token } = await ctx.signIn("0513000001");
    const r = await ctx.app.inject({
      method: "POST",
      url: "/v1/requests",
      headers: auth(token),
      payload: { ...validRequest, category: "pest_control", typeId: "rodents", details: "مكافحة فيران في المستودع" },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().request.category).toBe("pest_control");
    expect(r.json().request.cityId).toBe("sudair");
    expect(r.json().request.area).toBe(validRequest.area);
  });

  it("نوع ما يتبع قسم المكافحة ينرفض", async () => {
    const { token } = await ctx.signIn("0513000002");
    const r = await ctx.app.inject({
      method: "POST",
      url: "/v1/requests",
      headers: auth(token),
      payload: { ...validRequest, category: "pest_control", typeId: "flatbed" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("مدينة غير موجودة أو موقوفة ترجع خطأ واضح", async () => {
    const { token } = await ctx.signIn("0513000003");
    const r = await ctx.app.inject({ method: "POST", url: "/v1/requests", headers: auth(token), payload: { ...validRequest, cityId: "riyadh" } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("city_unavailable");
  });

  it("المزوّد يقدر يختار ٧ أقسام، ومدنه تنحفظ (الافتراضي كل المدن الفعّالة)", async () => {
    const { token } = await ctx.signIn("0513000004", "provider");
    const all = ["transport", "maintenance", "materials", "security", "cleaning", "customs", "pest_control"];
    const r = await ctx.app.inject({ method: "PUT", url: "/v1/provider/profile", headers: auth(token), payload: { ...providerProfile, categories: all } });
    expect(r.statusCode).toBe(200);
    expect(r.json().provider.categories).toEqual(all);
    expect(r.json().provider.cityIds).toEqual(["sudair"]);
  });

  it("المصنع ياخذ المدينة الوحيدة الفعّالة تلقائيًا، وبياناته تكتمل بدون خانة مدينة", async () => {
    const { token } = await ctx.signIn("0513000005");
    const r = await ctx.app.inject({
      method: "PUT",
      url: "/v1/factory",
      headers: auth(token),
      payload: { name: "مصنع تجريبي", commercialRegister: "1010000000", vatNumber: "300000000000003" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().factory.cityId).toBe("sudair");
    expect(r.json().factory.city).toEqual({ ar: "سدير", en: "Sudair" });
    expect(r.json().factory.profileComplete).toBe(true);
  });
});
