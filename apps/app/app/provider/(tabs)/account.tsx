// حسابي (للمزوّد): البيانات، والتقييم ورقم الالتزام، والمستندات وتواريخ انتهائها، والتفضيلات.
// المستحقات تنضاف هنا في المرحلة ٥.
import { spacing } from "@mazood/brand";
import { router } from "expo-router";
import { View } from "react-native";
import { DeleteAccountSection, NotificationPrefsSection, PreferencesSection, SignOutButton } from "@/components/account";
import { DocSlotCard, dayIso } from "@/components/DocSlotCard";
import { Stars } from "@/components/flow";
import { IconHelpCircle, IconUpload } from "@/components/icons";
import { Screen, SectionTitle, SkeletonList, TwoColumn } from "@/components/layout";
import { AppText, Button, Card, Divider, Notice, Row, VerifiedBadge } from "@/components/ui";
import { categoryById, type CategoryId } from "@/data/categories";
import { DOC_LABELS } from "@/data/labels";
import { useProvider } from "@/data/useProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatNumber } from "@/lib/format";

export default function ProviderAccount() {
  const { t, tl, num, locale, digits, date } = useI18n();
  const { provider } = useProvider();
  if (!provider) return <SkeletonList />;
  const p = provider;

  const main = (
    <>
      <Card style={{ gap: spacing["2"] }}>
        <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <AppText variant="h2" style={{ flexShrink: 1 }}>
            {provider.tradeName}
          </AppText>
          {provider.verified && <VerifiedBadge />}
        </Row>
        <AppText variant="bodySm" color="inkMuted">
          {provider.categories.map((c) => tl(categoryById(c as CategoryId).name)).join(" · ")}
        </AppText>
        <Divider />
        <AppText variant="label" color="inkMuted">
          {t("howFactoriesSeeYou")}
        </AppText>
        {p.rating ? (
          <Row gap="2">
            <Stars value={p.rating.average} />
            <AppText variant="bodySm">
              {formatNumber(p.rating.average, locale, 1)} ({num(p.rating.count)})
            </AppText>
          </Row>
        ) : (
          <AppText variant="bodySm" color="inkMuted">
            {t("noRatingsYet")}
          </AppText>
        )}
        {p.commitment && (
          <AppText variant="bodySm">
            {p.commitment.kind === "new" ? t("commitmentNew") : t("commitmentCount", { kept: num(p.commitment.kept), total: num(p.commitment.total) })}
          </AppText>
        )}
        <AppText variant="caption" color="inkMuted">
          {t("crShort")} {digits(provider.commercialRegister)} · {provider.idNumberMasked}
        </AppText>
      </Card>

      {provider.expiring.map((e) => (
        <Notice key={e.docType} text={`${tl(DOC_LABELS[e.docType])}: ${e.expired ? t("docExpiredWarn") : t("docExpiringWarn")} (${date(dayIso(e.expiresOn))})`} />
      ))}

      <SectionTitle title={t("docsTitle")} />
      {provider.documents.map((slot) => (
        <DocSlotCard key={slot.docType} slot={slot}>
          <View>
            <Button label={t("renewDoc")} icon={IconUpload} variant="ghost" onPress={() => router.push({ pathname: "/provider/upload", params: { docType: slot.docType } })} />
          </View>
        </DocSlotCard>
      ))}
    </>
  );

  const side = (
    <>
      <Button label={t("help")} icon={IconHelpCircle} variant="secondary" onPress={() => router.push("/help")} />
      <PreferencesSection />
      <NotificationPrefsSection />
      <SignOutButton />
      <DeleteAccountSection />
    </>
  );

  return (
    <Screen title={t("tabAccount")} width="page">
      <TwoColumn main={main} side={side} />
    </Screen>
  );
}
