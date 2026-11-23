// مكوّنات شاشات المزوّد: بطاقة الطلب المتاح، ولوحة الطلب مع نموذج العرض، وبطاقة الشغل.
// هدف نموذج العرض: أقل من ٣٠ ثانية (السعر، والمدة، وملاحظة اختيارية). docs/product.md، القسم ٢.
import { spacing } from "@mazood/brand";
import { containsContactInfo, SETTING_DEFAULTS } from "@mazood/shared";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { JobSummary, MyOffer, OpenRequest } from "@/api/types";
import { categoryById } from "@/data/categories";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { isolate } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { RequestStatusDot } from "./domain";
import { Field } from "./Field";
import { Fact, RewardCheck, SideCard } from "./flow";
import { IconAlertTriangle, IconCircleCheck, IconSend } from "./icons";
import { AppText, Badge, Button, Card, Chips, Notice, ReadMore, Row } from "./ui";

/** المدد الجاهزة (بالساعات) عشان العرض ينرسل بضغطتين. */
const DURATIONS = [2, 4, 8, 24, 48, 72] as const;
/** صلاحية العرض: بالكثير الإعداد offerValidityHours (٤٨ ساعة الحين). */
const VALIDITIES = [12, 24, SETTING_DEFAULTS.offerValidityHours] as const;

import { arabicCountForm } from "@/lib/format";
import { parseRiyals } from "@/lib/money";

export { parseRiyals };

export function OpenRequestCard({ request, selected, onPress }: { request: OpenRequest; selected?: boolean; onPress: () => void }) {
  const { t, tl, relative, num } = useI18n();
  const { colors } = useTheme();
  const cat = categoryById(request.category);
  const type = cat.types.find((x) => x.id === request.typeId);
  const Icon = cat.icon;
  return (
    <Card onPress={onPress} style={{ gap: spacing["2"], borderWidth: selected ? 2 : 1, borderColor: selected ? colors.ink : colors.line }}>
      <Row gap="3" style={{ alignItems: "flex-start" }}>
        <Icon size={22} color={colors.inkMuted} strokeWidth={1.75} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText variant="body" weight={600}>
            {type ? tl(type.name) : tl(cat.name)}
          </AppText>
          <AppText variant="caption" color="inkMuted">
            {t(request.customerKind === "individual" ? "customerIndividual" : "customerBusiness")} · {request.area ?? tl(cat.name)} ·{" "}
            {t(request.when === "today" ? "whenToday" : request.when === "tomorrow" ? "whenTomorrow" : "whenThisWeek")}
          </AppText>
        </View>
        {/* الوقت نص ثانوي، والكبسولة للحالة بس («عرضك مرسل»). */}
        {request.myOffer ? (
          <Badge label={t("offerSent")} tone="ok" />
        ) : (
          <AppText variant="caption" color="inkMuted" style={{ flexShrink: 0 }}>
            {relative(request.createdAt)}
          </AppText>
        )}
      </Row>
      <AppText variant="bodySm" numberOfLines={2}>
        {request.details}
      </AppText>
      <AppText variant="caption" color="inkMuted">
        {request.offerCount === 0
          ? t("noOffersYetBeFirst")
          : t({ one: "offersSoFarOne", two: "offersSoFarTwo", few: "offersSoFarFew", many: "offersSoFar" }[arabicCountForm(request.offerCount)] as "offersSoFar", {
              n: num(request.offerCount),
            })}
      </AppText>
    </Card>
  );
}

/**
 * الطلب المختار ونموذج العرض. في الكمبيوتر يظهر جنب القائمة، فيرسل المزوّد عروض كثيرة بدون ما يرجع.
 * في الجوال يظهر في شاشة لحاله (app/provider/request/[id].tsx).
 */
