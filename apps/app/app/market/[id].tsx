// صفحة المنتج (/market/:id): تنفتح بدون دخول. الصور، والسعر وشرائحه، وأقل طلب، والبائع الموثّق.
// الزر الكهرماني الوحيد: «اطلب سعر» (القاعدة ٣). بدون دخول يودّي لشاشة الدخول.
import { spacing } from "@mazood/brand";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { ApiClientError } from "@/api/client";
import type { MarketProduct } from "@/api/market-types";
import { TwoColumn, Screen, SectionTitle } from "@/components/layout";
import { PriceText, ProductImage, SellerLine, useUnit } from "@/components/market";
import { AppText, Button, Card, Divider, Notice, ReadMore, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { errorKey } from "@/api/mapping";

export default function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tl, num, money } = useI18n();
  const { authed, state, role, factory } = useStore();
  const unit = useUnit();
  const [product, setProduct] = useState<MarketProduct | null | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    authed<{ product: MarketProduct }>(`/v1/market/products/${id}`)
      .then((r) => setProduct(r.product))
      .catch((e) => {
        setProduct(null);
        setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
      });
  }, [authed, id, t]);

  if (product === undefined) return <Screen title={t("marketTitle")} back>{null}</Screen>;
  if (product === null) {
    return (
      <Screen title={t("marketTitle")} back contentStyle={{ gap: spacing["3"] }}>
        <Notice text={failure ?? t("errNotFound")} />
        <Button label={t("marketTitle")} variant="secondary" onPress={() => router.replace("/market")} />
      </Screen>
    );
  }

  // مين يقدر يطلب: العميل الداخل (المنشآت الحين، والخادم هو اللي يقرر). الفرد يشوف السبب.
  const signedIn = state.signedIn && role === "factory";
  const individual = signedIn && factory.kind === "individual";
  const cta = !state.signedIn ? (
    <Button label={t("signInToRequest")} variant="accent" size="lg" full onPress={() => router.push("/login")} />
  ) : signedIn && !individual ? (
    <Button label={t("requestPrice")} variant="accent" size="lg" full onPress={() => router.push({ pathname: "/purchase/new", params: { product: product.id } })} />
  ) : null;

  const main = (
    <>
      <ProductImage url={product.images[0]?.url} size="full" maxHeight={420} />
      {product.images.length > 1 && (
        <ScrollView horizontal contentContainerStyle={{ gap: spacing["2"] }}>
          {product.images.slice(1).map((img) => (
            <ProductImage key={img.id} url={img.url} size={88} />
          ))}
        </ScrollView>
      )}
      <AppText variant="h2" weight={700}>
        {product.name}
      </AppText>
      {product.category.name && (
        <AppText variant="caption" color="inkMuted">
          {tl(product.category.name)}
        </AppText>
      )}
      <ReadMore text={product.description} variant="body" />
    </>
  );

  const side = (
    <>
      <Card style={{ gap: spacing["2"] }}>
        <PriceText product={product} size="h2" />
        <AppText variant="bodySm" color="inkMuted">
          {t("minOrder", { n: num(product.minOrderQty), unit: unit(product.unit) })}
        </AppText>
        {product.priceTiers.length > 0 && (
          <>
            <Divider />
            <SectionTitle title={t("priceTiers")} />
            {product.priceTiers.map((tier) => (
              <Row key={tier.minQty} style={{ justifyContent: "space-between" }}>
                <AppText variant="bodySm">{t("fromQty", { n: num(tier.minQty), unit: unit(product.unit) })}</AppText>
                <AppText variant="bodySm" weight={600}>
                  {money(tier.unitPriceHalalas)}
                </AppText>
              </Row>
            ))}
          </>
        )}
      </Card>
      <SellerLine name={product.seller.name} rating={product.seller.rating} onPress={() => router.push(`/market/seller/${product.seller.id}`)} />
      {individual && <Notice text={t("marketBuyerNotAllowed")} />}
    </>
  );

  return (
    <Screen title={t("marketTitle")} back width="page" footer={cta} contentStyle={{ gap: spacing["3"] }}>
      <TwoColumn main={<View style={{ gap: spacing["3"] }}>{main}</View>} side={<View style={{ gap: spacing["3"] }}>{side}</View>} />
    </Screen>
  );
}
