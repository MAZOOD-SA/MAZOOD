// أدوات مشتركة لكل المسارات: التحقق من الجلسة والصلاحيات وقراءة المدخلات.
// القاعدة: هوية المستخدم ودوره وجهته (مصنع/مزوّد) تجي من الجلسة في الخادم، ما تجي أبدًا من العميل.
import { can, type Permission, type StaffRole } from "@mazood/shared";
import type { FastifyRequest } from "fastify";
import type { ZodTypeAny, z } from "zod";
import { sessionUserByToken, type SessionUser } from "./auth.ts";
import type { Config } from "./config.ts";
import type { CryptoBox } from "./crypto-box.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import type { SmsSender } from "./sms.ts";
import type { FileStorage } from "./storage.ts";

export type Ctx = {
  db: Db;
  sms: SmsSender;
  config: Config;
  storage: FileStorage;
  box: CryptoBox;
  now: () => Date;
  strictRateLimits: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
    token?: string;
  }
}

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> => schema.parse(data);

export function makeGuards(ctx: Ctx) {
  async function authenticate(req: FastifyRequest): Promise<SessionUser> {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token || token.length > 200) throw new ApiError(401, "unauthorized");
    const user = await sessionUserByToken(ctx.db, token, ctx.now());
    if (!user) throw new ApiError(401, "unauthorized");
    req.user = user;
    req.token = token;
    return user;
  }

  return {
    authenticate,
    async requireFactory(req: FastifyRequest) {
      const user = await authenticate(req);
      if (user.role !== "factory" || !user.factoryId) throw new ApiError(403, "forbidden");
      return { user, factoryId: user.factoryId };
    },
    async requireProviderUser(req: FastifyRequest) {
      const user = await authenticate(req);
      if (user.role !== "provider") throw new ApiError(403, "forbidden");
      return user;
    },
    /** موظف فعّال عنده الصلاحية المطلوبة. */
    async requireStaff(req: FastifyRequest, permission?: Permission): Promise<SessionUser & { staffRole: StaffRole }> {
      const user = await authenticate(req);
      if (user.role !== "staff" || !user.staffRole) throw new ApiError(403, "forbidden");
      if (permission && !can(user.staffRole, permission)) throw new ApiError(403, "forbidden");
      return user as SessionUser & { staffRole: StaffRole };
    },
  };
}

export type Guards = ReturnType<typeof makeGuards>;

export const actorOf = (u: SessionUser) => ({ id: u.id, role: u.staffRole ?? u.role });

/** اليوم بتوقيت السعودية بصيغة YYYY-MM-DD (المستندات تنتهي بالتاريخ، مو بالساعة). */
export function todayRiyadh(now: Date): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}
