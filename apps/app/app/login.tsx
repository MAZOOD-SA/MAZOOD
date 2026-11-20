// الدخول برقم الجوال. في النسخة التجريبية ما ترسل رسالة حقيقية.
// في المرحلة ٢: الخادم يرسل رمز التحقق، ويحدد عدد المحاولات لكل رقم ولكل جهاز.
import { spacing } from "@mazood/brand";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/layout";
import { LogoMark } from "@/components/Logo";
import { Field } from "@/components/Field";
import { AppText, Button } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeSaudiMobile } from "@/lib/format";

export default function Login() {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const normalized = normalizeSaudiMobile(phone);
    if (!normalized) return setError(t("phoneInvalid"));
    setError(null);
    router.push({ pathname: "/verify", params: { phone: normalized } });
  }

  return (
    <Screen contentStyle={{ paddingTop: spacing["8"], gap: spacing["6"] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["3"] }}>
        <LogoMark size={48} />
        <AppText variant="display">{t("appName")}</AppText>
      </View>
      <View style={{ gap: spacing["1"] }}>
        <AppText variant="h1">{t("loginTitle")}</AppText>
        <AppText color="inkMuted">{t("loginSubtitle")}</AppText>
      </View>
      <Field
        label={t("phoneLabel")}
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          if (error) setError(null);
        }}
        placeholder="05XXXXXXXX"
        keyboardType="phone-pad"
        autoComplete="tel"
        error={error}
        onSubmitEditing={submit}
        ltr
      />
      <Button label={t("sendCode")} variant="accent" size="lg" full onPress={submit} />
    </Screen>
  );
}