export function ProviderRequestPanel({ requestId, onChanged }: { requestId: string; onChanged?: () => void }) {
  const { t, tl, until, money, duration } = useI18n();
  const { authed } = useStore();
  const [req, setReq] = useState<OpenRequest | null | undefined>(undefined);
  const [mine, setMine] = useState<MyOffer | null>(null);
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([
        authed<{ request: OpenRequest }>(`/v1/provider/requests/${requestId}`),
        authed<{ offers: MyOffer[] }>("/v1/provider/offers"),
      ]);
      setReq(r.request);
      setMine(o.offers.find((x) => x.requestId === requestId && x.status === "active") ?? null);
    } catch {
      setReq(null);
    }
  }, [authed, requestId]);

  useEffect(() => {
    setReq(undefined);
    setEditing(false);
    setSent(false);
    load();
  }, [load]);

  if (req === undefined) return <AppText color="inkMuted">{t("loading")}</AppText>;
  if (req === null) return <Notice text={t("requestNoLongerOpen")} />;

  const cat = categoryById(req.category);
  const type = cat.types.find((x) => x.id === req.typeId);
  return (
    <View style={{ gap: spacing["4"] }}>
      <SideCard title={tl(cat.name)}>
        <AppText variant="h2">{type ? tl(type.name) : tl(cat.name)}</AppText>
        <ReadMore text={req.details} variant="body" />
        {!!req.area && <Fact label={t("areaLabel")} value={req.area} />}
        <Fact label={t("whenLabel")} value={t(req.when === "today" ? "whenToday" : req.when === "tomorrow" ? "whenTomorrow" : "whenThisWeek")} />
        <Fact label={t("openUntil")} value={until(req.expiresAt)} />
        <AppText variant="caption" color="inkMuted">
          {t("factoryHiddenUntilAccept")}
        </AppText>
      </SideCard>

      {sent && <Notice icon={IconCircleCheck} text={t("offerSentNotice")} />}

      {mine && !editing ? (
        <Card style={{ gap: spacing["2"] }}>
          <Row style={{ justifyContent: "space-between" }}>
            <AppText variant="label" color="inkMuted">
              {t("yourOffer")}
            </AppText>
            {mine.seenByFactory ? <Badge label={t("factorySawOffer")} tone="ok" /> : <Badge label={t("factoryNotSeen")} tone="muted" />}
          </Row>
          <AppText variant="price">{money(mine.priceHalalas)}</AppText>
          <AppText variant="caption" color="inkMuted">
            {t("priceExcludesVat")} · {duration(mine.durationHours)} · {t("validUntil", { until: until(mine.validUntil) })}
          </AppText>
          {!!mine.note && <AppText variant="bodySm">{mine.note}</AppText>}
          <Row style={{ flexWrap: "wrap" }}>
            <Button label={t("editOffer")} variant="secondary" onPress={() => setEditing(true)} />
            <WithdrawOffer offerId={mine.id} onDone={() => { load(); onChanged?.(); }} />
          </Row>
        </Card>
      ) : (
        <OfferComposer
          requestId={req.id}
          existing={editing ? mine : null}
          onDone={() => {
            setSent(true);
            setEditing(false);
            load();
            onChanged?.();
          }}
          onCancelEdit={editing ? () => setEditing(false) : undefined}
        />
      )}
    </View>
  );
}

function WithdrawOffer({ offerId, onDone }: { offerId: string; onDone: () => void }) {
  const { t } = useI18n();
  const { authed } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label={t("withdrawOffer")}
      variant="ghost"
      tone="danger"
      loading={busy}
      onPress={async () => {
        setBusy(true);
        await authed(`/v1/provider/offers/${offerId}/withdraw`, { method: "POST" }).catch(() => {});
        setBusy(false);
        onDone();
      }}
    />
  );
}

