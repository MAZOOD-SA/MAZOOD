// تفاصيل الطلب للمصنع: قلب المرحلة ٤. مقارنة العروض، والقبول أو الترشيح، والتنفيذ، والإلغاء، وتأكيد
// الاستلام، والتقييم، والبلاغ، و«اختر عرض ثاني».
//
// الأزرار ما تنحسب هنا: الخادم يرجّعها مع الطلب (actions، من جدول الانتقالات في packages/shared/src/order-flow.ts)،
// والشاشة تبيّنها كما هي. فـ«ولا مرة طريق مسدود» مضمونة من مكان واحد ومغطّاة باختبار.
// الزر الكهرماني (واحد بس) هو actions.primary، في أسفل الشاشة.
//
// الكمبيوتر: عمودين (العروض أو التنفيذ في جهة، وبيانات الطلب والخط الزمني في الجهة الثانية)،
// والعروض جنب بعض حتى ٣ في الصف مع ترتيب بالسعر والتقييم والمدة.
import { radius, spacing } from "@mazood/brand";
import { DISPUTE_REASONS, type FactoryUiAction } from "@mazood/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { FactoryOffer, FactoryRequestView } from "@/api/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Field } from "@/components/Field";
import { CountUp, Fact, PhotoStrip, ProviderLine, SideCard, Stars, Timeline, useAutoRefresh } from "@/components/flow";
import { IconAlertTriangle, IconCircleCheck, IconHourglass } from "@/components/icons";
import { DealRoom } from "@/components/deal-room";
import { Grid, Screen, SectionTitle, SkeletonList, TwoColumn } from "@/components/layout";
import { AppText, Badge, Button, Card, Chips, Divider, Notice, Row } from "@/components/ui";
import { RequestStatusBadge } from "@/components/domain";
import { categoryById } from "@/data/categories";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { useTheme } from "@/theme/ThemeProvider";

type Sort = "price" | "rating" | "duration";
type Dialog =
  | { kind: "accept"; offer: FactoryOffer }
  | { kind: "nominate"; offer: FactoryOffer }
  | { kind: "cancel" }
  | { kind: "request_cancel" }
  | { kind: "open_dispute" }
  | { kind: "add_note" }
  | { kind: "republish" }
  | { kind: "confirm" }
  | null;

/** أزرار ما لها شاشة بعد: «عدّل الطلب» يحتاج قرار (وش يصير للعروض اللي وصلت؟)، مكتوب في PLAN.md. */
const HIDDEN_ACTIONS: FactoryUiAction[] = ["edit"];

