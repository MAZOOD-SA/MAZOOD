// ربط الأحداث بالتنبيهات (القرار ٤٩، والجدول في docs/plans/phase-4.md القسم ٧).
// كل دالة تلقى الأطراف من القاعدة (مين العميل، مين المزوّد) وتنادي notify().
// تنادى بعد ما ينجح الإجراء. لو فشل التنبيه نفسه، ننكتب الخطأ في السجل والإجراء يبقى ناجح
// (التنبيه مهم، بس ما يرجّع قبول عرض أو رد على طلب).
import type { Db } from "./db.ts";
import { eligibleProviderIds } from "./orders.ts";
import { customerUsers, notify, providerUser } from "./notify.ts";
import { titleOf } from "./reminders.ts";

type Log = { error(o: unknown, m?: string): void };
let log: Log = { error: (o, m) => console.error(m, o) };
export const setEventLog = (l: Log) => (log = l);

async function safe(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    log.error(err, `notification event ${name} failed`);
  }
}

async function requestInfo(db: Db, requestId: string) {
  const [r] = await db.query<{ id: string; details: string; factory_id: string; category: string; city_id: string }>(
    "SELECT id, details, factory_id, category, city_id FROM requests WHERE id=$1",
    [requestId],
  );
  return r;
}

/** آخر طلب منفّذ (order) على الطلب: المزوّد المقبول. */
async function lastOrder(db: Db, requestId: string) {
  const [o] = await db.query<{ id: string; provider_id: string }>("SELECT id, provider_id FROM orders WHERE request_id=$1 ORDER BY accepted_at DESC LIMIT 1", [requestId]);
  return o;
}

/** الطلب اللي يتبعه الطلب المنفّذ (للمسارات اللي تجي بـ orderId). */
export async function requestOfOrder(db: Db, orderId: string): Promise<string> {
  const [o] = await db.query<{ request_id: string }>("SELECT request_id FROM orders WHERE id=$1", [orderId]);
  return o?.request_id ?? "";
}

