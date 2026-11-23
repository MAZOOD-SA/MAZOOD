// «طلباتي من السوق» للمزوّد (/provider/purchases): نفس بطاقات طلبات الشراء عند العميل،
// وكل بطاقة تفتح تفاصيل الطلب (/purchase/:id) بأزرارها من الخادم (القبول، والإلغاء، والاستلام، والتقييم).
import { spacing } from "@mazood/brand";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import type { PurchaseRequest } from "@/api/market-types";
import { useAutoRefresh } from "@/components/flow";
import { IconShoppingBag } from "@/components/icons";
import { Grid, Screen } from "@/components/layout";
import { PurchaseCard } from "@/components/market";
import { AppText, Button } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

export default function ProviderPurchases() {
  const { t } = useI18n();
  const { authed } = useStore();
  const [purchases, setPurchases] = useState<PurchaseRequest[] | null>(null);
  const load = useCallback(
    () => authed<{ purchaseRequests: PurchaseRequest[] }>("/v1/market/purchase-requests").then((r) => setPurchases(r.purchaseRequests)).catch(() => {}),
    [authed],
  );
  useAutoRefresh(load);

  return (
    <Screen title={t("myPurchases")} back width="page" onRefresh={load} contentStyle={{ gap: spacing["3"] }}>
      {purchases && purchases.length === 0 ? (
        <>
          <AppText color="inkMuted">{t("noPurchases")}</AppText>
          <Button label={t("marketTitle")} icon={IconShoppingBag} variant="primary" onPress={() => router.push("/provider/market")} />
        </>
      ) : (
        <Grid minItemWidth={320} max={2}>
          {(purchases ?? []).map((p) => (
            <PurchaseCard key={p.id} purchase={p} viewer="buyer" onPress={() => router.push(`/purchase/${p.id}`)} />
          ))}
        </Grid>
      )}
    </Screen>
  );
}
