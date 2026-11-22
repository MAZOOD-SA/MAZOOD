// رقم الالتزام «التزم بـ X من Y طلب» (القرار ٣٣): العدّ من القاعدة. الحساب نفسه في packages/shared/src/commitment.ts،
// وطريقة حذف الميزة أو تبديلها مكتوبة هناك.
import { commitmentView, type CommitmentSettings, type CommitmentView } from "@mazood/shared";
import type { Db } from "./db.ts";

export async function providerCommitment(db: Db, providerId: string, s: CommitmentSettings, now: Date): Promise<CommitmentView> {
  if (!s.enabled) return null;
  // الطلبات اللي انقبل فيها عرضه خلال آخر windowMonths شهر، وكم واحد منها اعتذر عنه.
  const [r] = await db.query<{ accepted: number; withdrawals: number }>(
    `SELECT count(*)::int AS accepted,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM cancellations c WHERE c.order_id = o.id AND c.kind = 'provider_withdrawal'))::int AS withdrawals
       FROM orders o
      WHERE o.provider_id = $1 AND o.accepted_at > ($2::timestamptz - make_interval(months => $3::int))`,
    [providerId, now, s.windowMonths],
  );
  return commitmentView(r, s);
}
