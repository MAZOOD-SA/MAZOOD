// الطلب المنفّذ للمزوّد: «بدأت التنفيذ»، و«تم التنفيذ» مع الصور، و«اطلب تعديل السعر»، والرد على طلب
// الإلغاء، والاعتذار قبل البدء، والبلاغ. هنا بس يشوف اسم المصنع والموقع بالضبط والمحادثة مع العميل (غرفة الصفقة، بعد القبول).
// الزر الكهرماني (واحد) هو الخطوة الجاية في التنفيذ.
import { spacing } from "@mazood/brand";
import { DISPUTE_REASONS } from "@mazood/shared";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { JobView } from "@/api/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RequestStatusBadge } from "@/components/domain";
import { Field } from "@/components/Field";
import { Fact, PhotoStrip, SideCard, Timeline, useAutoRefresh } from "@/components/flow";
import { IconAlertTriangle, IconCamera, IconCircleCheck, IconHourglass } from "@/components/icons";
import { DealRoom } from "@/components/deal-room";
import { Screen, SkeletonList, TwoColumn } from "@/components/layout";
import { pickAndUploadPhoto } from "@/components/provider";
import { parseRiyals } from "@/lib/money";
import { AppText, Button, Card, Chips, Notice, Row } from "@/components/ui";
import { categoryById } from "@/data/categories";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { useTheme } from "@/theme/ThemeProvider";

type Dialog = "start" | "deliver" | "withdraw" | "price" | "decline_cancel" | "dispute" | "note" | null;

