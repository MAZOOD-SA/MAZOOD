// تفاصيل الطلب: العروض ومقارنتها وقبول واحد منها، ثم التنفيذ، والإلغاء، وتأكيد الاستلام.
//
// الأزرار تُعرض حسب «الإجراءات المتاحة» اللي يرجعها الخادم (request.actions)، والخادم يحسبها من
// القواعد المشتركة في packages/shared/src/requests.ts. فالشاشة ما تقرر شي بنفسها، وما فيه حالة
// بدون زر واضح (قاعدة «ولا مرة طريق مسدود» في docs/product.md).
//
// زر accent: «اطلب مرة ثانية» بس، لأنه الإجراء الأهم في الطلب المكتمل أو الملغي.
// «قبول العرض» زر primary لأنه يتكرر على كل بطاقة.
import { spacing } from "@mazood/brand";
import type { FactoryAction, RequestDetailsDto } from "@mazood/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ApiRequestError } from "@/api/client";
import { markOffersSeen, useRequest, useRequestCommand, type RequestCommand } from "@/api/requests";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonLine, SkeletonList, useToast } from "@/components/feedback";
import { OfferCard, RequestStatusBadge } from "@/components/domain";
import { IconCalendar, IconCircleCheck, IconHourglass, IconInfoCircle, IconMapPin, IconRefresh } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Card, Notice, Row } from "@/components/ui";
import { categoryById, requestTitle, type IconComponent } from "@/data/categories";
import { errorMessage } from "@/i18n/errors";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { useTheme } from "@/theme/ThemeProvider";

/** رسالة النجاح بعد كل إجراء. */
const SUCCESS: Record<RequestCommand["kind"], StringKey> = {
  accept: "toastOfferAccepted",
  cancel: "toastCancelled",
  request_cancel: "toastCancelRequested",
  withdraw_cancel_request: "toastCancelWithdrawn",
  confirm_receipt: "toastReceiptConfirmed",
  open_dispute: "toastDisputeOpened",
};

type Dialog = { cmd: RequestCommand; title: string; body: string; confirm: string; danger?: boolean } | null;

