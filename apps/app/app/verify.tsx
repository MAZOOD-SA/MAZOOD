// إدخال رمز التحقق. الخادم يتحقق من الرمز، وبعد ٥ محاولات غلط ينلغي.
import { spacing } from "@mazood/brand";
import { localMobile, normalizeSaudiMobile, toLatinDigits } from "@mazood/shared";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Field } from "@/components/Field";
import { Screen } from "@/components/layout";
import { AppText, Button, Notice } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/** كم ثانية ينتظر قبل ما يقدر يطلب رمز جديد (الخادم يسمح بـ ٣ رموز كل ١٥ دقيقة). */
const RESEND_AFTER_SECONDS = 60;

export default function Verify() {
  const { t, digits } = useI18n();
  const { signedIn } = useAuth();
  const params = useLocalSearchParams<{ phone: string }>();
  const phone = normalizeSaudiMobile(params.phone ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  if (!phone) return <Redirect href="/login" />;

  async function submit() {
    if (!phone) return;
    const latin = toLatinDigits(code).trim();
    if (!/^\d{6}$/.test(latin)) return setError(t("codeInvalid"));
    setBusy(true);
    setInfo(null);
    try {
      const me = await api.verifyOtp(phone, latin);
      signedIn(me);
      router.replace(me.factory ? "/home" : "/complete-profile");
    } catch (e) {
      setError(errorMessage(t, e));
      if (e instanceof ApiError && (e.code === "code_expired" || (e.code === "code_wrong" && !e.body.attemptsLeft))) setResendIn(0);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!phone) return;
    setError(null);
    try {
      await api.requestOtp(phone);
      setInfo(t("codeResent"));
      setResendIn(RESEND_AFTER_SECONDS);
    } catch (e) {
      setError(errorMessage(t, e));
    }
  }

  return (
    <Screen title="" back contentStyle={{ gap: spacing["6"] }}>
      <View style={{ gap: spacing["1"] }}>
        <AppText variant="h1">{t("verifyTitle")}</AppText>
        <AppText color="inkMuted">
          {t("verifySubtitle")}{" "}
          <AppText weight={600} style={{ writingDirection: "ltr" }}>
            {digits(localMobile(phone))}
          </AppText>
        </AppText>
      </View>
      {__DEV__ && <Notice text={t("verifyDevHint")} />}
      <Field
        label={t("codeLabel")}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        error={error}
        onSubmitEditing={submit}
        ltr
      />
      {info && (
        <AppText variant="bodySm" color="success">
          {info}
        </AppText>
      )}
      <Button label={t("confirm")} variant="accent" size="lg" full loading={busy} disabled={busy} onPress={submit} />
      <Button
        label={resendIn > 0 ? t("resendIn", { s: resendIn }) : t("resendCode")}
        variant="secondary"
        disabled={resendIn > 0}
        onPress={resend}
      />
      <Button label={t("changeNumber")} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
