import { describe, expect, it } from "vitest";
import { pendingOffersFor, reducer, type State } from "./reducer";
import { seedInvoices, seedNotifications, seedOffers, seedRequests } from "./seed";

const now = "2026-11-20T12:00:00.000Z";
const initial = (): State => ({
  signedIn: true,
  phone: "+966551234567",
  requests: seedRequests(),
  offers: seedOffers(),
  invoices: seedInvoices(),
  notifications: seedNotifications(),
  invoiceCounter: 127,
});

describe("قبول العروض", () => {
  it("يقبل عرض واحد ويرفض الباقي", () => {
    const s = reducer(initial(), { type: "acceptOffer", offerId: "o1002", now });
    const offers = s.offers.filter((o) => o.requestId === "r1001");
    expect(offers.find((o) => o.id === "o1002")?.status).toBe("accepted");
    expect(offers.filter((o) => o.status === "declined")).toHaveLength(2);
    expect(s.requests.find((r) => r.id === "r1001")?.status).toBe("in_progress");
  });

  it("ما يقبل عرض ثاني بعد ما انقبل واحد", () => {
    let s = reducer(initial(), { type: "acceptOffer", offerId: "o1002", now });
    s = reducer(s, { type: "acceptOffer", offerId: "o1001", now });
    expect(s.requests.find((r) => r.id === "r1001")?.acceptedOfferId).toBe("o1002");
  });

  it("يرتب العروض من الأقل سعرًا", () => {
    const prices = pendingOffersFor(initial(), "r1001").map((o) => o.priceHalalas);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});

describe("تأكيد الاستلام", () => {
  it("يكمّل الطلب ويصدر فاتورة برقم تسلسلي", () => {
    let s = reducer(initial(), { type: "acceptOffer", offerId: "o1001", now });
    s = reducer(s, { type: "confirmReceipt", requestId: "r1001", now });
    const r = s.requests.find((x) => x.id === "r1001");
    expect(r?.status).toBe("completed");
    const inv = s.invoices.find((i) => i.id === r?.invoiceId);
    expect(inv?.number).toBe("MZ-2026-000128");
    expect(inv?.lines[0].amountHalalas).toBe(s.offers.find((o) => o.id === "o1001")?.priceHalalas);
  });

  it("ما يصدر فاتورة لطلب ما انقبل فيه عرض", () => {
    const s = reducer(initial(), { type: "confirmReceipt", requestId: "r1001", now });
    expect(s.invoices).toHaveLength(1);
  });
});

describe("الإلغاء", () => {
  it("يلغي طلب بانتظار العروض ويرفض عروضه", () => {
    const s = reducer(initial(), { type: "cancelRequest", requestId: "r1001" });
    expect(s.requests.find((r) => r.id === "r1001")?.status).toBe("cancelled");
    expect(pendingOffersFor(s, "r1001")).toHaveLength(0);
  });

  it("ما يلغي طلب قيد التنفيذ", () => {
    const s = reducer(initial(), { type: "cancelRequest", requestId: "r0999" });
    expect(s.requests.find((r) => r.id === "r0999")?.status).toBe("in_progress");
  });

  it("يتجاهل العروض اللي توصل بعد الإلغاء", () => {
    let s = reducer(initial(), { type: "cancelRequest", requestId: "r1001" });
    const before = s.offers.length;
    s = reducer(s, { type: "offersArrived", offers: [{ ...seedOffers()[0], id: "late" }], now });
    expect(s.offers).toHaveLength(before);
  });
});
