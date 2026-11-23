// «اطلب سعر» على منتج (/purchase/new?product=ID): الكمية والموعد وملاحظة. والتقدير من السعر المعلن يتحدّث مع الكمية.
// المكافأة: بعد الإرسال تنفتح تفاصيل الطلب ومعها «وصل طلبك للمصنع».
// المشتري عميل أو مزوّد (القرار ٥٧). العميل يكمّل بياناته أول، والمزوّد لازم يكون موثّق (والخادم يتأكد بنفسه).
import { spacing } from "@mazood/brand";
import { containsContactInfo, purchaseRequestBody, unitPriceFor } from "@mazood/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { MarketProduct, PurchaseRequest } from "@/api/market-types";
import { Field } from "@/components/Field";
import { IconAlertTriangle, IconSend } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { PriceText, ProductImage, useUnit } from "@/components/market";
import { AppText, Button, Card, Chips, Notice, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useProvider } from "@/data/useProvider";
import { useI18n } from "@/i18n/I18nProvider";

type When = "today" | "tomorrow" | "this_week" | "this_month";
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();

export default function NewPurchase() {
  const { role } = useStore();
  return role === "provider" ? <ProviderGate /> : <PurchaseForm />;
}

/** المزوّد: يطلب بعد التوثيق بس. قبله يشوف السبب وزر يكمّل فيه التوثيق (ولا مرة طريق مسدود). */
function ProviderGate() {
  const { t } = useI18n();
  const { provider } = useProvider();
  if (provider === undefined) return <Screen title={t("purchaseNewTitle")} back>{null}</Screen>;
  if (!provider?.verified) {
    return (
      <Screen title={t("purchaseNewTitle")} back contentStyle={{ gap: spacing["3"] }}>
        <AppText variant="h2" weight={700}>
          {t("providerVerifyToBuy")}
        </AppText>
        <Button label={t("finishVerification")} variant="primary" size="lg" full onPress={() => router.push("/provider")} />
      </Screen>
    );
  }
  return <PurchaseForm buyer="provider" />;
}

function PurchaseForm({ buyer = "customer" }: { buyer?: "customer" | "provider" }) {
  const { product: productId } = useLocalSearchParams<{ product: string }>();
  const { t, num, money } = useI18n();
  const { authed, profileComplete: customerComplete } = useStore();
  // بيانات المزوّد اتراجعت في التوثيق، فما يحتاج «كمّل بياناتك».
  const profileComplete = buyer === "provider" || customerComplete;
  const unit = useUnit();
  const [product, setProduct] = useState<MarketProduct | null>(null);
  const [qty, setQty] = useState("");
  const [when, setWhen] = useState<When>("this_week");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authed<{ product: MarketProduct }>(`/v1/market/products/${productId}`)
      .then((r) => {
        setProduct(r.product);
        setQty(String(r.product.minOrderQty));
      })
      .catch(() => setFailure(t("errNotFound")));
  }, [authed, productId, t]);

  if (!profileComplete) {
    return (
      <Screen title={t("purchaseNewTitle")} back contentStyle={{ gap: spacing["3"] }}>
        <AppText variant="h2" weight={700}>
          {t("completeProfileFirst")}
        </AppText>
        <Button label={t("completeProfile")} variant="primary" size="lg" full onPress={() => router.push("/factory-profile")} />
      </Screen>
    );
  }

  const quantity = Number(toLatin(qty));
  const unitPrice = product && Number.isInteger(quantity) ? unitPriceFor(product, quantity) : null;

  async function submit() {
    if (!product || busy) return;
    const parsed = purchaseRequestBody.safeParse({ quantity, when, note: note.trim() || undefined });
    if (!parsed.success || quantity < product.minOrderQty) return setError(t("quantityInvalid", { n: num(product.minOrderQty) }));
    setError(null);
    setFailure(null);
    setBusy(true);
    try {
      const r = await authed<{ purchaseRequest: PurchaseRequest }>(`/v1/market/products/${product.id}/purchase-requests`, { method: "POST", body: parsed.data });
      router.replace({ pathname: "/purchase/[id]", params: { id: r.purchaseRequest.id, created: "1" } });
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t("purchaseNewTitle")}
      back
      contentStyle={{ gap: spacing["3"] }}
      footer={<Button label={t("sendPurchaseRequest")} icon={IconSend} variant="accent" size="lg" full onPress={submit} disabled={busy || !product} />}
    >
      {failure && <Notice text={failure} />}
      {product && (
        <Card>
          <Row gap="3">
            <ProductImage url={product.images[0]?.url} size={56} />
            <AppText weight={700} style={{ flex: 1 }} numberOfLines={2}>
              {product.name}
            </AppText>
          </Row>
          <PriceText product={product} />
        </Card>
      )}
      {product && (
        <Field
          label={t("quantityLabel", { unit: unit(product.unit) })}
          value={qty}
          onChangeText={setQty}
          keyboardType="number-pad"
          maxLength={8}
          error={error}
          ltr
        />
      )}
      {product && unitPrice !== null && quantity >= product.minOrderQty && (
        <AppText variant="bodySm" color="inkMuted">
          {t("estimateLabel")}: {money(unitPrice * quantity)}
        </AppText>
      )}
      <SectionTitle title={t("whenLabel")} />
      <Chips<When>
        value={when}
        onChange={setWhen}
        options={[
          { value: "today", label: t("whenToday") },
          { value: "tomorrow", label: t("whenTomorrow") },
          { value: "this_week", label: t("whenThisWeek") },
          { value: "this_month", label: t("whenThisMonth") },
        ]}
      />
      <Field label={t("purchaseNoteLabel")} value={note} onChangeText={setNote} multiline maxLength={1000} />
      <AppText variant="caption" color="inkMuted">
        {t("purchaseNoteHint")}
      </AppText>
      {containsContactInfo(note) && <Notice icon={IconAlertTriangle} text={t("noContactInRequest")} />}
    </Screen>
  );
}
