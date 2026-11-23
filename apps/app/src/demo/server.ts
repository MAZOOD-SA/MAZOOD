// الخادم التجريبي: يشتغل داخل المتصفح لما ما فيه EXPO_PUBLIC_API_URL (رابط النسخة التجريبية للمالك وشريكه).
// يرد على نفس المسارات وبنفس شكل الردود اللي يرجعها الخادم الحقيقي (apps/api/src/routes)، فالشاشات
// تنكتب مرة وحدة وتشتغل في الوضعين (القرار ٣٦ في docs/decisions.md).
//
// ⚠️ هذا للتجربة بس: ما فيه أمان ولا حفظ حقيقي. البيانات في ذاكرة المتصفح (sessionStorage):
// تبقى لو حدّثت الصفحة، وترجع لأصلها في نافذة جديدة. القواعد المهمة (جدول الانتقالات، والأزرار،
// والأسعار، والرسوم، ومنع أرقام التواصل) من @mazood/shared نفسها اللي يستخدمها الخادم الحقيقي.
//
// اللي ما يسويه الخادم التجريبي (قصدًا): رسائل نصية، وتوثيق المزوّد (المزوّد التجريبي موثّق من البداية)،
// ولوحة الإدارة، والمهام في الخلفية (التأكيد التلقائي وانتهاء الطلب).
import { demoProductImage, registerMarketDemo, seedMarket, type DemoHost, type MarketState } from "./market";
import {
  cancellationFee,
  CATEGORY_IDS,
  commitmentView,
  containsContactInfo,
  createRequestBody,
  factoryProfileBody,
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_COMMITMENT_SETTINGS,
  factoryActions,
  nextStatus,
  normalizeSaudiMobile,
  offerBody,
  openDisputeBody,
  priceChangeBody,
  priceForFactory,
  ratingSummary,
  republishBody,
  requiredDocsFor,
  SETTING_DEFAULTS,
  CHAT_SYSTEM_EVENTS,
  chatClosedReason,
  chatWritable,
  sendMessageBody,
  type CancellationPolicy,
  type ChatItem,
  type ChatSystemEvent,
  type ChatView,
  type FlowAction,
  type FlowActor,
  type RequestStatus,
  type DocType,
  inclusionsError,
  type Inclusions,
} from "@mazood/shared";
import { ApiClientError } from "@/api/errors";

