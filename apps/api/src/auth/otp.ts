// رموز التحقق (OTP): الطلب والتحقق، مع حدود المحاولات.
// الأمان:
//   - الرمز من مولّد آمن، ويُحفظ كبصمة HMAC مربوطة بالرقم (ما يُحفظ كنص أبدًا).
//   - الرد على طلب الرمز نفسه دائمًا، سواء الرقم مسجّل ولا لا، عشان ما ينعرف مين مسجّل.
//   - كل محاولة تحقق تُحسب قبل المقارنة بتحديث ذرّي، فما ينفع إرسال محاولات كثيرة بنفس اللحظة.
//   - المقارنة بوقت ثابت.
import { HttpError } from "../lib/errors.ts";
import { generateOtpCode, hmac, safeEqual } from "../lib/crypto.ts";
import { audit } from "../lib/audit.ts";
import type { Db } from "../db.ts";
import type { SmsSender } from "../sms/index.ts";
import { OTP_LIMITS, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from "./policy.ts";

const MIN = 60_000;

export function hashOtp(pepper: string, phone: string, code: string): string {
  return hmac(pepper, `otp:${phone}:${code}`);
}

export function hashIp(pepper: string, ip: string): string {
  return hmac(pepper, `ip:${ip}`);
}

export function otpMessage(code: string): string {
  return `رمز الدخول إلى مزوّد: ${code}\nلا تعطيه لأي أحد، ولا أحد من مزوّد بيطلبه منك.`;
}

/** كم ثانية باقية لين تطلع أقدم محاولة من النافذة الزمنية. */
function retryAfter(oldest: Date, windowMs: number, now: Date): number {
  return Math.max(1, Math.ceil((oldest.getTime() + windowMs - now.getTime()) / 1000));
}

export async function requestOtp(
  deps: { db: Db; sms: SmsSender; pepper: string },
  input: { phone: string; ip: string },
): Promise<{ expiresInSeconds: number }> {
  const { db, sms, pepper } = deps;
  const now = new Date();
  const ipHash = hashIp(pepper, input.ip);
  const code = generateOtpCode();

  await db.$transaction(async (tx) => {
    // قفل على مستوى الرقم داخل المعاملة: طلبين بنفس اللحظة لنفس الرقم يمشون واحد ورا الثاني،
    // فما ينفع أحد يتجاوز الحد بإرسال طلبات متزامنة.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"otp:" + input.phone}))`;

    const windows = [
      { where: { phone: input.phone }, ms: 15 * MIN, max: OTP_LIMITS.perPhone15Min },
      { where: { phone: input.phone }, ms: 24 * 60 * MIN, max: OTP_LIMITS.perPhoneDay },
      { where: { ipHash }, ms: 60 * MIN, max: OTP_LIMITS.perIpHour },
    ];
    for (const w of windows) {
      const since = new Date(now.getTime() - w.ms);
      const recent = await tx.otpChallenge.findMany({
        where: { ...w.where, createdAt: { gt: since } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
        take: w.max,
      });
      if (recent.length >= w.max) {
        throw new HttpError(429, "rate_limited", { retryAfterSeconds: retryAfter(recent[0]!.createdAt, w.ms, now) });
      }
    }

    // الرمز الجديد يلغي أي رمز قبله لنفس الرقم.
    await tx.otpChallenge.updateMany({
      where: { phone: input.phone, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
    await tx.otpChallenge.create({
      data: {
        phone: input.phone,
        codeHash: hashOtp(pepper, input.phone, code),
        ipHash,
        expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      },
    });
  });

  // الإرسال بعد حفظ الرمز. إذا فشل، المحاولة تنحسب من الحد (عشان ما ينستغل الفشل لتجاوزه).
  try {
    await sms.send(input.phone, otpMessage(code));
  } catch {
    throw new HttpError(502, "sms_failed");
  }
  return { expiresInSeconds: OTP_TTL_SECONDS };
}

/**
 * يتحقق من الرمز. إذا صح، يُستهلك (ما ينفع ينستخدم مرة ثانية) ويرجع true.
 * إذا غلط، يرمي code_wrong مع عدد المحاولات الباقية. لما توصل صفر ينلغي الرمز، ويلزم طلب رمز جديد.
 */
export async function verifyOtp(deps: { db: Db; pepper: string }, input: { phone: string; code: string }): Promise<void> {
  const { db, pepper } = deps;
  const now = new Date();

  const challenge = await db.otpChallenge.findFirst({
    where: { phone: input.phone, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) throw new HttpError(400, "code_expired");

  // نحجز المحاولة أول (attempts + 1) بشرط إنها ما وصلت الحد. التحديث ذرّي في قاعدة البيانات.
  const reserved = await db.otpChallenge.updateMany({
    where: { id: challenge.id, attempts: { lt: OTP_MAX_ATTEMPTS }, consumedAt: null, invalidatedAt: null },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) throw new HttpError(400, "code_expired");
  const attempts = challenge.attempts + 1;

  if (!safeEqual(hashOtp(pepper, input.phone, input.code), challenge.codeHash)) {
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
    if (attemptsLeft === 0) {
      await db.otpChallenge.update({ where: { id: challenge.id }, data: { invalidatedAt: now } });
      await audit(db, { action: "auth.otp_locked", entityType: "otp_challenge", entityId: challenge.id });
    }
    throw new HttpError(400, "code_wrong", { attemptsLeft });
  }

  // الرمز صح: نستهلكه. الشرط consumedAt: null يضمن إن طلبين بنفس الرمز ما يدخلون الاثنين.
  const consumed = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, invalidatedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) throw new HttpError(400, "code_expired");
}
