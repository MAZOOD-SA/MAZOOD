// مفتاح الدخول القصير (JWT موقّع بـ HS256). فيه رقم الجلسة والمستخدم والدور بس.
// الخادم يتأكد من الجلسة في قاعدة البيانات مع كل طلب، فالخروج يوقف المفتاح فورًا.
import { jwtVerify, SignJWT } from "jose";
import { ACCESS_TOKEN_TTL_SECONDS } from "./policy.ts";

const ISSUER = "mazood-api";
const AUDIENCE = "mazood-app";

export type AccessClaims = { sub: string; sid: string };

export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessClaims, now = new Date()): Promise<string> {
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({ sid: claims.sid })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.key);
  }

  /** يرجع المحتوى إذا المفتاح سليم وما انتهى، وإلا null. */
  async verify(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
      return { sub: payload.sub, sid: payload.sid };
    } catch {
      return null;
    }
  }
}
