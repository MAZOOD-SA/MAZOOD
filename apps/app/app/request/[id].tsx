// تفاصيل الطلب.
//   - الطلب الحقيقي (من الخادم): حالته، والإلغاء وهو «بانتظار العروض». العروض الحقيقية تبدأ في المرحلة ٤.
//   - الطلب التجريبي: العروض ومقارنتها وقبول واحد منها، ثم تأكيد الاستلام والفاتورة (بيانات تجريبية).
// ما فيه زر accent هنا: «قبول العرض» زر primary لأنه يتكرر على كل بطاقة.
// قاعدة «ولا مرة طريق مسدود»: في كل حالة فيه زر واضح للخطوة الجاية.
import { spacing } from "@mazood/brand";
import { IconCalendar, IconCircleCheck, IconHourglass, IconMapPin } from "@/components/icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OfferCard, RequestStatusBadge } from "@/components/domain";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Card, Notice, Row } from "@/components/ui";
import { categoryById, type IconComponent } from "@/data/categories";
import { pendingOffersFor } from "@/data/reducer";
import { useRequests } from "@/data/requests";
import type { ServiceRequest } from "@/data/types";
import { PROVIDERS } from "@/data/seed";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/theme/ThemeProvider";

export default function RequestDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useStore();
  const demo = state.requests.find((r) => r.id === id);
  return demo ? <DemoRequestDetails request={demo} /> : <RealRequestDetails id={id ?? ""} />;
}

/** بطاقة الطلب نفسها: القسم، والعنوان، والحالة، والتفاصيل، والموقع، والموعد. */
function RequestSummary({ request, pendingOffers }: { request: ServiceRequest; pendingOffers: number }) {
  const { t, tl, relative } = useI18n();
  const cat = categoryById(request.category);
  const whenLabel = { today: t("whenToday"), tomorrow: t("whenTomorrow"), this_week: t("whenThisWeek") }[request.when];
  return (
    <Card style={{ gap: spacing["3"] }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" color="inkMuted">
            {tl(cat.name)} · {relative(request.createdAt)}
          </AppText>
          <AppText variant="h2">{tl(request.title)}</AppText>
        </View>
        <RequestStatusBadge request={request} pendingOffers={pendingOffers} />
      </Row>
      <AppText variant="bodySm">{tl(request.details)}</AppText>
      <InfoLine icon={IconMapPin} text={tl(request.location)} />
      <InfoLine icon={IconCalendar} text={whenLabel} />
    </Card>
  );
}

function WaitingForOffers() {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Card style={{ flexDirection: "row", gap: spacing["2"], alignItems: "center", backgroundColor: colors.surfaceAlt }}>
      <IconHourglass size={20} color={colors.inkMuted} strokeWidth={1.75} />
      <AppText variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
        {t("waitingOffersHint")}
      </AppText>
    </Card>
  );
}

/** طلب حقيقي من الخادم. */
function RealRequestDetails({ id }: { id: string }) {
  const { created } = useLocalSearchParams<{ created?: string }>();
  const { t, num } = useI18n();
  const { colors } = useTheme();
  const requests = useRequests();
  const fromList = requests.items.find((r) => r.id === id);
  const [request, setRequest] = useState<ServiceRequest | null | undefined>(fromList);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // نجيب آخر حالة من الخادم كل ما انفتحت الشاشة.
  const load = () => {
    setLoadError(null);
    requests
      .fetchOne(id)
      .then(setRequest)
      .catch((e) => setLoadError(errorMessage(t, e)));
  };
  useEffect(load, [id]);
  useEffect(() => {
    if (fromList) setRequest(fromList);
  }, [fromList]);

  if (request === undefined) {
    return (
      <Screen title={t("requestDetails")} back>
        {loadError ? (
          <>
            <Notice text={loadError} />
            <Button label={t("retry")} variant="secondary" onPress={load} />
          </>
        ) : (
          <ActivityIndicator color={colors.ink} />
        )}
      </Screen>
    );
  }
  if (request === null) {
    return (
      <Screen title={t("requestDetails")} back>
        <AppText color="inkMuted">{t("notFound")}</AppText>
        <Button label={t("goHome")} variant="secondary" onPress={() => router.replace("/home")} />
      </Screen>
    );
  }

  return (
    <Screen title={t("requestDetails")} back>
      {created && request.status === "awaiting_offers" && <Notice icon={IconCircleCheck} text={t("requestSent")} />}
      <RequestSummary request={request} pendingOffers={0} />

      {request.status === "awaiting_offers" && (
        <>
          <SectionTitle title={`${t("receivedOffers")} (${num(0)})`} />
          <WaitingForOffers />
          {actionError && (
            <AppText variant="bodySm" color="danger">
              {actionError}
            </AppText>
          )}
          <Button label={t("cancelRequest")} variant="ghost" tone="danger" onPress={() => setCancelling(true)} />
        </>
      )}

      {request.status === "cancelled" && <CancelledNextStep request={request} />}

      <ConfirmDialog
        visible={cancelling}
        title={t("cancelConfirmTitle")}
        body={t("cancelConfirmBody")}
        confirmLabel={t("cancelRequest")}
        cancelLabel={t("keepRequest")}
        onCancel={() => setCancelling(false)}
        onConfirm={() => {
          setCancelling(false);
          setActionError(null);
          requests
            .cancel(request.id)
            .then(setRequest)
            .catch((e) => setActionError(errorMessage(t, e)));
        }}
      />
    </Screen>
  );
}

/** طلب تجريبي: دورة العروض والقبول والفاتورة كاملة ببيانات وهمية. */
function DemoRequestDetails({ request }: { request: ServiceRequest }) {
  const { t, tl, num } = useI18n();
  const { state, dispatch } = useStore();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const pending = pendingOffersFor(state, request.id);
  const accepted = state.offers.find((o) => o.id === request.acceptedOfferId);
  const acceptingOffer = state.offers.find((o) => o.id === accepting);
  const acceptingProvider = PROVIDERS.find((p) => p.id === acceptingOffer?.providerId);
  const now = () => new Date().toISOString();

  return (
    <Screen title={t("requestDetails")} back>
      <Notice text={t("demoRequestNote")} />
      <RequestSummary request={request} pendingOffers={pending.length} />

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
            <WaitingForOffers />
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

      {request.status === "cancelled" && <CancelledNextStep request={request} />}

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

/** الطلب الملغي: الخطوة الجاية واضحة (ولا مرة طريق مسدود). */
function CancelledNextStep({ request }: { request: ServiceRequest }) {
  const { t } = useI18n();
  return (
    <Card style={{ gap: spacing["3"] }}>
      <AppText variant="bodySm" color="inkMuted">
        {t("requestCancelledNote")}
      </AppText>
      <Button
        label={t("newRequestSameCategory")}
        variant="primary"
        onPress={() => router.push({ pathname: "/request/new", params: { category: request.category } })}
      />
    </Card>
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
