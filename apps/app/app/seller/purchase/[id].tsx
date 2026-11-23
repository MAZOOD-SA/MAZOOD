// طلب شراء واصل للمصنع البائع (/seller/purchase/:id): التفاصيل، والرد بسعر ومدة وتوصيل وصلاحية، أو الاعتذار.
// قبل الاتفاق يشوف «منشأة» أو «فرد» بدون الاسم. بعده يشوف الاسم والجوال.
import { spacing } from "@mazood/brand";
import { purchaseQuoteBody } from "@mazood/shared";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Switch, View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { PurchaseRequest } from "@/api/market-types";
import { useAutoRefresh } from "@/components/flow";
import { Field } from "@/components/Field";
import { IconPhone, IconSend } from "@/components/icons";
import { Screen, SectionTitle, TwoColumn } from "@/components/layout";
import { PurchaseStatusBadge } from "@/components/market";
import { PurchaseDetails } from "@/components/purchase";
import { AppText, Button, Card, Notice, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { parseRiyals } from "@/lib/money";
import { useTheme } from "@/theme/ThemeProvider";

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();

export default function SellerPurchase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money } = useI18n();
  const { colors } = useTheme();
  const { authed, factoryRole } = useStore();
  const [p, setP] = useState<PurchaseRequest | null>(null);
  const [price, setPrice] = useState("");
  const [lead, setLead] = useState("3");
  const [delivery, setDelivery] = useState(true);
  const [validDays, setValidDays] = useState("3");
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => authed<{ purchaseRequest: PurchaseRequest }>(`/v1/market/seller/purchase-requests/${id}`).then((r) => setP(r.purchaseRequest)),
    [authed, id],
  );
  useEffect(() => {
    load().catch(() => setFailure(t("errNotFound")));
  }, [load, t]);
  useAutoRefresh(load);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setFailure(null);
    try {
      const r = await authed<{ purchaseRequest: PurchaseRequest }>(`/v1/market/seller/purchase-requests/${id}/${path}`, { method: "POST", body });
      setP(r.purchaseRequest);
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  function sendQuote() {
    const parsed = purchaseQuoteBody.safeParse({
      unitPriceHalalas: parseRiyals(price),
      leadTimeDays: Number(toLatin(lead)),
      deliveryIncluded: delivery,
      validDays: Number(toLatin(validDays)),
      note: note.trim() || undefined,
    });
    if (!parsed.success) return setError(t("productPriceRequired"));
    setError(null);
    return post("quote", parsed.data);
  }

  if (!p) return <Screen title={t("purchaseTitle")} back>{failure ? <Notice text={failure} /> : null}</Screen>;
  const canReply = factoryRole !== "member" && p.actions.includes("quote");
  const unitPrice = parseRiyals(price);

  const reply = canReply && (
    <Card style={{ gap: spacing["3"] }}>
      <SectionTitle title={t("replyTitle")} />
      {p.revisionNote && <Notice text={p.revisionNote} />}
      <Field label={t("replyUnitPrice")} value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={12} error={error} ltr />
      {unitPrice && (
        <AppText variant="bodySm" color="inkMuted">
          {t("quoteTotal")}: {money(unitPrice * p.quantity)}
        </AppText>
      )}
      <Field label={t("replyLeadDays")} value={lead} onChangeText={setLead} keyboardType="number-pad" maxLength={3} ltr />
      <Row style={{ justifyContent: "space-between" }}>
        <AppText>{t("replyDelivery")}</AppText>
        <Switch value={delivery} onValueChange={setDelivery} trackColor={{ true: colors.primary, false: colors.line }} />
      </Row>
      <Field label={t("replyValidDays")} value={validDays} onChangeText={setValidDays} keyboardType="number-pad" maxLength={2} ltr />
      <Field label={t("replyNote")} value={note} onChangeText={setNote} multiline maxLength={1000} />
      <Button label={t("sendReply")} icon={IconSend} variant="accent" size="lg" full disabled={busy} onPress={sendQuote} />
      {declining ? (
        <View style={{ gap: spacing["2"] }}>
          <Field label={t("declineReason")} value={note} onChangeText={setNote} multiline maxLength={500} />
          <Button label={t("declinePurchase")} variant="secondary" tone="danger" disabled={busy} onPress={() => post("decline", note.trim() ? { note: note.trim() } : {})} />
        </View>
      ) : (
        <Button label={t("declinePurchase")} variant="ghost" tone="danger" onPress={() => setDeclining(true)} />
      )}
    </Card>
  );

  return (
    <Screen title={t("purchaseTitle")} back width="page" onRefresh={load} contentStyle={{ gap: spacing["3"] }}>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <AppText weight={600}>
          {t("buyerKindLabel")}: {p.buyer?.name ?? t(p.buyer?.kind === "individual" ? "customerIndividual" : "customerBusiness")}
        </AppText>
        <PurchaseStatusBadge status={p.status} viewer="seller" />
      </Row>
      {failure && <Notice text={failure} />}
      <TwoColumn
        main={
          <View style={{ gap: spacing["3"] }}>
            <PurchaseDetails p={p} />
          </View>
        }
        side={
          <View style={{ gap: spacing["3"] }}>
            {reply}
            {p.contact && <Button label={t("callBuyer")} icon={IconPhone} variant="secondary" onPress={() => Linking.openURL(`tel:${p.contact!.phone}`)} />}
          </View>
        }
      />
    </Screen>
  );
}