type Role = "factory" | "provider";
type User = { id: string; phone: string; role: Role; factoryId: string | null; providerId: string | null };
/** العميل (منشأة أو فرد). الهوية هنا وهمية، ونحفظ آخر ٤ أرقام بس مثل الخادم الحقيقي. */
type Factory = {
  id: string;
  kind?: "business" | "individual" | null;
  name: string | null;
  cityId: string | null;
  commercialRegister: string | null;
  vatNumber: string | null;
  idType?: "national_id" | "iqama" | null;
  idLast4?: string | null;
};
type Provider = { id: string; userId: string | null; tradeName: string; categories: string[]; withdrawals: number; history: number };
type Req = {
  id: string;
  factoryId: string;
  category: string;
  typeId: string;
  details: string;
  area: string | null;
  location: string;
  cityId: string;
  when: "today" | "tomorrow" | "this_week";
  status: RequestStatus;
  createdAt: string;
  expiresAt: string;
};
type Offer = {
  id: string;
  requestId: string;
  providerId: string;
  priceHalalas: number;
  durationHours: number;
  note: string | null;
  inclusions?: Inclusions | null;
  validUntil: string;
  status: "active" | "withdrawn" | "accepted" | "rejected" | "expired";
  revision: number;
  firstSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type Order = {
  id: string;
  requestId: string;
  providerId: string;
  factoryId: string;
  acceptedBy: string;
  state: "active" | "withdrawn" | "done";
  priceHalalas: number;
  acceptedAt: string;
  startedAt: string | null;
  deliveredAt: string | null;
  confirmedAt: string | null;
  policy: CancellationPolicy;
};
type Event = { requestId: string; at: string; by: string; event: string; stage?: string };
type Photo = { id: string; orderId: string; stage: "start" | "delivery"; url: string; createdAt: string };
type PriceChange = { id: string; orderId: string; oldPriceHalalas: number; newPriceHalalas: number; reason: string; status: "pending" | "approved" | "rejected" | "withdrawn"; requestedAt: string; decidedAt: string | null };
type Cancellation = { id: string; orderId: string; requestId: string; kind: "after_start" | "provider_withdrawal"; status: "pending" | "agreed" | "declined" | "withdrawn"; reason: string | null; requestedAt: string; respondBy: string | null; respondedAt: string | null; responseNote: string | null };
type Dispute = { id: string; orderId: string; number: number; reason: string; details: string | null; openedBy: string; status: "open" | "closed"; openedAt: string; notes: { by: string; body: string; at: string }[] };
type Rating = { requestId: string; providerId: string; stars: number; createdAt: string };
/** رسالة في غرفة الصفقة. هنا بدون تشفير لأنها داخل متصفحك بس (الخادم الحقيقي يشفّرها). */
type Message = { id: string; seq: number; orderId: string; senderId: string; from: "customer" | "provider"; body: string; at: string };

type Db = {
  seq: number;
  users: User[];
  factories: Factory[];
  providers: Provider[];
  requests: Req[];
  offers: Offer[];
  orders: Order[];
  events: Event[];
  photos: Photo[];
  priceChanges: PriceChange[];
  cancellations: Cancellation[];
  disputes: Dispute[];
  ratings: Rating[];
  deletions: { userId: string; requestedAt: string }[];
  /** غرفة الصفقة: الرسائل، وآخر رسالة قرأها كل مستخدم في كل طلب («orderId:userId» ← seq). */
  messages: Message[];
  reads: Record<string, number>;
  /** السوق (src/demo/market.ts). */
  market: MarketState;
  /** جلسة «الكوكي» في الموقع (الخادم الحقيقي يحطها في كوكي محمي). */
  session: string | null;
  /** مستندات المزوّد التجريبي القريبة من الانتهاء (فاضية إلا في بيانات «أسوأ حالة»). */
  demoExpiring?: { docType: DocType; expiresOn: string; expired: boolean }[];
};

const CITY = "sudair";
const HOUR = 3600_000;
// v3: غرفة الصفقة (الرسائل). النسخة القديمة المحفوظة تنتهي وتبدأ من جديد.
const STORAGE_KEY = "mazood.demo.v3";
/** كم ثانية بعد رفع الطلب توصل العروض الوهمية من مزوّدين ثانيين. */
const SIMULATED_OFFER_DELAY_MS = 5000;
/** أرقام جاهزة للتجربة: تظهر في شاشة الدخول. */
export const DEMO_PHONES = { factory: "0500000001", provider: "0500000002", individual: "0500000004" } as const;

const iso = (ms: number) => new Date(ms).toISOString();
const now = () => Date.now();

// ───────── البيانات الأولى ─────────

function seed(): Db {
  const t = now();
  const db: Db = {
    seq: 100,
    users: [],
    factories: [{ id: "f1", kind: "business", name: "مصنع سدير للبلاستيك", cityId: CITY, commercialRegister: "1010123456", vatNumber: "300123456700003" }],
    providers: [
      { id: "p1", userId: null, tradeName: "مؤسسة الثويرات للنقل", categories: [...CATEGORY_IDS], withdrawals: 0, history: 32 },
      { id: "p2", userId: null, tradeName: "شركة سدير للخدمات اللوجستية", categories: [...CATEGORY_IDS], withdrawals: 1, history: 57 },
      { id: "p3", userId: null, tradeName: "مؤسسة الطريق الصناعي", categories: [...CATEGORY_IDS], withdrawals: 0, history: 3 },
      { id: "p4", userId: null, tradeName: "ورشة الإتقان للتكييف", categories: [...CATEGORY_IDS], withdrawals: 0, history: 88 },
      { id: "pme", userId: "u2", tradeName: "مؤسسة الأمانة للخدمات", categories: [...CATEGORY_IDS], withdrawals: 0, history: 6 },
    ],
    requests: [],
    offers: [],
    orders: [],
    events: [],
    photos: [],
    priceChanges: [],
    cancellations: [],
    disputes: [],
    ratings: [],
    deletions: [],
    messages: [],
    reads: {},
    market: seedMarket(t, iso),
    session: null,
  };
  db.users.push({ id: "u1", phone: "+966500000001", role: "factory", factoryId: "f1", providerId: null });
  db.users.push({ id: "u2", phone: "+966500000002", role: "provider", factoryId: null, providerId: "pme" });
  // مصنع ثاني (طلباته تظهر للمزوّد التجريبي في «الطلبات المتاحة»).
  db.factories.push({ id: "f2", kind: "business", name: "مصنع الخليج للحديد", cityId: CITY, commercialRegister: null, vatNumber: null });
  db.users.push({ id: "u3", phone: "+966500000003", role: "factory", factoryId: "f2", providerId: null });
  // عميل فرد (القرار ٤١): الاسم والهوية وهمية، وبياناته مكتملة عشان يرفع طلب مباشرة.
  db.factories.push({ id: "f3", kind: "individual", name: "عميل فرد تجريبي", cityId: CITY, commercialRegister: null, vatNumber: null, idType: "national_id", idLast4: "4821" });
  db.users.push({ id: "u4", phone: "+966500000004", role: "factory", factoryId: "f3", providerId: null });
  // تقييمات سابقة للمزوّدين الوهميين (عشان النجوم تظهر في بطاقة العرض).
  for (const [providerId, stars] of [["p1", [5, 5, 4, 5]], ["p2", [4, 5, 4]], ["p4", [5, 5, 5, 4, 5]], ["pme", [5, 4]]] as const) {
    for (const s of stars) db.ratings.push({ requestId: "old", providerId, stars: s, createdAt: iso(t - 30 * 24 * HOUR) });
  }

  const req = (id: string, factoryId: string, category: string, typeId: string, details: string, area: string, hoursAgo: number, status: RequestStatus = "awaiting_offers") => {
    const createdAt = t - hoursAgo * HOUR;
    db.requests.push({ id, factoryId, category, typeId, details, area, location: "المدينة الصناعية، شارع ١٢، مصنع ١٤", cityId: CITY, when: "tomorrow", status, createdAt: iso(createdAt), expiresAt: iso(createdAt + SETTING_DEFAULTS.requestOpenDays * 24 * HOUR) });
    db.events.push({ requestId: id, at: iso(createdAt), by: "factory", event: "created" });
  };
  const offer = (id: string, requestId: string, providerId: string, sar: number, durationHours: number, note: string | null, hoursAgo: number, status: Offer["status"] = "active") => {
    const at = t - hoursAgo * HOUR;
    db.offers.push({ id, requestId, providerId, priceHalalas: sar * 100, durationHours, note, validUntil: iso(at + SETTING_DEFAULTS.offerValidityHours * HOUR), status, revision: 1, firstSeenAt: null, createdAt: iso(at), updatedAt: iso(at) });
  };
  const order = (id: string, r: string, o: string, providerId: string, sar: number, acceptedHoursAgo: number, extra: Partial<Order> = {}) => {
    db.orders.push({ id, requestId: r, providerId, factoryId: "f1", acceptedBy: "u1", state: "active", priceHalalas: sar * 100, acceptedAt: iso(t - acceptedHoursAgo * HOUR), startedAt: null, deliveredAt: null, confirmedAt: null, policy: DEFAULT_CANCELLATION_POLICY, ...extra });
    db.events.push({ requestId: r, at: iso(t - acceptedHoursAgo * HOUR), by: "factory", event: "accepted" });
  };

  // طلبات المصنع التجريبي: واحد فيه ثلاث عروض للمقارنة، وواحد قيد التنفيذ، وواحد بانتظار التأكيد، وواحد مكتمل.
  req("r1", "f1", "transport", "flatbed", "نقل ماكينة تغليف وزنها ٨ طن من المصنع إلى الرياض. التحميل بالرافعة عندنا.", "المدينة الصناعية الثانية", 3);
  offer("o1", "r1", "p2", 2450, 8, "السعر يشمل التأمين على الحمولة.", 2);
  offer("o2", "r1", "p1", 2300, 10, null, 1.5);
  offer("o3", "r1", "p3", 2600, 6, "نقدر نحمّل اليوم العصر.", 1);
  // «يشمل / ما يشمل» (القرار ٥٨): الأرخص ما يشمل التنزيل، عشان المقارنة تبين ليش السعر يفرق.
  const inc = (o: string, loading: boolean, unloading: boolean, waiting: boolean) =>
    (db.offers.find((x) => x.id === o)!.inclusions = {
      loading: loading ? "included" : "excluded",
      unloading: unloading ? "included" : "excluded",
      waiting_over_2h: waiting ? "included" : "excluded",
    });
  inc("o1", true, true, false);
  inc("o2", true, false, false);
  inc("o3", true, true, true);
  req("r2", "f1", "maintenance", "ac", "صيانة ٤ مكيفات سبليت في صالة الإنتاج، واحد منها ما يبرّد.", "المدينة الصناعية الأولى", 30, "in_progress");
  offer("o4", "r2", "p4", 1200, 5, null, 29, "accepted");
  order("d2", "r2", "o4", "p4", 1200, 28, { startedAt: iso(t - 2 * HOUR) });
  db.events.push({ requestId: "r2", at: iso(t - 2 * HOUR), by: "provider", event: "started" });
  req("r3", "f1", "cleaning", "chemicals", "توريد منظفات صناعية لخط الإنتاج: ٢٠ جالون مزيل شحوم.", "المدينة الصناعية الأولى", 52, "delivered");
  offer("o5", "r3", "p2", 900, 24, null, 50, "accepted");
  order("d3", "r3", "o5", "p2", 900, 49, { startedAt: iso(t - 26 * HOUR), deliveredAt: iso(t - 3 * HOUR) });
  db.events.push({ requestId: "r3", at: iso(t - 26 * HOUR), by: "provider", event: "started" }, { requestId: "r3", at: iso(t - 3 * HOUR), by: "provider", event: "delivered" });
  req("r4", "f1", "materials", "sand", "توريد ٣ قلابات رمل دفان لتسوية الساحة الخلفية.", "المدينة الصناعية الثانية", 24 * 9, "completed");
  offer("o6", "r4", "p1", 1800, 6, null, 24 * 9, "accepted");
  order("d4", "r4", "o6", "p1", 1800, 24 * 8.9, { startedAt: iso(t - 24 * 8 * HOUR), deliveredAt: iso(t - 24 * 7.8 * HOUR), confirmedAt: iso(t - 24 * 7.7 * HOUR), state: "done" });

  // طلبات من مصنع ثاني يشوفها المزوّد التجريبي، وفيها عرض منه.
  req("r5", "f2", "security", "guards", "حارسين أمن للبوابة الرئيسية لمدة شهر، دوام ليلي.", "المدينة الصناعية الثانية", 1);
  req("r6", "f2", "pest_control", "rodents", "مكافحة فيران في مستودع المواد الخام، مساحته ٦٠٠ متر.", "المدينة الصناعية الأولى", 5);
  offer("o7", "r6", "p3", 1500, 4, null, 4);
  req("r7", "f2", "transport", "reefer", "تريلا مبردة لنقل مواد غذائية من سدير إلى الدمام بعد بكرة.", "المدينة الصناعية الثانية", 20);
  offer("o8", "r7", "pme", 3200, 12, "التريلا جاهزة والتبريد يوصل -١٨.", 6);
  db.offers.find((o) => o.id === "o8")!.firstSeenAt = iso(t - 4 * HOUR);
  // طلب انقبل فيه عرض المزوّد التجريبي وما بدأ (تظهر له حركة «انقبل عرضك» أول مرة يفتح «شغلي»).
  req("r8", "f2", "maintenance", "smith", "تركيب درابزين حديد للدرج الخارجي، طوله ١٢ متر.", "المدينة الصناعية الثانية", 8, "accepted");
  offer("o9", "r8", "pme", 2800, 16, null, 7, "accepted");
  order("d8", "r8", "o9", "pme", 2800, 1, { factoryId: "f2", acceptedBy: "u3" });

  // غرفة الصفقة: محادثة سابقة في الطلب الجاري، عشان يبان شكلها من أول ما يدخل المصنع.
  const msg = (orderId: string, senderId: string, from: Message["from"], body: string, hoursAgo: number) =>
    db.messages.push({ id: `m${db.messages.length + 1}`, seq: db.messages.length + 1, orderId, senderId, from, body, at: iso(t - hoursAgo * HOUR) });
  msg("d2", "u1", "customer", "الدخول من البوابة الشرقية، واسأل عن مشرف الإنتاج.", 27);
  msg("d2", "p4", "provider", "تمام. نوصل الساعة ٨ الصبح ومعنا غاز للمكيف اللي ما يبرّد.", 26);
  db.reads["d2:u1"] = 1;
  msg("d8", "u3", "customer", "الدرج جنب المستودع رقم ٢. نبي اللون أسود مطفي.", 0.5);
  applyDataVariant(db, demoDataVariant(), t);
  return db;
}

// ───────── بيانات «أسوأ حالة» (للفحص بس) ─────────
// ?data=worst أو ?data=mixed في الرابط أول ما تنفتح النسخة التجريبية (أو زر DataVariantToggle).
// تختبر الشاشات بقيم حقيقية ممكنة: اسم منشأة طويل، واسم يخلط العربي والإنجليزي، و١٢٠ عرض، ومستند ينتهي اليوم.
// ما تأثر على الخادم الحقيقي: هذا الملف يشتغل بس في النسخة التجريبية.

export type DemoDataVariant = "demo" | "worst" | "mixed";

export function demoDataVariant(): DemoDataVariant {
  try {
    const v = typeof location !== "undefined" ? new URLSearchParams(location.search).get("data") : null;
    return v === "worst" || v === "mixed" ? v : "demo";
  } catch {
    return "demo";
  }
}

/** يرجّع النسخة التجريبية لبياناتها الأولى بنوع بيانات معيّن (يستخدمه زر الفحص). */
export function resetDemoData() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ما فيه تخزين: البيانات أصلًا تبدأ من جديد.
  }
}