export default function RequestDetails() {
  const { id, created, reach: reachParam } = useLocalSearchParams<{ id: string; created?: string; reach?: string }>();
  const { t, tl, num, money, relative, until, duration, digits } = useI18n();
  const { colors } = useTheme();
  const { authed, factoryRole, refreshRequests } = useStore();
  const [view, setView] = useState<FactoryRequestView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("price");
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [reason, setReason] = useState<(typeof DISPUTE_REASONS)[number]>("quality");
  const [stars, setStars] = useState(0);

  const load = useCallback(async () => {
    try {
      setView(await authed<FactoryRequestView>(`/v1/requests/${id}`));
      setLoadError(null);
    } catch (e) {
      setLoadError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
  }, [authed, id, t]);
  useAutoRefresh(load);

  const offers = useMemo(() => {
    const list = [...(view?.offers ?? [])].filter((o) => o.status === "active");
    const byRating = (o: FactoryOffer) => o.provider.rating?.average ?? 0;
    if (sort === "rating") list.sort((a, b) => byRating(b) - byRating(a) || a.price.amountHalalas - b.price.amountHalalas);
    if (sort === "duration") list.sort((a, b) => a.durationHours - b.durationHours || a.price.amountHalalas - b.price.amountHalalas);
    return list;
  }, [view, sort]);

  if (!view) {
    return (
      <Screen title={t("requestDetails")} back width="page">
        {loadError ? <Notice icon={IconAlertTriangle} text={loadError} /> : <SkeletonList rows={3} />}
      </Screen>
    );
  }

  const { request, actions, order, execution } = view;
  const status = request.status;
  const cat = categoryById(request.category);
  const type = cat.types.find((x) => x.id === request.typeId);
  const isMember = factoryRole === "member";
  const others = actions.others.filter((a) => !HIDDEN_ACTIONS.includes(a));
  const nominated = view.approval ? view.offers.find((o) => o.id === view.approval!.offerId) : undefined;
  const choosing = status === "awaiting_offers" && offers.length > 0;
  const chosen = offers.find((o) => o.id === selected) ?? offers[0];
  const pendingChange = execution?.priceChanges.find((c) => c.status === "pending");
  const cancellationPending = view.cancellationRequest?.status === "pending" ? view.cancellationRequest : null;
  const timeline = execution?.timeline.length ? execution.timeline : [{ at: request.createdAt, by: "factory", event: "created" }];
  if (!timeline.some((e) => e.event === "created")) timeline.unshift({ at: request.createdAt, by: "factory", event: "created" });

  /** ينفّذ إجراء على الخادم، ويحدّث الشاشة من الرد. */
  async function run(path: string, body?: unknown) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await authed<Partial<FactoryRequestView>>(path, { method: "POST", body });
      if (res && "actions" in res) setView(res as FactoryRequestView);
      else await load();
      setDialog(null);
      setText("");
      refreshRequests();
    } catch (e) {
      setActionError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  const open = (d: Dialog) => {
    setActionError(null);
    setText("");
    setDialog(d);
  };

  const reorder = () =>
    router.push({
      pathname: "/request/new",
      params: { category: request.category, typeId: request.typeId, details: request.details, area: request.area ?? "", location: request.location, when: request.when },
    });

  // ── الزر الكهرماني ──
  let primary: { label: string; onPress: () => void } | null = null;
  switch (actions.primary) {
    case "accept":
    case "choose_other":
      if (status === "pending_approval" && nominated && !isMember) primary = { label: t("approveAndAccept"), onPress: () => open({ kind: "accept", offer: nominated }) };
      else if (choosing && chosen)
        primary = isMember
          ? { label: t("nominateOffer", { provider: chosen.provider.tradeName }), onPress: () => open({ kind: "nominate", offer: chosen }) }
          : { label: t("acceptOfferFrom", { provider: chosen.provider.tradeName }), onPress: () => open({ kind: "accept", offer: chosen }) };
      break;
    case "confirm":
      primary = { label: t("confirmReceipt"), onPress: () => open({ kind: "confirm" }) };
      break;
    case "republish":
      primary = { label: t("republish"), onPress: () => open({ kind: "republish" }) };
      break;
    case "reorder":
      primary = { label: t("reorder"), onPress: reorder };
      break;
  }

  const otherButton = (a: FactoryUiAction) => {
    const b = (label: StringKey, onPress: () => void, danger = false) => (
      <Button key={a} label={t(label)} variant={danger ? "ghost" : "secondary"} tone={danger ? "danger" : "default"} onPress={onPress} />
    );
    switch (a) {
      case "cancel":
        return b(status === "accepted" ? "cancelFree" : "cancelRequest", () => open({ kind: "cancel" }), true);
      case "request_cancel":
        return b("requestCancellation", () => open({ kind: "request_cancel" }), true);
      case "withdraw_cancel_request":
        return b("withdrawCancellation", () => run(`/v1/requests/${id}/cancellation/withdraw`));
      case "open_dispute":
        return b("openDispute", () => open({ kind: "open_dispute" }));
      case "add_note":
        return b("addNote", () => open({ kind: "add_note" }));
      case "withdraw_nomination":
        return isMember ? b("withdrawNomination", () => run(`/v1/requests/${id}/nomination/withdraw`)) : null;
      case "choose_other":
        return !isMember && status === "pending_approval" ? b("chooseOther", () => run(`/v1/requests/${id}/nomination/withdraw`)) : null;
      default:
        return null; // rate: داخل بطاقة التقييم. reorder وrepublish وaccept: الزر الكهرماني.
    }
  };

  const headline = (
    <Card style={{ gap: spacing["2"], backgroundColor: colors.surfaceAlt }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" color="inkMuted">
            {tl(cat.name)} · {relative(request.createdAt)}
          </AppText>
          <AppText variant="h2">{type ? tl(type.name) : tl(cat.name)}</AppText>
        </View>
        <RequestStatusBadge status={status} offerCount={offers.length} />
      </Row>
      <StatusText view={view} offers={offers.length} animate={!!created} reachHint={Number(reachParam) || undefined} />
    </Card>
  );

  const main = (
    <>
      {headline}
      {view.withdrawal && status === "awaiting_offers" && <Notice icon={IconAlertTriangle} text={t("providerWithdrewNotice")} />}

      {/* ── المقارنة ── */}
      {(status === "awaiting_offers" || status === "pending_approval") && offers.length > 0 && (
        <>
          <SectionTitle title={`${t("receivedOffers")} (${num(offers.length)})`} />
          {offers.length > 1 && (
            <Chips<Sort>
              value={sort}
              onChange={setSort}
              options={[
                { value: "price", label: t("sortPrice") },
                { value: "rating", label: t("sortRating") },
                { value: "duration", label: t("sortDuration") },
              ]}
            />
          )}
          <Grid minItemWidth={220} max={3}>
            {offers.map((o) => (
              <OfferCompareCard
                key={o.id}
                offer={o}
                selected={status === "awaiting_offers" && chosen?.id === o.id}
                nominated={nominated?.id === o.id}
                onSelect={status === "awaiting_offers" ? () => setSelected(o.id) : undefined}
              />
            ))}
          </Grid>
          {status === "pending_approval" && view.approval && (
            <Notice text={t(isMember ? "waitingManagerApproval" : "nominatedBy", { phone: digits(`0${view.approval.nominatedBy.phone.slice(4)}`) })} />
          )}
        </>
      )}
      {status === "awaiting_offers" && offers.length === 0 && (
        <Card style={{ flexDirection: "row", gap: spacing["2"], alignItems: "center" }}>
          <IconHourglass size={20} color={colors.inkMuted} strokeWidth={1.75} />
          <AppText variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
            {t("waitingOffersHint")}
          </AppText>
        </Card>
      )}

      {/* ── بعد القبول: المزوّد والتواصل ── */}
      {order && (
        <Card style={{ gap: spacing["3"] }}>
          <AppText variant="label" color="inkMuted">
            {t("acceptedProvider")}
          </AppText>
          <ProviderLine provider={{ ...order.provider, rating: null, commitment: null }} large nameOnly />
          <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <View>
              <AppText variant="price">{money(order.price.amountHalalas)}</AppText>
              <AppText variant="caption" color="inkMuted">
                {t("priceExcludesVat")}
              </AppText>
            </View>
          </Row>
          {status === "accepted" && <AppText variant="caption" color="inkMuted">{t("freeCancelUntilStart")}</AppText>}
        </Card>
      )}

      {pendingChange && (
        <Card style={{ gap: spacing["2"], borderColor: colors.ink }}>
          <AppText variant="body" weight={600}>
            {t("priceChangeTitle")}
          </AppText>
          <AppText variant="bodySm">
            {money(pendingChange.oldPriceHalalas)} ← {money(pendingChange.newPriceHalalas)}
          </AppText>
          <AppText variant="bodySm" color="inkMuted">
            {pendingChange.reason}
          </AppText>
          {isMember ? (
            <AppText variant="caption" color="inkMuted">
              {t("managerDecides")}
            </AppText>
          ) : (
            <Row style={{ flexWrap: "wrap" }}>
              <Button label={t("approvePrice")} variant="primary" loading={busy} onPress={() => run(`/v1/requests/${id}/price-changes/${pendingChange.id}/approve`)} />
              <Button label={t("rejectPrice")} variant="ghost" tone="danger" onPress={() => run(`/v1/requests/${id}/price-changes/${pendingChange.id}/reject`)} />
            </Row>
          )}
        </Card>
      )}

      {cancellationPending && <Notice icon={IconHourglass} text={t("cancellationPendingNotice", { until: cancellationPending.respondBy ? until(cancellationPending.respondBy) : "" })} />}

      {execution && execution.photos.length > 0 && (
        <Card style={{ gap: spacing["3"] }}>
          <AppText variant="label" color="inkMuted">
            {t("photosStart")}
          </AppText>
          <PhotoStrip photos={execution.photos} stage="start" />
          <AppText variant="label" color="inkMuted">
            {t("photosDelivery")}
          </AppText>
          <PhotoStrip photos={execution.photos} stage="delivery" />
        </Card>
      )}

      {view.dispute && (
        <Card style={{ gap: spacing["2"] }}>
          <Row style={{ justifyContent: "space-between" }}>
            <AppText variant="body" weight={600}>
              {t("disputeNumber", { n: num(view.dispute.number) })}
            </AppText>
            <Badge label={t(view.dispute.status === "open" ? "disputeOpen" : "disputeClosed")} tone={view.dispute.status === "open" ? "new" : "muted"} />
          </Row>
          {view.dispute.notes.map((n, i) => (
            <View key={i} style={{ gap: 2 }}>
              <AppText variant="caption" color="inkMuted">
                {t(n.by === "staff" ? "noteBySupport" : "noteByYou")} · {relative(n.at)}
              </AppText>
              <AppText variant="bodySm">{n.body}</AppText>
            </View>
          ))}
        </Card>
      )}

      {/* ── التقييم: مرة وحدة بعد الاكتمال، واختياري ── */}
      {status === "completed" && others.includes("rate") && order && (
        <Card style={{ gap: spacing["2"] }}>
          <AppText variant="body" weight={600}>
            {t("rateProvider", { provider: order.provider.tradeName })}
          </AppText>
          <Stars value={stars} onChange={setStars} size={28} />
          {stars > 0 && <Button label={t("sendRating")} variant="primary" loading={busy} onPress={() => run(`/v1/requests/${id}/rating`, { stars })} />}
        </Card>
      )}
      {view.rating && (
        <Row>
          <AppText variant="bodySm" color="inkMuted">
            {t("yourRating")}
          </AppText>
          <Stars value={view.rating.stars} size={16} />
        </Row>
      )}

      {actionError && !dialog && <Notice icon={IconAlertTriangle} text={actionError} />}
      {others.length > 0 && (
        <Row gap="2" style={{ flexWrap: "wrap" }}>
          {others.map(otherButton)}
        </Row>
      )}

      {/* غرفة الصفقة (القرار ٣٥): التواصل مع المزوّد هنا بدل رقم الجوال. آخر الصفحة عشان ما تدفّ أزرار الطلب لتحت. */}
      {order && <DealRoom path={`/v1/requests/${view.request.id}/messages`} viewer="customer" />}
    </>
  );

  const side = (
    <>
      <SideCard title={t("requestData")}>
        <Fact label={t("detailsLabel")} value={request.details} />
        {!!request.area && <Fact label={t("areaLabel")} value={request.area} />}
        <Fact label={t("locationLabel")} value={request.location} />
        <Fact label={t("whenLabel")} value={t(request.when === "today" ? "whenToday" : request.when === "tomorrow" ? "whenTomorrow" : "whenThisWeek")} />
        {status === "awaiting_offers" && <Fact label={t("openUntil")} value={until(request.expiresAt)} />}
      </SideCard>
      <SideCard title={t("timeline")}>
        <Timeline events={timeline} />
      </SideCard>
    </>
  );

  return (
    <Screen
      title={t("requestDetails")}
      back
      width="page"
      onRefresh={load}
      footer={primary ? <Button label={primary.label} variant="accent" size="lg" full icon={IconCircleCheck} onPress={primary.onPress} /> : undefined}
    >
      <TwoColumn main={main} side={side} />

      {/* ── النوافذ ── */}
      <ConfirmDialog
        visible={dialog?.kind === "accept" || dialog?.kind === "nominate"}
        title={dialog?.kind === "nominate" ? t("nominateTitle") : t("acceptConfirmTitle", { provider: dialog && "offer" in dialog ? dialog.offer.provider.tradeName : "" })}
        body={dialog?.kind === "nominate" ? t("nominateBody") : t("acceptConfirmBody")}
        confirmLabel={dialog?.kind === "nominate" ? t("nominate") : t("acceptOffer")}
        cancelLabel={t("back")}
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (!dialog || !("offer" in dialog)) return;
          run(`/v1/requests/${id}/offers/${dialog.offer.id}/${dialog.kind === "nominate" ? "nominate" : "accept"}`);
        }}
      >
        {dialog && "offer" in dialog && (
          <View style={{ gap: spacing["1"] }}>
            <AppText variant="price">{money(dialog.offer.price.amountHalalas)}</AppText>
            <AppText variant="caption" color="inkMuted">
              {t("priceExcludesVat")} · {duration(dialog.offer.durationHours)}
            </AppText>
            <AppText variant="caption" color="inkMuted">
              {t("policyFreeBeforeStart")}
            </AppText>
          </View>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        visible={dialog?.kind === "cancel"}
        title={t("cancelConfirmTitle")}
        body={view.cancellationFee && view.cancellationFee.feeHalalas > 0 ? t("cancelFee", { fee: money(view.cancellationFee.feeHalalas) }) : t("cancelIsFree")}
        confirmLabel={t("cancelRequest")}
        cancelLabel={t("keepRequest")}
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/requests/${id}/cancel`)}
      />

      <ConfirmDialog
        visible={dialog?.kind === "request_cancel"}
        title={t("requestCancellation")}
        body={t("requestCancellationBody")}
        confirmLabel={t("sendCancellationRequest")}
        cancelLabel={t("back")}
        busy={busy}
        error={actionError}
        confirmDisabled={text.trim().length < 2}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/requests/${id}/cancellation`, { reason: text.trim() })}
      >
        <Field label={t("reasonLabel")} value={text} onChangeText={setText} multiline maxLength={500} />
      </ConfirmDialog>

      <ConfirmDialog
        visible={dialog?.kind === "open_dispute"}
        title={t("openDispute")}
        body={t("openDisputeBody")}
        confirmLabel={t("sendDispute")}
        cancelLabel={t("back")}
        busy={busy}
        error={actionError}
        confirmDisabled={text.trim().length < 2}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/requests/${id}/dispute`, { reason, details: text.trim() })}
      >
        <Chips value={reason} onChange={setReason} options={DISPUTE_REASONS.map((r) => ({ value: r, label: t(DISPUTE_REASON_KEYS[r]) }))} />
        <Field label={t("disputeDetails")} value={text} onChangeText={setText} multiline maxLength={500} />
      </ConfirmDialog>

      <ConfirmDialog
        visible={dialog?.kind === "add_note"}
        title={t("addNote")}
        body={t("addNoteBody")}
        confirmLabel={t("sendNote")}
        cancelLabel={t("back")}
        busy={busy}
        error={actionError}
        confirmDisabled={text.trim().length < 2}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/requests/${id}/dispute/notes`, { body: text.trim() })}
      >
        <Field label={t("noteLabel")} value={text} onChangeText={setText} multiline maxLength={500} />
      </ConfirmDialog>

      <ConfirmDialog
        visible={dialog?.kind === "republish"}
        title={t("republish")}
        body={t("republishBody")}
        confirmLabel={t("republish")}
        cancelLabel={t("back")}
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/requests/${id}/republish`, {})}
      />

      <ConfirmDialog
        visible={dialog?.kind === "confirm"}
        title={t("confirmReceipt")}
        body={t("confirmReceiptBody")}
        confirmLabel={t("confirmReceipt")}
        cancelLabel={t("back")}
        busy={busy}
        error={actionError}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/requests/${id}/confirm`)}
      />
    </Screen>
  );
}

