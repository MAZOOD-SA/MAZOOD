// صفحة المصنع البائع (/market/seller/:id): اسمه وشارة «موثّق» ومدينته وتقييمه ومنتجاته. تنفتح بدون دخول.
import { spacing } from "@mazood/brand";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import type { SellerPage } from "@/api/market-types";
import { Grid, Screen, SectionTitle } from "@/components/layout";
import { ProductCard, SellerLine } from "@/components/market";
import { AppText, Notice } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

export default function SellerPublicPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tl } = useI18n();
  const { authed } = useStore();
  const [page, setPage] = useState<SellerPage | null | undefined>(undefined);

  useEffect(() => {
    authed<SellerPage>(`/v1/market/sellers/${id}`)
      .then(setPage)
      .catch(() => setPage(null));
  }, [authed, id]);

  return (
    <Screen title={page?.seller.name ?? t("marketTitle")} back width="page" contentStyle={{ gap: spacing["3"] }}>
      {page === null && <Notice text={t("errNotFound")} />}
      {page && (
        <>
          <SellerLine name={page.seller.name} rating={page.seller.rating} />
          {page.seller.city && (
            <AppText variant="caption" color="inkMuted">
              {t("cityLabel")}: {tl(page.seller.city)}
            </AppText>
          )}
          <SectionTitle title={t("sellerProducts")} />
          {page.products.length === 0 ? (
            <AppText color="inkMuted">{t("marketEmpty")}</AppText>
          ) : (
            <Grid minItemWidth={160} max={4}>
              {page.products.map((p) => (
                <ProductCard key={p.id} product={p} onPress={() => router.push(`/market/${p.id}`)} />
              ))}
            </Grid>
          )}
        </>
      )}
    </Screen>
  );
}
