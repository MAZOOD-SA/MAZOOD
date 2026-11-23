// التذكيرات اللي تطلع من الوقت (مو من ضغطة أحد). تشتغل مع المهام كل دقيقة (jobs.ts).
// كل تذكير له مفتاح ثابت (dedupe_key)، فلو اشتغلت المهمة مرتين أو تأخرت، التذكير ما يتكرر.
import { EXPIRY_WARNING_DAYS } from "@mazood/shared";
import type { Db } from "./db.ts";
import { todayRiyadh, addDays } from "./http.ts";
import { customerUsers, notify, providerUser } from "./notify.ts";
import { getSettings } from "./settings.ts";

/** أول ٤٠ حرف من تفاصيل الطلب: عنوان التنبيه (نص العميل نفسه، فما يحتاج ترجمة). */
export const titleOf = (details: string) => (details.length > 40 ? `${details.slice(0, 40)}…` : details);

export async function remindersDue(db: Db, now: Date) {
  const settings = await getSettings(db);
  let count = 0;

  // ١. تذكير العميل بتأكيد الاستلام بعد «تم التنفيذ» (الإعداد confirmReminderHours، الافتراضي ٢٤ و٤٨ ساعة).
  for (const h of settings.confirmReminderHours) {
    const due = await db.query<{ id: string; request_id: string; factory_id: string; details: string }>(
      `SELECT o.id, o.request_id, o.factory_id, r.details FROM orders o JOIN requests r ON r.id = o.request_id
        WHERE o.state='open' AND r.status='delivered' AND o.delivered_at <= $1
          AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe_key = 'confirm:' || o.id || ':' || $2::text)
        LIMIT 200`,
      [new Date(now.getTime() - h * 3600_000), String(h)],
    );
    for (const o of due) {
      await notify(db, await customerUsers(db, o.factory_id), "confirm_reminder", { title: titleOf(o.details), link: { screen: "request", id: o.request_id } }, now, `confirm:${o.id}:${h}`);
      count++;
    }
  }

  // ٢. مستند مزوّد مقبول ينتهي خلال ٣٠ يوم (تنبيه مرة وحدة لكل مستند).
  const today = todayRiyadh(now);
  const docs = await db.query<{ id: string; provider_id: string; doc_type: string; expires_on: string }>(
    `SELECT d.id, d.provider_id, d.doc_type, to_char(d.expires_on, 'YYYY-MM-DD') AS expires_on FROM provider_documents d
      WHERE d.status='approved' AND d.expires_on >= $1::date AND d.expires_on <= $2::date
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe_key = 'doc:' || d.id)
      LIMIT 200`,
    [today, addDays(today, EXPIRY_WARNING_DAYS)],
  );
  for (const d of docs) {
    const days = Math.round((Date.parse(d.expires_on) - Date.parse(today)) / 86400_000);
    await notify(db, [await providerUser(db, d.provider_id)], "document_expiring", { title: d.doc_type, n: days, link: { screen: "provider_account" } }, now, `doc:${d.id}`);
    count++;
  }

  // ٣. اشتراك البائع في السوق ينتهي قريب (الإعداد market.expiryWarningDays). مرة وحدة لكل تاريخ انتهاء.
  const warnUntil = new Date(now.getTime() + settings.market.expiryWarningDays * 86400_000);
  const subs = await db.query<{ subject_id: string; ends_at: Date }>(
    `SELECT s.subject_id, max(s.ends_at) AS ends_at FROM subscriptions s WHERE s.subject_type='factory'
      GROUP BY s.subject_id HAVING max(s.ends_at) > $1 AND max(s.ends_at) <= $2`,
    [now, warnUntil],
  );
  for (const s of subs) {
    const ends = new Date(s.ends_at);
    const days = Math.max(1, Math.ceil((ends.getTime() - now.getTime()) / 86400_000));
    const key = `sub:${s.subject_id}:${ends.toISOString().slice(0, 10)}`;
    const managers = await customerUsers(db, s.subject_id, true);
    const before = await db.query("SELECT 1 FROM notifications WHERE dedupe_key=$1 LIMIT 1", [key]);
    if (before.length) continue;
    await notify(db, managers, "subscription_ending", { n: days, link: { screen: "store" } }, now, key);
    count++;
  }
  return count;
}