export const WORST_CASE = {
  // ٦٠ حرف بالضبط، وأقل من حد الاسم في الخادم (١٢٠).
  longName: "شركة مصنع سدير الوطني للصناعات البلاستيكية والتغليف المحدودة".slice(0, 60),
  mixedName: "Al-Sharq Industrial Co. مصنع الشرق",
  offers: 120,
} as const;

function applyDataVariant(db: Db, variant: DemoDataVariant, t: number) {
  if (variant === "demo") return;
  const f1 = db.factories.find((f) => f.id === "f1")!;
  f1.name = variant === "worst" ? WORST_CASE.longName : WORST_CASE.mixedName;
  // مستند للمزوّد التجريبي ينتهي اليوم.
  db.demoExpiring = [{ docType: "cr_certificate", expiresOn: iso(t).slice(0, 10), expired: false }];
  if (variant !== "worst") return;
  // ١٢٠ عرض على طلب النقل (r1)، كل واحد من مزوّد مختلف، وما انفتح منها شي.
  for (let n = 1; db.offers.filter((o) => o.requestId === "r1").length < WORST_CASE.offers; n++) {
    const pid = `pw${n}`;
    db.providers.push({ id: pid, userId: null, tradeName: `مؤسسة رقم ${n} للنقل والخدمات اللوجستية`, categories: ["transport"], withdrawals: 0, history: n });
    db.offers.push({
      id: `ow${n}`,
      requestId: "r1",
      providerId: pid,
      priceHalalas: (2000 + n * 15) * 100,
      durationHours: 4 + (n % 20),
      note: null,
      validUntil: iso(t + SETTING_DEFAULTS.offerValidityHours * HOUR),
      status: "active",
      revision: 1,
      firstSeenAt: null,
      createdAt: iso(t - (n % 50) * 60_000),
      updatedAt: iso(t - (n % 50) * 60_000),
    });
  }
}

// ───────── الحفظ في المتصفح ─────────

let db: Db = load();

function load(): Db {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // ما نقدر نقرأ: نبدأ من البيانات الأولى.
  }
  return seed();
}

function persist() {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ما انحفظ: البيانات تبقى لين تتحدث الصفحة.
  }
}

/** يرجّع البيانات لأصلها (للاختبارات، ولزر «ابدأ التجربة من جديد»). */
export function resetDemo() {
  db = seed();
  persist();
}

const id = (prefix: string) => `${prefix}${++db.seq}`;
const fail = (status: number, code: string): never => {
  throw new ApiClientError(status, code);
};

// ───────── أدوات مشتركة ─────────

function userFrom(token: string | null): User {
  const tk = token ?? db.session;
  const uid = tk?.startsWith("demo:") ? tk.slice(5) : null;
  const u = db.users.find((x) => x.id === uid);
  if (!u) fail(401, "unauthenticated");
  return u!;
}

const factoryOf = (u: User) => (u.role === "factory" && u.factoryId ? u.factoryId : fail(403, "forbidden"));
const providerOf = (u: User) => db.providers.find((p) => p.id === u.providerId) ?? fail(403, "forbidden");

function parseBody<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) fail(400, "validation");
  return (r as { data: T }).data;
}

/** نفس فحص الخادم الحقيقي لـ«يشمل / ما يشمل» (القرار ٥٨). */
function checkInclusions(category: string, inclusions: Inclusions | undefined) {
  const err = inclusionsError(category, inclusions);
  if (err) fail(400, err);
}

function noContact(...texts: (string | null | undefined)[]) {
  if (texts.some((x) => containsContactInfo(x))) fail(400, "contact_info_not_allowed");
}

const live = (o: Offer, t = now()) => o.status === "active" && Date.parse(o.validUntil) > t;

function effectiveStatus(r: Req): RequestStatus {
  return r.status === "awaiting_offers" && Date.parse(r.expiresAt) <= now() ? "expired" : r.status;
}

/** يغيّر حالة الطلب عن طريق جدول الانتقالات المشترك (نفس الخادم الحقيقي). */
function move(r: Req, action: FlowAction, actor: FlowActor) {
  try {
    r.status = nextStatus(effectiveStatus(r), action, actor);
  } catch {
    fail(409, "invalid_transition");
  }
}

const event = (requestId: string, by: string, ev: string, stage?: string) => db.events.push({ requestId, at: iso(now()), by, event: ev, ...(stage ? { stage } : {}) });

function rating(providerId: string) {
  const r = db.ratings.filter((x) => x.providerId === providerId);
  return ratingSummary(r.reduce((s, x) => s + x.stars, 0), r.length);
}

function commitment(p: Provider) {
  const accepted = p.history + db.orders.filter((o) => o.providerId === p.id).length;
  return commitmentView({ accepted, withdrawals: p.withdrawals }, DEFAULT_COMMITMENT_SETTINGS);
}

