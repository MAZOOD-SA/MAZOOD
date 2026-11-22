// «متجري» للمصنع البائع: الحالة والاشتراك، وطلبات الشراء الواصلة، ومنتجاتي.
// قبل التفعيل: بطاقة «اعرض منتجاتك في السوق» مع سعر الباقة. بعده: خطوات الظهور (السجل ← التوثيق ← الاشتراك ← المنتجات).
// الزر الكهرماني الوحيد: أهم خطوة ناقصة (فعّل البيع، أو أرسل للتوثيق، أو أضف منتج).
import { spacing } from "@mazood/brand";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { MarketProduct, PurchaseRequest, SellerResponse } from "@/api/market-types";
import { useAutoRefresh } from "@/components/flow";
import { Field } from "@/components/Field";
import { IconCircleCheck, IconFileUpload, IconPlus } from "@/components/icons";
import { Grid, Screen, SectionTitle, TwoColumn } from "@/components/layout";
import { ProductCard, PurchaseCard, setSellerEnabled } from "@/components/market";
import { AppText, Badge, Button, Card, Notice, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import type { StringKey } from "@/i18n/strings";
import { useI18n } from "@/i18n/I18nProvider";

export default function Store() {
  const { t, money, num, date } = useI18n();
  const { authed, upload, factory, factoryRole } = useStore();
  const [data, setData] = useState<SellerResponse | null>(null);
  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [incoming, setIncoming] = useState<PurchaseRequest[]>([]);
  const [expiry, setExpiry] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manager = factoryRole !== "member";

  const load = useCallback(async () => {
    const r = await authed<SellerResponse>("/v1/market/seller");
    setData(r);
    setSellerEnabled(!!r.seller);
    if (!r.seller) return;
    const [p, i] = await Promise.all([
      authed<{ products: MarketProduct[] }>("/v1/market/seller/products"),
      authed<{ purchaseRequests: PurchaseRequest[] }>("/v1/market/seller/purchase-requests"),
    ]);
    setProducts(p.products);
    setIncoming(i.purchaseRequests);
  }, [authed]);
  useAutoRefresh(() => load().catch(() => {}));

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  async function uploadDocument() {
    const latin = expiry.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(latin)) return setFailure(t("storeDocExpiry"));
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const form = new FormData();
    form.append("expiresOn", latin);
    if (Platform.OS === "web" && a.file) form.append("file", a.file);
    else form.append("file", { uri: a.uri, name: a.name, type: a.mimeType ?? "application/pdf" } as unknown as Blob);
    await act(() => upload("/v1/market/seller/documents", form));
  }

  if (factory.kind !== "business") {
    return (
      <Screen title={t("storeTitle")}>
        <Notice text={t("storeBusinessOnly")} />
      </Screen>
    );
  }
  if (!data) return <Screen title={t("storeTitle")}>{failure ? <Notice text={failure} /> : null}</Screen>;

  // قبل التفعيل
  if (!data.seller) {
    return (
      <Screen title={t("storeTitle")} contentStyle={{ gap: spacing["3"] }}>
        <Card style={{ gap: spacing["2"] }}>
          <AppText variant="h2" weight={700}>
            {t("storeEnableTitle")}
          </AppText>
          <AppText color="inkMuted">{t("storeEnableHint")}</AppText>
          {data.plan && <AppText weight={700}>{t("storePlanPrice", { price: money(data.plan.monthlyPriceHalalas) })}</AppText>}
          {data.trialDays > 0 && <Badge label={t("storeTrial", { n: num(data.trialDays) })} tone="ok" />}
        </Card>
        {failure && <Notice text={failure} />}
        {manager && <Button label={t("storeEnable")} variant="accent" size="lg" full disabled={busy} onPress={() => act(() => authed("/v1/market/seller", { method: "POST" }))} />}
      </Screen>
    );
  }

  const s = data.seller;
  const needsDocument = !s.document || s.document.status === "rejected" || (!s.documentValid && s.document.status !== "pending");
  const canSubmit = s.document?.status === "pending" && s.status !== "pending";
  const waiting = incoming.filter((p) => p.actions.includes("quote")).length;
  const steps: [StringKey, boolean][] = [
    ["storeStepDocument", !!s.document && s.document.status !== "rejected"],
    ["storeStepVerify", s.status === "verified" && s.documentValid],
    ["storeStepSubscribe", !!s.subscription],
    ["storeStepProducts", s.products.active > 0],
  ];

  const status = (
    <Card style={{ gap: spacing["2"] }}>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <AppText weight={700}>{t(s.listed ? "storeListed" : "storeNotListed")}</AppText>
        {s.listed && <Badge label={t("verifiedSeller")} tone="ok" icon={IconCircleCheck} />}
      </Row>
      {!s.listed &&
        steps.map(([key, done]) => (
          <Row key={key} gap="2">
            <Badge label={done ? "✓" : "•"} tone={done ? "ok" : "muted"} />
            <AppText variant="bodySm" color={done ? "ink" : "inkMuted"}>
              {t(key)}
            </AppText>
          </Row>
        ))}
      <AppText variant="bodySm" color="inkMuted">
        {s.subscription ? t("storeSubscriptionUntil", { date: date(s.subscription.endsAt) }) : t("storeSubscriptionNone")}
      </AppText>
      {s.warnings.subscriptionEndingSoon && <Notice text={t("storeSubscriptionEnding")} />}
      {s.warnings.documentExpiringSoon && <Notice text={t("storeDocumentExpiring")} />}
      {s.status === "rejected" && s.statusReason && <Notice text={t("storeRejected", { reason: s.statusReason })} />}
      {s.status === "suspended" && <Notice text={t("storeSuspended", { reason: s.statusReason ?? "" })} />}
      {s.status === "pending" && <Notice text={t("storePending")} />}
    </Card>
  );

  const documentCard = manager && (needsDocument || canSubmit || s.warnings.documentExpiringSoon) && (
    <Card style={{ gap: spacing["2"] }}>
      <SectionTitle title={t("storeUploadDocument")} />
      {(needsDocument || s.warnings.documentExpiringSoon) && (
        <>
          <Field label={t("storeDocExpiry")} value={expiry} onChangeText={setExpiry} placeholder="2030-01-31" maxLength={10} ltr />
          <Button label={t("storeUploadDocument")} icon={IconFileUpload} variant="secondary" disabled={busy} onPress={uploadDocument} />
        </>
      )}
      {canSubmit && <Button label={t("storeSubmit")} variant="primary" disabled={busy} onPress={() => act(() => authed("/v1/market/seller/submit", { method: "POST" }))} />}
    </Card>
  );

  const main = (
    <View style={{ gap: spacing["3"] }}>
      <SectionTitle title={t("storeIncoming")} action={waiting ? <Badge label={t("waitingReply", { n: num(waiting) })} tone="new" /> : undefined} />
      {incoming.length === 0 ? (
        <AppText variant="bodySm" color="inkMuted">
          {t("storeNoIncoming")}
        </AppText>
      ) : (
        incoming.map((p) => <PurchaseCard key={p.id} purchase={p} viewer="seller" onPress={() => router.push(`/seller/purchase/${p.id}`)} />)
      )}
      <SectionTitle
        title={t("storeProducts")}
        action={manager && products.length > 0 ? <Button label={t("addProduct")} icon={IconPlus} variant="ghost" onPress={() => router.push("/seller/product")} /> : undefined}
      />
      {products.length === 0 ? (
        <>
          <AppText variant="bodySm" color="inkMuted">
            {t("storeNoProducts")}
          </AppText>
          {manager && <Button label={t("addProduct")} icon={IconPlus} variant="accent" size="lg" full onPress={() => router.push("/seller/product")} />}
        </>
      ) : (
        <Grid minItemWidth={160} max={3}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} showStatus onPress={() => router.push({ pathname: "/seller/product", params: { id: p.id } })} />
          ))}
        </Grid>
      )}
    </View>
  );

  return (
    <Screen title={t("storeTitle")} width="page" onRefresh={load} contentStyle={{ gap: spacing["3"] }}>
      {failure && <Notice text={failure} />}
      <TwoColumn
        main={main}
        side={
          <View style={{ gap: spacing["3"] }}>
            {status}
            {documentCard}
          </View>
        }
      />
    </Screen>
  );
}
