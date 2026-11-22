// منطق سوق منتجات المصانع (الخطوة ب). المسارات في routes/market.ts وroutes/market-admin.ts.
//
// متى يظهر منتج في السوق؟ (القرار ٤٤) كل هذي لازم تتحقق:
//  ١. المنتج فعّال (مو مخفي من المصنع، ولا مشال من الإدارة).
//  ٢. البائع موثّق (status = verified) ومو موقوف.
//  ٣. سجله التجاري المقبول ما انتهى.
//  ٤. عنده اشتراك يغطي الحين (تجريبي أو مدفوع).
// لو انتهى الاشتراك أو السجل، المنتجات تختفي تلقائيًا بدون أي مهمة دورية (الشرط يُحسب وقت القراءة).
import type { Db } from "./db.ts";
import { todayRiyadh } from "./http.ts";

/**
 * شرط SQL: البائع (sellers s) ظاهر في السوق الحين. nowP: معامل الوقت، todayP: معامل التاريخ (YYYY-MM-DD).
 * ممنوع نعرض منتج بدون هذا الشرط في أي مسار عام.
 */
export const sellerListedSql = (nowP: string, todayP: string) => `(
  s.status = 'verified'
  AND EXISTS (SELECT 1 FROM seller_documents d WHERE d.factory_id = s.factory_id AND d.status = 'approved' AND d.expires_on >= ${todayP}::date)
  AND EXISTS (SELECT 1 FROM subscriptions sub WHERE sub.subject_type = 'factory' AND sub.subject_id = s.factory_id
              AND sub.starts_at <= ${nowP} AND sub.ends_at > ${nowP})
)`;

/** شرط SQL: المنتج (products p) ظاهر في السوق. لازم يكون فيه JOIN على sellers s. */
export const productListedSql = (nowP: string, todayP: string) => `(p.status = 'active' AND ${sellerListedSql(nowP, todayP)})`;

export type SubscriptionView = { planId: string; kind: "trial" | "paid"; startsAt: Date; endsAt: Date } | null;

/** الاشتراك اللي يغطي الحين، أو آخر اشتراك قادم يبدأ بعد الحين (لو دفع مقدمًا). */
export async function currentSubscription(db: Db, subjectType: "factory" | "provider", subjectId: string, now: Date): Promise<SubscriptionView> {
  const [row] = await db.query<{ plan_id: string; kind: "trial" | "paid"; starts_at: Date; ends_at: Date }>(
    `SELECT plan_id, kind, starts_at, ends_at FROM subscriptions
      WHERE subject_type=$1 AND subject_id=$2 AND starts_at <= $3 AND ends_at > $3
      ORDER BY ends_at DESC LIMIT 1`,
    [subjectType, subjectId, now],
  );
  if (!row) return null;
  // لو فيه فترات متتالية (دفعة بعد دفعة)، النهاية الفعلية آخر فترة متصلة.
  const [last] = await db.query<{ ends_at: Date }>(
    `SELECT max(ends_at) AS ends_at FROM subscriptions WHERE subject_type=$1 AND subject_id=$2 AND starts_at <= $3`,
    [subjectType, subjectId, row.ends_at],
  );
  return { planId: row.plan_id, kind: row.kind, startsAt: row.starts_at, endsAt: last?.ends_at ?? row.ends_at };
}

/** نهاية آخر فترة اشتراك (حتى لو في المستقبل). الدفعة الجديدة تبدأ منها لو ما انتهت. */
export async function lastSubscriptionEnd(db: Db, subjectType: "factory" | "provider", subjectId: string): Promise<Date | null> {
  const [row] = await db.query<{ ends_at: Date | null }>(
    "SELECT max(ends_at) AS ends_at FROM subscriptions WHERE subject_type=$1 AND subject_id=$2",
    [subjectType, subjectId],
  );
  return row?.ends_at ? new Date(row.ends_at) : null;
}

export type SellerRow = {
  factory_id: string;
  status: "draft" | "pending" | "verified" | "rejected" | "suspended";
  status_reason: string | null;
  submitted_at: Date | null;
  verified_at: Date | null;
};

export type SellerDocRow = {
  id: string;
  status: "pending" | "approved" | "rejected" | "replaced";
  expires_on: string | Date;
  reject_reason: string | null;
  created_at: Date;
};

const dateStr = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** حالة البائع كاملة: التوثيق، والسجل، والاشتراك، وهل منتجاته ظاهرة، والتنبيهات قبل الانتهاء. */
export async function sellerState(db: Db, factoryId: string, now: Date, warningDays: number) {
  const [s] = await db.query<SellerRow>("SELECT * FROM sellers WHERE factory_id=$1", [factoryId]);
  if (!s) return null;
  const docs = await db.query<SellerDocRow>(
    "SELECT id, status, expires_on, reject_reason, created_at FROM seller_documents WHERE factory_id=$1 AND status <> 'replaced' ORDER BY created_at DESC",
    [factoryId],
  );
  const today = todayRiyadh(now);
  const approved = docs.find((d) => d.status === "approved");
  const docValid = !!approved && dateStr(approved.expires_on) >= today;
  const subscription = await currentSubscription(db, "factory", factoryId, now);
  const warnUntil = new Date(now.getTime() + warningDays * 86400_000);
  const [counts] = await db.query<{ total: number; active: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE status='active')::int AS active FROM products WHERE seller_id=$1 AND status <> 'removed'`,
    [factoryId],
  );
  return {
    status: s.status,
    statusReason: s.status_reason,
    submittedAt: s.submitted_at,
    verifiedAt: s.verified_at,
    document: docs[0]
      ? { id: docs[0].id, status: docs[0].status, expiresOn: dateStr(docs[0].expires_on), rejectReason: docs[0].reject_reason }
      : null,
    documentValid: docValid,
    subscription,
    /** منتجاته ظاهرة في السوق الحين؟ (نفس شرط sellerListedSql) */
    listed: s.status === "verified" && docValid && !!subscription,
    warnings: {
      subscriptionEndingSoon: !!subscription && subscription.endsAt <= warnUntil,
      documentExpiringSoon: !!approved && docValid && dateStr(approved.expires_on) <= todayRiyadh(warnUntil),
    },
    products: counts,
  };
}

/** متوسط نجوم البائع وعددها (من طلبات الشراء المستلمة). */
export async function sellerRating(db: Db, sellerId: string): Promise<{ average: number; count: number } | null> {
  const [r] = await db.query<{ avg: string | null; n: number }>(
    "SELECT avg(stars)::numeric(3,2)::text AS avg, count(*)::int AS n FROM seller_ratings WHERE seller_id=$1",
    [sellerId],
  );
  return r && r.n > 0 ? { average: Number(r.avg), count: r.n } : null;
}