export default function RequestDetails() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { t, tl, num } = useI18n();
  const { colors } = useTheme();
  const q = useRequest(id);
  const command = useRequestCommand(id);
  const [dialog, setDialog] = useState<Dialog>(null);
  // نحتفظ بآخر نص للنافذة، عشان ما تختفي كلماتها وهي تتسكّر (حركة الإغلاق تاخذ لحظة).
  const lastDialog = useRef<Dialog>(null);
  if (dialog) lastDialog.current = dialog;
  const shown = dialog ?? lastDialog.current;
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // أول ما تظهر العروض الجديدة نعلّمها مقروءة (عشان النقطة في الرئيسية تختفي).
  const unseen = q.data?.unseenOffers ?? 0;
  const seenRef = useRef(0);
  useEffect(() => {
    if (unseen > 0 && seenRef.current !== unseen) {
      seenRef.current = unseen;
      markOffersSeen(id);
    }
  }, [id, unseen]);

  if (q.isPending) {
    return (
      <Screen title={t("requestDetails")} back>
        <Card style={{ gap: spacing["3"] }}>
          <SkeletonLine width="35%" height={12} />
          <SkeletonLine width="55%" height={20} />
          <SkeletonLine />
          <SkeletonLine width="70%" />
        </Card>
        <SkeletonList count={2} />
      </Screen>
    );
  }
  if (!q.data) {
    const notFound = q.error instanceof ApiRequestError && q.error.status === 404;
    return (
      <Screen title={t("requestDetails")} back>
        <AppText color="inkMuted">{notFound ? t("notFound") : errorMessage(q.error, t)}</AppText>
        {!notFound && <Button label={t("retry")} variant="secondary" onPress={() => q.refetch()} />}
      </Screen>
    );
  }

  const r = q.data;
  const can = (a: FactoryAction) => r.actions.includes(a);

  function run(cmd: RequestCommand) {
    setError(null);
    command.mutate(cmd, {
      onSuccess: () => toast.show(t(SUCCESS[cmd.kind])),
      onError: (err) => setError(errorMessage(err, t)),
      onSettled: () => setDialog(null),
    });
  }

  return (
    <Screen title={t("requestDetails")} back>
      {created && r.status === "awaiting_offers" && r.offers.length === 0 && <Notice icon={IconCircleCheck} text={t("requestSent")} />}

      <Summary r={r} />

      {/* ─── بانتظار العروض ─── */}
      {r.status === "awaiting_offers" && (
        <>
          <SectionTitle
            title={`${t("receivedOffers")} (${num(r.offers.length)})`}
            action={
              r.offers.length > 1 ? (
                <AppText variant="caption" color="inkMuted">
                  {t("sortedByPrice")}
                </AppText>
              ) : undefined
            }
          />
          {r.offers.length === 0 ? (
            <Card style={{ flexDirection: "row", gap: spacing["2"], alignItems: "center", backgroundColor: colors.surfaceAlt }}>
              <IconHourglass size={20} color={colors.inkMuted} strokeWidth={1.75} />
              <AppText variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
                {t("waitingOffersHint")}
              </AppText>
            </Card>
          ) : (
            r.offers.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                onAccept={
                  can("accept_offer")
                    ? () =>
                        setDialog({
                          cmd: { kind: "accept", offerId: o.id },
                          title: t("acceptConfirmTitle", { provider: tl(o.provider.name) }),
                          body: t("acceptConfirmBody"),
                          confirm: t("acceptOffer"),
                        })
                    : undefined
                }
              />
            ))
          )}
        </>
      )}

      {/* ─── العرض المقبول ─── */}
      {r.acceptedOffer && (
        <>
          <SectionTitle title={t("acceptedOffer")} />
          <OfferCard offer={r.acceptedOffer} accepted />
        </>
      )}

      {/* ─── رسالة الحالة: وش صاير، ووش تقدر تسوي ─── */}
      <StatusHint r={r} />

      {/* ─── الإجراءات ─── */}
      <View style={{ gap: spacing["2"] }}>
        {can("confirm_receipt") && (
          <Button
            label={t("confirmReceipt")}
            variant="primary"
            icon={IconCircleCheck}
            full
            onPress={() => setDialog({ cmd: { kind: "confirm_receipt" }, title: t("confirmReceiptTitle"), body: t("confirmReceiptBody"), confirm: t("confirmReceipt") })}
          />
        )}
        {can("reorder") && (
          <Button
            label={t("reorder")}
            variant="accent"
            icon={IconRefresh}
            full
            size="lg"
            onPress={() =>
              router.push({
                pathname: "/request/new",
                params: { category: r.category, typeId: r.typeId, details: r.details, location: r.location, when: r.when },
              })
            }
          />
        )}
        {can("view_invoice") && <Button label={t("viewInvoice")} variant="secondary" full onPress={() => router.push(`/invoice/${r.id}`)} />}
        {can("open_dispute") && (
          <Button
            label={t("openDispute")}
            variant="secondary"
            full
            onPress={() => setDialog({ cmd: { kind: "open_dispute" }, title: t("disputeTitle"), body: t("disputeBody"), confirm: t("openDispute") })}
          />
        )}
        {can("withdraw_cancel_request") && (
          <Button label={t("withdrawCancelRequest")} variant="secondary" full loading={command.isPending} onPress={() => run({ kind: "withdraw_cancel_request" })} />
        )}
        {can("request_cancel") && (
          <Button
            label={t("requestCancelAction")}
            variant="ghost"
            tone="danger"
            onPress={() =>
              setDialog({ cmd: { kind: "request_cancel" }, title: t("requestCancelTitle"), body: t("requestCancelBody"), confirm: t("sendCancelRequest"), danger: true })
            }
          />
        )}
        {can("cancel") && (
          <Button
            label={t("cancelRequest")}
            variant="ghost"
            tone="danger"
            onPress={() =>
              setDialog({
                cmd: { kind: "cancel" },
                title: t("cancelConfirmTitle"),
                body: r.status === "awaiting_offers" ? t("cancelConfirmBodyAwaiting") : t("cancelConfirmBodyAccepted"),
                confirm: t("cancelRequest"),
                danger: true,
              })
            }
          />
        )}
      </View>

      {error && (
        <AppText variant="bodySm" color="danger">
          {error}
        </AppText>
      )}

      <ConfirmDialog
        visible={!!dialog}
        title={shown?.title ?? ""}
        body={shown?.body ?? ""}
        confirmLabel={shown?.confirm ?? ""}
        cancelLabel={t("keepRequest")}
        onCancel={() => setDialog(null)}
        onConfirm={() => dialog && run(dialog.cmd)}
      />
    </Screen>
  );
}

function Summary({ r }: { r: RequestDetailsDto }) {
  const { t, tl, relative } = useI18n();
  const cat = categoryById(r.category);
  const whenLabel = { today: t("whenToday"), tomorrow: t("whenTomorrow"), this_week: t("whenThisWeek") }[r.when];
  return (
    <Card style={{ gap: spacing["3"] }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" color="inkMuted">
            {tl(cat.name)} · {relative(r.createdAt)}
          </AppText>
          <AppText variant="h2">{tl(requestTitle(r))}</AppText>
        </View>
        <RequestStatusBadge request={r} />
      </Row>
      <AppText variant="bodySm">{r.details}</AppText>
      <InfoLine icon={IconMapPin} text={r.location} />
      <InfoLine icon={IconCalendar} text={whenLabel} />
    </Card>
  );
}

/** جملة وحدة تقول للمصنع وين وصل طلبه. */
function StatusHint({ r }: { r: RequestDetailsDto }) {
  const { t } = useI18n();
  let key: StringKey | null = null;
  if (r.disputeOpened) key = "disputeOpenedHint";
  else if (r.cancelRequestStatus === "pending") key = "cancelPendingHint";
  else if (r.cancelRequestStatus === "declined") key = "cancelDeclinedHint";
  else if (r.status === "accepted") key = r.actions.includes("cancel") ? "acceptedHint" : "inProgressHint";
  else if (r.status === "in_progress") key = "inProgressHint";
  else if (r.status === "cancelled") key = "cancelledHint";
  return key ? <Notice icon={IconInfoCircle} text={t(key)} /> : null;
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
