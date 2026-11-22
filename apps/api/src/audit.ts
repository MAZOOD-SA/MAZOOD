// سجل الإجراءات: مين سوّى وش، ومتى، وعلى أي شي. ما ينحذف ولا يتعدّل (قاعدة البيانات تمنع هذا).
// القاعدة: أي إجراء يغيّر حساب أو طلب أو مبلغ، يُسجَّل هنا.
import type { Db } from "./db";
import type { Prisma } from "./generated/prisma/client";

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  entityType: "user" | "session" | "factory" | "request" | "offer" | "setting";
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
};

type Tx = Pick<Db, "auditLog">;

export async function audit(db: Tx, e: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: e.actorUserId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      metadata: e.metadata ?? {},
      ip: e.ip ?? null,
    },
  });
}