export const events = {
  /** طلب جديد: المزوّدين الموثّقين في القسم والمدينة. */
  requestCreated: (db: Db, requestId: string, now: Date) =>
    safe("requestCreated", async () => {
      const r = await requestInfo(db, requestId);
      const providers = await eligibleProviderIds(db, r.category, r.city_id, now);
      const users = await Promise.all(providers.map((p) => providerUser(db, p)));
      await notify(db, users, "new_request", { title: titleOf(r.details), link: { screen: "provider_request", id: r.id } }, now);
    }),

  /** عرض جديد: أول عرض تنبيه لحاله (ومعه رسالة نصية)، والباقي تنبيه واحد كل ساعة بالكثير. */
  offerSent: (db: Db, requestId: string, now: Date) =>
    safe("offerSent", async () => {
      const r = await requestInfo(db, requestId);
      const [c] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM offers WHERE request_id=$1", [requestId]);
      const users = await customerUsers(db, r.factory_id);
      const data = { title: titleOf(r.details), link: { screen: "request" as const, id: r.id } };
      if (c.n <= 1) await notify(db, users, "first_offer", data, now, `first_offer:${r.id}`);
      else await notify(db, users, "more_offers", data, now, `offers:${r.id}:${now.toISOString().slice(0, 13)}`);
    }),

  nominated: (db: Db, requestId: string, now: Date) =>
    safe("nominated", async () => {
      const r = await requestInfo(db, requestId);
      await notify(db, await customerUsers(db, r.factory_id, true), "approval_needed", { title: titleOf(r.details), link: { screen: "request", id: r.id } }, now);
    }),

  /** انقبل عرض: المزوّد المقبول، والباقين اللي ما انقبلوا. */
  accepted: (db: Db, requestId: string, now: Date) =>
    safe("accepted", async () => {
      const r = await requestInfo(db, requestId);
      const o = await lastOrder(db, requestId);
      const title = titleOf(r.details);
      await notify(db, [await providerUser(db, o.provider_id)], "offer_accepted", { title, link: { screen: "provider_job", id: o.id } }, now);
      const others = await db.query<{ provider_id: string }>(
        "SELECT DISTINCT provider_id FROM offers WHERE request_id=$1 AND provider_id<>$2 AND status='rejected'",
        [requestId, o.provider_id],
      );
      const users = await Promise.all(others.map((x) => providerUser(db, x.provider_id)));
      await notify(db, users, "offer_not_selected", { title }, now, `not_selected:${requestId}:${o.id}`);
    }),

  /** حدث من المزوّد يوصل للعميل (بدأ، وتم، وطلب تعديل سعر، واعتذار). */
  toCustomer: (db: Db, requestId: string, event: "job_started" | "job_delivered" | "price_change_requested" | "provider_withdrew" | "rate_provider", now: Date) =>
    safe(event, async () => {
      const r = await requestInfo(db, requestId);
      // تعديل السعر قرار المدير، والباقي لكل موظفين العميل.
      const users = await customerUsers(db, r.factory_id, event === "price_change_requested");
      await notify(db, users, event, { title: titleOf(r.details), link: { screen: "request", id: r.id } }, now);
    }),

  /** حدث من العميل يوصل للمزوّد المنفّذ (طلب إلغاء، أو إلغاء بعد القبول). */
  toProvider: (db: Db, requestId: string, event: "cancellation_requested" | "order_cancelled", now: Date) =>
    safe(event, async () => {
      const r = await requestInfo(db, requestId);
      const o = await lastOrder(db, requestId);
      if (!o) return; // إلغاء قبل القبول: ما فيه مزوّد ينبلغ.
      await notify(db, [await providerUser(db, o.provider_id)], event, { title: titleOf(r.details), link: { screen: "provider_job", id: o.id } }, now);
    }),

  /** بلاغ: يوصل للطرف الثاني. */
  disputeOpened: (db: Db, requestId: string, by: "factory" | "provider", now: Date) =>
    safe("disputeOpened", async () => {
      const r = await requestInfo(db, requestId);
      const o = await lastOrder(db, requestId);
      const users = by === "factory" ? [await providerUser(db, o.provider_id)] : await customerUsers(db, r.factory_id);
      const link = by === "factory" ? { screen: "provider_job" as const, id: o.id } : { screen: "request" as const, id: r.id };
      await notify(db, users, "dispute_opened", { title: titleOf(r.details), link }, now);
    }),

  // ───────── السوق ─────────

  purchaseRequested: (db: Db, purchaseId: string, now: Date) =>
    safe("purchaseRequested", async () => {
      const [p] = await db.query<{ seller_id: string; name: string }>(
        "SELECT pr.seller_id, p.name FROM purchase_requests pr JOIN products p ON p.id = pr.product_id WHERE pr.id=$1",
        [purchaseId],
      );
      await notify(db, await customerUsers(db, p.seller_id, true), "purchase_request", { title: p.name, link: { screen: "seller_purchase", id: purchaseId } }, now);
    }),

  purchaseQuoted: (db: Db, purchaseId: string, now: Date) =>
    safe("purchaseQuoted", async () => {
      const [p] = await db.query<{ buyer_user_id: string; name: string }>(
        "SELECT pr.buyer_user_id, p.name FROM purchase_requests pr JOIN products p ON p.id = pr.product_id WHERE pr.id=$1",
        [purchaseId],
      );
      await notify(db, [p.buyer_user_id], "purchase_quoted", { title: p.name, link: { screen: "purchase", id: purchaseId } }, now);
    }),

  purchaseAccepted: (db: Db, purchaseId: string, now: Date) =>
    safe("purchaseAccepted", async () => {
      const [p] = await db.query<{ seller_user_id: string | null; seller_id: string; name: string }>(
        "SELECT pr.seller_user_id, pr.seller_id, p.name FROM purchase_requests pr JOIN products p ON p.id = pr.product_id WHERE pr.id=$1",
        [purchaseId],
      );
      const users = p.seller_user_id ? [p.seller_user_id] : await customerUsers(db, p.seller_id, true);
      await notify(db, users, "purchase_accepted", { title: p.name, link: { screen: "seller_purchase", id: purchaseId } }, now);
    }),
};
