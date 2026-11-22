// منطق الدخول: رمز تحقق ثم جلسة. الحدود هنا (لكل رقم) تكمّل حدود الـ IP اللي في app.ts.
import type { StaffRole } from "@mazood/shared";
import { audit } from "./audit.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import { generateOtp, generateSessionToken, hashOtp, hashSessionToken, safeEqualHex } from "./security.ts";
import type { SmsSender } from "./sms.ts";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
/** أقل فاصل بين رمزين لنفس الرقم. */
export const OTP_COOLDOWN_MS = 60_000;
/** أقصى عدد رموز لنفس الرقم خلال ١٠ دقايق. */
export const OTP_MAX_PER_WINDOW = 3;
export const OTP_WINDOW_MS = 10 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 3600_000;

export type SessionUser = {
  id: string;
  phone: string;
  role: "factory" | "provider" | "staff";
  factoryId: string | null;
  /** دور المستخدم داخل مصنعه: مدير أو موظف (سؤال ١٦). null لغير المصانع أو الموظف الموقوف. */
  factoryRole: "manager" | "member" | null;
  providerId: string | null;
  /** دور الموظف داخل الإدارة. null إذا ما كان موظف أو كان موقوف. */
  staffRole: StaffRole | null;
};

export async function requestOtp(
  db: Db,
  sms: SmsSender,
  secret: string,
  phone: string,
  now: Date = new Date(),
): Promise<{ retryAfterSeconds: number }> {
  const recent = await db.query<{ created_at: Date }>(
    "SELECT created_at FROM otp_codes WHERE phone = $1 AND created_at > $2 ORDER BY created_at DESC",
    [phone, new Date(now.getTime() - OTP_WINDOW_MS)],
  );
  if (recent.length >= OTP_MAX_PER_WINDOW) {
    const oldest = new Date(recent[recent.length - 1].created_at).getTime();
    throw new ApiError(429, "otp_rate_limited", undefined, {
      retryAfterSeconds: Math.ceil((oldest + OTP_WINDOW_MS - now.getTime()) / 1000),
    });
  }
  if (recent[0]) {
    const wait = new Date(recent[0].created_at).getTime() + OTP_COOLDOWN_MS - now.getTime();
    if (wait > 0) throw new ApiError(429, "otp_cooldown", undefined, { retryAfterSeconds: Math.ceil(wait / 1000) });
  }

  const code = generateOtp();
  // نخلي الرموز القديمة غير صالحة: رمز واحد فعّال لكل رقم.
  await db.query("UPDATE otp_codes SET consumed_at = $2 WHERE phone = $1 AND consumed_at IS NULL", [phone, now]);
  await db.query("INSERT INTO otp_codes (phone, code_hash, expires_at, created_at) VALUES ($1,$2,$3,$4)", [
    phone,
    hashOtp(secret, phone, code),
    new Date(now.getTime() + OTP_TTL_MS),
    now,
  ]);
  try {
    await sms.send(phone, `رمز التحقق في مزوّد: ${code}\nلا تشاركه مع أحد.`);
  } catch {
    // الإرسال فشل: نبطل الرمز، والمستخدم يقدر يعيد المحاولة.
    await db.query("UPDATE otp_codes SET consumed_at = $2 WHERE phone = $1 AND consumed_at IS NULL", [phone, now]);
    throw new ApiError(503, "sms_unavailable");
  }
  return { retryAfterSeconds: OTP_COOLDOWN_MS / 1000 };
}

