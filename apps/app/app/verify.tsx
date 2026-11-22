// إدخال رمز التحقق. في النسخة التجريبية: أي ٦ أرقام تمشي.
import { spacing } from "@mazood/brand";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api, ApiClientError, IS_WEB, LIVE } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { homeRouteFor } from "@/lib/home-route";
import { Field } from "@/components/Field";
import { Screen } from "@/components/layout";
import { AppText, Button, Notice } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

export default function Verify() {
  const { t, digits } = useI18n();
  const { dispatch, startSession } = useStore();
  const { phone, as } = useLocalSearchParams<{ phone: string; as?: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const latin = code.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (!/^\d{6}$/.test(latin)) return setError(t("codeInvalid"));
    if (LIVE) {
      setBusy(true);
      try {
        // الموقع: الخادم يحط الجلسة في كوكي محمي وما يرجّع الرمز. الجوال: الرمز يرجع وينحفظ في الخزنة.
        const res = await api<{ token?: string }>("/v1/auth/otp/verify", {
          method: "POST",
          body: { phone, code: latin, ...(as === "provider" ? { as: "provider" } : {}), ...(IS_WEB ? { channel: "web" } : {}) },
        });
        const role = await startSession(res.token ?? null, phone ?? "");
        setBusy(false);
        return router.replace(homeRouteFor(role));
      } catch (e) {
        setError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
        setBusy(false);
        return;
      }
      setBusy(false);
    } else {
      dispatch({ type: "signIn", phone: phone ?? "" });
    }
    router.replace("/home");
  }

  // الرقم يظهر بصيغة محلية: 05XXXXXXXX
  const display = phone ? `0${phone.slice(4)}` : "";

  return (
    <Screen title="" back contentStyle={{ gap: spacing["6"] }}>
      <View style={{ gap: spacing["1"] }}>
        <AppText variant="h1">{t("verifyTitle")}</AppText>
        <AppText color="inkMuted">
          {t("verifySubtitle")}{" "}
          <AppText weight={600} style={{ writingDirection: "ltr" }}>
            {digits(display)}
          </AppText>
        </AppText>
      </View>
      {!LIVE && <Notice text={t("verifyPrototypeHint")} />}
      <Field
        label={t("codeLabel")}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        maxLength={6}
        error={error}
        onSubmitEditing={submit}
        ltr
      />
      <Button label={t("confirm")} variant="accent" size="lg" full onPress={submit} disabled={busy} />
      <Button label={t("changeNumber")} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