const DISPUTE_REASON_KEYS: Record<(typeof DISPUTE_REASONS)[number], StringKey> = {
  quality: "disputeQuality",
  not_delivered: "disputeNotDelivered",
  delay: "disputeDelay",
  price: "disputePrice",
  conduct: "disputeConduct",
  other: "disputeOther",
};

/** سطر الحالة تحت العنوان: وش صار، ووش الخطوة الجاية. */
function StatusText({ view, offers, animate, reachHint }: { view: FactoryRequestView; offers: number; animate: boolean; reachHint?: number }) {
  const { t, num, relative, until } = useI18n();
  const { request, order, execution } = view;
  const reach = view.reach || reachHint || 0;
  switch (request.status) {
    case "awaiting_offers":
      if (offers === 0) {
        // لحظة المكافأة: «وصل طلبك لـ ٨ مزوّدين موثّقين»، والرقم يعدّ لين يوقف. رقم حقيقي من الخادم.
        return (
          <Row gap="3" style={{ alignItems: "center" }}>
            <CountUp to={reach} animate={animate} />
            <AppText variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
              {t("reachedProviders")}
            </AppText>
          </Row>
        );
      }
      return <AppText variant="bodySm" color="inkMuted">{t("repliedOfReach", { k: num(offers), n: num(Math.max(reach, offers)) })}</AppText>;
    case "pending_approval":
      return <AppText variant="bodySm" color="inkMuted">{t("statusPendingApprovalHint")}</AppText>;
    case "accepted":
      return <AppText variant="bodySm" color="inkMuted">{t("acceptedHint")}</AppText>;
    case "in_progress":
      return <AppText variant="bodySm" color="inkMuted">{t("startedAt", { when: order?.startedAt ? relative(order.startedAt) : "" })}</AppText>;
    case "delivered":
      return (
        <AppText variant="bodySm" color="inkMuted">
          {t("deliveredHint", { until: execution?.autoConfirmAt ? until(execution.autoConfirmAt) : "" })}
        </AppText>
      );
    case "completed":
      return <AppText variant="bodySm" color="inkMuted">{t("completedHint")}</AppText>;
    case "expired":
      return <AppText variant="bodySm" color="inkMuted">{t("expiredHint")}</AppText>;
    case "cancelled":
      return <AppText variant="bodySm" color="inkMuted">{t("cancelledHint")}</AppText>;
    case "disputed":
      return <AppText variant="bodySm" color="inkMuted">{t("disputedHint", { n: num(view.dispute?.number ?? 0) })}</AppText>;
  }
}