/** نموذج العرض: السعر، والمدة، والصلاحية، وملاحظة اختيارية. الزر الكهرماني الوحيد في الشاشة. */
export function OfferComposer({
  requestId,
  existing,
  onDone,
  onCancelEdit,
}: {
  requestId: string;
  existing: MyOffer | null;
  onDone: () => void;
  onCancelEdit?: () => void;
}) {
  const { t, num, duration } = useI18n();
  const { authed } = useStore();
  const [price, setPrice] = useState(existing ? String(existing.priceHalalas / 100) : "");
  const [hours, setHours] = useState<number>(existing?.durationHours ?? 8);
  const [validity, setValidity] = useState<number>(SETTING_DEFAULTS.offerValidityHours);
  const [note, setNote] = useState(existing?.note ?? "");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const durationOptions = [...new Set([...DURATIONS, hours])].sort((a, b) => a - b);

  async function submit() {
    const halalas = parseRiyals(price);
    if (!halalas) return setPriceError(t("priceInvalid"));
    setPriceError(null);
    setError(null);
    setBusy(true);
    const body = { priceHalalas: halalas, durationHours: hours, validHours: validity, ...(note.trim() ? { note: note.trim() } : {}) };
    try {
      if (existing) await authed(`/v1/provider/offers/${existing.id}`, { method: "PUT", body });
      else await authed(`/v1/provider/requests/${requestId}/offers`, { method: "POST", body });
      onDone();
    } catch (e) {
      setError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  return (
    <Card style={{ gap: spacing["3"] }}>
      <AppText variant="h2">{existing ? t("editOffer") : t("sendOfferTitle")}</AppText>
      <Field
        label={t("priceLabel")}
        value={price}
        onChangeText={(v) => {
          setPrice(v);
          if (priceError) setPriceError(null);
        }}
        placeholder={num(2450)}
        keyboardType="decimal-pad"
        error={priceError}
        onSubmitEditing={submit}
        ltr
      />
      <AppText variant="caption" color="inkMuted">
        {t("priceHint")}
      </AppText>
      <AppText variant="label">{t("durationLabel")}</AppText>
      <Chips<string> value={String(hours)} onChange={(v) => setHours(Number(v))} options={durationOptions.map((h) => ({ value: String(h), label: duration(h) }))} />
      <AppText variant="label">{t("validityLabel")}</AppText>
      <Chips<string> value={String(validity)} onChange={(v) => setValidity(Number(v))} options={VALIDITIES.map((h) => ({ value: String(h), label: duration(h) }))} />
      <Field label={t("noteOptional")} value={note} onChangeText={setNote} multiline maxLength={500} placeholder={t("notePlaceholder")} />
      {containsContactInfo(note) && <Notice icon={IconAlertTriangle} text={t("noContactInOffer")} />}
      {error && <Notice icon={IconAlertTriangle} text={error} />}
      <Button label={existing ? t("saveOffer") : t("sendOffer")} icon={IconSend} variant="accent" size="lg" full loading={busy} onPress={submit} />
      {onCancelEdit && <Button label={t("back")} variant="ghost" onPress={onCancelEdit} />}
    </Card>
  );
}

/** بطاقة طلب منفّذ في «شغلي». newlyAccepted: انقبل عرضه وما شافه للحين (لحظة المكافأة). */
export function JobCard({ job, newlyAccepted, onPress }: { job: JobSummary; newlyAccepted?: boolean; onPress: () => void }) {
  const { t, tl, money, num, isRTL } = useI18n();
  const { colors } = useTheme();
  const cat = categoryById(job.category);
  const type = cat.types.find((x) => x.id === job.typeId);
  const unread = job.unreadMessages ?? 0;
  return (
    <Card onPress={onPress} style={{ gap: spacing["2"], borderColor: newlyAccepted ? colors.success : unread ? colors.ink : colors.line }}>
      <Row gap="3" style={{ alignItems: "center" }}>
        {newlyAccepted && <RewardCheck size={40} animate />}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body" weight={600}>
            {newlyAccepted ? t("offerAcceptedTitle") : type ? tl(type.name) : tl(cat.name)}
          </AppText>
          <AppText variant="caption" color="inkMuted" numberOfLines={1} style={{ writingDirection: isRTL ? "rtl" : "ltr" }}>
            {newlyAccepted ? `${type ? tl(type.name) : tl(cat.name)} · ` : ""}
            {isolate(job.factory.name ?? t("factory"))} · {money(job.priceHalalas)}
          </AppText>
          {unread > 0 && (
            <AppText variant="caption" weight={600}>
              {t("chatUnread", { n: num(unread) })}
            </AppText>
          )}
        </View>
        <RequestStatusDot status={job.status} viewer="provider" />
      </Row>
    </Card>
  );
}

/** يختار صورة من الجهاز ويرفعها لمرحلة معيّنة (البدء أو الانتهاء). يرجّع الرد الجديد أو يرمي الخطأ. */
export async function pickAndUploadPhoto<T>(upload: (path: string, form: FormData) => Promise<T>, orderId: string, stage: "start" | "delivery"): Promise<T | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png"], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const form = new FormData();
  form.append("stage", stage);
  if (Platform.OS === "web" && a.file) form.append("file", a.file);
  else form.append("file", { uri: a.uri, name: a.name, type: a.mimeType ?? "image/jpeg" } as unknown as Blob);
  return upload(`/v1/provider/jobs/${orderId}/photos`, form);
}
