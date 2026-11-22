// قراءة الطلبات وإجراءاتها من الخادم.
// الشاشات تسأل الخادم كل كم ثانية وقت ما الطلب ينتظر شي (عروض، أو بدء المزوّد، أو رده على الإلغاء)،
// عشان المكافأة (وصول العروض) تبان بدون ما يحدّث الصفحة.
import type { CreateRequestInput, RequestDetailsDto, RequestDto } from "@mazood/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./client";

const LIST_KEY = ["requests"] as const;
const detailKey = (id: string) => ["request", id] as const;

/** هل الطلب ينتظر شي يتغيّر من طرف ثاني؟ */
export function isWaiting(r: Pick<RequestDto, "status" | "cancelRequestStatus">): boolean {
  return r.status === "awaiting_offers" || r.status === "accepted" || r.cancelRequestStatus === "pending";
}

export function useRequests() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api<RequestDto[]>("GET", "/requests"),
    refetchInterval: (q) => (q.state.data?.some(isWaiting) ? 4_000 : false),
  });
}

/** يجلب تفاصيل الطلبات الحالية مسبقًا، فتنفتح فورًا لما يضغط عليها المستخدم. */
export function usePrefetchActive(list: RequestDto[] | undefined) {
  const qc = useQueryClient();
  // نجلب مرة وحدة لكل طلب، مو مع كل تحديث للقائمة (القائمة تتحدّث كل ٤ ثواني وقت الانتظار).
  const ids = (list ?? [])
    .filter((r) => r.status !== "completed" && r.status !== "cancelled")
    .slice(0, 8)
    .map((r) => r.id)
    .join(",");
  useEffect(() => {
    for (const id of ids ? ids.split(",") : []) {
      qc.prefetchQuery({ queryKey: detailKey(id), queryFn: () => api<RequestDetailsDto>("GET", `/requests/${id}`), staleTime: 30_000 });
    }
  }, [ids, qc]);
}

export function useRequest(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => api<RequestDetailsDto>("GET", `/requests/${id}`),
    refetchInterval: (q) => (q.state.data && isWaiting(q.state.data) ? 3_000 : false),
  });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequestInput) => api<RequestDetailsDto>("POST", "/requests", input),
    onSuccess: (r) => {
      qc.setQueryData(detailKey(r.id), r);
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export type RequestCommand =
  | { kind: "accept"; offerId: string }
  | { kind: "cancel" }
  | { kind: "request_cancel" }
  | { kind: "withdraw_cancel_request" }
  | { kind: "confirm_receipt" }
  | { kind: "open_dispute" };

const PATHS: Record<RequestCommand["kind"], string> = {
  accept: "accept",
  cancel: "cancel",
  request_cancel: "cancel-request",
  withdraw_cancel_request: "cancel-request/withdraw",
  confirm_receipt: "confirm-receipt",
  open_dispute: "dispute",
};

/** ينفّذ إجراء على الطلب. الخادم يتحقق إن الإجراء مسموح، ويرجع الطلب بحالته الجديدة. */
export function useRequestCommand(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cmd: RequestCommand) =>
      api<RequestDetailsDto>("POST", `/requests/${id}/${PATHS[cmd.kind]}`, cmd.kind === "accept" ? { offerId: cmd.offerId } : undefined),
    onSuccess: (r) => {
      qc.setQueryData(detailKey(id), r);
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    // لو الحالة تغيّرت من طرف ثاني (مثلًا المزوّد بدأ التنفيذ)، نجيب الحالة الجديدة.
    onError: () => qc.invalidateQueries({ queryKey: detailKey(id) }),
  });
}

export async function markOffersSeen(id: string): Promise<void> {
  await api("POST", `/requests/${id}/seen`).catch(() => {});
}
