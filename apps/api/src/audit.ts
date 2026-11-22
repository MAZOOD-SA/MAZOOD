// سجل الإجراءات: مين سوّى وش ومتى. إضافة فقط (قاعدة البيانات نفسها تمنع التعديل والحذف).
// ما نحط في details بيانات حساسة (رمز تحقق، توكن، رقم هوية).
import type { Db } from "./db.ts";

export type Actor = { id: string | null; role: string | null };

export async function audit(
  db: Db,
  actor: Actor,
  action: string,
  entity?: { type: string; id: string },
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    "INSERT INTO audit_log (actor_id, actor_role, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)",
    [actor.id, actor.role, action, entity?.type ?? null, entity?.id ?? null, JSON.stringify(details)],
  );
}