const providerCard = (providerId: string) => {
  const p = db.providers.find((x) => x.id === providerId)!;
  return { tradeName: p.tradeName, verified: true, rating: rating(p.id), commitment: commitment(p) };
};

const reach = (category: string) => db.providers.filter((p) => p.categories.includes(category)).length;
const orderOf = (requestId: string) => db.orders.filter((o) => o.requestId === requestId && o.state !== "withdrawn").at(-1) ?? null;
const reqView = (r: Req) => ({ ...r, status: effectiveStatus(r) });

function cancellationView(c: Cancellation | undefined) {
  if (!c) return null;
  const { orderId: _o, requestId: _r, ...rest } = c;
  return { ...rest, fee: { feeHalalas: 0, toProviderHalalas: 0, toFactoryHalalas: 0, toPlatformHalalas: 0 } };
}

function disputeView(orderId: string, party: "factory" | "provider") {
  const d = db.disputes.filter((x) => x.orderId === orderId).at(-1);
  if (!d) return null;
  return {
    id: d.id,
    number: d.number,
    reason: d.reason,
    details: d.openedBy === party ? d.details : null,
    openedBy: d.openedBy,
    status: d.status,
    resolution: null,
    openedAt: d.openedAt,
    closedAt: null,
    notes: d.notes.filter((n) => n.by === party || n.by === "staff"),
  };
}

function execution(o: Order) {
  return {
    autoConfirmAt: o.deliveredAt ? iso(Date.parse(o.deliveredAt) + SETTING_DEFAULTS.autoConfirmHours * HOUR) : null,
    confirmedBy: o.confirmedAt ? "factory" : null,
    photos: db.photos.filter((p) => p.orderId === o.id).map((p) => ({ id: p.id, stage: p.stage, createdAt: p.createdAt, link: { path: p.url, expiresAt: iso(now() + 5 * 60_000) } })),
    priceChanges: db.priceChanges.filter((p) => p.orderId === o.id).map(({ orderId: _o, ...p }) => p),
    timeline: db.events.filter((e) => e.requestId === o.requestId).map(({ requestId: _r, ...e }) => e),
  };
}

function fee(o: Order, payer: "factory" | "provider", stage: "after_accept" | "after_start") {
  return cancellationFee({ policy: o.policy, payer, stage, priceHalalas: o.priceHalalas, acceptedAt: new Date(o.acceptedAt), now: new Date() });
}

// ───────── المصنع ─────────

function ownRequest(u: User, requestId: string): Req {
  const f = factoryOf(u);
  return db.requests.find((r) => r.id === requestId && r.factoryId === f) ?? fail(404, "not_found");
}

function factoryView(u: User, requestId: string) {
  const r = ownRequest(u, requestId);
  const status = effectiveStatus(r);
  const t = now();
  // فتح التفاصيل = «المصنع شاف العروض» (يظهر للمزوّد).
  for (const o of db.offers) if (o.requestId === r.id && live(o, t) && !o.firstSeenAt) o.firstSeenAt = iso(t);
  const offers = db.offers
    .filter((o) => o.requestId === r.id && (live(o, t) || o.status === "accepted"))
    .sort((a, b) => a.priceHalalas - b.priceHalalas)
    .map((o) => ({
      id: o.id,
      provider: providerCard(o.providerId),
      price: priceForFactory(o.priceHalalas),
      durationHours: o.durationHours,
      note: o.note,
      inclusions: o.inclusions ?? null,
      validUntil: o.validUntil,
      status: o.status as "active" | "accepted",
      revised: o.revision > 1,
      createdAt: o.createdAt,
    }));
  const order = orderOf(r.id);
  const p = order ? db.providers.find((x) => x.id === order.providerId)! : null;
  const cancellation = order ? db.cancellations.filter((c) => c.orderId === order.id && c.kind === "after_start").at(-1) : undefined;
  const withdrawal = status === "awaiting_offers" ? db.cancellations.filter((c) => c.requestId === r.id && c.kind === "provider_withdrawal").at(-1) : undefined;
  const rated = db.ratings.find((x) => x.requestId === r.id);
  return {
    request: reqView(r),
    reach: reach(r.category),
    offers,
    approval: null,
    order:
      order && p
        ? {
            id: order.id,
            state: order.state,
            price: priceForFactory(order.priceHalalas),
            acceptedAt: order.acceptedAt,
            startedAt: order.startedAt,
            deliveredAt: order.deliveredAt,
            confirmedAt: order.confirmedAt,
            cancellationPolicy: order.policy,
            provider: { tradeName: p.tradeName, verified: true },
          }
        : null,
    execution: order ? execution(order) : null,
    actions: factoryActions(status, {
      hasLiveOffers: offers.some((o) => o.status === "active"),
      reopenedAfterWithdrawal: !!withdrawal,
      cancellationPending: cancellation?.status === "pending",
      alreadyRated: !!rated,
    }),
    cancellationPolicy: order ? null : DEFAULT_CANCELLATION_POLICY,
    cancellationFee: order && status === "accepted" ? fee(order, "factory", "after_accept") : order && status === "in_progress" ? fee(order, "factory", "after_start") : null,
    cancellationRequest: cancellationView(cancellation),
    withdrawal: withdrawal ? { at: withdrawal.requestedAt, reason: withdrawal.reason } : null,
    dispute: order ? disputeView(order.id, "factory") : null,
    rating: rated ? { stars: rated.stars, createdAt: rated.createdAt } : null,
    unreadMessages: order ? unread(order.id, u.id) : 0,
  };
}

/** عروض وهمية توصل بعد ثواني من رفع الطلب (المزوّدين الوهميين). */
function simulateOffers(requestId: string) {
  setTimeout(() => {
    const r = db.requests.find((x) => x.id === requestId);
    if (!r || effectiveStatus(r) !== "awaiting_offers") return;
    const t = now();
    const base = 800 + Math.round(Math.random() * 20) * 100;
    for (const [providerId, delta, hours] of [["p2", 150, 8], ["p1", 0, 10]] as const) {
      db.offers.push({ id: id("o"), requestId, providerId, priceHalalas: (base + delta) * 100, durationHours: hours, note: null, validUntil: iso(t + SETTING_DEFAULTS.offerValidityHours * HOUR), status: "active", revision: 1, firstSeenAt: null, createdAt: iso(t), updatedAt: iso(t) });
    }
    persist();
  }, SIMULATED_OFFER_DELAY_MS);
}

// ───────── المزوّد ─────────

function openRequests(p: Provider, onlyId?: string, category?: string) {
  const t = now();
  return db.requests
    .filter((r) => effectiveStatus(r) === "awaiting_offers" && p.categories.includes(r.category) && r.cityId === CITY)
    .filter((r) => !db.orders.some((o) => o.requestId === r.id && o.providerId === p.id && o.state === "withdrawn"))
    .filter((r) => (!onlyId || r.id === onlyId) && (!category || r.category === category))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((r) => {
      const offerCount = db.offers.filter((o) => o.requestId === r.id && live(o, t)).length;
      const mine = db.offers.find((o) => o.requestId === r.id && o.providerId === p.id && o.status === "active");
      const customerKind = db.factories.find((f) => f.id === r.factoryId)?.kind ?? "business";
      return { id: r.id, category: r.category, typeId: r.typeId, details: r.details, area: r.area, cityId: r.cityId, when: r.when, createdAt: r.createdAt, expiresAt: r.expiresAt, customerKind, offerCount, myOffer: mine ? { id: mine.id } : null };
    })
    .filter((r) => r.offerCount < SETTING_DEFAULTS.maxOffersPerRequest || r.myOffer);
}

