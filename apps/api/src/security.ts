// أدوات الأمان: توليد الرموز والتوكنات، وبصماتها. ما نحفظ رمز تحقق ولا توكن بنصّه أبدًا.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** رمز تحقق من ٦ أرقام، من مولّد عشوائي آمن (مو Math.random). */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** بصمة الرمز مربوطة بالرقم وبسر الخادم: تسريب الجدول وحده ما يكشف الرموز. */
export function hashOtp(secret: string, phone: string, code: string): string {
  return createHmac("sha256", secret).update(`otp:${phone}:${code}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** توكن جلسة: ٣٢ بايت عشوائي. اللي يوصل للعميل هو التوكن، واللي ينحفظ هو SHA-256 له. */
export function generateSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** يخفي رقم الجوال في السجلات: +966501234567 → +9665*****67 */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 5)}*****${phone.slice(-2)}`;
}
