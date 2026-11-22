// حسابي: بيانات المصنع، واللغة، والمظهر، والخروج.
import { spacing } from "@mazood/brand";
import { IconInfoCircle, IconLogout } from "@/components/icons";
import { router } from "expo-router";
import { View } from "react-native";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Card, Chips, Divider, Notice } from "@/components/ui";
import { LIVE } from "@/api/client";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/lib/format";
import { useTheme, type ThemeMode } from "@/theme/ThemeProvider";

export default function Account() {
  const { t, tl, locale, setLocale, digits, code } = useI18n();
  const { mode, setMode } = useTheme();
  const { state, factory: FACTORY, profileComplete, signOut } = useStore();
  const phone = state.phone ? `0${state.phone.slice(4)}` : "";

  return (
    <Screen title={t("accountTitle")}>
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

      <SectionTitle title={t("language")} />
      <Chips<Locale>
        value={locale}
        onChange={setLocale}
        options={[
          { value: "ar", label: "العربية" },
          { value: "en", label: "English" },
        ]}
      />

      <SectionTitle title={t("appearance")} />
      <Chips<ThemeMode>
        value={mode}
        onChange={setMode}
        options={[
          { value: "system", label: t("themeSystem") },
          { value: "light", label: t("themeLight") },
          { value: "dark", label: t("themeDark") },
        ]}
      />

      {!LIVE && <Notice icon={IconInfoCircle} text={t("prototypeNote")} />}

      <Button
        label={t("signOut")}
        variant="secondary"
        icon={IconLogout}
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      />
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