export default function ProviderJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tl, money, relative, until, digits, num } = useI18n();
  const { colors } = useTheme();
  const { authed, upload } = useStore();
  const [job, setJob] = useState<JobView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState<(typeof DISPUTE_REASONS)[number]>("price");

  const load = useCallback(async () => {
    try {
      setJob((await authed<{ job: JobView }>(`/v1/provider/jobs/${id}`)).job);
      setLoadError(null);
    } catch (e) {
      setLoadError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
  }, [authed, id, t]);
  useAutoRefresh(load);

  if (gone) {
    return (
      <Screen title={t("jobTitle")} back>
        <Notice icon={IconCircleCheck} text={t("withdrewDone")} />
      </Screen>
    );
  }
  if (!job) {
    return (
      <Screen title={t("jobTitle")} back width="page">
        {loadError ? <Notice icon={IconAlertTriangle} text={loadError} /> : <SkeletonList rows={3} />}
      </Screen>
    );
  }

  const status = job.status;
  const cat = categoryById(job.category);
  const type = cat.types.find((x) => x.id === job.typeId);
  const ex = job.execution;
  const pendingChange = ex.priceChanges.find((c) => c.status === "pending");
  const cancellation = job.cancellationRequest?.status === "pending" ? job.cancellationRequest : null;
  const startPhotos = ex.photos.filter((p) => p.stage === "start").length;
  const deliveryPhotos = ex.photos.filter((p) => p.stage === "delivery").length;

  async function run(path: string, body?: unknown, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await authed<{ job?: JobView }>(path, { method: "POST", body });
      if (res?.job) setJob(res.job);
      else await load();
      setDialog(null);
      setText("");
      after?.();
    } catch (e) {
      setError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  async function addPhoto(stage: "start" | "delivery") {
    setError(null);
    try {
      const res = await pickAndUploadPhoto<{ job: JobView }>(upload, job!.orderId, stage);
      if (res) setJob(res.job);
    } catch (e) {
      setError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
  }

  const open = (d: Dialog) => {
    setError(null);
    setText("");
    setDialog(d);
  };

  // ── الخطوة الجاية (الزر الكهرماني) ──
  let primary: { label: StringKey; onPress: () => void } | null = null;
  if (status === "accepted") primary = { label: "startJob", onPress: () => open("start") };
  else if (status === "in_progress" && cancellation) primary = { label: "agreeCancellation", onPress: () => run(`/v1/provider/jobs/${id}/cancellation/respond`, { decision: "agree" }) };
  else if (status === "in_progress" && !pendingChange) primary = { label: "deliverJob", onPress: () => open("deliver") };

  const main = (
    <>
      <Card style={{ gap: spacing["2"], backgroundColor: colors.surfaceAlt }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="caption" color="inkMuted">
              {tl(cat.name)} · {relative(job.acceptedAt)}
            </AppText>
            <AppText variant="h2">{type ? tl(type.name) : tl(cat.name)}</AppText>
          </View>
          <RequestStatusBadge status={status} viewer="provider" />
        </Row>
        <AppText variant="bodySm" color="inkMuted">
          {t(JOB_HINTS[status] ?? "jobHintDone", { until: ex.autoConfirmAt ? until(ex.autoConfirmAt) : "" })}
        </AppText>
      </Card>

      {cancellation && (
        <Card style={{ gap: spacing["2"], borderColor: colors.accent }}>
          <AppText variant="body" weight={600}>
            {t("factoryRequestedCancel")}
          </AppText>
          {!!cancellation.reason && <AppText variant="bodySm">{cancellation.reason}</AppText>}
          <AppText variant="caption" color="inkMuted">
            {t("respondBefore", { until: cancellation.respondBy ? until(cancellation.respondBy) : "" })}
          </AppText>
          <Button label={t("declineCancellation")} variant="ghost" tone="danger" onPress={() => open("decline_cancel")} />
        </Card>
      )}

      {pendingChange && (
        <Card style={{ gap: spacing["2"] }}>
          <Row gap="2">
            <IconHourglass size={18} color={colors.inkMuted} strokeWidth={1.75} />
            <AppText variant="body" weight={600}>
              {t("priceChangeWaiting")}
            </AppText>
          </Row>
          <AppText variant="bodySm">
            {money(pendingChange.oldPriceHalalas)} ← {money(pendingChange.newPriceHalalas)}
          </AppText>
          <Button label={t("withdrawPriceChange")} variant="ghost" onPress={() => run(`/v1/provider/jobs/${id}/price-change/withdraw`)} />
        </Card>
      )}

      {/* الصور: حتى ٣ لكل مرحلة، في التخزين الخاص وبروابط مؤقتة. */}
      {(status === "accepted" || status === "in_progress" || ex.photos.length > 0) && (
        <Card style={{ gap: spacing["3"] }}>
          <AppText variant="label" color="inkMuted">
            {t("photosStart")} ({num(startPhotos)}/{num(3)})
          </AppText>
          <PhotoStrip photos={ex.photos} stage="start" />
          {(status === "accepted" || status === "in_progress") && startPhotos < 3 && (
            <Button label={t("addPhoto")} icon={IconCamera} variant="secondary" onPress={() => addPhoto("start")} />
          )}
          {(status === "in_progress" || deliveryPhotos > 0) && (
            <>
              <AppText variant="label" color="inkMuted">
                {t("photosDelivery")} ({num(deliveryPhotos)}/{num(3)})
              </AppText>
              <PhotoStrip photos={ex.photos} stage="delivery" />
              {status === "in_progress" && deliveryPhotos < 3 && <Button label={t("addPhoto")} icon={IconCamera} variant="secondary" onPress={() => addPhoto("delivery")} />}
            </>
          )}
        </Card>
      )}

      {job.dispute && (
        <Card style={{ gap: spacing["2"] }}>
          <AppText variant="body" weight={600}>
            {t("disputeNumber", { n: num(job.dispute.number) })}
          </AppText>
          {job.dispute.notes.map((n, i) => (
            <View key={i}>
              <AppText variant="caption" color="inkMuted">
                {t(n.by === "staff" ? "noteBySupport" : "noteByYou")} · {relative(n.at)}
              </AppText>
              <AppText variant="bodySm">{n.body}</AppText>
            </View>
          ))}
        </Card>
      )}

      {error && !dialog && <Notice icon={IconAlertTriangle} text={error} />}

      <Row gap="2" style={{ flexWrap: "wrap" }}>
        {status === "accepted" && <Button label={t("withdrawJob")} variant="ghost" tone="danger" onPress={() => open("withdraw")} />}
        {status === "in_progress" && !pendingChange && !cancellation && (
          <Button
            label={t("requestPriceChange")}
            variant="secondary"
            onPress={() => {
              setPrice(String(job.priceHalalas / 100));
              open("price");
            }}
          />
        )}
        {(status === "in_progress" || status === "delivered") && !cancellation && <Button label={t("openDispute")} variant="secondary" onPress={() => open("dispute")} />}
        {status === "disputed" && <Button label={t("addNote")} variant="secondary" onPress={() => open("note")} />}
      </Row>
      {/* غرفة الصفقة (القرار ٣٥): التواصل مع العميل هنا بدل رقم الجوال. */}
      <DealRoom path={`/v1/provider/jobs/${job.orderId}/messages`} viewer="provider" />
    </>
  );

  const side = (
    <>
      <SideCard title={t("jobFactory")}>
        <AppText variant="body" weight={600}>
          {job.factory.name ?? t("factory")}
        </AppText>
        <Fact label={t("agreedPrice")} value={`${money(job.priceHalalas)} · ${t("priceExcludesVat")}`} />
        <Fact label={t("locationLabel")} value={job.location} />
        {!!job.area && <Fact label={t("areaLabel")} value={job.area} />}
        <Fact label={t("whenLabel")} value={t(job.when === "today" ? "whenToday" : job.when === "tomorrow" ? "whenTomorrow" : "whenThisWeek")} />
        <Fact label={t("detailsLabel")} value={job.details} />
      </SideCard>
      <SideCard title={t("timeline")}>
        <Timeline events={ex.timeline} />
      </SideCard>
    </>
  );

  const fee = job.withdrawalFee?.feeHalalas ?? 0;

  return (
    <Screen
      title={t("jobTitle")}
      back
      width="page"
      onRefresh={load}
      footer={primary ? <Button label={t(primary.label)} variant="accent" size="lg" full icon={IconCircleCheck} loading={busy && !dialog} onPress={primary.onPress} /> : undefined}
    >
      <TwoColumn main={main} side={side} />

      <ConfirmDialog
        visible={dialog === "start"}
        title={t("startJob")}
        body={t("startJobBody")}
        confirmLabel={t("startJob")}
        cancelLabel={t("back")}
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/provider/jobs/${id}/start`)}
      />
      <ConfirmDialog
        visible={dialog === "deliver"}
        title={t("deliverJob")}
        body={deliveryPhotos ? t("deliverJobBody") : t("deliverNoPhotos")}
        confirmLabel={t("deliverJob")}
        cancelLabel={t("back")}
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/provider/jobs/${id}/deliver`)}
      />
      <ConfirmDialog
        visible={dialog === "withdraw"}
        title={t("withdrawJob")}
        body={fee > 0 ? t("withdrawFee", { fee: money(fee) }) : t("withdrawJobBody")}
        confirmLabel={t("withdrawJob")}
        cancelLabel={t("back")}
        busy={busy}
        error={error}
        confirmDisabled={text.trim().length < 2}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/provider/jobs/${id}/withdraw`, { reason: text.trim() }, () => setGone(true))}
      >
        <Field label={t("reasonLabel")} value={text} onChangeText={setText} multiline maxLength={500} />
      </ConfirmDialog>
      <ConfirmDialog
        visible={dialog === "price"}
        title={t("requestPriceChange")}
        body={t("priceChangeBody")}
        confirmLabel={t("sendPriceChange")}
        cancelLabel={t("back")}
        busy={busy}
        error={error}
        confirmDisabled={!parseRiyals(price) || text.trim().length < 5}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/provider/jobs/${id}/price-change`, { newPriceHalalas: parseRiyals(price), reason: text.trim() })}
      >
        <Field label={t("newPriceLabel")} value={price} onChangeText={setPrice} keyboardType="decimal-pad" ltr />
        <Field label={t("priceChangeReason")} value={text} onChangeText={setText} multiline maxLength={500} />
      </ConfirmDialog>
      <ConfirmDialog
        visible={dialog === "decline_cancel"}
        title={t("declineCancellation")}
        body={t("declineCancellationBody")}
        confirmLabel={t("declineCancellation")}
        cancelLabel={t("back")}
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/provider/jobs/${id}/cancellation/respond`, { decision: "decline", ...(text.trim() ? { note: text.trim() } : {}) })}
      >
        <Field label={t("noteOptional")} value={text} onChangeText={setText} multiline maxLength={500} />
      </ConfirmDialog>
      <ConfirmDialog
        visible={dialog === "dispute"}
        title={t("openDispute")}
        body={t("openDisputeBody")}
        confirmLabel={t("sendDispute")}
        cancelLabel={t("back")}
        busy={busy}
        error={error}
        confirmDisabled={text.trim().length < 2}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/provider/jobs/${id}/dispute`, { reason, details: text.trim() })}
      >
        <Chips value={reason} onChange={setReason} options={DISPUTE_REASONS.map((r) => ({ value: r, label: t(`dispute${r === "not_delivered" ? "NotDelivered" : r[0].toUpperCase() + r.slice(1)}` as StringKey) }))} />
        <Field label={t("disputeDetails")} value={text} onChangeText={setText} multiline maxLength={500} />
      </ConfirmDialog>
      <ConfirmDialog
        visible={dialog === "note"}
        title={t("addNote")}
        body={t("addNoteBody")}
        confirmLabel={t("sendNote")}
        cancelLabel={t("back")}
        busy={busy}
        error={error}
        confirmDisabled={text.trim().length < 2}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(`/v1/provider/jobs/${id}/dispute/notes`, { body: text.trim() })}
      >
        <Field label={t("noteLabel")} value={text} onChangeText={setText} multiline maxLength={500} />
      </ConfirmDialog>
    </Screen>
  );
}


const JOB_HINTS: Partial<Record<JobView["status"], StringKey>> = {
  accepted: "jobHintAccepted",
  in_progress: "jobHintInProgress",
  delivered: "jobHintDelivered",
  completed: "jobHintCompleted",
  cancelled: "jobHintCancelled",
  disputed: "jobHintDisputed",
};
