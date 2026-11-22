// المهام الدورية: تشتغل كل دقيقة داخل الخادم (server.ts). اليوم: التأكيد التلقائي، وحفظ حالة الطلبات المنتهية،
// وطلبات الإلغاء اللي ما رد عليها المزوّد في المهلة (تتحوّل بلاغ).
// كل مهمة لازم تكون آمنة لو اشتغلت مرتين أو تأخرت: الحالة الفعلية تنحسب وقت القراءة أصلًا
// (effectiveStatus في orders.ts)، والمهمة بس تثبّتها في القاعدة.
// التنبيهات والتذكيرات تنضاف هنا في الخطوة ١٠.
import type { Db } from "./db.ts";
import { cancellationTimeoutsDue } from "./cancellations.ts";
import { autoConfirmDue } from "./execution.ts";

export const JOBS_INTERVAL_MS = 60_000;

export async function runScheduledJobs(db: Db, now: Date) {
  // الطلب المفتوح اللي عدّت مدته: «انتهى بدون عروض». العروض اللي عليه تبقى، لأن المصنع يقدر يعيد نشره.
  const expired = await db.query<{ id: string }>(
    "UPDATE requests SET status='expired', updated_at=$1 WHERE status='awaiting_offers' AND expires_at <= $1 RETURNING id",
    [now],
  );
  const autoConfirmed = await autoConfirmDue(db, now);
  const cancellationTimeouts = await cancellationTimeoutsDue(db, now);
  return { expired: expired.length, autoConfirmed: autoConfirmed.length, cancellationTimeouts: cancellationTimeouts.length };
}

/** يشغّل المهام كل دقيقة. الخطأ ينكتب في السجل وما يوقف الخادم. يرجّع دالة توقفها. */
export function startScheduledJobs(db: Db, now: () => Date, log: { error(o: unknown, m?: string): void }) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // المرة اللي قبل ما خلصت: ننتظرها
    running = true;
    try {
      await runScheduledJobs(db, now());
    } catch (err) {
      log.error(err, "scheduled jobs failed");
    } finally {
      running = false;
    }
  }, JOBS_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
