// حسابي: بيانات المصنع. واللغة والمظهر والخروج في الإعدادات (زر الترس فوق).
import { spacing } from "@mazood/brand";
import { IconSettings } from "@/components/icons";
import { router } from "expo-router";
import { View } from "react-native";
import { HeaderIconButton, Screen } from "@/components/layout";
import { AppText, Button, Card, Divider } from "@/components/ui";
import { LIVE } from "@/api/client";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

export default function Account() {
  const { t, tl, locale, digits, code } = useI18n();
  const { state, factory: FACTORY, profileComplete } = useStore();
  const phone = state.phone ? `0${state.phone.slice(4)}` : "";

  return (
    <Screen
      title={t("accountTitle")}
      headerAction={<HeaderIconButton icon={IconSettings} label={t("openSettings")} onPress={() => router.push("/settings")} />}
    >
      <Card style={{ gap: spacing["2"] }}>
        <AppText variant="caption" color="inkMuted">
          {t("factory")}
        </AppText>
        <AppText variant="h2">{profileComplete ? tl(FACTORY.name) : t("profileMissingName")}</AppText>
        <AppText variant="bodySm" color="inkMuted" style={{ writingDirection: "ltr", textAlign: locale === "ar" ? "right" : "left" }}>
          {digits(phone)}
        </AppText>
        <Divider />
        <InfoRow label={t("commercialRegister")} value={code(FACTORY.commercialRegister)} />
        <InfoRow label={t("vatNumber")} value={code(FACTORY.vatNumber)} />
      </Card>

      {LIVE && (
        <Button
          label={profileComplete ? t("editProfile") : t("completeProfile")}
          variant={profileComplete ? "secondary" : "primary"}
          onPress={() => router.push("/factory-profile")}
        />
      )}

    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing["2"] }}>
      <AppText variant="bodySm" color="inkMuted">
        {label}
      </AppText>
      <AppText variant="bodySm" style={{ writingDirection: "ltr" }}>
        {value}
      </AppText>
    </View>
  );
}
