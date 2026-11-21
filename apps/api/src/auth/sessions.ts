// الجلسات ومفاتيح التجديد.
//   - مفتاح الدخول قصير (15 دقيقة) ويتجدد بمفتاح التجديد.
//   - مفتاح التجديد ينستخدم مرة وحدة ويتبدّل بواحد جديد.
//   - إذا انستخدم مفتاح قديم مرة ثانية، معناها أحد سرقه: تنلغي الجلسة كلها (الحرامي وصاحب الجهاز يطلعون).
import { sha256, generateRefreshToken } from "../lib/crypto.ts";
import { audit } from "../lib/audit.ts";
import { HttpError, unauthorized } from "../lib/errors.ts";
import type { Db } from "../db.ts";
import type { ClientKind } from "@mazood/shared";
import { SESSION_TTL_SECONDS } from "./policy.ts";

const sessionExpiry = (now: Date) => new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

export async function createSession(db: Db, userId: string, client: ClientKind) {
  const now = new Date();
  const refreshToken = generateRefreshToken();
  const session = await db.session.create({
    data: {
      userId,
      client,
      expiresAt: sessionExpiry(now),
      refreshTokens: { create: { tokenHash: sha256(refreshToken) } },
    },
  });
  return { sessionId: session.id, refreshToken };
}

/** يبدّل مفتاح التجديد بواحد جديد. يرجع الجلسة والمفتاح الجديد، أو يرمي unauthorized. */
export async function rotateRefreshToken(db: Db, presented: string) {
  const now = new Date();
  const record = await db.refreshToken.findUnique({
    where: { tokenHash: sha256(presented) },
    include: { session: { include: { user: true } } },
  });
  if (!record) throw unauthorized();
  const { session } = record;
  if (session.revokedAt || session.expiresAt <= now) throw unauthorized();

  // نعلّم المفتاح «مستخدم» بشرط إنه ما انستخدم قبل. لو count = 0 فهو مستخدم من قبل: سرقة.
  const marked = await db.refreshToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: now } });
  if (marked.count === 0) {
    await revokeSession(db, session.id, "refresh_reuse");
    await audit(db, { action: "auth.refresh_reuse", actorUserId: session.userId, entityType: "session", entityId: session.id });
    throw unauthorized();
  }

  if (session.user.status !== "active") {
    await revokeSession(db, session.id, "suspended");
    throw new HttpError(403, "account_suspended");
  }

  const refreshToken = generateRefreshToken();
  await db.$transaction([
    db.refreshToken.create({ data: { sessionId: session.id, tokenHash: sha256(refreshToken) } }),
    db.session.update({ where: { id: session.id }, data: { lastUsedAt: now, expiresAt: sessionExpiry(now) } }),
  ]);
  return { sessionId: session.id, userId: session.userId, refreshToken };
}

export async function revokeSession(db: Db, sessionId: string, reason: string): Promise<void> {
  await db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}

/** يلاقي الجلسة من مفتاح التجديد (للخروج). ما يتأكد من صلاحيته: الخروج مسموح دائمًا. */
export async function sessionIdFromRefreshToken(db: Db, presented: string): Promise<string | null> {
  const record = await db.refreshToken.findUnique({ where: { tokenHash: sha256(presented) }, select: { sessionId: true } });
  return record?.sessionId ?? null;
}
