// المرحلة ٤، الخطوة ٣: جدول انتقالات الطلب. اختبار لكل انتقال مسموح، ولكل انتقال ممنوع،
// وإن المصنع يلقى دائمًا زر في كل حالة («ولا مرة طريق مسدود» في CLAUDE.md).
import { describe, expect, it } from "vitest";
import {
  FACTORY_ACTIONS,
  FLOW_ACTORS,
  OrderFlowError,
  REQUEST_STATUSES,
  TRANSITIONS,
  allowedActions,
  canTransition,
  nextStatus,
  type FlowActor,
  type RequestStatus,
} from "./order-flow.ts";

// الجدول المتوقع مكتوب هنا من جديد (مو منسوخ من الكود)، عشان أي تغيير في الجدول يلزم تغيير مقصود هنا.
const EXPECTED: [action: string, from: RequestStatus, to: RequestStatus, actors: FlowActor[]][] = [
  ["nominate", "awaiting_offers", "pending_approval", ["factory"]],
  ["withdraw_nomination", "pending_approval", "awaiting_offers", ["factory"]],
  ["accept", "awaiting_offers", "accepted", ["factory"]],
  ["accept", "pending_approval", "accepted", ["factory"]],
  ["cancel", "awaiting_offers", "cancelled", ["factory"]],
  ["cancel", "pending_approval", "cancelled", ["factory"]],
  ["cancel", "accepted", "cancelled", ["factory"]],
  ["cancel", "expired", "cancelled", ["factory"]],
  ["expire", "awaiting_offers", "expired", ["system"]],
  ["republish", "expired", "awaiting_offers", ["factory"]],
  ["provider_withdraw", "accepted", "awaiting_offers", ["provider"]],
  ["start", "accepted", "in_progress", ["provider"]],
  ["deliver", "in_progress", "delivered", ["provider"]],
  ["confirm", "delivered", "completed", ["factory"]],
  ["auto_confirm", "delivered", "completed", ["system"]],
  ["cancel_agreed", "in_progress", "cancelled", ["provider"]],
  ["open_dispute", "in_progress", "disputed", ["factory", "provider", "system"]],
  ["open_dispute", "delivered", "disputed", ["factory", "provider"]],
  ["resolve_complete", "disputed", "completed", ["staff"]],
  ["resolve_cancel", "disputed", "cancelled", ["staff"]],
  ["resolve_resume", "disputed", "in_progress", ["staff"]],
];

describe("جدول الانتقالات", () => {
  it("الجدول في الكود يطابق المتوقع بالضبط", () => {
    const actual = TRANSITIONS.flatMap((t) => t.from.map((f) => [t.action, f, t.to, [...t.actors].sort()]));
    const expected = EXPECTED.map(([a, f, to, actors]) => [a, f, to, [...actors].sort()]);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it.each(EXPECTED)("مسموح: %s من %s إلى %s", (action, from, to, actors) => {
    for (const actor of actors) expect(nextStatus(from, action as never, actor)).toBe(to);
  });

  it("كل تركيبة ثانية (حالة × إجراء × طرف) ممنوعة وترجّع invalid_transition", () => {
    const allowed = new Set(EXPECTED.flatMap(([a, f, , actors]) => actors.map((x) => `${a}|${f}|${x}`)));
    const actions = [...new Set(EXPECTED.map((e) => e[0]))];
    let checked = 0;
    for (const status of REQUEST_STATUSES)
      for (const action of actions)
        for (const actor of FLOW_ACTORS) {
          if (allowed.has(`${action}|${status}|${actor}`)) continue;
          checked++;
          expect(canTransition(status, action as never, actor)).toBe(false);
          expect(() => nextStatus(status, action as never, actor)).toThrow(OrderFlowError);
          try {
            nextStatus(status, action as never, actor);
          } catch (e) {
            expect((e as OrderFlowError).code).toBe("invalid_transition");
          }
        }
    expect(checked).toBeGreaterThan(200);
  });

  it("المكتمل والملغي نهائيين: ما يطلع منهم أي انتقال", () => {
    for (const actor of FLOW_ACTORS) {
      expect(allowedActions("completed", actor)).toEqual([]);
      expect(allowedActions("cancelled", actor)).toEqual([]);
    }
  });

  it("المزوّد ما يقدر يقبل ولا يلغي مجانًا، والمصنع ما يقدر يبدأ ولا يسلّم", () => {
    expect(canTransition("awaiting_offers", "accept", "provider")).toBe(false);
    expect(canTransition("accepted", "cancel", "provider")).toBe(false);
    expect(canTransition("accepted", "start", "factory")).toBe(false);
    expect(canTransition("in_progress", "deliver", "factory")).toBe(false);
    // بعد البدء الإلغاء المباشر ممنوع: لازم «طلب إلغاء» يوافق عليه المزوّد.
    expect(canTransition("in_progress", "cancel", "factory")).toBe(false);
  });
});

describe("ولا مرة طريق مسدود", () => {
  it.each(REQUEST_STATUSES)("في حالة %s فيه زر واضح للمصنع", (status) => {
    const a = FACTORY_ACTIONS[status];
    expect(a.primary !== null || a.others.length > 0).toBe(true);
  });

  it("الإلغاء متاح للمصنع في كل حالة قبل البدء، وطلب الإلغاء بعده", () => {
    for (const s of ["awaiting_offers", "pending_approval", "accepted", "expired"] as const) {
      expect([FACTORY_ACTIONS[s].primary, ...FACTORY_ACTIONS[s].others]).toContain("cancel");
    }
    expect(FACTORY_ACTIONS.in_progress.others).toContain("request_cancel");
  });

  it("الزر الكهرماني واحد بالكثير في كل حالة", () => {
    for (const s of REQUEST_STATUSES) expect(typeof FACTORY_ACTIONS[s].primary === "string" || FACTORY_ACTIONS[s].primary === null).toBe(true);
  });
});
