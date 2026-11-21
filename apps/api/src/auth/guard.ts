// الصلاحيات. كل مسار محمي يمر على requireAuth ثم requireRole.
// القاعدة: هوية المستخدم ودوره ومصنعه تُعرف من الجلسة في الخادم بس، وما نصدّق أي شي يرسله التطبيق.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@mazood/shared";
import { HttpError, forbidden, unauthorized } from "../lib/errors.ts";
import type { Db } from "../db.ts";
import type { AccessTokens } from "./tokens.ts";

export type AuthContext = { userId: string; sessionId: string; role: UserRole };

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export function makeRequireAuth(db: Db, tokens: AccessTokens) {
  return async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    const claims = await tokens.verify(header.slice(7));
    if (!claims) throw unauthorized();

    // نتأكد إن الجلسة ما انلغت (خروج، أو كشف سرقة)، وإن الحساب ما انوقف.
    const session = await db.session.findUnique({
      where: { id: claims.sid },
      select: { userId: true, revokedAt: true, expiresAt: true, user: { select: { role: true, status: true } } },
    });
    if (!session || session.userId !== claims.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw unauthorized();
    }
    if (session.user.status !== "active") throw new HttpError(403, "account_suspended");

    req.auth = { userId: claims.sub, sessionId: claims.sid, role: session.user.role };
  };
}

export function requireRole(...roles: UserRole[]) {
  return async function (req: FastifyRequest): Promise<void> {
    if (!req.auth) throw unauthorized();
    if (!roles.includes(req.auth.role)) throw forbidden();
  };
}

/** المستخدم الحالي بعد requireAuth. */
export function authOf(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
