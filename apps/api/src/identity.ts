// بيانات العميل (منشأة أو فرد) والتحقق من هوية الفرد (القرارين ٤١ و٤٢).
//
// التحقق خطوة منفصلة عن التسجيل: العميل يعبّي بياناته، و`identity_verified_at` ينحط لما تتأكد الهوية.
// الحين ما فيه تحقق آلي (ربط «نفاذ» يحتاج سجل الشركة وموافقة «علم»)، فالفحص بصيغة الرقم بس (schemas.ts)
// والفرد يظهر له «بانتظار التحقق». والإعداد individualRequiresVerifiedIdentity مقفول، فالطلبات ما تتوقف.
//
// لما يجهز ربط نفاذ (للمبرمج):
//  ١. ملف جديد `nafath.ts` يرسل طلب التحقق برقم الهوية، ويستقبل رد نفاذ (callback) ويتأكد من توقيعه.
//  ٢. لما يوصل رد ناجح ورقم الهوية يطابق المحفوظ: `markIdentityVerified(db, factoryId, "nafath", now)`.
//  ٣. `pnpm api:set-setting individualRequiresVerifiedIdentity true` لو المالك يبي يمنع الطلب قبل التحقق.
//  ما فيه شي ثاني يتغيّر: الشاشات تقرأ `identity.status` من /v1/me.
import type { CustomerKind, IdType } from "@mazood/shared";
import { audit, type Actor } from "./audit.ts";
import type { Db } from "./db.ts";

export type CustomerRow = {
  id: string;
  kind: CustomerKind | null;
  name: string | null;
  city_id: string | null;
  commercial_register: string | null;
  vat_number: string | null;
  id_type: IdType | null;
  id_number_enc: string | null;
  id_number_last4: string | null;
  identity_verified_at: Date | null;
  identity_method: "nafath" | "manual" | null;
};

/** اكتملت بيانات العميل حسب نوعه؟ بدون بيانات كاملة ما يرفع طلب. */
export function profileComplete(f: CustomerRow): boolean {
  if (f.kind === "business") return !!(f.name && f.city_id && f.commercial_register && f.vat_number);
  if (f.kind === "individual") return !!(f.name && f.city_id && f.id_type && f.id_number_enc);
  return false;
}

/** حالة التحقق من الهوية: للفرد بس. المنشأة ما تحتاجه (السجل التجاري يراجعه المالك لاحقًا عند الحاجة). */
export function identityStatus(f: CustomerRow): "not_required" | "pending" | "verified" {
  if (f.kind !== "individual") return "not_required";
  return f.identity_verified_at ? "verified" : "pending";
}

/** يسجّل إن هوية الفرد تأكدت (من نفاذ، أو يدويًا من موظف مخوّل). ينكتب في السجل. */
export async function markIdentityVerified(db: Db, actor: Actor, factoryId: string, method: "nafath" | "manual", now: Date) {
  const rows = await db.query(
    `UPDATE factories SET identity_verified_at=$2, identity_method=$3, updated_at=now()
      WHERE id=$1 AND kind='individual' AND id_number_enc IS NOT NULL RETURNING id`,
    [factoryId, now, method],
  );
  if (rows.length) await audit(db, actor, "customer.identity_verified", { type: "factory", id: factoryId }, { method });
  return rows.length > 0;
}
