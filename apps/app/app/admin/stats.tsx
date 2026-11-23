// الأرقام شهر بشهر: الشهر الحالي مقارنة باللي قبله، ورسم النمو، وصحة المنصة، والعرض والطلب في كل قسم، والسوق.
// يشوفها المالك والمدير العام والمالية (reports.view، قرار المالك 23 نوفمبر 2026، وتتغيّر من شاشة الصلاحيات).
import { spacing } from "@mazood/brand";
import { View } from "react-native";
import { MonthBars, StatTile } from "@/components/admin";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Badge, Card, Notice, Row } from "@/components/ui";
import { categoryById, type CategoryId } from "@/data/categories";
import { useCan, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";

type Month = {
  month: string;
  requests: number;
  activeCustomers: number;
  activeProviders: number;
  avgOffersPerRequest: number | null;
  avgMinutesToFirstOffer: number | null;
  completed: number;
  completedValueHalalas: number;
  commissionHalalas: number;
  completionRatePct: number | null;
  cancelRatePct: number | null;
  disputeRatePct: number | null;
};
type Stats = {
  months: Month[];
  categories: { category: CategoryId; requests: number; providers: number; requestsPerProvider: number | null }[];
  totals: { verifiedProviders: number; customers: number };
};
type MarketMonth = { month: string; subscriptionIncomeHalalas: number; subscribedSellers: number; purchaseRequests: number; acceptedPurchases: number };

/** «فرصة»: القسم فيه طلبات أكثر من ٣ لكل مزوّد، أو فيه طلبات وما فيه مزوّد. */
const isOpportunity = (c: Stats["categories"][number]) => c.requests > 0 && (c.providers === 0 || (c.requestsPerProvider ?? 0) >= 3);

export default function StatsScreen() {
  const { t, tl, num, money } = useI18n();
  const allowed = useCan();
  const { data, error } = useLoad<Stats>("/v1/admin/stats");
  const market = useLoad<{ months: MarketMonth[] }>(allowed("market.reports") ? "/v1/admin/market/stats" : null);
  const cur = data?.months[data.months.length - 1];
  const prev = data?.months[data.months.length - 2];
  const dash = t("statNoData");
  const pct = (v: number | null | undefined) => (v == null ? dash : t("percent", { n: num(v) }));
  const minutes = (m: number | null | undefined) => (m == null ? dash : m < 120 ? t("minutesShort", { n: num(m) }) : t("hoursShort", { n: num(Math.round(m / 60)) }));
  const vs = (v: string) => t("statVsLast", { v });
  const mCur = market.data?.months[market.data.months.length - 1];
  const mPrev = market.data?.months[market.data.months.length - 2];

  return (
    <Screen title={t("navStats")} back width="page">
      {error && <Notice text={t(error)} />}
      <AppText variant="bodySm" color="inkMuted">
        {t("statsHint")}
      </AppText>
      {cur && prev && data && (
        <>
          <SectionTitle title={t("statThisMonth")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
            <StatTile label={t("statCompleted")} value={num(cur.completed)} sub={vs(num(prev.completed))} />
            <StatTile label={t("statCompletedValue")} value={money(cur.completedValueHalalas)} sub={vs(money(prev.completedValueHalalas))} />
            <StatTile label={t("statCommission")} value={money(cur.commissionHalalas)} sub={t("statCommissionLater")} />
            <StatTile label={t("statRequests")} value={num(cur.requests)} sub={vs(num(prev.requests))} />
            <StatTile label={t("statActiveProviders")} value={num(cur.activeProviders)} sub={vs(num(prev.activeProviders))} />
            <StatTile label={t("statActiveCustomers")} value={num(cur.activeCustomers)} sub={vs(num(prev.activeCustomers))} />
          </View>

          <SectionTitle title={t("statGrowth")} />
          <MonthBars caption={t("statGrowthCaption")} data={data.months.map((m) => ({ month: m.month, value: m.requests }))} />

          <SectionTitle title={t("statHealth")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
            <StatTile label={t("statAvgOffers")} value={cur.avgOffersPerRequest == null ? dash : num(cur.avgOffersPerRequest)} sub={vs(prev.avgOffersPerRequest == null ? dash : num(prev.avgOffersPerRequest))} />
            <StatTile label={t("statFirstOffer")} value={minutes(cur.avgMinutesToFirstOffer)} sub={vs(minutes(prev.avgMinutesToFirstOffer))} />
            <StatTile label={t("statCompletionRate")} value={pct(cur.completionRatePct)} sub={vs(pct(prev.completionRatePct))} />
            <StatTile label={t("statCancelRate")} value={pct(cur.cancelRatePct)} sub={vs(pct(prev.cancelRatePct))} />
            <StatTile label={t("statDisputeRate")} value={pct(cur.disputeRatePct)} sub={vs(pct(prev.disputeRatePct))} />
          </View>

          <SectionTitle title={t("statCategories")} />
          <AppText variant="bodySm" color="inkMuted">
            {t("statCategoriesHint")}
          </AppText>
          <View style={{ gap: spacing["2"] }}>
            {data.categories.map((c) => (
              <Card key={c.category}>
                <Row style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <AppText weight={600} style={{ flex: 1 }}>
                    {tl(categoryById(c.category).name)}
                  </AppText>
                  {isOpportunity(c) && <Badge label={t("statOpportunity")} tone="new" />}
                </Row>
                <AppText variant="bodySm" color="inkMuted">
                  {t("statCatRequests", { n: num(c.requests) })} · {t("statCatProviders", { n: num(c.providers) })}
                </AppText>
              </Card>
            ))}
          </View>
        </>
      )}

      {mCur && mPrev && (
        <>
          <SectionTitle title={t("statMarket")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
            <StatTile label={t("statSubscriptionIncome")} value={money(mCur.subscriptionIncomeHalalas)} sub={vs(money(mPrev.subscriptionIncomeHalalas))} />
            <StatTile label={t("statSubscribedSellers")} value={num(mCur.subscribedSellers)} sub={vs(num(mPrev.subscribedSellers))} />
            <StatTile label={t("statPurchaseRequests")} value={num(mCur.purchaseRequests)} sub={vs(num(mPrev.purchaseRequests))} />
          </View>
        </>
      )}
    </Screen>
  );
}
