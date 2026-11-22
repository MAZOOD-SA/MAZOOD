// رقم الالتزام في بطاقة العرض: «التزم بـ X من Y طلب» (القرار ٣٣، قرار المالك 22 نوفمبر 2026).
//
// Y: الطلبات اللي انقبل فيها عرض المزوّد خلال المدة (windowMonths).
// X: نفس العدد ناقص اعتذاراته بعد القبول. الإلغاء من المصنع ما ينحسب على المزوّد.
// قبل minOrders طلب: يطلع «جديد على المنصة» بدل الرقم، عشان ما ينظلم من أول اعتذار.
// enabled=false: الرقم يختفي من كل البطاقات (بأمر إعداد واحد، بدون مبرمج).
//
// ── للحذف أو التبديل (طلب المالك) ──
// الميزة كلها: هذا الملف، وapps/api/src/commitment.ts (العدّ من القاعدة)، وخانة provider.commitment
// في بطاقة العرض وفي /v1/provider/me، والإعداد commitment في settings.ts.
// الحذف: امسح الملفين والخانة والإعداد. التبديل (نسبة مئوية، أو شارة «ملتزم»): غيّر commitmentView() بس.
import { z } from "zod";

export const commitmentSettingsSchema = z
  .object({
    enabled: z.boolean(),
    /** المدة بالأشهر اللي ينحسب منها الرقم (١٢ الحين، والمالك ممكن يغيّرها). */
    windowMonths: z.number().int().min(1).max(60),
    /** أقل عدد طلبات مقبولة قبل ما يطلع الرقم. */
    minOrders: z.number().int().min(1).max(100),
  })
  .strict();
export type CommitmentSettings = z.infer<typeof commitmentSettingsSchema>;

export const DEFAULT_COMMITMENT_SETTINGS: CommitmentSettings = { enabled: true, windowMonths: 12, minOrders: 5 };

/** new: «جديد على المنصة». count: «التزم بـ kept من total طلب». null: الميزة موقوفة. */
export type CommitmentView = { kind: "new" } | { kind: "count"; kept: number; total: number } | null;

export function commitmentView(counts: { accepted: number; withdrawals: number }, s: CommitmentSettings): CommitmentView {
  if (!s.enabled) return null;
  if (counts.accepted < s.minOrders) return { kind: "new" };
  const kept = Math.max(0, counts.accepted - Math.min(counts.withdrawals, counts.accepted));
  return { kind: "count", kept, total: counts.accepted };
}
