// التنبيهات (القرار ٤٩): مكان واحد للكتابة، ومكان واحد للإرسال.
//
//  ١. notify(): أي حدث (قبول عرض، رد على طلب شراء...) يكتب صف لكل مستخدم في جدول notifications،
//     ويحدد القنوات: إشعار جوال لو الحدث يدعمه والمستخدم ما طفّاه، ورسالة نصية لو الحدث في الإعداد
//     smsEvents والمستخدم ما طفّاها. الشاشات والمسارات ما ترسل شي بنفسها.
//  ٢. deliverPending(): مهمة كل دقيقة (jobs.ts) ترسل الصفوف اللي تنتظر، وتعيد المحاولة لو فشل
//     (بعد ١ ثم ٥ ثم ٣٠ دقيقة ثم ساعتين)، وبعدها «فشل» ونكتب السبب.
//
// الرسائل النصية من sms.ts (الحين تطبع في الطرفية لين يتحدد المزوّد). إشعارات الجوال من Expo (PushSender تحت).
import { NOTIFICATION_EVENTS, NOTIFY_RETRY_MINUTES, notificationText, type NotificationEvent, type NotificationLink } from "@mazood/shared";
import type { Db } from "./db.ts";
import { getSettings } from "./settings.ts";
import type { SmsSender } from "./sms.ts";

export type NotificationData = { title?: string; n?: number; link?: NotificationLink };

/**
 * يكتب تنبيه لكل مستخدم. dedupeKey: نفس المفتاح لنفس المستخدم ما ينكتب مرتين (مثل تذكير، أو «عروض جديدة» مرة كل ساعة).
 * يشتغل داخل نفس العملية (transaction) اللي سوت الحدث لو انعطى t، فلو فشل الحدث ما ينكتب تنبيه.
 */