export async function verifyOtp(
  db: Db,
  secret: string,
  phone: string,
  code: string,
  now: Date = new Date(),
  /** نوع الحساب لو الرقم جديد. */
  as: "factory" | "provider" = "factory",
): Promise<{ token: string; user: SessionUser }> {
  const result = await db.tx(async (t) => {
    const rows = await t.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM otp_codes
        WHERE phone = $1 AND consumed_at IS NULL AND expires_at > $2
        ORDER BY created_at DESC LIMIT 1`,
      [phone, now],
    );
    const otp = rows[0];
    if (!otp) return { ok: false as const };

    // نزيد المحاولات قبل المقارنة: حتى لو الطلبات توازت ما تقدر تتجاوز الحد.
    const [{ attempts }] = await t.query<{ attempts: number }>(
      "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts",
      [otp.id],
    );
    if (attempts > OTP_MAX_ATTEMPTS) {
      await t.query("UPDATE otp_codes SET consumed_at = $2 WHERE id = $1", [otp.id, now]);
      return { ok: false as const };
    }
    if (!safeEqualHex(otp.code_hash, hashOtp(secret, phone, code))) {
      if (attempts >= OTP_MAX_ATTEMPTS) await t.query("UPDATE otp_codes SET consumed_at = $2 WHERE id = $1", [otp.id, now]);
      return { ok: false as const };
    }
    // استخدام واحد فقط: الشرط consumed_at IS NULL يمنع نجاح طلبين متوازيين بنفس الرمز.
    const used = await t.query("UPDATE otp_codes SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL RETURNING id", [otp.id, now]);
    if (used.length === 0) return { ok: false as const };

    const [user] = await t.query<{ id: string; role: SessionUser["role"]; status: string }>(
      `INSERT INTO users (phone, last_login_at, role) VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET last_login_at = EXCLUDED.last_login_at
       RETURNING id, role, status`,
      [phone, now, as],
    );
    if (user.status !== "active") return { ok: false as const, suspended: true };
    if (user.role === "staff") {
      // موظف أُوقف من الإدارة: ما يدخل.
      const s = await t.query("SELECT 1 FROM staff WHERE user_id = $1 AND active", [user.id]);
      if (s.length === 0) return { ok: false as const, suspended: true };
    }

    if (user.role === "factory") {
      const member = await t.query("SELECT 1 FROM factory_members WHERE user_id = $1", [user.id]);
      if (member.length === 0) {
        // أول دخول لمستخدم جديد: ينفتح له مصنع جديد وهو مديره. (موظفين المصنع اللي يضيفهم المدير
        // ينضافون مع مكانهم في المصنع من قبل، فما يوصلون هنا.)
        const [f] = await t.query<{ id: string }>("INSERT INTO factories DEFAULT VALUES RETURNING id");
        await t.query("INSERT INTO factory_members (user_id, factory_id, role) VALUES ($1,$2,'manager')", [user.id, f.id]);
      }
    }
    const { token, hash } = generateSessionToken();
    await t.query("INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES ($1,$2,$3,$4)", [
      user.id,
      hash,
      new Date(now.getTime() + SESSION_TTL_MS),
      now,
    ]);
    await audit(t, { id: user.id, role: user.role }, "auth.login", { type: "user", id: user.id });
    return { ok: true as const, token, userId: user.id };
  });

  if (!result.ok) {
    // رسالة وحدة لكل الأسباب (غلط، منتهي، موقوف): ما نكشف للمهاجم وش السبب.
    throw new ApiError(400, "otp_invalid");
  }
  const user = await sessionUserByToken(db, result.token, now);
  return { token: result.token, user: user! };
}

/** يرجّع المستخدم صاحب التوكن، أو null إذا التوكن غلط أو منتهي أو ملغي أو الحساب موقوف. */
export async function sessionUserByToken(db: Db, token: string, now: Date = new Date()): Promise<SessionUser | null> {
  const rows = await db.query<{
    id: string;
    phone: string;
    role: SessionUser["role"];
    factory_id: string | null;
    factory_role: SessionUser["factoryRole"];
    provider_id: string | null;
    staff_role: StaffRole | null;
  }>(
    `SELECT u.id, u.phone, u.role, fm.factory_id, fm.role AS factory_role, p.id AS provider_id, st.role AS staff_role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       -- موظف المصنع الموقوف: ما له مصنع (والمسارات ترفضه).
       LEFT JOIN factory_members fm ON fm.user_id = u.id AND fm.active
       LEFT JOIN providers p ON p.user_id = u.id
       LEFT JOIN staff st ON st.user_id = u.id AND st.active
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND u.status = 'active'`,
    [hashSessionToken(token), now],
  );
  const r = rows[0];
  if (!r) return null;
  // موظف موقوف: جلسته ما تشتغل حتى لو ما انتهت.
  if (r.role === "staff" && !r.staff_role) return null;
  return { id: r.id, phone: r.phone, role: r.role, factoryId: r.factory_id, factoryRole: r.factory_role, providerId: r.provider_id, staffRole: r.role === "staff" ? r.staff_role : null };
}

export async function revokeSession(db: Db, token: string, user: SessionUser): Promise<void> {
  await db.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [hashSessionToken(token)]);
  await audit(db, { id: user.id, role: user.role }, "auth.logout", { type: "user", id: user.id });
}
