// طلب الشراء للمشتري (/purchase/:id): الحالة، ورد المصنع، والأزرار من الخادم (`actions`)، والتواصل بعد الاتفاق.
// «ولا مرة طريق مسدود»: كل حالة فيها زر (اختبار في الخادم يتأكد).
// الزر الكهرماني واحد بس: أهم إجراء في الحالة (اقبل الرد، أو أكّد الاستلام، أو قيّم).
import { spacing } from "@mazood/brand";
import type { BuyerPurchaseAction } from "@mazood/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { PurchaseRequest } from "@/api/market-types";
import { useAutoRefresh, Stars } from "@/components/flow";
import { Field } from "@/components/Field";
import { IconCircleCheck, IconPhone } from "@/components/icons";
import { Screen, SectionTitle, TwoColumn } from "@/components/layout";
import { PurchaseStatusBadge } from "@/components/market";
import { PurchaseDetails } from "@/components/purchase";
import { AppText, Button, Card, Divider, Notice, Row } from "@/components/ui";
import { useStore } from "@/data/store";
import type { StringKey } from "@/i18n/strings";
import { useI18n } from "@/i18n/I18nProvider";

const PATHS: Record<Exclude<BuyerPurchaseAction, "rate" | "order_again">, string> = {
  accept: "accept",
  reject: "reject",
  request_revision: "revision",
  cancel: "cancel",
  confirm_received: "received",
};
const LABELS: Record<BuyerPurchaseAction, StringKey> = {
  accept: "actionAccept",
  reject: "actionReject",
  request_revision: "actionRequestRevision",
  cancel: "actionCancelPurchase",
  confirm_received: "actionConfirmReceived",
  rate: "actionRateSeller",
  order_again: "actionOrderAgain",
};
/** أهم زر في الحالة (الكهرماني). الباقي أزرار عادية. */
const PRIMARY: BuyerPurchaseAction[] = ["accept", "confirm_received", "rate"];

export default function BuyerPurchase() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { t } = useI18n();
  const { authed } = useStore();
  const [p, setP] = useState<PurchaseRequest | null>(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<BuyerPurchaseAction | null>(null);
  const [stars, setStars] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => authed<{ purchaseRequest: PurchaseRequest }>(`/v1/market/purchase-requests/${id}`).then((r) => setP(r.purchaseRequest)),
    [authed, id],
  );
  useEffect(() => {
    load().catch(() => setFailure(t("errNotFound")));
  }, [load, t]);
  useAutoRefresh(load);

  async function run(action: BuyerPurchaseAction) {
    if (!p || busy) return;
    if (action === "order_again") return router.push(`/market/${p.product.id}`);
    // الرفض والتعديل والإلغاء: نطلب السبب (اختياري) قبل ما نرسل.
    if ((action === "reject" || action === "request_revision" || action === "cancel") && asking !== action) return setAsking(action);
    setBusy(true);
    setFailure(null);
    try {
      const path = action === "rate" ? "rating" : PATHS[action];
      const body = action === "rate" ? { stars } : note.trim() ? { note: note.trim() } : {};
      const r = await authed<{ purchaseRequest: PurchaseRequest }>(`/v1/market/purchase-requests/${p.id}/${path}`, { method: "POST", body });
      setP(r.purchaseRequest);
      setAsking(null);
      setNote("");
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  if (!p) return <Screen title={t("purchaseTitle")} back>{failure ? <Notice text={failure} /> : null}</Screen>;

  const primary = p.actions.find((a) => PRIMARY.includes(a as BuyerPurchaseAction)) as BuyerPurchaseAction | undefined;
  const others = p.actions.filter((a) => a !== primary) as BuyerPurchaseAction[];

  const actions = (
    <View style={{ gap: spacing["2"] }}>
      {asking && (
        <Card style={{ gap: spacing["2"] }}>
          {asking === "request_revision" && <AppText variant="caption" color="inkMuted">{t("revisionOnce")}</AppText>}
          <Field label={t(asking === "request_revision" ? "revisionNoteLabel" : "declineReason")} value={note} onChangeText={setNote} multiline maxLength={500} />
        </Card>
      )}
      {primary === "rate" && <Stars value={stars} onChange={setStars} size={32} />}
      {primary && (
        <Button
          label={t(LABELS[primary])}
          icon={primary === "accept" || primary === "confirm_received" ? IconCircleCheck : undefined}
          variant="accent"
          size="lg"
          full
          disabled={busy || (primary === "rate" && stars === 0)}
          onPress={() => run(primary)}
        />
      )}
      <Row style={{ flexWrap: "wrap" }}>
        {others.map((a) => (
          <Button
            key={a}
            label={t(LABELS[a])}
            variant={asking === a ? "primary" : "secondary"}
            tone={a === "cancel" || a === "reject" ? "danger" : "default"}
            disabled={busy}
            onPress={() => run(a)}
          />
        ))}
      </Row>
      {p.contact && (
        <Button label={t("callSeller")} icon={IconPhone} variant="secondary" onPress={() => Linking.openURL(`tel:${p.contact!.phone}`)} />
      )}
    </View>
  );

  return (
    <Screen title={t("purchaseTitle")} back width="page" onRefresh={load} contentStyle={{ gap: spacing["3"] }}>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <AppText weight={600}>{p.seller.name ?? ""}</AppText>
        <PurchaseStatusBadge status={p.status} viewer="buyer" />
      </Row>
      {created === "1" && p.status === "pending" && <Notice icon={IconCircleCheck} text={t("purchaseSent")} />}
      {p.rated && <Notice text={t("thanksRating")} />}
      {failure && <Notice text={failure} />}
      <TwoColumn main={<View style={{ gap: spacing["3"] }}><PurchaseDetails p={p} /></View>} side={actions} />
      <Divider />
    </Screen>
  );
}
