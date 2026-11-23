// إعدادات المنصة من اللوحة (settings.manage): كل قسم يتحفظ لحاله، والخادم يتحقق من القيمة ويسجّل التعديل (من كم لكم).
// العمولة قرار المالك بس (CLAUDE.md): الحقل يظهر للكل، ويتعدّل بس لو الخادم قال canEditCommission، والخادم يرفض غيره.
// سياسة رسوم الإلغاء ما تتعدّل من هنا الحين (قرار المالك مع الشريك، القرار ٣٠): بالأمر pnpm api:set-setting.
import { spacing } from "@mazood/brand";
import type { Settings } from "@mazood/shared";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ActionNotices } from "@/components/admin";
import { Field } from "@/components/Field";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Card, Chips } from "@/components/ui";
import { useStore } from "@/data/store";
import { useAction, useLoad } from "@/data/useAdmin";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";

type Editable = Omit<Settings, "rolePermissions">;
type SmsEvent = Editable["smsEvents"][number];
type Buyer = Editable["market"]["buyerKinds"][number];

const SMS: { value: SmsEvent; label: StringKey }[] = [
  { value: "first_offer", label: "smsFirstOffer" },
  { value: "offer_accepted", label: "smsAccepted" },
  { value: "cancellation_requested", label: "smsCancellation" },
];

const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

