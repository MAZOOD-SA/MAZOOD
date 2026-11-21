// سجل الإجراءات: مين سوّى وش ومتى. قاعدة البيانات تمنع تعديله أو حذفه (trigger).
// لا تحط في metadata بيانات شخصية (جوال، هوية): المعرّفات تكفي للرجوع للتفاصيل.
import type { Db, Prisma } from "../db.ts";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.otp_locked"
  | "auth.refresh_reuse"
  | "factory.create"
  | "factory.update"
  | "request.create"
  | "request.cancel";

type Tx = Pick<Db, "auditLog">;

export async function audit(
  db: Tx,
  entry: {
    action: AuditAction;
    actorUserId?: string | null;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
    },
  });
}
