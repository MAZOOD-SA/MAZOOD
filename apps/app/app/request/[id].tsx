// تفاصيل الطلب: العروض المستلمة ومقارنتها وقبول واحد منها، ثم تأكيد الاستلام والفاتورة.
// ما فيه زر accent هنا: «قبول العرض» زر primary لأنه يتكرر على كل بطاقة.
import { spacing } from "@mazood/brand";
import { IconCalendar, IconCircleCheck, IconHourglass, IconMapPin } from "@/components/icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OfferCard, RequestStatusBadge } from "@/components/domain";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Card, Notice, Row } from "@/components/ui";
import { categoryById, type IconComponent } from "@/data/categories";
import { pendingOffersFor } from "@/data/reducer";
import { PROVIDERS } from "@/data/seed";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function RequestDetails() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { t, tl, num, relative } = useI18n();
  const { colors } = useTheme();
  const { state, dispatch } = useStore();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const request = state.requests.find((r) => r.id === id);
  if (!request) {
    return (
      <Screen title={t("requestDetails")} back>
        <AppText color="inkMuted">{t("notFound")}</AppText>
      </Screen>
    );
  }

  const cat = categoryById(request.category);
  const pending = pendingOffersFor(state, request.id);
  const accepted = state.offers.find((o) => o.id === request.acceptedOfferId);
  const acceptingOffer = state.offers.find((o) => o.id === accepting);
  const acceptingProvider = PROVIDERS.find((p) => p.id === acceptingOffer?.providerId);
  const whenLabel = { today: t("whenToday"), tomorrow: t("whenTomorrow"), this_week: t("whenThisWeek") }[request.when];
  const now = () => new Date().toISOString();

  return (
    <Screen title={t("requestDetails")} back>
      {created && request.status === "awaiting_offers" && pending.length === 0 && <Notice icon={IconCircleCheck} text={t("requestSent")} />}

      <Card style={{ gap: spacing["3"] }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="caption" color="inkMuted">
              {tl(cat.name)} · {relative(request.createdAt)}
            </AppText>
            <AppText variant="h2">{tl(request.title)}</AppText>
          </View>
          <RequestStatusBadge request={request} pendingOffers={pending.length} />
        </Row>
        <AppText variant="bodySm">{tl(request.details)}</AppText>
        <InfoLine icon={IconMapPin} text={tl(request.location)} />
        <InfoLine icon={IconCalendar} text={whenLabel} />
      </Card>

      {request.status === "awaiting_offers" && (
        <>
          <SectionTitle
            title={`${t("receivedOffers")} (${num(pending.length)})`}
            action={
              pending.length > 1 ? (
                <AppText variant="caption" color="inkMuted">
                  {t("sortedByPrice")}
                </AppText>
              ) : undefined
            }
          />
          {pending.length === 0 ? (
            <Card style={{ flexDirection: "row", gap: spacing["2"], alignItems: "center", backgroundColor: colors.surfaceAlt }}>
              <IconHourglass size={20} color={colors.inkMuted} strokeWidth={1.75} />
              <AppText variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
                {t("waitingOffersHint")}
              </AppText>
            </Card>
          ) : (
            pending.map((o) => <OfferCard key={o.id} offer={o} onAccept={() => setAccepting(o.id)} />)
          )}
          <Button label={t("cancelRequest")} variant="ghost" tone="danger" onPress={() => setCancelling(true)} />
        </>
      )}

      {accepted && (
        <>
          <SectionTitle title={t("acceptedOffer")} />
          <OfferCard offer={accepted} accepted />
        </>
      )}

      {request.status === "in_progress" && (
        <Card style={{ gap: spacing["3"] }}>
          <AppText variant="bodySm" color="inkMuted">
            {t("confirmReceiptHint")}
          </AppText>
          <Button label={t("confirmReceipt")} variant="primary" icon={IconCircleCheck} onPress={() => dispatch({ type: "confirmReceipt", requestId: request.id, now: now() })} />
        </Card>
      )}

      {request.status === "completed" && request.invoiceId && (
        <Button label={t("viewInvoice")} variant="secondary" onPress={() => router.push(`/invoice/${request.invoiceId}`)} />
      )}

      <ConfirmDialog
        visible={!!accepting}
        title={t("acceptConfirmTitle", { provider: acceptingProvider ? tl(acceptingProvider.name) : "" })}
        body={t("acceptConfirmBody")}
        confirmLabel={t("acceptOffer")}
        cancelLabel={t("cancel")}
        onCancel={() => setAccepting(null)}
        onConfirm={() => {
          if (accepting) dispatch({ type: "acceptOffer", offerId: accepting, now: now() });
          setAccepting(null);
        }}
      />
      <ConfirmDialog
        visible={cancelling}
        title={t("cancelConfirmTitle")}
        body={t("cancelConfirmBody")}
        confirmLabel={t("cancelRequest")}
        cancelLabel={t("keepRequest")}
        onCancel={() => setCancelling(false)}
        onConfirm={() => {
          dispatch({ type: "cancelRequest", requestId: request.id });
          setCancelling(false);
        }}
      />
    </Screen>
  );
}

function InfoLine({ icon: Icon, text }: { icon: IconComponent; text: string }) {
  const { colors } = useTheme();
  return (
    <Row>
      <Icon size={18} color={colors.inkMuted} strokeWidth={1.75} />
      <AppText variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
        {text}
      </AppText>
    </Row>
  );
}
