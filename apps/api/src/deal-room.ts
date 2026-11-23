// غرفة الصفقة (القرار ٣٥ والقرار ٥٢، الخطة docs/plans/deal-room.md).
//
// محادثة لكل طلب منفّذ (order) بين العميل (كل موظفين المنشأة الفعّالين، أو الفرد) والمزوّد.
//  - الصلاحية تنفحص هنا: المسارات تجيب orderId من صاحب الجلسة نفسه، وهذي الدوال ما تثق بأي شي من الواجهة.
//  - النص ينشفّر قبل ما ينحفظ (ctx.box)، وينفك بس وقت العرض لأطراف الطلب، أو لخدمة العملاء لو فيه بلاغ.
//  - الكتابة مسموحة بس والطلب شغّال (CHAT_WRITABLE_STATUSES). بعد الاكتمال أو الإلغاء: قراءة بس.
//  - أرقام الجوال والروابط ممنوعة (المسار يفحصها بـ rejectContactInfo قبل ما يوصل هنا).
import {
  CHAT_SYSTEM_EVENTS,
  MESSAGE_NOTIFY_WINDOW_MINUTES,
  chatClosedReason,
  chatWritable,
  type ChatItem,
  type ChatSystemEvent,
  type ChatView,
} from "@mazood/shared";
import { audit } from "./audit.ts";
import type { SessionUser } from "./auth.ts";
import type { Db } from "./db.ts";
import { ApiError } from "./errors.ts";
import type { Ctx } from "./http.ts";
import { customerUsers, notify, providerUser } from "./notify.ts";
import { titleOf } from "./reminders.ts";

export type ChatRole = "customer" | "provider";

type OrderRow = { id: string; request_id: string; factory_id: string; provider_id: string; state: string; status: string; details: string };

/** لو آخر «قرأت» خلال هالمدة، نعتبر الشخص فاتح المحادثة الحين وما نرسل له تنبيه. */
const ACTIVE_READER_MS = 30_000;

async function orderRow(db: Db, orderId: string): Promise<OrderRow> {
  const [o] = await db.query<OrderRow>(
    `SELECT o.id, o.request_id, o.factory_id, o.provider_id, o.state, r.status, r.details
       FROM orders o JOIN requests r ON r.id = o.request_id WHERE o.id=$1`,
    [orderId],
  );
  if (!o) throw new ApiError(404, "not_found");
  return o;
}

/** الطلب المنفّذ الحالي لطلب العميل. طلب عميل ثاني، أو طلب ما انقبل: «غير موجود». */
export async function customerChatOrder(db: Db, factoryId: string, requestId: string): Promise<string> {
  const [o] = await db.query<{ id: string }>(
    "SELECT id FROM orders WHERE request_id=$1 AND factory_id=$2 AND state <> 'withdrawn' ORDER BY accepted_at DESC LIMIT 1",
    [requestId, factoryId],
  );
  if (!o) throw new ApiError(404, "not_found");
  return o.id;
}

/** طلب منفّذ لهذا المزوّد. طلب مزوّد ثاني، أو طلب اعتذر عنه: «غير موجود». */
export async function providerChatOrder(db: Db, userId: string, orderId: string): Promise<string> {
  const [o] = await db.query<{ id: string }>(
    "SELECT o.id FROM orders o JOIN providers p ON p.id = o.provider_id WHERE o.id=$1 AND p.user_id=$2 AND o.state <> 'withdrawn'",
    [orderId, userId],
  );
  if (!o) throw new ApiError(404, "not_found");
  return o.id;
}

/**
 * المحادثة كاملة (آخر ٥٠٠ رسالة). viewerId: عشان نعرف «رسالتي»، وnull لخدمة العملاء.
 * أسطر النظام (بدأ التنفيذ، تم، بلاغ...) تجي من order_events لنفس الطلب المنفّذ، فما تنحفظ مرتين.
 * نرجّعها كاملة كل مرة (محادثة طلب وحد صغيرة)، أبسط وأضمن من «الجديد بس».
 */
export async function chatView(ctx: Ctx, orderId: string, viewer: { userId: string | null }): Promise<ChatView> {
  const o = await orderRow(ctx.db, orderId);
  const msgs = await ctx.db.query<{ seq: string; id: string; sender_id: string; sender_role: ChatRole; body_enc: string; created_at: Date }>(
    `SELECT * FROM (SELECT seq, id, sender_id, sender_role, body_enc, created_at FROM order_messages
                     WHERE order_id=$1 ORDER BY seq DESC LIMIT 500) m ORDER BY seq`,
    [orderId],
  );
  const evs = await ctx.db.query<{ id: string; event: ChatSystemEvent; at: Date }>(
    "SELECT id::text, event, at FROM order_events WHERE order_id=$1 AND event = ANY($2) ORDER BY at, id",
    [orderId, CHAT_SYSTEM_EVENTS as readonly string[]],
  );
  // بالوقت. ولو نفس اللحظة: أسطر النظام قبل الرسائل، وكل نوع بترتيب إضافته.
  const keyed: { at: string; rank: number; n: number; item: ChatItem }[] = [
    ...evs.map((e) => {
      const at = new Date(e.at).toISOString();
      return { at, rank: 0, n: Number(e.id), item: { kind: "event", id: `e${e.id}`, seq: 0, event: e.event, at } as ChatItem };
    }),
    ...msgs.map((m) => {
      const at = new Date(m.created_at).toISOString();
      const item: ChatItem = { kind: "message", id: m.id, seq: Number(m.seq), from: m.sender_role, mine: viewer.userId !== null && m.sender_id === viewer.userId, body: ctx.box.decrypt(m.body_enc), at };
      return { at, rank: 1, n: Number(m.seq), item };
    }),
  ];
  keyed.sort((a, b) => (a.at !== b.at ? (a.at < b.at ? -1 : 1) : a.rank !== b.rank ? a.rank - b.rank : a.n - b.n));
  const items = keyed.map((k) => k.item);
  const writable = o.state === "open" && chatWritable(o.status);
  const lastSeq = msgs.length ? Number(msgs[msgs.length - 1].seq) : 0;
  return { items, writable, closedReason: writable ? null : chatClosedReason(o.status), lastSeq };
}