function myOfferView(o: Offer) {
  const r = db.requests.find((x) => x.id === o.requestId)!;
  const expired = o.status === "active" && Date.parse(o.validUntil) <= now();
  return {
    id: o.id,
    requestId: o.requestId,
    priceHalalas: o.priceHalalas,
    durationHours: o.durationHours,
    note: o.note,
    inclusions: o.inclusions ?? null,
    validUntil: o.validUntil,
    status: expired ? "expired" : o.status,
    revision: o.revision,
    seenByFactory: !!o.firstSeenAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    request: { id: r.id, category: r.category, typeId: r.typeId, area: r.area, when: r.when, status: effectiveStatus(r) },
  };
}

function jobSummary(o: Order) {
  const r = db.requests.find((x) => x.id === o.requestId)!;
  const f = db.factories.find((x) => x.id === o.factoryId)!;
  return {
    orderId: o.id,
    requestId: r.id,
    status: effectiveStatus(r),
    category: r.category,
    typeId: r.typeId,
    details: r.details,
    area: r.area,
    location: r.location,
    when: r.when,
    priceHalalas: o.priceHalalas,
    acceptedAt: o.acceptedAt,
    startedAt: o.startedAt,
    deliveredAt: o.deliveredAt,
    factory: { name: f.name, kind: f.kind ?? "business" },
    unreadMessages: unread(o.id, db.providers.find((x) => x.id === o.providerId)?.userId ?? ""),
  };
}

function ownJob(u: User, orderId: string): Order {
  const p = providerOf(u);
  return db.orders.find((o) => o.id === orderId && o.providerId === p.id && o.state !== "withdrawn") ?? fail(404, "not_found");
}

function jobView(u: User, orderId: string) {
  const o = ownJob(u, orderId);
  const status = effectiveStatus(db.requests.find((r) => r.id === o.requestId)!);
  return {
    job: {
      ...jobSummary(o),
      confirmedAt: o.confirmedAt,
      cancellationPolicy: o.policy,
      execution: execution(o),
      cancellationRequest: cancellationView(db.cancellations.filter((c) => c.orderId === o.id && c.kind === "after_start").at(-1)),
      withdrawalFee: status === "accepted" ? fee(o, "provider", "after_accept") : null,
      dispute: disputeView(o.id, "provider"),
    },
  };
}

function providerMe(u: User) {
  const p = providerOf(u);
  const docs = requiredDocsFor(p.categories).map((docType) => ({
    docType,
    approved: { id: `doc-${docType}`, docType, mimeType: "application/pdf", expiresOn: iso(now() + 300 * 24 * HOUR).slice(0, 10), status: "approved" as const, checklist: [], rejectionReason: null, uploadedAt: iso(now() - 40 * 24 * HOUR) },
    pending: null,
    rejected: null,
    expired: false,
    expiringSoon: false,
  }));
  return {
    provider: {
      id: p.id,
      tradeName: p.tradeName,
      ownerName: "عبدالله المزوّد",
      idType: "national_id",
      idNumberMasked: "******4821",
      commercialRegister: "1010987654",
      categories: p.categories,
      cityIds: [CITY],
      status: "verified",
      statusReason: null,
      verified: true,
      readyToSubmit: false,
      documents: docs,
      expiring: db.demoExpiring ?? [],
      rating: rating(p.id),
      commitment: commitment(p),
    },
  };
}

function openDispute(o: Order, by: "factory" | "provider", body: unknown) {
  const b = parseBody(openDisputeBody, body);
  noContact(b.details);
  const r = db.requests.find((x) => x.id === o.requestId)!;
  move(r, "open_dispute", by);
  db.disputes.push({ id: id("disp"), orderId: o.id, number: 1000 + db.disputes.length + 1, reason: b.reason, details: b.details, openedBy: by, status: "open", openedAt: iso(now()), notes: [] });
  event(r.id, by, "dispute_opened");
}

function addDisputeNote(o: Order, by: "factory" | "provider", body: unknown) {
  const text = (body as { body?: string })?.body?.trim() ?? "";
  if (text.length < 2) fail(400, "validation");
  noContact(text);
  const d = db.disputes.filter((x) => x.orderId === o.id && x.status === "open").at(-1) ?? fail(409, "no_open_dispute");
  d.notes.push({ by, body: text, at: iso(now()) });
}

// ───────── الموجّه ─────────

type Handler = (ctx: { u: () => User; body: unknown; params: string[]; query: URLSearchParams; token: string | null }) => unknown;

