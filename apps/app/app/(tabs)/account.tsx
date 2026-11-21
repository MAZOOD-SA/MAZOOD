// حسابي: بيانات المصنع، واللغة، والمظهر، والخروج.
import { spacing } from "@mazood/brand";
import { IconInfoCircle, IconLogout, IconPencil } from "@/components/icons";
import { router } from "expo-router";
import { View } from "react-native";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Card, Chips, Divider, Notice } from "@/components/ui";
import { localMobile } from "@mazood/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/lib/format";
import { useTheme, type ThemeMode } from "@/theme/ThemeProvider";

export default function Account() {
  const { t, locale, setLocale, digits, code } = useI18n();
  const { mode, setMode } = useTheme();
  const { me, signOut } = useAuth();
  const factory = me?.factory;
  const phone = me ? localMobile(me.user.phone) : "";

  return (
    <Screen title={t("accountTitle")}>
      <Card style={{ gap: spacing["2"] }}>
        <AppText variant="caption" color="inkMuted">
          {t("factory")}
        </AppText>
        <AppText variant="h2">{factory?.name}</AppText>
        <AppText variant="bodySm" color="inkMuted" style={{ writingDirection: "ltr", textAlign: locale === "ar" ? "right" : "left" }}>
          {digits(phone)}
        </AppText>
        <Divider />
        <InfoRow label={t("cityLabel")} value={factory?.city ?? "—"} ltr={false} />
        <InfoRow label={t("contactPerson")} value={factory?.contactName ?? "—"} ltr={false} />
        <InfoRow label={t("commercialRegister")} value={factory?.commercialRegister ? code(factory.commercialRegister) : "—"} />
        <InfoRow label={t("vatNumber")} value={factory?.vatNumber ? code(factory.vatNumber) : "—"} />
        <Button
          label={t("editProfile")}
          variant="ghost"
          icon={IconPencil}
          onPress={() => router.push({ pathname: "/complete-profile", params: { edit: "1" } })}
        />
      </Card>

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

      <Notice icon={IconInfoCircle} text={t("prototypeNote")} />

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

function InfoRow({ label, value, ltr = true }: { label: string; value: string; ltr?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing["2"] }}>
      <AppText variant="bodySm" color="inkMuted">
        {label}
      </AppText>
      <AppText variant="bodySm" style={ltr ? { writingDirection: "ltr" } : undefined}>
        {value}
      </AppText>
    </View>
  );
}
