// غرفة الصفقة (القرار ٣٥، الخطة docs/plans/deal-room.md): محادثة بين العميل والمزوّد داخل الطلب بعد القبول.
// القواعد هنا مشتركة بين الخادم (الفحص الفعلي) والواجهة (إظهار خانة الكتابة أو سطر «انقفلت»).
import { z } from "zod";
import type { RequestStatus } from "./order-flow.ts";

/** أطول رسالة. */
export const MESSAGE_MAX_CHARS = 1000;
/** أقصى عدد رسائل لكل مستخدم في الدقيقة (الخادم يرفض الزيادة بـ rate_limited). */
export const MESSAGES_PER_MINUTE = 20;
/** تنبيه «رسالة جديدة» واحد كل هالمدة للطلب الواحد، مهما كثرت الرسائل. */
export const MESSAGE_NOTIFY_WINDOW_MINUTES = 10;
/** كل كم ثانية تتحدّث المحادثة والصفحة مفتوحة. */
export const MESSAGE_POLL_SECONDS = 10;

/** الحالات اللي تنكتب فيها رسائل. بعد الاكتمال أو الإلغاء تصير قراءة بس (قرار المالك، 23 نوفمبر 2026). */
export const CHAT_WRITABLE_STATUSES = ["accepted", "in_progress", "delivered", "disputed"] as const satisfies readonly RequestStatus[];

export function chatWritable(status: RequestStatus | string): boolean {
  return (CHAT_WRITABLE_STATUSES as readonly string[]).includes(status);
}

/** ليش المحادثة مقفولة (لسطر التوضيح في الواجهة). null = مفتوحة. */
export function chatClosedReason(status: RequestStatus | string): "completed" | "cancelled" | null {
  if (chatWritable(status)) return null;
  return status === "completed" ? "completed" : "cancelled";
}

export const sendMessageBody = z
  .object({ body: z.string().trim().min(1, "required").max(MESSAGE_MAX_CHARS, "too_long") })
  .strict();

/** أحداث من الخط الزمني للطلب تظهر سطر في المحادثة، عشان القصة كاملة في مكان واحد. */
export const CHAT_SYSTEM_EVENTS = ["accepted", "started", "delivered", "confirmed", "auto_confirmed", "cancelled", "dispute_opened", "dispute_resolved"] as const;
export type ChatSystemEvent = (typeof CHAT_SYSTEM_EVENTS)[number];

/** عنصر في المحادثة: رسالة من طرف، أو سطر من النظام. */
export type ChatItem =
  | { kind: "message"; id: string; seq: number; from: "customer" | "provider"; mine: boolean; body: string; at: string }
  | { kind: "event"; id: string; seq: number; event: ChatSystemEvent; at: string };

export type ChatView = {
  items: ChatItem[];
  writable: boolean;
  closedReason: "completed" | "cancelled" | null;
  /** رقم آخر رسالة. الواجهة تقارنه عشان تعرف لو وصل جديد (تنزل لتحت). */
  lastSeq: number;
};