/** اختيار متعدد بنفس شكل Chips: الضغط يضيف أو يشيل. */
function MultiChips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <View style={{ gap: spacing["2"] }}>
      {options.map((o) => (
        <Chips
          key={o.value}
          value={value.includes(o.value) ? o.value : null}
          onChange={() => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])}
          options={[o]}
        />
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useI18n();
  const { authed } = useStore();
  const { data, error, reload } = useLoad<{ settings: Editable; canEditCommission: boolean }>("/v1/admin/settings");
  const { busy, failure, done, run } = useAction(reload);
  const [form, setForm] = useState<Record<string, string>>({});
  const [sms, setSms] = useState<SmsEvent[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [identity, setIdentity] = useState<"on" | "off">("off");
  const [commitOn, setCommitOn] = useState<"on" | "off">("on");
  const s = data?.settings;

  // نعبّي الحقول من القيم المحفوظة كل ما رجعت من الخادم.
  useEffect(() => {
    if (!s) return;
    setForm({
      offerValidityHours: String(s.offerValidityHours),
      requestOpenDays: String(s.requestOpenDays),
      maxOffersPerRequest: String(s.maxOffersPerRequest),
      autoConfirmHours: String(s.autoConfirmHours),
      trialDays: String(s.market.trialDays),
      publicMinProducts: String(s.market.publicMinProducts),
      expiryWarningDays: String(s.market.expiryWarningDays),
      commissionPct: String(s.market.commissionBps / 100),
      windowMonths: String(s.commitment.windowMonths),
      minOrders: String(s.commitment.minOrders),
    });
    setSms(s.smsEvents);
    setBuyers(s.market.buyerKinds);
    setIdentity(s.individualRequiresVerifiedIdentity ? "on" : "off");
    setCommitOn(s.commitment.enabled ? "on" : "off");
  }, [s]);

  const f = (k: string) => form[k] ?? "";
  const setF = (k: string) => (v: string) => setForm((m) => ({ ...m, [k]: v }));
  const save = (key: keyof Editable, value: unknown) => run(() => authed(`/v1/admin/settings/${key}`, { method: "PUT", body: { value } }), t("settingSaved"));
  const onOff = [
    { value: "on" as const, label: t("on") },
    { value: "off" as const, label: t("off") },
  ];

  /** حقل رقم مع زر حفظ لإعداد رقمي واحد. (دالة مو مكوّن، عشان الحقل ما يفقد التركيز مع كل حرف.) */
  const numberSetting = (k: "offerValidityHours" | "requestOpenDays" | "maxOffersPerRequest" | "autoConfirmHours", label: StringKey) => (
    <View key={k} style={{ gap: spacing["1"] }}>
      <Field label={t(label)} value={f(k)} onChangeText={setF(k)} keyboardType="number-pad" maxLength={4} ltr />
      <Button label={t("saveSetting")} variant="secondary" disabled={busy || !Number.isInteger(int(f(k))) || int(f(k)) === s?.[k]} onPress={() => save(k, int(f(k)))} />
    </View>
  );

  const commission = Number(f("commissionPct"));
  const commissionBps = Number.isFinite(commission) ? Math.round(commission * 100) : NaN;

  return (
    <Screen title={t("navSettings")} back>
      <ActionNotices error={error ? t(error) : null} failure={failure} done={done} />
      <AppText variant="bodySm" color="inkMuted">
        {t("settingsHint")}
      </AppText>
      {s && data && (
        <>
          <SectionTitle title={t("setRequests")} />
          <Card style={{ gap: spacing["3"] }}>
            {numberSetting("offerValidityHours", "setOfferValidity")}
            {numberSetting("requestOpenDays", "setRequestOpen")}
            {numberSetting("maxOffersPerRequest", "setMaxOffers")}
            {numberSetting("autoConfirmHours", "setAutoConfirm")}
            <AppText variant="label">{t("setIndividualIdentity")}</AppText>
            <Chips value={identity} onChange={setIdentity} options={onOff} />
            <Button
              label={t("saveSetting")}
              variant="secondary"
              disabled={busy || (identity === "on") === s.individualRequiresVerifiedIdentity}
              onPress={() => save("individualRequiresVerifiedIdentity", identity === "on")}
            />
          </Card>

          <SectionTitle title={t("setSms")} />
          <Card style={{ gap: spacing["3"] }}>
            <MultiChips value={sms} onChange={setSms} options={SMS.map((x) => ({ value: x.value, label: t(x.label) }))} />
            <Button label={t("saveSetting")} variant="secondary" disabled={busy} onPress={() => save("smsEvents", sms)} />
          </Card>

          <SectionTitle title={t("commitmentTitle")} />
          <Card style={{ gap: spacing["3"] }}>
            <Chips value={commitOn} onChange={setCommitOn} options={onOff} />
            <Field label={t("commitmentWindow")} value={f("windowMonths")} onChangeText={setF("windowMonths")} keyboardType="number-pad" maxLength={2} ltr />
            <Field label={t("commitmentMin")} value={f("minOrders")} onChangeText={setF("minOrders")} keyboardType="number-pad" maxLength={3} ltr />
            <Button
              label={t("saveSetting")}
              variant="secondary"
              disabled={busy || !Number.isInteger(int(f("windowMonths"))) || !Number.isInteger(int(f("minOrders")))}
              onPress={() => save("commitment", { enabled: commitOn === "on", windowMonths: int(f("windowMonths")), minOrders: int(f("minOrders")) })}
            />
          </Card>

          <SectionTitle title={t("setMarket")} />
          <Card style={{ gap: spacing["3"] }}>
            <AppText variant="label">{t("setBuyers")}</AppText>
            <MultiChips
              value={buyers}
              onChange={setBuyers}
              options={[
                { value: "business" as Buyer, label: t("customerBusiness") },
                { value: "individual" as Buyer, label: t("customerIndividual") },
              ]}
            />
            <Field label={t("setTrialDays")} value={f("trialDays")} onChangeText={setF("trialDays")} keyboardType="number-pad" maxLength={3} ltr />
            <Field label={t("setPublicMin")} value={f("publicMinProducts")} onChangeText={setF("publicMinProducts")} keyboardType="number-pad" maxLength={5} ltr />
            <Field label={t("setExpiryWarning")} value={f("expiryWarningDays")} onChangeText={setF("expiryWarningDays")} keyboardType="number-pad" maxLength={2} ltr />
            <Field
              label={t("setCommission")}
              value={f("commissionPct")}
              onChangeText={setF("commissionPct")}
              keyboardType="decimal-pad"
              maxLength={5}
              editable={data.canEditCommission}
              ltr
            />
            {!data.canEditCommission && (
              <AppText variant="caption" color="inkMuted">
                {t("setCommissionOwner")}
              </AppText>
            )}
            <Button
              label={t("saveSetting")}
              variant="secondary"
              disabled={busy || buyers.length === 0 || ["trialDays", "publicMinProducts", "expiryWarningDays"].some((k) => !Number.isInteger(int(f(k)))) || !Number.isInteger(commissionBps)}
              onPress={() =>
                save("market", {
                  buyerKinds: buyers,
                  trialDays: int(f("trialDays")),
                  publicMinProducts: int(f("publicMinProducts")),
                  expiryWarningDays: int(f("expiryWarningDays")),
                  // غير المالك: نرسل العمولة كما هي، والخادم يرفض أي تغيير فيها منه.
                  commissionBps: data.canEditCommission ? commissionBps : s.market.commissionBps,
                })
              }
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
