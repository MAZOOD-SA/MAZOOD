// أدوات الأمان: توليد الرموز وبصمتها ومقارنتها.
//
// ليش «بصمة» (hash) وما نحفظ الرمز نفسه؟ لو أحد وصل لقاعدة البيانات (تسريب، أو نسخة احتياطية ضايعة)
// ما يقدر يستخدم رموز التحقق أو جلسات الدخول، لأن المحفوظ بصمتها بس، وما ترجع للرمز الأصلي.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** رمز تحقق من ٦ أرقام، عشوائي بأمان (مو Math.random). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * بصمة رمز التحقق. نستخدم HMAC مع مفتاح سري (OTP_SECRET) لأن الرموز ٦ أرقام بس،
 * فبصمة عادية ممكن تنكسر بتجربة المليون احتمال. بدون المفتاح ما ينفع.
 * الجوال داخل في البصمة، فنفس الرمز لجوالين مختلفين يعطي بصمتين مختلفة.
 */
export function hashOtp(secret: string, phone: string, code: string): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

/** مقارنة بوقت ثابت، عشان ما يقدر أحد يخمّن الرمز من سرعة الرد. */
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** رمز جلسة الدخول: ٣٢ بايت عشوائية. هذا اللي يحمله التطبيق. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** بصمة رمز الجلسة. الرمز عشوائي وطويل، فبصمة SHA-256 العادية كافية. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** يخفي رقم الجوال في السجلات: +966551234567 → +96655*****67 */
export function maskPhone(phone: string): string {
  return phone.length > 8 ? `${phone.slice(0, 6)}*****${phone.slice(-2)}` : "***";
}
