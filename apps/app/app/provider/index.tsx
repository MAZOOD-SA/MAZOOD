// حالة التوثيق للمزوّد قبل ما يتوثّق (الشاشة الوحيدة له قبل التوثيق): بياناته ومستنداته والخطوة الجاية.
// بعد التوثيق يروح مباشرة للطلبات المتاحة.
// «ولا مرة طريق مسدود»: في كل حالة فيه زر واضح يقول له وش الخطوة الجاية.
import { spacing } from "@mazood/brand";
import { IconAlertTriangle, IconLogout, IconSend, IconUpload } from "@/components/icons";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { DocSlotCard, dayIso, slotState } from "@/components/DocSlotCard";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Badge, Button, Card, Notice, Row, VerifiedBadge } from "@/components/ui";
import { categoryById } from "@/data/categories";
import { DOC_LABELS, PROVIDER_STATUS } from "@/data/labels";
import type { ProviderView } from "@/data/provider-types";
import { useStore } from "@/data/store";
import { useProvider } from "@/data/useProvider";
import type { CategoryId } from "@/data/categories";
import { useI18n } from "@/i18n/I18nProvider";

export default function ProviderHome() {
  const { t, tl, digits, date } = useI18n();
  const { authed, signOut } = useStore();
  const { provider, setProvider, error } = useProvider();
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const signOutButton = (
    <Button
      label={t("signOut")}
      variant="ghost"
      icon={IconLogout}
      onPress={async () => {
        await signOut();
        router.replace("/login");
      }}
    />
  );

  if (provider === undefined) {
    return (
      <Screen title={t("providerHomeTitle")}>
        {error ? <Notice text={t(error)} /> : <AppText color="inkMuted">{t("loading")}</AppText>}
      </Screen>
    );
  }

  // بعد التوثيق: شاشاته الأساسية (الطلبات المتاحة وشغلي وحسابي). حالة التوثيق تبقى في «حسابي».
  if (provider?.verified) return <Redirect href="/provider/requests" />;

  // أول مرة: ما سجّل بياناته للحين.
  if (provider === null) {
    return (
      <Screen title={t("providerHomeTitle")}>
        <AppText variant="h2">{t("providerStartTitle")}</AppText>
        <AppText color="inkMuted">{t("providerStartBody")}</AppText>
        <Button label={t("providerRegister")} variant="accent" size="lg" full onPress={() => router.push("/provider/profile")} />
        {signOutButton}
      </Screen>
    );
  }

  const st = PROVIDER_STATUS[provider.status];
  const editable = provider.status === "draft" || provider.status === "rejected";
  const canSubmit = editable && provider.readyToSubmit;

  async function submit() {
    setBusy(true);
    setSubmitError(null);
    try {
      const r = await authed<{ provider: ProviderView }>("/v1/provider/submit", { method: "POST" });
      setProvider(r.provider);
    } catch (e) {
      setSubmitError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
    }
    setBusy(false);
  }

  return (
    <Screen
      title={t("providerHomeTitle")}
      footer={
        canSubmit ? <Button label={t("submitForReview")} icon={IconSend} variant="accent" size="lg" full onPress={submit} disabled={busy} /> : undefined
      }
    >
      <Card style={{ gap: spacing["2"] }}>
        <Row style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <AppText variant="h2" style={{ flexShrink: 1 }}>
            {provider.tradeName}
          </AppText>
          {/* شارة «موثّق» الخضراء تظهر بس إذا المزوّد موثّق فعليًا (ومستنداته ما انتهت). */}
          {provider.verified ? <VerifiedBadge /> : <Badge label={tl(st.label)} tone={st.tone} />}
        </Row>
        <AppText variant="bodySm" color="inkMuted">
          {provider.categories.map((c) => tl(categoryById(c as CategoryId).name)).join(" · ")}
        </AppText>
        <AppText variant="bodySm" color="inkMuted">
          {t("crShort")}{" "}
          <AppText variant="bodySm" color="inkMuted" style={{ writingDirection: "ltr" }}>
            {digits(provider.commercialRegister)}
          </AppText>
        </AppText>
      </Card>

      {/* الخطوة الجاية حسب الحالة */}
      <Notice text={nextStepText(provider, t)} />
      {provider.status === "rejected" && provider.statusReason && <Notice icon={IconAlertTriangle} text={`${t("rejectionReason")}: ${provider.statusReason}`} />}
      {provider.status === "suspended" && provider.statusReason && <Notice icon={IconAlertTriangle} text={`${t("suspensionReason")}: ${provider.statusReason}`} />}
      {provider.expiring.map((e) => (
        <Notice
          key={e.docType}
          icon={IconAlertTriangle}
          text={`${tl(DOC_LABELS[e.docType])}: ${e.expired ? t("docExpiredWarn") : t("docExpiringWarn")} (${date(dayIso(e.expiresOn))})`}
        />
      ))}
      {submitError && (
        <AppText variant="bodySm" color="danger">
          {submitError}
        </AppText>
      )}

      <SectionTitle
        title={t("docsTitle")}
        action={editable ? <Button label={t("providerEditProfile")} variant="ghost" onPress={() => router.push("/provider/profile")} /> : undefined}
      />
      {provider.documents.map((slot) => {
        const s = slotState(slot);
        const label = s.key === "missing" ? t("uploadDoc") : s.key === "approved" ? t("renewDoc") : t("reuploadDoc");
        return (
          <DocSlotCard key={slot.docType} slot={slot}>
            {provider.status !== "suspended" && s.key !== "pending" && (
              <View>
                <Button
                  label={label}
                  icon={IconUpload}
                  variant={s.key === "approved" ? "ghost" : "secondary"}
                  onPress={() => router.push({ pathname: "/provider/upload", params: { docType: slot.docType } })}
                />
              </View>
            )}
          </DocSlotCard>
        );
      })}

      {signOutButton}
    </Screen>
  );
}

function nextStepText(p: ProviderView, t: (k: "stepDraftMissing" | "stepDraftReady" | "stepPending" | "stepVerified" | "stepVerifiedExpired" | "stepRejected" | "stepSuspended") => string) {
  switch (p.status) {
    case "draft":
      return p.readyToSubmit ? t("stepDraftReady") : t("stepDraftMissing");
    case "pending":
      return t("stepPending");
    case "verified":
      return p.verified ? t("stepVerified") : t("stepVerifiedExpired");
    case "rejected":
      return t("stepRejected");
    case "suspended":
      return t("stepSuspended");
  }
}
