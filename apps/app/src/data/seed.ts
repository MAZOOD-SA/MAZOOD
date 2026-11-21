// بيانات تجريبية (وهمية) تبيّن دورة العروض والفواتير لين تُبنى حقيقية في المرحلة 4 و5.
// الأسماء والأرقام كلها من خيالنا، وتظهر في الواجهة بشارة «تجريبي».
// الأرقام الضريبية والسجلات هنا شكلية وغير صالحة عمدًا.
import { riyals } from "@/lib/money";
import type { AppNotification, Factory, Invoice, Offer, Provider, ServiceRequest } from "./types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const FACTORY: Factory = {
  name: { ar: "مصنع الجودة للبلاستيك", en: "Al Jawdah Plastics Factory" },
  city: { ar: "سدير", en: "Sudair" },
  commercialRegister: "0000000000",
  vatNumber: "300000000000003",
};

export const PROVIDERS: Provider[] = [
  { id: "p1", name: { ar: "مؤسسة الثويرات للنقل", en: "Al Thuwairat Transport" }, verified: true, ratingTenths: 48, completedOrders: 32 },
  { id: "p2", name: { ar: "شركة سدير للخدمات اللوجستية", en: "Sudair Logistics Co." }, verified: true, ratingTenths: 46, completedOrders: 57 },
  { id: "p3", name: { ar: "مؤسسة الطريق الصناعي", en: "Industrial Road Est." }, verified: true, ratingTenths: 44, completedOrders: 12 },
  { id: "p4", name: { ar: "ورشة الإتقان للتكييف", en: "Al Itqan AC Workshop" }, verified: true, ratingTenths: 49, completedOrders: 88 },
  { id: "p5", name: { ar: "مؤسسة الرمال الذهبية", en: "Golden Sands Est." }, verified: true, ratingTenths: 45, completedOrders: 21 },
];

export function seedRequests(): ServiceRequest[] {
  return [
    {
      id: "r1001",
      category: "transport",
      typeId: "flatbed",
      title: { ar: "سطحة 20 طن للدمام", en: "20-ton flatbed to Dammam" },
      details: {
        ar: "نقل 6 قوالب حديد من المصنع إلى ميناء الدمام. الوزن الإجمالي تقريبًا 18 طن.",
        en: "Move 6 steel molds from the factory to Dammam port. Total weight about 18 tons.",
      },
      location: { ar: "مدينة سدير الصناعية · مصنع 14", en: "Sudair Industrial City · Factory 14" },
      when: "tomorrow",
      createdAt: minutesAgo(15),
      status: "awaiting_offers",
      demo: true,
    },
    {
      id: "r1000",
      category: "maintenance",
      typeId: "ac",
      title: { ar: "صيانة مكيفات العنبر 2", en: "AC maintenance, hall 2" },
      details: { ar: "صيانة دورية لـ 8 مكيفات سبليت.", en: "Routine service for 8 split AC units." },
      location: { ar: "مدينة سدير الصناعية · مصنع 14", en: "Sudair Industrial City · Factory 14" },
      when: "this_week",
      createdAt: minutesAgo(60 * 26),
      status: "completed",
      acceptedOfferId: "o2001",
      invoiceId: "i3001",
      demo: true,
    },
    {
      id: "r0999",
      category: "materials",
      typeId: "sand",
      title: { ar: "رمل دفان 3 قلابات", en: "Fill sand, 3 dump trucks" },
      details: { ar: "رمل دفان لتسوية الساحة الخلفية.", en: "Fill sand to level the back yard." },
      location: { ar: "مدينة سدير الصناعية · مصنع 14", en: "Sudair Industrial City · Factory 14" },
      when: "this_week",
      createdAt: minutesAgo(60 * 24 * 3),
      status: "in_progress",
      acceptedOfferId: "o2101",
      demo: true,
    },
  ];
}

export function seedOffers(): Offer[] {
  return [
    {
      id: "o1001",
      requestId: "r1001",
      providerId: "p1",
      priceHalalas: riyals(2100),
      summary: { ar: "سطحة 20 طن · التحميل بكرة الساعة 7 الصبح · مدة التنفيذ يوم واحد", en: "20-ton flatbed · loading tomorrow 7 AM · one day" },
      note: { ar: "السعر يشمل الرافعة عند التحميل. التأمين على الحمولة متوفر بطلب.", en: "Price includes a crane for loading. Cargo insurance available on request." },
      createdAt: minutesAgo(9),
      status: "pending",
    },
    {
      id: "o1002",
      requestId: "r1001",
      providerId: "p2",
      priceHalalas: riyals(2300),
      summary: { ar: "سطحة 25 طن · التحميل بكرة الساعة 9 الصبح · مدة التنفيذ يوم واحد", en: "25-ton flatbed · loading tomorrow 9 AM · one day" },
      note: { ar: "معنا سائق احتياطي، ونرسل موقع الشاحنة مباشر.", en: "Backup driver included, live truck location shared." },
      createdAt: minutesAgo(6),
      status: "pending",
    },
    {
      id: "o1003",
      requestId: "r1001",
      providerId: "p3",
      priceHalalas: riyals(2600),
      summary: { ar: "سطحة 20 طن · التحميل بعد بكرة · مدة التنفيذ يومين", en: "20-ton flatbed · loading in 2 days · two days" },
      note: { ar: "الوصول للميناء في اليوم الثاني الصبح.", en: "Arrives at the port on the morning of day two." },
      createdAt: minutesAgo(2),
      status: "pending",
    },
    {
      id: "o2001",
      requestId: "r1000",
      providerId: "p4",
      priceHalalas: riyals(1600),
      summary: { ar: "صيانة 8 مكيفات · يوم واحد", en: "Service 8 AC units · one day" },
      note: { ar: "تشمل تنظيف الفلاتر وفحص الفريون.", en: "Includes filter cleaning and refrigerant check." },
      createdAt: minutesAgo(60 * 30),
      status: "accepted",
    },
    {
      id: "o2101",
      requestId: "r0999",
      providerId: "p5",
      priceHalalas: riyals(1950),
      summary: { ar: "3 قلابات رمل دفان · التوريد خلال يومين", en: "3 dump trucks of fill sand · delivery in 2 days" },
      note: { ar: "", en: "" },
      createdAt: minutesAgo(60 * 24 * 3 - 90),
      status: "accepted",
    },
  ];
}

export function seedInvoices(): Invoice[] {
  return [
    {
      id: "i3001",
      number: "MZ-2026-000127",
      requestId: "r1000",
      issuedAt: minutesAgo(60 * 20),
      lines: [{ description: { ar: "صيانة 8 مكيفات سبليت · ورشة الإتقان للتكييف", en: "Service of 8 split AC units · Al Itqan AC Workshop" }, amountHalalas: riyals(1600) }],
      status: "paid",
    },
  ];
}

export function seedNotifications(): AppNotification[] {
  return [
    { id: "n3", text: { ar: "وصلك 3 عروض على طلب السطحة", en: "You have 3 quotes on the flatbed request" }, createdAt: minutesAgo(2), read: false, requestId: "r1001" },
    { id: "n2", text: { ar: "الفاتورة MZ-2026-000127 جاهزة", en: "Invoice MZ-2026-000127 is ready" }, createdAt: minutesAgo(60 * 20), read: true },
    { id: "n1", text: { ar: "مؤسسة الرمال الذهبية بدأت تنفيذ طلب رمل الدفان", en: "Golden Sands started your fill sand request" }, createdAt: minutesAgo(60 * 24 * 2), read: true, requestId: "r0999" },
  ];
}
