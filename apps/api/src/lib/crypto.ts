// أدوات التشفير الصغيرة. كلها من مكتبة node:crypto الأصلية، بدون مكتبات خارجية.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** بصمة HMAC-SHA256 بمفتاح سري. نستخدمها لرموز التحقق وعناوين IP. */
export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** بصمة SHA-256 بدون مفتاح. تكفي لمفاتيح التجديد لأنها عشوائية وطويلة أصلًا. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** مقارنة نصين بوقت ثابت، عشان ما يقدر أحد يخمّن الرمز من سرعة الرد. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** رمز تحقق من ٦ أرقام، من مولّد أرقام عشوائية آمن (مو Math.random). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** مفتاح تجديد عشوائي: ٣٢ بايت (٢٥٦ بت). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}