export async function notify(db: Db, userIds: (string | null | undefined)[], event: NotificationEvent, data: NotificationData, now: Date, dedupeKey?: string) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const def = NOTIFICATION_EVENTS[event];
  const { smsEvents } = await getSettings(db);
  const smsOn = !!def.sms && (smsEvents as string[]).includes(def.sms);
  for (const userId of ids) {
    const [prefs] = await db.query<{ sms: boolean; push: boolean; muted: string[] }>("SELECT sms, push, muted FROM notification_prefs WHERE user_id=$1", [userId]);
    const muted = prefs?.muted?.includes(event) ?? false;
    const sms = smsOn && !muted ? ((prefs?.sms ?? true) ? "pending" : "skipped") : "none";
    const push = def.push && !muted ? ((prefs?.push ?? true) ? "pending" : "skipped") : "none";
    await db.query(
      `INSERT INTO notifications (user_id, event, data, dedupe_key, sms_status, push_status, next_attempt_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [userId, event, JSON.stringify(data), dedupeKey ?? null, sms, push, now],
    );
  }
}

/** مستخدمين العميل (المنشأة أو الفرد) الفعّالين. onlyManagers: للقرارات (مثل الترشيح). */
export async function customerUsers(db: Db, factoryId: string, onlyManagers = false): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `SELECT fm.user_id FROM factory_members fm JOIN users u ON u.id = fm.user_id
      WHERE fm.factory_id=$1 AND fm.active AND u.status='active' AND ($2::boolean = false OR fm.role='manager')`,
    [factoryId, onlyManagers],
  );
  return rows.map((r) => r.user_id);
}

/** مستخدم المزوّد. */
export async function providerUser(db: Db, providerId: string): Promise<string | null> {
  const [r] = await db.query<{ user_id: string | null }>("SELECT user_id FROM providers WHERE id=$1", [providerId]);
  return r?.user_id ?? null;
}

// ───────── الإرسال ─────────

export interface PushSender {
  /** يرسل إشعار لمجموعة رموز. يرجّع الرموز اللي Expo قال إنها ما عادت صالحة (نلغيها). */
  send(tokens: string[], title: string, body: string, data: object): Promise<{ invalidTokens: string[] }>;
}

/** بدون إعداد إشعارات (الحين، والاختبارات): ما نرسل شي، والإشعار ينحسب «skipped». */
export const noPush: PushSender | null = null;

/**
 * خدمة إشعارات Expo (https://docs.expo.dev/push-notifications/sending-notifications/). مجانية.
 * تحتاج حساب Expo ومشروع Firebase لأجهزة Android باسم الشركة (docs/services.md).
 */
export function expoPush(accessToken: string | undefined, fetchFn: typeof fetch = fetch): PushSender {
  return {
    async send(tokens, title, body, data) {
      const res = await fetchFn("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify(tokens.map((to) => ({ to, title, body, data, sound: "default" }))),
      });
      if (!res.ok) throw new Error(`expo push ${res.status}`);
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      const invalidTokens = (json.data ?? []).flatMap((r, i) => (r.status === "error" && r.details?.error === "DeviceNotRegistered" ? [tokens[i]] : []));
      return { invalidTokens };
    },
  };
}

type Row = {
  id: string;
  user_id: string;
  event: NotificationEvent;
  data: NotificationData;
  sms_status: string;
  push_status: string;
  attempts: number;
};

/** يرسل التنبيهات اللي تنتظر. آمنة لو اشتغلت مرتين: كل صف يتحدّث بعد ما ينرسل. */
export async function deliverPending(db: Db, deps: { sms: SmsSender; push: PushSender | null }, now: Date) {
  const rows = await db.query<Row>(
    `SELECT id, user_id, event, data, sms_status, push_status, attempts FROM notifications
      WHERE (sms_status='pending' OR push_status='pending') AND next_attempt_at <= $1
      ORDER BY next_attempt_at LIMIT 200`,
    [now],
  );
  let sent = 0;
  for (const n of rows) {
    // الرسائل والإشعارات بالعربي (اللغة الافتراضية). لما نحفظ لغة المستخدم، نرسل بلغته.
    const text = notificationText(n.event, n.data, "ar");
    let sms = n.sms_status;
    let push = n.push_status;
    const errors: string[] = [];
    if (sms === "pending") {
      try {
        const [u] = await db.query<{ phone: string }>("SELECT phone FROM users WHERE id=$1", [n.user_id]);
        await deps.sms.send(u.phone, `مزوّد: ${text}`);
        sms = "sent";
      } catch (e) {
        errors.push(`sms: ${(e as Error).message}`);
      }
    }
    if (push === "pending") {
      const tokens = await db.query<{ token: string }>("SELECT token FROM push_tokens WHERE user_id=$1 AND revoked_at IS NULL", [n.user_id]);
      if (!deps.push || tokens.length === 0) push = "skipped";
      else {
        try {
          const r = await deps.push.send(tokens.map((x) => x.token), "مزوّد", text, { id: n.id, link: n.data.link ?? null });
          if (r.invalidTokens.length) await db.query("UPDATE push_tokens SET revoked_at=$2 WHERE token = ANY($1::text[])", [r.invalidTokens, now]);
          push = "sent";
        } catch (e) {
          errors.push(`push: ${(e as Error).message}`);
        }
      }
    }
    const attempts = n.attempts + (errors.length ? 1 : 0);
    const giveUp = errors.length > 0 && attempts > NOTIFY_RETRY_MINUTES.length;
    if (giveUp) {
      if (sms === "pending") sms = "failed";
      if (push === "pending") push = "failed";
    }
    const next = errors.length && !giveUp ? new Date(now.getTime() + NOTIFY_RETRY_MINUTES[attempts - 1] * 60_000) : null;
    await db.query("UPDATE notifications SET sms_status=$2, push_status=$3, attempts=$4, next_attempt_at=$5, last_error=$6 WHERE id=$1", [
      n.id,
      sms,
      push,
      attempts,
      next,
      errors.length ? errors.join("; ").slice(0, 500) : null,
    ]);
    if (!errors.length) sent++;
  }
  return { processed: rows.length, sent };
}
