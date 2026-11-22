import { describe, expect, it } from "vitest";
import { CATEGORY_INFO } from "./categories";
import { normalizeSaudiMobile } from "./phone";
import {
  allowedFactoryActions,
  DEFAULT_CANCEL_POLICY,
  REQUEST_STATUSES,
  type CancelPolicy,
  type CancelRequestStatus,
  type RequestSnapshot,
} from "./requests";
import { createRequestSchema, factoryProfileSchema, otpVerifySchema } from "./schemas";

const snap = (s: Partial<RequestSnapshot> & Pick<RequestSnapshot, "status">): RequestSnapshot => ({
  cancelRequestStatus: null,
  pendingOffers: 0,
  disputeOpened: false,
  ...s,
});

describe("رقم الجوال", () => {
  it("يوحّد الصيغ المختلفة لنفس الرقم", () => {
    for (const v of ["0551234567", "551234567", "966551234567", "+966551234567", "055 123 4567", "٠٥٥١٢٣٤٥٦٧"]) {
      expect(normalizeSaudiMobile(v)).toBe("+966551234567");
    }
  });
  it("يرفض الأرقام غير السعودية أو الأرضية", () => {
    for (const v of ["0112345678", "12345", "+971551234567", "05512345678", ""]) {
      expect(normalizeSaudiMobile(v)).toBeNull();
    }
  });
});

describe("التحقق من المدخلات", () => {
  it("رمز التحقق ٦ أرقام، ويقبل الأرقام المشرقية", () => {
    expect(otpVerifySchema.parse({ phone: "0551234567", code: "٢٣٤٥٦٧" }).code).toBe("234567");
    expect(otpVerifySchema.safeParse({ phone: "0551234567", code: "12345" }).success).toBe(false);
  });
  it("يرفض نوع ما يتبع القسم", () => {
    const base = { category: "transport", details: "نقل قوالب حديد للميناء", location: "سدير", when: "today" } as const;
    expect(createRequestSchema.safeParse({ ...base, typeId: "flatbed" }).success).toBe(true);
    expect(createRequestSchema.safeParse({ ...base, typeId: "ac" }).success).toBe(false);
  });
  it("ينظّف النصوص ويرفض القصيرة", () => {
    const r = createRequestSchema.parse({ category: "materials", typeId: "sand", details: "  رمل دفان لتسوية الساحة\u0007 ", location: "سدير", when: "today" });
    expect(r.details).toBe("رمل دفان لتسوية الساحة");
    expect(createRequestSchema.safeParse({ category: "materials", typeId: "sand", details: "قصير", location: "سدير", when: "today" }).success).toBe(false);
  });
  it("الرقم الضريبي ١٥ رقم يبدأ وينتهي بـ 3، والسجل ١٠ أرقام", () => {
    expect(factoryProfileSchema.safeParse({ name: "مصنع", location: "سدير", vatNumber: "300000000000003" }).success).toBe(true);
    expect(factoryProfileSchema.safeParse({ name: "مصنع", location: "سدير", vatNumber: "100000000000003" }).success).toBe(false);
    expect(factoryProfileSchema.safeParse({ name: "مصنع", location: "سدير", commercialRegister: "123" }).success).toBe(false);
  });
  it("كل قسم فيه نوع واحد على الأقل", () => {
    expect(CATEGORY_INFO).toHaveLength(6);
    for (const c of CATEGORY_INFO) expect(c.types.length).toBeGreaterThan(0);
  });
});

describe("قواعد الطلب والإلغاء", () => {
  const policies: CancelPolicy[] = [{ freeCancelUntil: "provider_starts" }, { freeCancelUntil: "offer_accepted" }];
  const cancelStates: CancelRequestStatus[] = [null, "pending", "declined"];

  it("ولا مرة طريق مسدود: كل حالة فيها إجراء واحد على الأقل، مع أي سياسة", () => {
    for (const policy of policies)
      for (const status of REQUEST_STATUSES)
        for (const cancelRequestStatus of cancelStates)
          for (const disputeOpened of [false, true])
            for (const pendingOffers of [0, 2]) {
              const actions = allowedFactoryActions({ status, cancelRequestStatus, disputeOpened, pendingOffers }, policy);
              expect(actions.length, `${policy.freeCancelUntil}/${status}/${cancelRequestStatus}`).toBeGreaterThan(0);
            }
  });

  it("قبل وصول العروض: الإلغاء متاح", () => {
    expect(allowedFactoryActions(snap({ status: "awaiting_offers" }), DEFAULT_CANCEL_POLICY)).toEqual(["cancel"]);
    expect(allowedFactoryActions(snap({ status: "awaiting_offers", pendingOffers: 2 }), DEFAULT_CANCEL_POLICY)).toEqual(["accept_offer", "cancel"]);
  });

  it("السياسة المعتمدة: بعد القبول وقبل البدء، الإلغاء مجاني", () => {
    expect(allowedFactoryActions(snap({ status: "accepted" }), DEFAULT_CANCEL_POLICY)).toContain("cancel");
  });

  it("بعد بدء التنفيذ: «طلب إلغاء» بدل الإلغاء المباشر", () => {
    const a = allowedFactoryActions(snap({ status: "in_progress" }), DEFAULT_CANCEL_POLICY);
    expect(a).toContain("request_cancel");
    expect(a).not.toContain("cancel");
    expect(allowedFactoryActions(snap({ status: "in_progress", cancelRequestStatus: "pending" }), DEFAULT_CANCEL_POLICY)).toContain("withdraw_cancel_request");
    expect(allowedFactoryActions(snap({ status: "in_progress", cancelRequestStatus: "declined" }), DEFAULT_CANCEL_POLICY)).toContain("open_dispute");
  });

  it("لو تغيّرت السياسة: بعد القبول يصير «طلب إلغاء»", () => {
    const a = allowedFactoryActions(snap({ status: "accepted" }), { freeCancelUntil: "offer_accepted" });
    expect(a).toContain("request_cancel");
    expect(a).not.toContain("cancel");
  });

  it("الطلب المكتمل أو الملغي: «اطلب مرة ثانية»", () => {
    expect(allowedFactoryActions(snap({ status: "completed" }), DEFAULT_CANCEL_POLICY)).toEqual(["view_invoice", "reorder"]);
    expect(allowedFactoryActions(snap({ status: "cancelled" }), DEFAULT_CANCEL_POLICY)).toEqual(["reorder"]);
  });
});
