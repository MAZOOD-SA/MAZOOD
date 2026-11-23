// نص سبب البلاغ للإدارة (أسباب الطرفين، وأسباب النظام من طلب الإلغاء).
import type { DisputeReason } from "@mazood/shared";
import type { StringKey } from "@/i18n/strings";

export const DISPUTE_REASON_LABEL: Record<DisputeReason, StringKey> = {
  quality: "disputeQuality",
  not_delivered: "disputeNotDelivered",
  delay: "disputeDelay",
  price: "disputePrice",
  conduct: "disputeConduct",
  other: "disputeOther",
  cancellation_declined: "disputeReasonCancelDeclined",
  cancellation_no_response: "disputeReasonNoResponse",
};
