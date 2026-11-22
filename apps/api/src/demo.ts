// وضع التجربة (DEMO_MODE=true): مزوّدين وهميين يردّون تلقائيًا، عشان نشوف الدورة كاملة
// قبل ما تجهز شاشات المزوّد (المرحلة ٣ و٤). **ممنوع في الإنتاج** (config.ts يمنعه).
//
// وش يسوون:
//   - بعد ٥ ثواني من رفع أي طلب: يوصل عرضين.
//   - بعد دقيقة من قبول العرض: المزوّد «يبدأ التنفيذ» (عشان نجرّب الإلغاء قبل وبعد البدء).
//   - بعد ١٠ ثواني من «طلب الإلغاء»: المزوّد يوافق.
// الأسماء كلها من خيالنا، ومكتوب عليها «تجريبي» في قاعدة البيانات (is_demo).
import { categoryInfo, riyals, typeName, type CategoryId } from "@mazood/shared";
import type { AppContext } from "./context";
import { providerRespondToCancel, providerStartWork, providerSubmitOffer } from "./services/requests";

export const DEMO_TIMINGS = { offersAfterMs: 5_000, startWorkAfterMs: 60_000, cancelResponseAfterMs: 10_000 };

/** أرقام ثابتة عشان المزوّدين الوهميين ما يتكررون كل ما اشتغل الخادم. */
export const DEMO_PROVIDERS = [
  { id: "00000000-0000-4000-8000-000000000001", nameAr: "مؤسسة الثويرات للنقل (تجريبي)", nameEn: "Al Thuwairat Transport (demo)", ratingTenths: 48, completedOrders: 32 },
  { id: "00000000-0000-4000-8000-000000000002", nameAr: "شركة سدير للخدمات (تجريبي)", nameEn: "Sudair Services Co. (demo)", ratingTenths: 46, completedOrders: 57 },
];

/** سعر تقريبي بالريال حسب القسم، عشان الأرقام تكون معقولة في التجربة. */
const BASE_PRICE_SAR: Record<CategoryId, number> = {
  transport: 2400,
  maintenance: 950,
  materials: 1800,
  security: 3200,
  cleaning: 700,
  customs: 1500,
};

export async function ensureDemoProviders(ctx: AppContext) {
  // skipDuplicates: لو اشتغل أكثر من نسخة من الخادم بنفس الوقت، ما يصير تعارض.
  await ctx.db.provider.createMany({ data: DEMO_PROVIDERS.map((p) => ({ ...p, verified: true, isDemo: true })), skipDuplicates: true });
}

export function onRequestCreated(ctx: AppContext, request: { id: string; category: CategoryId; typeId: string }) {
  if (!ctx.config.DEMO_MODE) return;
  const type = typeName(request.category, request.typeId) ?? categoryInfo(request.category).name;
  const base = BASE_PRICE_SAR[request.category];
  ctx.scheduler.after(DEMO_TIMINGS.offersAfterMs, async () => {
    const [a, b] = DEMO_PROVIDERS;
    await providerSubmitOffer(ctx.db, a.id, request.id, {
      priceHalalas: riyals(base),
      summaryAr: `${type.ar}، التنفيذ خلال يوم`,
      summaryEn: `${type.en}, done within a day`,
      noteAr: "السعر شامل العمالة والنقل.",
      noteEn: "Price includes labor and transport.",
    });
    await providerSubmitOffer(ctx.db, b.id, request.id, {
      priceHalalas: riyals(Math.round(base * 1.15)),
      summaryAr: `${type.ar}، نبدأ اليوم`,
      summaryEn: `${type.en}, we can start today`,
      noteAr: "عندنا فريق جاهز في المدينة الصناعية.",
      noteEn: "Our team is ready in the industrial city.",
    });
  });
}

export function onOfferAccepted(ctx: AppContext, requestId: string, providerId: string) {
  if (!ctx.config.DEMO_MODE || !DEMO_PROVIDERS.some((p) => p.id === providerId)) return;
  ctx.scheduler.after(DEMO_TIMINGS.startWorkAfterMs, async () => {
    await providerStartWork(ctx.db, providerId, requestId, ctx.clock.now());
  });
}

export function onCancelRequested(ctx: AppContext, requestId: string, providerId: string) {
  if (!ctx.config.DEMO_MODE || !DEMO_PROVIDERS.some((p) => p.id === providerId)) return;
  ctx.scheduler.after(DEMO_TIMINGS.cancelResponseAfterMs, async () => {
    await providerRespondToCancel(ctx.db, providerId, requestId, true, ctx.clock.now());
  });
}
