// حالات الطلب في قاعدة البيانات لازم تطابق جدول الانتقالات في packages/shared/src/order-flow.ts.
import { REQUEST_STATUSES } from "@mazood/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestCtx, type TestCtx } from "./test-helpers.ts";

let ctx: TestCtx;
beforeAll(async () => { ctx = await createTestCtx(); });
afterAll(async () => { await ctx.close(); });

describe("حالات الطلب في القاعدة", () => {
  it("قيد الحالة في جدول requests يطابق REQUEST_STATUSES", async () => {
    const [c] = await ctx.db.query<{ def: string }>(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'requests_status_check'",
    );
    const inDb = [...c.def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inDb).toEqual([...REQUEST_STATUSES].sort());
  });
});
