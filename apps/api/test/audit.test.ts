// سجل الإجراءات: قاعدة البيانات نفسها تمنع تعديله أو حذفه.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit } from "../src/lib/audit.ts";
import { setupApp, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeAll(async () => {
  t = await setupApp();
});
afterAll(async () => t.close());

describe("audit_log", () => {
  it("الإضافة مسموحة", async () => {
    await audit(t.db, { action: "auth.logout", entityType: "test", entityId: "add" });
    expect(await t.db.auditLog.count({ where: { entityType: "test", entityId: "add" } })).toBe(1);
  });

  it("التعديل ممنوع (حتى بأمر SQL مباشر)", async () => {
    await audit(t.db, { action: "auth.logout", entityType: "test", entityId: "update" });
    await expect(t.db.auditLog.updateMany({ where: { entityId: "update" }, data: { action: "x" } })).rejects.toThrow();
    await expect(t.db.$executeRawUnsafe(`UPDATE audit_log SET action = 'x' WHERE entity_id = 'update'`)).rejects.toThrow(/append-only/);
    expect((await t.db.auditLog.findFirstOrThrow({ where: { entityId: "update" } })).action).toBe("auth.logout");
  });

  it("الحذف والتفريغ ممنوعين", async () => {
    await audit(t.db, { action: "auth.logout", entityType: "test", entityId: "delete" });
    await expect(t.db.auditLog.deleteMany({ where: { entityId: "delete" } })).rejects.toThrow();
    await expect(t.db.$executeRawUnsafe(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
    await expect(t.db.$executeRawUnsafe(`TRUNCATE audit_log`)).rejects.toThrow(/append-only/);
    expect(await t.db.auditLog.count({ where: { entityId: "delete" } })).toBe(1);
  });
});