/** «قرأت» لين آخر رسالة. ينادى مع كل تحميل للمحادثة من أطرافها. */
export async function markChatRead(db: Db, orderId: string, userId: string, now: Date): Promise<void> {
  await db.query(
    `INSERT INTO order_message_reads (order_id, user_id, last_seq, read_at)
     VALUES ($1, $2, COALESCE((SELECT max(seq) FROM order_messages WHERE order_id=$1), 0), $3)
     ON CONFLICT (order_id, user_id) DO UPDATE SET last_seq = EXCLUDED.last_seq, read_at = EXCLUDED.read_at`,
    [orderId, userId, now],
  );
}

/** عدد الرسائل اللي ما قرأها هذا المستخدم (من الطرف الثاني بس). */
export async function unreadCount(db: Db, orderId: string, userId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM order_messages m
      WHERE m.order_id=$1 AND m.sender_id <> $2
        AND m.seq > COALESCE((SELECT last_seq FROM order_message_reads WHERE order_id=$1 AND user_id=$2), 0)`,
    [orderId, userId],
  );
  return r?.n ?? 0;
}

/** يرسل رسالة. الفحص: الطلب شغّال، والمرسل طرف فيه (المسار جاب orderId من جلسته). */
export async function sendChatMessage(ctx: Ctx, orderId: string, user: SessionUser, role: ChatRole, body: string): Promise<void> {
  const now = ctx.now();
  const o = await orderRow(ctx.db, orderId);
  if (o.state !== "open" || !chatWritable(o.status)) throw new ApiError(409, "chat_closed");
  await ctx.db.query(
    "INSERT INTO order_messages (order_id, sender_id, sender_role, body_enc, created_at) VALUES ($1,$2,$3,$4,$5)",
    [orderId, user.id, role, ctx.box.encrypt(body), now],
  );
  await markChatRead(ctx.db, orderId, user.id, now);
  await notifyOtherSide(ctx.db, o, role, now);
}

/**
 * تنبيه «رسالة جديدة» للطرف الثاني: واحد بالكثير كل MESSAGE_NOTIFY_WINDOW_MINUTES للطلب الواحد (dedupeKey بالفترة)،
 * وما يوصل لمين فاتح المحادثة الحين (قرأ خلال آخر ٣٠ ثانية). والنص ما فيه الرسالة نفسها.
 */
async function notifyOtherSide(db: Db, o: OrderRow, from: ChatRole, now: Date): Promise<void> {
  const recipients = from === "customer" ? [await providerUser(db, o.provider_id)] : await customerUsers(db, o.factory_id);
  const ids = recipients.filter((x): x is string => !!x);
  if (!ids.length) return;
  const active = await db.query<{ user_id: string }>(
    "SELECT user_id FROM order_message_reads WHERE order_id=$1 AND user_id = ANY($2) AND read_at > $3",
    [o.id, ids, new Date(now.getTime() - ACTIVE_READER_MS)],
  );
  const activeSet = new Set(active.map((a) => a.user_id));
  const bucket = Math.floor(now.getTime() / (MESSAGE_NOTIFY_WINDOW_MINUTES * 60_000));
  const link = from === "customer" ? { screen: "provider_job" as const, id: o.id } : { screen: "request" as const, id: o.request_id };
  await notify(db, ids.filter((id) => !activeSet.has(id)), "new_message", { title: titleOf(o.details), link }, now, `msg:${o.id}:${bucket}`);
}

/**
 * خدمة العملاء تقرأ المحادثة **بس** لطلب فيه بلاغ (مفتوح أو مقفول)، وكل قراءة تنسجل في سجل الإجراءات
 * (القرار ٣٥، وقرار المالك 23 نوفمبر 2026).
 */
export async function staffDisputeChat(ctx: Ctx, staff: SessionUser, disputeId: string): Promise<ChatView> {
  const [d] = await ctx.db.query<{ order_id: string }>("SELECT order_id FROM disputes WHERE id=$1", [disputeId]);
  if (!d) throw new ApiError(404, "not_found");
  const view = await chatView(ctx, d.order_id, { userId: null });
  await audit(ctx.db, { id: staff.id, role: staff.staffRole ?? staff.role }, "dispute.chat_viewed", { type: "dispute", id: disputeId }, { orderId: d.order_id });
  return view;
}
