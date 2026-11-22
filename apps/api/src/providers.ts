// منطق حالة المزوّد ومستنداته. نفس الدوال يستخدمها مسار المزوّد ولوحة الإدارة.
//
// القواعد:
//  - المستندات المطلوبة تعتمد على أقسام المزوّد (requiredDocsFor في الحزمة المشتركة).
//  - «موثّق» فعليًا = حالته verified + كل مستند مطلوب له نسخة مقبولة وما انتهت.
//    فلو انتهى مستند، تختفي شارة «موثّق» تلقائيًا بدون ما أحد يغيّر شي.
//  - رفع نسخة جديدة من مستند (تجديد) ما يلغي النسخة المقبولة القديمة لين تنقبل الجديدة.
import { EXPIRY_WARNING_DAYS, requiredDocsFor, type DocStatus, type DocType, type ProviderStatus } from "@mazood/shared";
import type { Db } from "./db.ts";
import { addDays } from "./http.ts";

export type ProviderRow = {
  id: string;
  user_id: string;
  trade_name: string;
  owner_name: string;
  id_type: "national_id" | "iqama";
  id_number_enc: string;
  id_number_last4: string;
  commercial_register: string;
  categories: string[];
  status: ProviderStatus;
  status_reason: string | null;
  submitted_at: Date | null;
  verified_at: Date | null;
  created_at: Date;
};

export type DocRow = {
  id: string;
  provider_id: string;
  doc_type: DocType;
  mime_type: string;
  size_bytes: number;
  expires_on: string;
  status: DocStatus;
  checklist: string[];
  rejection_reason: string | null;
  reviewed_at: Date | null;
  created_at: Date;
};

const DOC_COLUMNS = `id, provider_id, doc_type, mime_type, size_bytes, to_char(expires_on, 'YYYY-MM-DD') AS expires_on,
  status, checklist, rejection_reason, reviewed_at, created_at`;

export async function loadDocs(db: Db, providerId: string): Promise<DocRow[]> {
  return db.query<DocRow>(
    `SELECT ${DOC_COLUMNS} FROM provider_documents WHERE provider_id = $1 AND status <> 'replaced' ORDER BY created_at DESC`,
    [providerId],
  );
}

export async function loadDoc(db: Db, id: string): Promise<DocRow | null> {
  const rows = await db.query<DocRow>(`SELECT ${DOC_COLUMNS} FROM provider_documents WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export type DocSlot = {
  docType: DocType;
  /** النسخة المقبولة الحالية (لو فيه) */
  approved: DocRow | null;
  /** أحدث نسخة تنتظر المراجعة (لو فيه) */
  pending: DocRow | null;
  /** آخر نسخة مرفوضة، تظهر بس إذا ما فيه نسخة أحدث تنتظر */
  rejected: DocRow | null;
  expired: boolean;
  expiringSoon: boolean;
};

export function summarize(provider: Pick<ProviderRow, "status" | "categories">, docs: DocRow[], today: string) {
  const required = requiredDocsFor(provider.categories);
  const warnUntil = addDays(today, EXPIRY_WARNING_DAYS);
  const slots: DocSlot[] = required.map((docType) => {
    const mine = docs.filter((d) => d.doc_type === docType); // الأحدث أول
    const approved = mine.find((d) => d.status === "approved") ?? null;
    const pending = mine.find((d) => d.status === "pending") ?? null;
    const lastRejected = mine.find((d) => d.status === "rejected") ?? null;
    const rejected = lastRejected && (!pending || lastRejected.created_at > pending.created_at) ? lastRejected : null;
    const expired = !!approved && approved.expires_on < today;
    const expiringSoon = !!approved && !expired && approved.expires_on <= warnUntil;
    return { docType, approved, pending, rejected, expired, expiringSoon };
  });
  const allApprovedValid = slots.every((s) => s.approved && !s.expired);
  // جاهز للإرسال: كل مستند مطلوب له نسخة (تنتظر أو مقبولة) وما انتهت.
  const readyToSubmit = slots.every((s) => (s.pending && s.pending.expires_on >= today) || (s.approved && !s.expired));
  return {
    required,
    slots,
    effectiveVerified: provider.status === "verified" && allApprovedValid,
    allApprovedValid,
    readyToSubmit,
    expiringSoon: slots.filter((s) => s.expiringSoon || s.expired).map((s) => ({ docType: s.docType, expiresOn: s.approved!.expires_on, expired: s.expired })),
  };
}

/** شكل المستند للعرض (بدون مكان الملف في التخزين). */
export function docView(d: DocRow | null) {
  if (!d) return null;
  return {
    id: d.id,
    docType: d.doc_type,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    expiresOn: d.expires_on,
    status: d.status,
    checklist: d.checklist,
    rejectionReason: d.rejection_reason,
    reviewedAt: d.reviewed_at,
    uploadedAt: d.created_at,
  };
}

export function slotView(s: DocSlot) {
  return { docType: s.docType, approved: docView(s.approved), pending: docView(s.pending), rejected: docView(s.rejected), expired: s.expired, expiringSoon: s.expiringSoon };
}
