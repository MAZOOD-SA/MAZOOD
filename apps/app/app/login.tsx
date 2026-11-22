// الدخول برقم الجوال. في النسخة التجريبية ما ترسل رسالة حقيقية.
// في المرحلة ٢: الخادم يرسل رمز التحقق، ويحدد عدد المحاولات لكل رقم ولكل جهاز.
import { spacing } from "@mazood/brand";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api, ApiClientError, IS_WEB, LIVE } from "@/api/client";
import { DEMO_PHONES } from "@/demo/server";
import { IconBuildingFactory2, IconTruck, IconUser } from "@/components/icons";
import { useStore } from "@/data/store";
import { homeRouteFor } from "@/lib/home-route";
import { errorKey } from "@/api/mapping";
import { Screen } from "@/components/layout";
import { LogoMark } from "@/components/Logo";
import { Field } from "@/components/Field";
import { AppText, Button, Card } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeSaudiMobile } from "@/lib/format";

export default function Login() {
  const { t } = useI18n();
  const { startSession } = useStore();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // as=provider: التسجيل كمزوّد خدمة (يأثر بس على الحسابات الجديدة).
  const { as } = useLocalSearchParams<{ as?: string }>();
  const asProvider = as === "provider";
  const next = (phone: string) => ({ pathname: "/verify" as const, params: { phone, ...(asProvider ? { as: "provider" } : {}) } });

  async function submit() {
    if (busy) return;
    const normalized = normalizeSaudiMobile(phone);
    if (!normalized) return setError(t("phoneInvalid"));
    setError(null);
    setBusy(true);
    try {
      await api("/v1/auth/otp/request", { method: "POST", body: { phone: normalized } });
    } catch (e) {
      // فاصل ٦٠ ثانية: المستخدم غالبًا طلب الرمز قبل شوي، نوديه لشاشة الرمز عشان يدخل اللي وصله.
      if (e instanceof ApiClientError && e.code === "otp_cooldown") {
        setBusy(false);
        return router.push(next(normalized));
      }
      setError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
      setBusy(false);
      return;
    }
    setBusy(false);
    router.push(next(normalized));
  }

  // النسخة التجريبية: دخول بضغطة كمصنع أو كمزوّد موثّق، عشان المالك وشريكه يجرّبون الدورة كاملة.
  async function tryAs(role: "factory" | "provider" | "individual") {
    setBusy(true);
    const res = await api<{ token?: string }>("/v1/auth/otp/verify", {
      method: "POST",
      body: { phone: DEMO_PHONES[role], code: "000000", ...(IS_WEB ? { channel: "web" } : {}) },
    });
    const r = await startSession(res.token ?? null, DEMO_PHONES[role]);
    setBusy(false);
    router.replace(homeRouteFor(r));
  }

  return (
    <Screen contentStyle={{ paddingTop: spacing["8"], gap: spacing["6"] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["3"] }}>
        <LogoMark size={48} />
        <AppText variant="display">{t("appName")}</AppText>
      </View>
      <View style={{ gap: spacing["1"] }}>
        <AppText variant="h1">{asProvider ? t("loginProviderTitle") : t("loginTitle")}</AppText>
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
      <Button label={t("sendCode")} variant="accent" size="lg" full onPress={submit} disabled={busy} />
      <Button
        label={asProvider ? t("iAmFactory") : t("iAmProvider")}
        variant="ghost"
        onPress={() => router.setParams({ as: asProvider ? "" : "provider" })}
      />
      {!LIVE && (
        <Card style={{ gap: spacing["3"] }}>
          <AppText variant="label">{t("demoTryTitle")}</AppText>
          <AppText variant="bodySm" color="inkMuted">
            {t("demoTryBody")}
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
            <Button label={t("demoAsFactory")} icon={IconBuildingFactory2} variant="secondary" onPress={() => tryAs("factory")} disabled={busy} />
            <Button label={t("demoAsIndividual")} icon={IconUser} variant="secondary" onPress={() => tryAs("individual")} disabled={busy} />
            <Button label={t("demoAsProvider")} icon={IconTruck} variant="secondary" onPress={() => tryAs("provider")} disabled={busy} />
          </View>
        </Card>
      )}
    </Screen>
  );
}
