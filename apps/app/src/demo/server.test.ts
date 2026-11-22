// الخادم التجريبي (رابط النسخة التجريبية): الدورة كاملة من الطلب للتقييم، بنفس شكل ردود الخادم الحقيقي.
import { beforeEach, describe, expect, it } from "vitest";
import type { FactoryRequestView, JobView, MyOffer, OpenRequest } from "@/api/types";
import { demoApi, resetDemo } from "./server";

const login = async (phone: string, as?: "provider") =>
  (await demoApi<{ token: string }>("POST", "/v1/auth/otp/verify", { phone, code: "123456", ...(as ? { as } : {}) }, null)).token;

const newRequest = { category: "transport", typeId: "flatbed", details: "نقل ماكينة من المصنع إلى الرياض", area: "المدينة الصناعية", location: "مصنع ١٤", when: "today" };

beforeEach(() => resetDemo());

describe("الخادم التجريبي", () => {
  it("الدورة كاملة: طلب ← عرض ← قبول ← بدأ ← تعديل سعر ← تم ← تأكيد ← تقييم", async () => {
    const f = await login("0500000001");
    const p = await login("0500000002", "provider");
    const created = await demoApi<{ request: { id: string }; reach: number }>("POST", "/v1/requests", newRequest, f);
    expect(created.reach).toBeGreaterThan(0);
    const id = created.request.id;

    const open = await demoApi<{ requests: OpenRequest[] }>("GET", "/v1/provider/requests", undefined, p);
    const seen = open.requests.find((r) => r.id === id)!;
    expect(seen).toBeDefined();
    // المزوّد ما يشوف موقع المصنع بالضبط قبل القبول.
    expect(seen).not.toHaveProperty("location");

    const { offer } = await demoApi<{ offer: MyOffer }>("POST", `/v1/provider/requests/${id}/offers`, { priceHalalas: 150_000, durationHours: 6 }, p);
    await expect(demoApi("POST", `/v1/provider/requests/${id}/offers`, { priceHalalas: 150_000, durationHours: 6 }, p)).rejects.toMatchObject({ code: "offer_exists" });

    let v = await demoApi<FactoryRequestView>("GET", `/v1/requests/${id}`, undefined, f);
    expect(v.actions.primary).toBe("accept");
    expect(v.offers[0].provider.verified).toBe(true);
    // فتح المصنع للتفاصيل = «المصنع شاف عرضك».
    const mine = await demoApi<{ offers: MyOffer[] }>("GET", "/v1/provider/offers", undefined, p);
    expect(mine.offers.find((o) => o.id === offer.id)!.seenByFactory).toBe(true);

    v = await demoApi<FactoryRequestView>("POST", `/v1/requests/${id}/offers/${offer.id}/accept`, undefined, f);
    expect(v.request.status).toBe("accepted");
    expect(v.order!.provider.contactPhone).toBeTruthy();

    const jobs = await demoApi<{ jobs: { orderId: string; requestId: string }[] }>("GET", "/v1/provider/jobs", undefined, p);
    const orderId = jobs.jobs.find((j) => j.requestId === id)!.orderId;
    await demoApi<JobView>("POST", `/v1/provider/jobs/${orderId}/start`, undefined, p);
    await demoApi("POST", `/v1/provider/jobs/${orderId}/price-change`, { newPriceHalalas: 170_000, reason: "زادت المسافة ٣٠ كيلو" }, p);
    // «تم التنفيذ» ممنوع لين ينحسم السعر.
    await expect(demoApi("POST", `/v1/provider/jobs/${orderId}/deliver`, undefined, p)).rejects.toMatchObject({ code: "price_change_pending" });
    v = await demoApi<FactoryRequestView>("GET", `/v1/requests/${id}`, undefined, f);
    const change = v.execution!.priceChanges[0];
    v = await demoApi<FactoryRequestView>("POST", `/v1/requests/${id}/price-changes/${change.id}/approve`, undefined, f);
    expect(v.order!.price.amountHalalas).toBe(170_000);

    await demoApi("POST", `/v1/provider/jobs/${orderId}/deliver`, undefined, p);
    v = await demoApi<FactoryRequestView>("GET", `/v1/requests/${id}`, undefined, f);
    expect(v.actions.primary).toBe("confirm");
    v = await demoApi<FactoryRequestView>("POST", `/v1/requests/${id}/confirm`, undefined, f);
    expect(v.request.status).toBe("completed");
    expect(v.actions.others).toContain("rate");
    v = await demoApi<FactoryRequestView>("POST", `/v1/requests/${id}/rating`, { stars: 5 }, f);
    expect(v.actions.others).not.toContain("rate");
    await expect(demoApi("POST", `/v1/requests/${id}/rating`, { stars: 4 }, f)).rejects.toMatchObject({ code: "already_rated" });
  });

  it("المزوّد يعتذر: الطلب يرجع مفتوح، والمصنع يشوف «اختر عرض ثاني»، والمزوّد ما يرجع يشوف الطلب", async () => {
    const f = await login("0500000001");
    const p = await login("0500000002", "provider");
    const { request } = await demoApi<{ request: { id: string } }>("POST", "/v1/requests", newRequest, f);
    const other = await login("0500000099", "provider");
    const { offer } = await demoApi<{ offer: MyOffer }>("POST", `/v1/provider/requests/${request.id}/offers`, { priceHalalas: 100_000, durationHours: 6 }, p);
    await demoApi("POST", `/v1/provider/requests/${request.id}/offers`, { priceHalalas: 120_000, durationHours: 6 }, other);
    await demoApi("POST", `/v1/requests/${request.id}/offers/${offer.id}/accept`, undefined, f);
    const job = (await demoApi<{ jobs: { orderId: string; requestId: string }[] }>("GET", "/v1/provider/jobs", undefined, p)).jobs.find((j) => j.requestId === request.id)!;
    await demoApi("POST", `/v1/provider/jobs/${job.orderId}/withdraw`, { reason: "تعطلت السطحة" }, p);
    const v = await demoApi<FactoryRequestView>("GET", `/v1/requests/${request.id}`, undefined, f);
    expect(v.request.status).toBe("awaiting_offers");
    expect(v.actions.primary).toBe("choose_other");
    const open = await demoApi<{ requests: OpenRequest[] }>("GET", "/v1/provider/requests", undefined, p);
    expect(open.requests.some((r) => r.id === request.id)).toBe(false);
  });

  it("طلب الإلغاء بعد البدء: المزوّد يرفض فيتحوّل بلاغ، والمصنع يقدر يضيف ملاحظة", async () => {
    const f = await login("0500000001");
    const p = await login("0500000002", "provider");
    const { request } = await demoApi<{ request: { id: string } }>("POST", "/v1/requests", newRequest, f);
    const { offer } = await demoApi<{ offer: MyOffer }>("POST", `/v1/provider/requests/${request.id}/offers`, { priceHalalas: 100_000, durationHours: 6 }, p);
    await demoApi("POST", `/v1/requests/${request.id}/offers/${offer.id}/accept`, undefined, f);
    const job = (await demoApi<{ jobs: { orderId: string; requestId: string }[] }>("GET", "/v1/provider/jobs", undefined, p)).jobs.find((j) => j.requestId === request.id)!;
    await demoApi("POST", `/v1/provider/jobs/${job.orderId}/start`, undefined, p);
    let v = await demoApi<FactoryRequestView>("POST", `/v1/requests/${request.id}/cancellation`, { reason: "تغيّرت الخطة" }, f);
    expect(v.actions.others).toContain("withdraw_cancel_request");
    await demoApi("POST", `/v1/provider/jobs/${job.orderId}/cancellation/respond`, { decision: "decline" }, p);
    v = await demoApi<FactoryRequestView>("POST", `/v1/requests/${request.id}/dispute/notes`, { body: "نبي نكمل بعد العيد" }, f);
    expect(v.request.status).toBe("disputed");
    expect(v.actions.others).toEqual(["add_note"]);
    expect(v.dispute!.notes).toHaveLength(1);
  });

  it("الطلبات الجاهزة: كل طلب للمصنع التجريبي فيه زر واحد على الأقل", async () => {
    const f = await login("0500000001");
    const { requests } = await demoApi<{ requests: { id: string }[] }>("GET", "/v1/requests", undefined, f);
    expect(requests.length).toBeGreaterThanOrEqual(4);
    for (const r of requests) {
      const v = await demoApi<FactoryRequestView>("GET", `/v1/requests/${r.id}`, undefined, f);
      expect(v.actions.primary !== null || v.actions.others.length > 0).toBe(true);
    }
  });

  it("رقم جوال أو رابط في الملاحظة ينرفض، وبدون دخول ممنوع", async () => {
    const p = await login("0500000002", "provider");
    await expect(demoApi("POST", "/v1/provider/requests/r5/offers", { priceHalalas: 100_000, durationHours: 2, note: "كلمني 0551234567" }, p)).rejects.toMatchObject({
      code: "contact_info_not_allowed",
    });
    await expect(demoApi("GET", "/v1/me", undefined, null)).rejects.toMatchObject({ status: 401 });
  });
});