/** بطاقة عرض للمقارنة: تنضغط عشان تختارها، والزر الكهرماني تحت يقبل المختار. */
function OfferCompareCard({ offer, selected, nominated, onSelect }: { offer: FactoryOffer; selected: boolean; nominated: boolean; onSelect?: () => void }) {
  const { t, money, duration, until } = useI18n();
  const { colors } = useTheme();
  return (
    <Card
      onPress={onSelect}
      style={{ gap: spacing["3"], borderWidth: selected ? 2 : 1, borderColor: selected ? colors.ink : colors.line, height: "100%" }}
    >
      <Row style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <ProviderLine provider={offer.provider} />
        </View>
        {/* دائرة الاختيار (الفكرة من نمط «بطاقات الاختيار» في 21st.dev، بدون نسخ كود): توضّح وش العرض اللي يقبله الزر تحت. */}
        {onSelect && (
          <View
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{ width: 22, height: 22, borderRadius: radius.full, borderWidth: 2, borderColor: selected ? colors.ink : colors.lineStrong, alignItems: "center", justifyContent: "center" }}
          >
            {selected && <View style={{ width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.ink }} />}
          </View>
        )}
      </Row>
      <Divider />
      <View>
        <AppText variant="price">{money(offer.price.amountHalalas)}</AppText>
        <AppText variant="caption" color="inkMuted">
          {t("priceExcludesVat")}
        </AppText>
      </View>
      {/* المدة نص واضح مو كبسولة: «١٠ ساعات» لحالها ما تقول وش هي. والكبسولات للحالات بس. */}
      <AppText variant="bodySm" weight={600}>
        {t("doneWithin", { d: duration(offer.durationHours) })}
      </AppText>
      {(offer.revised || nominated) && (
        <Row gap="2" style={{ flexWrap: "wrap" }}>
          {offer.revised && <Badge label={t("offerRevised")} tone="muted" />}
          {nominated && <Badge label={t("nominatedBadge")} tone="new" />}
        </Row>
      )}
      {!!offer.note && (
        <AppText variant="bodySm" color="ink">
          {offer.note}
        </AppText>
      )}
      <AppText variant="caption" color="inkMuted">
        {t("validUntil", { until: until(offer.validUntil) })}
      </AppText>
    </Card>
  );
}
