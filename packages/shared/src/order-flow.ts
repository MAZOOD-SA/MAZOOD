// دورة الطلب: كل الحالات، وكل انتقال مسموح بينها، ومين يقدر يسويه.
// ⚠️ هذا الجدول هو المرجع الوحيد. الخادم ما يغيّر حالة طلب إلا عن طريق nextStatus() هنا،
// وأي انتقال مو في الجدول يرجّع الخطأ invalid_transition. والواجهة تستخدم نفس الجدول عشان تعرف
// وش الأزرار اللي تبيّنها (FACTORY_ACTIONS). التفاصيل في docs/plans/phase-4.md (القسم ٤).

export const REQUEST_STATUSES = [
  /** مفتوح للعروض (فيه عروض أو لا: «وصلت عروض» تنحسب من عددها) */
  "awaiting_offers",
  /** موظف المصنع رشّح عرض، وينتظر موافقة المدير (سؤال ١٦) */
  "pending_approval",
  /** انقبل عرض، والمزوّد ما بدأ */
  "accepted",
  /** المزوّد ضغط «بدأت التنفيذ» */
  "in_progress",
  /** المزوّد ضغط «تم التنفيذ»، وينتظر تأكيد المصنع (أو التأكيد التلقائي، سؤال ١٨) */
  "delivered",
  "completed",
  /** انتهت مدة الطلب بدون قبول (الافتراضي ٧ أيام، سؤال ٤-٣) */
  "expired",
  "cancelled",
  /** فيه بلاغ مفتوح عند خدمة العملاء */
  "disputed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** مين يسوي الإجراء. system: المهمة اللي تشتغل في الخلفية (الانتهاء والتأكيد التلقائي). staff: فريق الإدارة. */
export const FLOW_ACTORS = ["factory", "provider", "system", "staff"] as const;
export type FlowActor = (typeof FLOW_ACTORS)[number];

type Transition = { action: string; from: readonly RequestStatus[]; to: RequestStatus; actors: readonly FlowActor[] };

export const TRANSITIONS = [
  // قبل القبول
  { action: "nominate", from: ["awaiting_offers"], to: "pending_approval", actors: ["factory"] },
  { action: "withdraw_nomination", from: ["pending_approval"], to: "awaiting_offers", actors: ["factory"] },
  // القبول: مباشرة، أو بموافقة المدير على الترشيح
  { action: "accept", from: ["awaiting_offers", "pending_approval"], to: "accepted", actors: ["factory"] },
  // الإلغاء المجاني: أي وقت قبل ما يبدأ المزوّد (سؤال ١٥)
  { action: "cancel", from: ["awaiting_offers", "pending_approval", "accepted", "expired"], to: "cancelled", actors: ["factory"] },
  { action: "expire", from: ["awaiting_offers"], to: "expired", actors: ["system"] },
  { action: "republish", from: ["expired"], to: "awaiting_offers", actors: ["factory"] },
  // المزوّد اعتذر قبل البدء: الطلب يرجع مفتوح، والمصنع يختار عرض ثاني (الإضافة ١١)
  { action: "provider_withdraw", from: ["accepted"], to: "awaiting_offers", actors: ["provider"] },
  // التنفيذ
  { action: "start", from: ["accepted"], to: "in_progress", actors: ["provider"] },
  { action: "deliver", from: ["in_progress"], to: "delivered", actors: ["provider"] },
  { action: "confirm", from: ["delivered"], to: "completed", actors: ["factory"] },
  { action: "auto_confirm", from: ["delivered"], to: "completed", actors: ["system"] },
  // بعد البدء: المصنع «يطلب الإلغاء»، والمزوّد يوافق. لو رفض أو ما رد في المهلة، يتحوّل بلاغ.
  { action: "cancel_agreed", from: ["in_progress"], to: "cancelled", actors: ["provider"] },
  { action: "open_dispute", from: ["in_progress"], to: "disputed", actors: ["factory", "provider", "system"] },
  { action: "open_dispute", from: ["delivered"], to: "disputed", actors: ["factory", "provider"] },
  // قرار خدمة العملاء في البلاغ (الإدارة الكاملة للنزاعات في المرحلة ٦)
  { action: "resolve_complete", from: ["disputed"], to: "completed", actors: ["staff"] },
  { action: "resolve_cancel", from: ["disputed"], to: "cancelled", actors: ["staff"] },
  { action: "resolve_resume", from: ["disputed"], to: "in_progress", actors: ["staff"] },
] as const satisfies readonly Transition[];

export type FlowAction = (typeof TRANSITIONS)[number]["action"];

export class OrderFlowError extends Error {
  code = "invalid_transition" as const;
  from: RequestStatus;
  action: string;
  actor: FlowActor;
  constructor(from: RequestStatus, action: string, actor: FlowActor) {
    super(`invalid_transition: ${action} from ${from} by ${actor}`);
    this.from = from;
    this.action = action;
    this.actor = actor;
  }
}

function find(from: RequestStatus, action: FlowAction, actor: FlowActor): Transition | undefined {
  return (TRANSITIONS as readonly Transition[]).find(
    (t) => t.action === action && t.from.includes(from) && t.actors.includes(actor),
  );
}

export function canTransition(from: RequestStatus, action: FlowAction, actor: FlowActor): boolean {
  return !!find(from, action, actor);
}

/** الحالة الجديدة، أو يرمي OrderFlowError لو الانتقال مو في الجدول. */
export function nextStatus(from: RequestStatus, action: FlowAction, actor: FlowActor): RequestStatus {
  const t = find(from, action, actor);
  if (!t) throw new OrderFlowError(from, action, actor);
  return t.to;
}

/** كل الإجراءات اللي يقدر يسويها هذا الطرف في هذي الحالة. */
export function allowedActions(from: RequestStatus, actor: FlowActor): FlowAction[] {
  return [...new Set((TRANSITIONS as readonly Transition[]).filter((t) => t.from.includes(from) && t.actors.includes(actor)).map((t) => t.action as FlowAction))];
}

/**
 * أزرار المصنع في كل حالة (جدول القسم ٤ في الخطة). primary هو الزر الكهرماني (واحد بالكثير).
 * بعضها مو انتقال حالة: edit (تعديل الطلب)، وrequest_cancel (طلب إلغاء بعد البدء)،
 * وchoose_other (اختيار عرض ثاني)، وreorder (اطلب مرة ثانية)، وrate (التقييم)، وadd_note (ملاحظة على البلاغ).
 * الاختبار يتأكد إن كل حالة فيها زر واحد على الأقل.
 */
export type FactoryUiAction =
  | FlowAction
  | "edit"
  | "request_cancel"
  | "withdraw_cancel_request"
  | "choose_other"
  | "reorder"
  | "rate"
  | "add_note";

export const FACTORY_ACTIONS: Record<RequestStatus, { primary: FactoryUiAction | null; others: FactoryUiAction[] }> = {
  // «اقبل العرض» يظهر بس لما يكون فيه عروض (أو «رشّح للمدير» لموظف المصنع).
  awaiting_offers: { primary: "accept", others: ["edit", "cancel"] },
  pending_approval: { primary: "accept", others: ["withdraw_nomination", "choose_other", "cancel"] },
  accepted: { primary: null, others: ["cancel"] },
  in_progress: { primary: null, others: ["request_cancel", "open_dispute"] },
  delivered: { primary: "confirm", others: ["open_dispute"] },
  completed: { primary: "reorder", others: ["rate"] },
  expired: { primary: "republish", others: ["cancel"] },
  cancelled: { primary: "reorder", others: [] },
  disputed: { primary: null, others: ["add_note"] },
};

/** معلومات عن الطلب تغيّر الأزرار داخل نفس الحالة. */
export type FactoryActionFlags = {
  /** فيه عروض صالحة يقدر يقبلها */
  hasLiveOffers?: boolean;
  /** المزوّد المقبول اعتذر، فرجع الطلب مفتوح (الإضافة ١١) */
  reopenedAfterWithdrawal?: boolean;
  /** المصنع طلب الإلغاء بعد البدء، وينتظر رد المزوّد */
  cancellationPending?: boolean;
  /** المصنع قيّم الطلب المكتمل، فزر «قيّم» يختفي (مرة وحدة) */
  alreadyRated?: boolean;
};

/**
 * أزرار المصنع الفعلية لطلب معيّن: FACTORY_ACTIONS معدّلة حسب وضع الطلب. الخادم يرجّعها مع تفاصيل الطلب،
 * والواجهة تبيّنها كما هي. الاختبار يمر على كل حالة وكل تركيبة ويتأكد إن فيه زر دائمًا.
 */
export function factoryActions(status: RequestStatus, flags: FactoryActionFlags = {}): { primary: FactoryUiAction | null; others: FactoryUiAction[] } {
  const base = FACTORY_ACTIONS[status];
  if (status === "awaiting_offers") {
    // بعد اعتذار المزوّد: «اختر عرض ثاني» من العروض اللي لسا صالحة. وبدون عروض: ينتظر، ويقدر يعدّل أو يلغي.
    if (!flags.hasLiveOffers) return { primary: null, others: base.others };
    return { primary: flags.reopenedAfterWithdrawal ? "choose_other" : "accept", others: base.others };
  }
  if (status === "in_progress" && flags.cancellationPending) {
    return { primary: null, others: ["withdraw_cancel_request", "open_dispute"] };
  }
  if (status === "completed" && flags.alreadyRated) {
    return { primary: base.primary, others: base.others.filter((a) => a !== "rate") };
  }
  return { primary: base.primary, others: [...base.others] };
}
