// اختبارات طبقة الحماية الثانية (RLS): حتى لو استعلام ما فيه فلترة برقم المصنع،
// قاعدة البيانات نفسها ما ترجع ولا تعدّل إلا بيانات المصنع المحدد للمعاملة.
import { describe, expect, it } from "vitest";
import { withFactoryScope } from "../src/scope";
import { makeTestApp, validRequest } from "./helpers";

const t = await makeTestApp();

async function twoFactoriesWithRequests() {
  const a = await t.factoryUser("مصنع أ");
  const b = await t.factoryUser("مصنع ب");
  for (const u of [a, b]) {
    await t.call("POST", "/requests", { token: u.token, body: validRequest });
    await t.call("POST", "/requests", { token: u.token, body: validRequest });
  }
  await t.scheduler.runAll(); // عروض وهمية على كل الطلبات
  return { a, b };
}

describe("قاعدة البيانات تعزل بيانات كل مصنع (RLS)", () => {
  it("استعلام بدون أي فلترة يرجع طلبات المصنع المحدد بس", async () => {
    const { a, b } = await twoFactoriesWithRequests();
    const seen = await withFactoryScope(t.db, a.factoryId, (tx) => tx.request.findMany());
    expect(seen.length).toBe(2);
    expect(seen.every((r) => r.factoryId === a.factoryId)).toBe(true);
    const seenB = await withFactoryScope(t.db, b.factoryId, (tx) => tx.request.findMany());
    expect(seenB.every((r) => r.factoryId === b.factoryId)).toBe(true);
  });

  it("العروض كذلك: بس العروض على طلبات المصنع", async () => {
    const { a } = await twoFactoriesWithRequests();
    const offers = await withFactoryScope(t.db, a.factoryId, (tx) => tx.offer.findMany({ include: { request: true } }));
    expect(offers.length).toBe(4);
    expect(offers.every((o) => o.request.factoryId === a.factoryId)).toBe(true);
  });

  it("تعديل بدون فلترة ما يلمس طلبات مصنع ثاني", async () => {
    const { a, b } = await twoFactoriesWithRequests();
    const res = await withFactoryScope(t.db, a.factoryId, (tx) => tx.request.updateMany({ data: { location: "تعديل" } }));
    expect(res.count).toBe(2);
    const bRequests = await t.db.request.findMany({ where: { factoryId: b.factoryId } });
    expect(bRequests.every((r) => r.location !== "تعديل")).toBe(true);
  });

  it("ما ينفع ينشئ طلب باسم مصنع ثاني", async () => {
    const { a, b } = await twoFactoriesWithRequests();
    await expect(
      withFactoryScope(t.db, a.factoryId, (tx) =>
        tx.request.create({ data: { factoryId: b.factoryId, createdById: a.userId, category: "transport", typeId: "flatbed", details: "محاولة", location: "سدير", when: "today" } }),
      ),
    ).rejects.toThrow();
  });

  it("بيانات مصنع ثاني ما تظهر حتى في جدول المصانع", async () => {
    const { a } = await twoFactoriesWithRequests();
    const factories = await withFactoryScope(t.db, a.factoryId, (tx) => tx.factory.findMany());
    expect(factories.map((f) => f.id)).toEqual([a.factoryId]);
  });

  it("التحديد ينتهي مع نهاية المعاملة، وما ينتقل لاستعلام بعده", async () => {
    const { a } = await twoFactoriesWithRequests();
    await withFactoryScope(t.db, a.factoryId, (tx) => tx.request.findMany());
    const all = await t.db.factory.count();
    expect(all).toBeGreaterThan(1);
  });
});