const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) => routes.push([method, new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, "([^/]+)")}$`), h]);

// الدخول: أي ٦ أرقام تمشي. رقم جديد ينشئ حساب مصنع، أو مزوّد موثّق لو اختار «مزوّد خدمة».
on("POST", "/v1/auth/otp/request", () => ({ ok: true, retryAfterSeconds: 60 }));
on("POST", "/v1/auth/otp/verify", ({ body }) => {
  const b = body as { phone?: string; code?: string; as?: string; channel?: string };
  const phone = normalizeSaudiMobile(b.phone ?? "") ?? fail(400, "validation");
  if (!/^\d{6}$/.test(b.code ?? "")) fail(400, "otp_invalid");
  let u = db.users.find((x) => x.phone === phone);
  if (!u) {
    const uid = id("u");
    if (b.as === "provider") {
      const pid = id("p");
      db.providers.push({ id: pid, userId: uid, tradeName: "مؤسسة تجريبية", categories: [...CATEGORY_IDS], withdrawals: 0, history: 0 });
      u = { id: uid, phone, role: "provider", factoryId: null, providerId: pid };
    } else {
      const fid = id("f");
      db.factories.push({ id: fid, kind: null, name: null, cityId: null, commercialRegister: null, vatNumber: null });
      u = { id: uid, phone, role: "factory", factoryId: fid, providerId: null };
    }
    db.users.push(u);
  }
  const token = `demo:${u.id}`;
  // الموقع: الجلسة في «كوكي» (هنا في ذاكرة الصفحة) والرمز ما يرجع، مثل الخادم الحقيقي.
  if (b.channel === "web") {
    db.session = token;
    return { ok: true };
  }
  return { ok: true, token };
});
on("POST", "/v1/auth/logout", () => {
  db.session = null;
  return undefined;
});

on("GET", "/v1/cities", () => ({ cities: [{ id: CITY, name: { ar: "سدير", en: "Sudair" } }] }));
/** نفس شكل loadFactory في الخادم الحقيقي. */
function customerView(f: Factory) {
  const kind = f.kind ?? null;
  const complete =
    kind === "business" ? !!(f.name && f.cityId && f.commercialRegister && f.vatNumber) : kind === "individual" ? !!(f.name && f.cityId && f.idLast4) : false;
  return {
    id: f.id,
    kind,
    name: f.name,
    cityId: f.cityId,
    city: f.cityId ? { ar: "سدير", en: "Sudair" } : null,
    commercialRegister: f.commercialRegister,
    vatNumber: f.vatNumber,
    idType: f.idType ?? null,
    idNumberMasked: f.idLast4 ? `******${f.idLast4}` : null,
    identity: { status: kind === "individual" ? "pending" : "not_required", verifiedAt: null },
    profileComplete: complete,
  };
}

on("GET", "/v1/me", ({ u }) => {
  const user = u();
  const f = user.factoryId ? db.factories.find((x) => x.id === user.factoryId)! : null;
  return {
    user: { id: user.id, phone: user.phone, role: user.role, staffRole: null, factoryRole: user.role === "factory" ? "manager" : null, hasFactory: !!f, hasProvider: !!user.providerId },
    factory: f ? customerView(f) : null,
  };
});
on("PUT", "/v1/factory", ({ u, body }) => {
  const f = db.factories.find((x) => x.id === factoryOf(u()))!;
  const b = parseBody(factoryProfileBody, body);
  if (f.kind && f.kind !== b.kind && db.requests.some((r) => r.factoryId === f.id)) fail(409, "kind_locked");
  if (b.kind === "business") {
    Object.assign(f, { kind: "business", name: b.name, cityId: CITY, commercialRegister: b.commercialRegister, vatNumber: b.vatNumber, idType: null, idLast4: null });
  } else {
    // الرقم الكامل ما ينحفظ حتى في النسخة التجريبية: آخر ٤ أرقام بس.
    Object.assign(f, { kind: "individual", name: b.name, cityId: CITY, commercialRegister: null, vatNumber: null, idType: b.idType, idLast4: b.idNumber.slice(-4) });
  }
  return { factory: customerView(f) };
});

on("POST", "/v1/requests", ({ u, body }) => {
  const f = factoryOf(u());
  const b = parseBody(createRequestBody, body);
  if (!customerView(db.factories.find((x) => x.id === f)!).profileComplete) fail(409, "profile_incomplete");
  noContact(b.details, b.area);
  const t = now();
  const r: Req = { id: id("r"), factoryId: f, category: b.category, typeId: b.typeId, details: b.details, area: b.area, location: b.location, cityId: CITY, when: b.when, status: "awaiting_offers", createdAt: iso(t), expiresAt: iso(t + SETTING_DEFAULTS.requestOpenDays * 24 * HOUR) };
  db.requests.push(r);
  event(r.id, "factory", "created");
  simulateOffers(r.id);
  return { request: reqView(r), reach: reach(r.category) };
});
on("GET", "/v1/requests", ({ u }) => {
  const f = factoryOf(u());
  const t = now();
  return {
    requests: db.requests
      .filter((r) => r.factoryId === f)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((r) => {
        const offers = db.offers.filter((o) => o.requestId === r.id && live(o, t));
        const order = orderOf(r.id);
        return { ...reqView(r), offerCount: offers.length, newOfferCount: offers.filter((o) => !o.firstSeenAt).length, unreadMessages: order ? unread(order.id, u().id) : 0 };
      }),
  };
});
on("GET", "/v1/requests/:id", ({ u, params }) => factoryView(u(), params[0]));
on("POST", "/v1/requests/:id/offers/:offerId/accept", ({ u, params }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  const o = db.offers.find((x) => x.id === params[1] && x.requestId === r.id) ?? fail(404, "not_found");
  if (!live(o)) fail(409, "offer_not_active");
  move(r, "accept", "factory");
  o.status = "accepted";
  for (const other of db.offers) if (other.requestId === r.id && other.id !== o.id && other.status === "active") other.status = "rejected";
  db.orders.push({ id: id("d"), requestId: r.id, providerId: o.providerId, factoryId: r.factoryId, acceptedBy: user.id, state: "active", priceHalalas: o.priceHalalas, acceptedAt: iso(now()), startedAt: null, deliveredAt: null, confirmedAt: null, policy: DEFAULT_CANCELLATION_POLICY });
  event(r.id, "factory", "accepted");
  return factoryView(user, r.id);
});
on("POST", "/v1/requests/:id/cancel", ({ u, params }) => {
  const r = ownRequest(u(), params[0]);
  if (!["awaiting_offers", "pending_approval", "accepted", "expired"].includes(effectiveStatus(r))) fail(409, "request_not_cancellable");
  move(r, "cancel", "factory");
  for (const o of db.offers) if (o.requestId === r.id && o.status === "active") o.status = "rejected";
  const order = orderOf(r.id);
  if (order) order.state = "done";
  event(r.id, "factory", "cancelled");
  return { request: reqView(r) };
});
on("POST", "/v1/requests/:id/cancellation", ({ u, params, body }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  const reason = ((body as { reason?: string })?.reason ?? "").trim();
  if (reason.length < 2) fail(400, "validation");
  noContact(reason);
  if (effectiveStatus(r) !== "in_progress") fail(409, "invalid_transition");
  const o = orderOf(r.id)!;
  if (db.cancellations.some((c) => c.orderId === o.id && c.status === "pending")) fail(409, "cancellation_pending");
  db.cancellations.push({ id: id("c"), orderId: o.id, requestId: r.id, kind: "after_start", status: "pending", reason, requestedAt: iso(now()), respondBy: iso(now() + o.policy.responseHours * HOUR), respondedAt: null, responseNote: null });
  event(r.id, "factory", "cancellation_requested");
  return factoryView(user, r.id);
});
on("POST", "/v1/requests/:id/cancellation/withdraw", ({ u, params }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  const o = orderOf(r.id) ?? fail(404, "not_found");
  const c = db.cancellations.find((x) => x.orderId === o.id && x.status === "pending") ?? fail(409, "invalid_transition");
  c.status = "withdrawn";
  event(r.id, "factory", "cancellation_withdrawn");
  return factoryView(user, r.id);
});
on("POST", "/v1/requests/:id/republish", ({ u, params, body }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  const b = parseBody(republishBody, body);
  noContact(b.details, b.area);
  move(r, "republish", "factory");
  Object.assign(r, Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)));
  r.expiresAt = iso(now() + SETTING_DEFAULTS.requestOpenDays * 24 * HOUR);
  event(r.id, "factory", "republished");
  simulateOffers(r.id);
  return factoryView(user, r.id);
});
on("POST", "/v1/requests/:id/dispute", ({ u, params, body }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  openDispute(orderOf(r.id) ?? fail(404, "not_found"), "factory", body);
  return factoryView(user, r.id);
});
on("POST", "/v1/requests/:id/dispute/notes", ({ u, params, body }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  addDisputeNote(orderOf(r.id) ?? fail(404, "not_found"), "factory", body);
  return factoryView(user, r.id);
});
on("POST", "/v1/requests/:id/confirm", ({ u, params }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  move(r, "confirm", "factory");
  const o = orderOf(r.id)!;
  o.confirmedAt = iso(now());
  o.state = "done";
  event(r.id, "factory", "confirmed");
  return factoryView(user, r.id);
});
on("POST", "/v1/requests/:id/rating", ({ u, params, body }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  const stars = (body as { stars?: number })?.stars;
  if (!Number.isInteger(stars) || stars! < 1 || stars! > 5) fail(400, "validation");
  if (effectiveStatus(r) !== "completed") fail(409, "not_completed");
  if (db.ratings.some((x) => x.requestId === r.id)) fail(409, "already_rated");
  db.ratings.push({ requestId: r.id, providerId: orderOf(r.id)!.providerId, stars: stars!, createdAt: iso(now()) });
  event(r.id, "factory", "rated");
  return factoryView(user, r.id);
});
on("POST", "/v1/requests/:id/price-changes/:changeId/:decision", ({ u, params }) => {
  const user = u();
  const r = ownRequest(user, params[0]);
  const o = orderOf(r.id) ?? fail(404, "not_found");
  const pc = db.priceChanges.find((x) => x.id === params[1] && x.orderId === o.id && x.status === "pending") ?? fail(409, "price_change_not_pending");
  const approve = params[2] === "approve";
  pc.status = approve ? "approved" : "rejected";
  pc.decidedAt = iso(now());
  if (approve) o.priceHalalas = pc.newPriceHalalas;
  event(r.id, "factory", approve ? "price_change_approved" : "price_change_rejected");
  return factoryView(user, r.id);
});
on("GET", "/v1/factory/members", ({ u }) => {
  const f = factoryOf(u());
  return { members: db.users.filter((x) => x.factoryId === f).map((x) => ({ userId: x.id, phone: x.phone, role: "manager", active: true, joined: true })) };
});

on("POST", "/v1/factory/members", ({ u, body }) => {
  const f = factoryOf(u());
  const b = body as { phone?: string; role?: string };
  const phone = normalizeSaudiMobile(b.phone ?? "") ?? fail(400, "validation");
  if (db.users.some((x) => x.phone === phone)) fail(409, "phone_in_use");
  const nu: User = { id: id("u"), phone, role: "factory", factoryId: f, providerId: null };
  db.users.push(nu);
  return { member: { userId: nu.id, phone, role: b.role === "manager" ? "manager" : "member", active: true, joined: false } };
});
on("POST", "/v1/factory/members/:userId/:action", () => ({ ok: true }));

on("GET", "/v1/provider/me", ({ u }) => providerMe(u()));
on("GET", "/v1/provider/requests", ({ u, query }) => ({ requests: openRequests(providerOf(u()), undefined, query.get("category") ?? undefined) }));
on("GET", "/v1/provider/requests/:id", ({ u, params }) => ({ request: openRequests(providerOf(u()), params[0])[0] ?? fail(404, "not_found") }));
on("POST", "/v1/provider/requests/:id/offers", ({ u, params, body }) => {
  const p = providerOf(u());
  const b = parseBody(offerBody, body);
  noContact(b.note);
  if ((b.validHours ?? 0) > SETTING_DEFAULTS.offerValidityHours) fail(400, "validity_too_long");
  const r = openRequests(p, params[0])[0] ?? fail(404, "not_found");
  checkInclusions(r.category, b.inclusions);
  if (r.myOffer) fail(409, "offer_exists");
  const t = now();
  const o: Offer = { id: id("o"), requestId: r.id, providerId: p.id, priceHalalas: b.priceHalalas, durationHours: b.durationHours, note: b.note || null, inclusions: b.inclusions ?? null, validUntil: iso(t + (b.validHours ?? SETTING_DEFAULTS.offerValidityHours) * HOUR), status: "active", revision: 1, firstSeenAt: null, createdAt: iso(t), updatedAt: iso(t) };
  db.offers.push(o);
  return { offer: myOfferView(o) };
});
on("PUT", "/v1/provider/offers/:id", ({ u, params, body }) => {
  const p = providerOf(u());
  const b = parseBody(offerBody, body);
  noContact(b.note);
  const o = db.offers.find((x) => x.id === params[0] && x.providerId === p.id) ?? fail(404, "not_found");
  if (!live(o)) fail(409, "offer_not_active");
  if (effectiveStatus(db.requests.find((r) => r.id === o.requestId)!) !== "awaiting_offers") fail(409, "offer_locked");
  checkInclusions(db.requests.find((r) => r.id === o.requestId)!.category, b.inclusions);
  const t = now();
  Object.assign(o, { priceHalalas: b.priceHalalas, durationHours: b.durationHours, note: b.note || null, inclusions: b.inclusions ?? o.inclusions ?? null, validUntil: iso(t + (b.validHours ?? SETTING_DEFAULTS.offerValidityHours) * HOUR), revision: o.revision + 1, updatedAt: iso(t) });
  return { offer: myOfferView(o) };
});
on("POST", "/v1/provider/offers/:id/withdraw", ({ u, params }) => {
  const p = providerOf(u());
  const o = db.offers.find((x) => x.id === params[0] && x.providerId === p.id) ?? fail(404, "not_found");
  if (o.status !== "active") fail(409, "offer_not_active");
  o.status = "withdrawn";
  o.updatedAt = iso(now());
  return { offer: myOfferView(o) };
});
on("GET", "/v1/provider/offers", ({ u }) => {
  const p = providerOf(u());
  return { offers: db.offers.filter((o) => o.providerId === p.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(myOfferView) };
});
on("GET", "/v1/provider/jobs", ({ u }) => {
  const p = providerOf(u());
  return { jobs: db.orders.filter((o) => o.providerId === p.id && o.state !== "withdrawn").sort((a, b) => Date.parse(b.acceptedAt) - Date.parse(a.acceptedAt)).map(jobSummary) };
});
on("GET", "/v1/provider/jobs/:id", ({ u, params }) => jobView(u(), params[0]));
on("POST", "/v1/provider/jobs/:id/start", ({ u, params }) => {
  const user = u();
  const o = ownJob(user, params[0]);
  move(db.requests.find((r) => r.id === o.requestId)!, "start", "provider");
  o.startedAt = iso(now());
  event(o.requestId, "provider", "started");
  return jobView(user, o.id);
});
on("POST", "/v1/provider/jobs/:id/deliver", ({ u, params }) => {
  const user = u();
  const o = ownJob(user, params[0]);
  if (db.priceChanges.some((x) => x.orderId === o.id && x.status === "pending")) fail(409, "price_change_pending");
  if (db.cancellations.some((x) => x.orderId === o.id && x.status === "pending")) fail(409, "cancellation_pending");
  move(db.requests.find((r) => r.id === o.requestId)!, "deliver", "provider");
  o.deliveredAt = iso(now());
  event(o.requestId, "provider", "delivered");
  return jobView(user, o.id);
});
on("POST", "/v1/provider/jobs/:id/price-change", ({ u, params, body }) => {
  const user = u();
  const o = ownJob(user, params[0]);
  const b = parseBody(priceChangeBody, body);
  noContact(b.reason);
  if (effectiveStatus(db.requests.find((r) => r.id === o.requestId)!) !== "in_progress") fail(409, "price_change_not_allowed");
  if (db.priceChanges.some((x) => x.orderId === o.id && x.status === "pending")) fail(409, "price_change_pending");
  if (b.newPriceHalalas === o.priceHalalas) fail(400, "price_unchanged");
  db.priceChanges.push({ id: id("pc"), orderId: o.id, oldPriceHalalas: o.priceHalalas, newPriceHalalas: b.newPriceHalalas, reason: b.reason, status: "pending", requestedAt: iso(now()), decidedAt: null });
  event(o.requestId, "provider", "price_change_requested");
  return jobView(user, o.id);
});
on("POST", "/v1/provider/jobs/:id/price-change/withdraw", ({ u, params }) => {
  const user = u();
  const o = ownJob(user, params[0]);
  const pc = db.priceChanges.find((x) => x.orderId === o.id && x.status === "pending") ?? fail(409, "price_change_not_pending");
  pc.status = "withdrawn";
  event(o.requestId, "provider", "price_change_withdrawn");
  return jobView(user, o.id);
});
on("POST", "/v1/provider/jobs/:id/cancellation/respond", ({ u, params, body }) => {
  const user = u();
  const o = ownJob(user, params[0]);
  const decision = (body as { decision?: string })?.decision;
  const c = db.cancellations.find((x) => x.orderId === o.id && x.status === "pending") ?? fail(409, "invalid_transition");
  const r = db.requests.find((x) => x.id === o.requestId)!;
  c.respondedAt = iso(now());
  if (decision === "agree") {
    c.status = "agreed";
    move(r, "cancel_agreed", "provider");
    o.state = "done";
    event(r.id, "provider", "cancellation_agreed");
  } else {
    c.status = "declined";
    event(r.id, "provider", "cancellation_declined");
    move(r, "open_dispute", "system");
    db.disputes.push({ id: id("disp"), orderId: o.id, number: 1000 + db.disputes.length + 1, reason: "cancellation_declined", details: null, openedBy: "system", status: "open", openedAt: iso(now()), notes: [] });
  }
  return jobView(user, o.id);
});
on("POST", "/v1/provider/jobs/:id/withdraw", ({ u, params, body }) => {
  const p = providerOf(u());
  const o = ownJob(u(), params[0]);
  const reason = ((body as { reason?: string })?.reason ?? "").trim();
  if (reason.length < 2) fail(400, "validation");
  noContact(reason);
  const r = db.requests.find((x) => x.id === o.requestId)!;
  move(r, "provider_withdraw", "provider");
  o.state = "withdrawn";
  p.withdrawals++;
  r.expiresAt = iso(now() + SETTING_DEFAULTS.requestOpenDays * 24 * HOUR);
  // العروض الثانية اللي لسا صالحة ترجع للمصنع.
  for (const other of db.offers) if (other.requestId === r.id && other.status === "rejected" && Date.parse(other.validUntil) > now()) other.status = "active";
  db.offers.find((x) => x.requestId === r.id && x.providerId === p.id && x.status === "accepted")!.status = "withdrawn";
  db.cancellations.push({ id: id("c"), orderId: o.id, requestId: r.id, kind: "provider_withdrawal", status: "agreed", reason, requestedAt: iso(now()), respondBy: null, respondedAt: null, responseNote: null });
  event(r.id, "provider", "provider_withdrew");
  return { ok: true };
});
on("POST", "/v1/provider/jobs/:id/dispute", ({ u, params, body }) => {
  const user = u();
  const o = ownJob(user, params[0]);
  openDispute(o, "provider", body);
  return jobView(user, o.id);
});
on("POST", "/v1/provider/jobs/:id/dispute/notes", ({ u, params, body }) => {
  const user = u();
  const o = ownJob(user, params[0]);
  addDisputeNote(o, "provider", body);
  return jobView(user, o.id);
});

on("GET", "/v1/account/deletion", ({ u }) => {
  const d = db.deletions.find((x) => x.userId === u().id);
  return { request: d ? { id: `del-${d.userId}`, status: "pending", requestedAt: d.requestedAt } : null };
});
on("POST", "/v1/account/deletion", ({ u, body }) => {
  const user = u();
  noContact((body as { reason?: string })?.reason);
  if (db.deletions.some((x) => x.userId === user.id)) fail(409, "deletion_pending");
  const d = { userId: user.id, requestedAt: iso(now()) };
  db.deletions.push(d);
  return { request: { id: `del-${user.id}`, status: "pending", requestedAt: d.requestedAt } };
});


// ───────── غرفة الصفقة (القرار ٣٥) ─────────
// نفس قواعد الخادم الحقيقي (apps/api/src/deal-room.ts): الكتابة والطلب شغّال، وبعدها قراءة بس،
// والأرقام والروابط ممنوعة. والتنبيهات ما تشتغل هنا.

const unread = (orderId: string, userId: string) =>
  db.messages.filter((m) => m.orderId === orderId && m.senderId !== userId && m.seq > (db.reads[`${orderId}:${userId}`] ?? 0)).length;

function chatView(o: Order, userId: string): ChatView {
  const r = db.requests.find((x) => x.id === o.requestId)!;
  const status = effectiveStatus(r);
  const msgs = db.messages.filter((m) => m.orderId === o.id);
  // «قرأت» مع كل تحميل، مثل الخادم.
  db.reads[`${o.id}:${userId}`] = msgs.at(-1)?.seq ?? 0;
  const evs = db.events.filter((e) => e.requestId === r.id && e.at >= o.acceptedAt && (CHAT_SYSTEM_EVENTS as readonly string[]).includes(e.event));
  const items: ChatItem[] = [
    ...evs.map((e, i): ChatItem => ({ kind: "event", id: `e${o.id}-${i}`, seq: 0, event: e.event as ChatSystemEvent, at: e.at })),
    ...msgs.map((m): ChatItem => ({ kind: "message", id: m.id, seq: m.seq, from: m.from, mine: m.senderId === userId, body: m.body, at: m.at })),
  ].sort((a, b) => (a.at === b.at ? a.seq - b.seq : a.at < b.at ? -1 : 1));
  const writable = o.state === "active" && chatWritable(status);
  return { items, writable, closedReason: writable ? null : chatClosedReason(status), lastSeq: msgs.at(-1)?.seq ?? 0 };
}

function sendMessage(o: Order, senderId: string, from: Message["from"], body: unknown): ChatView {
  const b = parseBody(sendMessageBody, body);
  noContact(b.body);
  const r = db.requests.find((x) => x.id === o.requestId)!;
  if (o.state !== "active" || !chatWritable(effectiveStatus(r))) fail(409, "chat_closed");
  const seq = (db.messages.at(-1)?.seq ?? 0) + 1;
  db.messages.push({ id: id("m"), seq, orderId: o.id, senderId, from, body: b.body, at: iso(now()) });
  return chatView(o, senderId);
}

on("GET", "/v1/requests/:id/messages", ({ u, params }) => {
  const user = u();
  return chatView(orderOf(ownRequest(user, params[0]).id) ?? fail(404, "not_found"), user.id);
});
on("POST", "/v1/requests/:id/messages", ({ u, params, body }) => {
  const user = u();
  return sendMessage(orderOf(ownRequest(user, params[0]).id) ?? fail(404, "not_found"), user.id, "customer", body);
});
on("GET", "/v1/provider/jobs/:id/messages", ({ u, params }) => chatView(ownJob(u(), params[0]), u().id));
on("POST", "/v1/provider/jobs/:id/messages", ({ u, params, body }) => sendMessage(ownJob(u(), params[0]), u().id, "provider", body));

/** الطلب للخادم التجريبي. يرمي ApiClientError مثل الخادم الحقيقي بالضبط. */
// السوق: مسارات منفصلة في src/demo/market.ts.
const marketHost: DemoHost = {
  on: (method, pattern, h) => on(method, pattern, h as Handler),
  market: () => db.market,
  factories: () => db.factories,
  phoneOf: (factoryId) => db.users.find((u) => u.factoryId === factoryId)?.phone ?? "",
  providerName: (providerId) => db.providers.find((p) => p.id === providerId)?.tradeName ?? null,
  fail,
  id,
  now,
  iso,
};
registerMarketDemo(marketHost);

export async function demoApi<T>(method: string, path: string, body: unknown, token: string | null): Promise<T> {
  const [pathname, qs] = path.split("?");
  for (const [m, re, h] of routes) {
    const match = m === method && pathname.match(re);
    if (!match) continue;
    const result = h({ u: () => userFrom(token), body, params: match.slice(1), query: new URLSearchParams(qs ?? ""), token });
    persist();
    // نسخة جديدة من الرد، عشان الشاشة ما تعدّل البيانات المحفوظة بالغلط.
    return (result === undefined ? undefined : JSON.parse(JSON.stringify(result))) as T;
  }
  // المسارات اللي ما يغطيها الوضع التجريبي (مثل لوحة الإدارة وتسجيل مزوّد جديد).
  return fail(501, "demo_unsupported");
}

/** رفع صور التنفيذ في الوضع التجريبي: الصورة تبقى في المتصفح نفسه (رابط blob). */
export async function demoUpload<T>(path: string, form: FormData, token: string | null): Promise<T> {
  const img = path.match(/^\/v1\/market\/seller\/products\/([^/]+)\/images$/);
  if (img) {
    const file = form.get("file");
    const r = demoProductImage(marketHost, userFrom(token), img[1], file && typeof file !== "string" ? file : null);
    persist();
    return JSON.parse(JSON.stringify(r)) as T;
  }
  const m = path.match(/^\/v1\/provider\/jobs\/([^/]+)\/photos$/);
  if (!m) return fail(501, "demo_unsupported");
  const user = userFrom(token);
  const o = ownJob(user, m[1]);
  const stage = form.get("stage") === "delivery" ? "delivery" : "start";
  if (db.photos.filter((p) => p.orderId === o.id && p.stage === stage).length >= 3) fail(409, "photos_limit");
  const file = form.get("file");
  const url = file && typeof file !== "string" && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "";
  db.photos.push({ id: id("ph"), orderId: o.id, stage, url, createdAt: iso(now()) });
  event(o.requestId, "provider", "photo_added", stage);
  persist();
  return JSON.parse(JSON.stringify(jobView(user, o.id))) as T;
}
