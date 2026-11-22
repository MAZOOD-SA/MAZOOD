// قواعد الطلب: حالاته، ومين يقدر يسوي وش في كل حالة، وسياسة الإلغاء.
//
// هذا الملف هو المرجع الوحيد للقواعد. الخادم يطبّقها قبل أي تغيير (وهو اللي يُصدَّق)،
// والتطبيق يستخدمها بس عشان يعرف أي أزرار يعرض. لو تغيّرت سياسة الإلغاء،
// تتغيّر هنا أو في إعدادات المنصة، ويتغيّر الطرفين مع بعض.
//
// مسار الطلب:
//   بانتظار العروض ──قبول عرض──► مقبول ──المزوّد يبدأ──► قيد التنفيذ ──تأكيد الاستلام──► مكتمل
//        │                         │                         │
//        └──إلغاء مجاني──┐   └──إلغاء مجاني*──┐       └──«طلب إلغاء» يوافق عليه المزوّد──┐
//                          ▼                    ▼                                           ▼
//                                              ملغي
//   * حسب سياسة الإلغاء (freeCancelUntil). القاعدة: «ولا مرة طريق مسدود» (docs/product.md):
//     كل حالة فيها إجراء واحد على الأقل يقدر المصنع يسويه، والاختبارات تتأكد من هذا.

export const REQUEST_STATUSES = ["awaiting_offers", "accepted", "in_progress", "completed", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** حالة «طلب الإلغاء» بعد بدء التنفيذ. null = ما فيه طلب إلغاء. */
export type CancelRequestStatus = "pending" | "declined" | null;

export const WHEN_OPTIONS = ["today", "tomorrow", "this_week"] as const;
export type When = (typeof WHEN_OPTIONS)[number];

/**
 * سياسة الإلغاء. وافق عليها المالك مبدئيًا في 21 نوفمبر 2026، وقابلة للتغيير
 * بدون تعديل كود (تنحفظ في جدول الإعدادات، وتتعدل من لوحة الإدارة في المرحلة ٦).
 *
 * - provider_starts: الإلغاء مجاني لين يضغط المزوّد «بدأت التنفيذ» (المعتمد مبدئيًا).
 * - offer_accepted: الإلغاء مجاني بس قبل قبول أي عرض، وبعدها يصير «طلب إلغاء».
 *
 * رسوم الإلغاء بعد البدء: ما انقررت (سؤال ١٥ في PLAN.md)، فما فيه رسوم للحين.
 */
export type CancelPolicy = { freeCancelUntil: "provider_starts" | "offer_accepted" };
export const DEFAULT_CANCEL_POLICY: CancelPolicy = { freeCancelUntil: "provider_starts" };

/** الإجراءات اللي ممكن يسويها المصنع على طلب. */
export type FactoryAction =
  | "accept_offer"
  | "cancel"
  | "request_cancel"
  | "withdraw_cancel_request"
  | "confirm_receipt"
  | "open_dispute"
  | "view_invoice"
  | "reorder";

export type RequestSnapshot = {
  status: RequestStatus;
  cancelRequestStatus: CancelRequestStatus;
  pendingOffers: number;
  disputeOpened: boolean;
};

/** هل الإلغاء المجاني (المباشر) مسموح في هذي الحالة؟ */
export function canCancelFreely(status: RequestStatus, policy: CancelPolicy): boolean {
  if (status === "awaiting_offers") return true;
  if (status === "accepted") return policy.freeCancelUntil === "provider_starts";
  return false;
}

/** هل «طلب الإلغاء» (اللي يحتاج موافقة المزوّد) هو الطريق في هذي الحالة؟ */
export function needsCancelRequest(status: RequestStatus, policy: CancelPolicy): boolean {
  if (status === "in_progress") return true;
  if (status === "accepted") return policy.freeCancelUntil === "offer_accepted";
  return false;
}

/** كل الإجراءات المتاحة للمصنع على الطلب الحين. الترتيب = ترتيب الأهمية في الشاشة. */
export function allowedFactoryActions(r: RequestSnapshot, policy: CancelPolicy): FactoryAction[] {
  const actions: FactoryAction[] = [];
  switch (r.status) {
    case "awaiting_offers":
      if (r.pendingOffers > 0) actions.push("accept_offer");
      actions.push("cancel");
      break;
    case "accepted":
    case "in_progress":
      // تأكيد الاستلام متاح حتى لو المزوّد نسي يضغط «بدأت التنفيذ».
      actions.push("confirm_receipt");
      if (canCancelFreely(r.status, policy)) actions.push("cancel");
      else if (needsCancelRequest(r.status, policy)) {
        if (r.cancelRequestStatus === null) actions.push("request_cancel");
        if (r.cancelRequestStatus === "pending") actions.push("withdraw_cancel_request");
        // المزوّد رفض الإلغاء: المصنع ما ينحبس، يقدر يفتح بلاغ لفريق مزوّد.
        if (r.cancelRequestStatus === "declined" && !r.disputeOpened) actions.push("open_dispute");
      }
      break;
    case "completed":
      actions.push("view_invoice", "reorder");
      break;
    case "cancelled":
      actions.push("reorder");
      break;
  }
  return actions;
}

export function isAllowed(action: FactoryAction, r: RequestSnapshot, policy: CancelPolicy): boolean {
  return allowedFactoryActions(r, policy).includes(action);
}
