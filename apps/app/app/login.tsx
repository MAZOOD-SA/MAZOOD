// الدخول: شاشة وحدة بثلاث خطوات (حسب docs/product.md، القسم ٣):
//   ١. رقم الجوال   ٢. رمز التحقق   ٣. اسم المصنع وموقعه (أول مرة بس)
// الخادم هو اللي يرسل الرمز ويتحقق منه ويحدد عدد المحاولات. هنا نعرض الرسائل بس.
import { localMobile, normalizeSaudiMobile } from "@mazood/shared";
import { spacing } from "@mazood/brand";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSession } from "@/api/session";
import { Field } from "@/components/Field";
import { Screen } from "@/components/layout";
import { LogoMark } from "@/components/Logo";
import { AppText, Button, Notice } from "@/components/ui";
import { ApiRequestError } from "@/api/client";
import { errorMessage } from "@/i18n/errors";
import { useI18n } from "@/i18n/I18nProvider";

type Step = "phone" | "code" | "profile";

export default function Login() {
  const { t, digits, code: codeText } = useI18n();
  const session = useSession();
  const params = useLocalSearchParams<{ step?: string }>();
  const [step, setStep] = useState<Step>(params.step === "profile" && session.me ? "profile" : "phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  // عدّاد «تقدر تطلب رمز جديد بعد ...».
  useEffect(() => {
    if (step !== "code") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  // داخل ومكمّل: ما يحتاج هذي الشاشة.
  if (session.me?.factory) return <Redirect href="/home" />;

  const normalized = normalizeSaudiMobile(phone);

  async function run(fn: () => Promise<void>, field = "form") {
    setBusy(true);
    setErrors({});
    try {
      await fn();
    } catch (err) {
      const f = err instanceof ApiRequestError && err.field ? err.field : field;
      setErrors({ [f]: errorMessage(err, t) });
    } finally {
      setBusy(false);
    }
  }

  function sendCode() {
    if (!normalized) return setErrors({ phone: t("phoneInvalid") });
    run(async () => {
      const r = await session.requestCode(normalized);
      setDevCode(r.devCode ?? null);
      setResendAt(Date.now() + r.resendAfterSeconds * 1000);
      setCode("");
      setStep("code");
    }, "phone");
  }

  function verify() {
    if (!normalized) return setStep("phone");
    if (!/^[0-9٠-٩]{6}$/.test(code.trim())) return setErrors({ code: t("codeInvalid") });
    run(async () => {
      const me = await session.verifyCode(normalized, code.trim());
      if (me.factory) router.replace("/home");
      else setStep("profile");
    }, "code");
  }

  function saveProfile() {
    run(async () => {
      await session.saveFactory({ name, location });
      router.replace("/home");
    });
  }

  const waitSeconds = Math.max(0, Math.floor((resendAt - now) / 1000));

  return (
    <Screen contentStyle={{ paddingTop: spacing["8"], gap: spacing["6"] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["3"] }}>
        <LogoMark size={48} />
        <AppText variant="display">{t("appName")}</AppText>
      </View>

      {step === "phone" && (
        <>
          <Title title={t("loginTitle")} subtitle={t("loginSubtitle")} />
          <Field
            label={t("phoneLabel")}
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setErrors({});
            }}
            placeholder="05XXXXXXXX"
            keyboardType="phone-pad"
            autoComplete="tel"
            error={errors.phone}
            onSubmitEditing={sendCode}
            maxLength={16}
            ltr
          />
          <Button label={t("sendCode")} variant="accent" size="lg" full loading={busy} onPress={sendCode} />
        </>
      )}

      {step === "code" && normalized && (
        <>
          <View style={{ gap: spacing["1"] }}>
            <AppText variant="h1">{t("verifyTitle")}</AppText>
            <AppText color="inkMuted">
              {t("verifySubtitle")}{" "}
              <AppText weight={600} style={{ writingDirection: "ltr" }}>
                {digits(localMobile(normalized))}
              </AppText>
            </AppText>
          </View>
          {devCode && <Notice text={t("devCodeHint", { code: codeText(devCode) })} />}
          <Field
            label={t("codeLabel")}
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setErrors({});
            }}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            error={errors.code}
            onSubmitEditing={verify}
            ltr
          />
          <Button label={t("confirm")} variant="accent" size="lg" full loading={busy} onPress={verify} />
          {waitSeconds > 0 ? (
            <AppText variant="bodySm" color="inkMuted" align="center">
              {t("resendIn", { n: waitSeconds })}
            </AppText>
          ) : (
            <Button label={t("resendCode")} variant="secondary" full disabled={busy} onPress={sendCode} />
          )}
          <Button label={t("changeNumber")} variant="ghost" onPress={() => setStep("phone")} />
        </>
      )}

      {step === "profile" && (
        <>
          <Title title={t("profileTitle")} subtitle={t("profileSubtitle")} />
          <Field
            label={t("factoryNameLabel")}
            value={name}
            onChangeText={setName}
            placeholder={t("factoryNamePlaceholder")}
            maxLength={120}
            error={errors.name}
          />
          <Field
            label={t("factoryLocationLabel")}
            value={location}
            onChangeText={setLocation}
            placeholder={t("factoryLocationPlaceholder")}
            maxLength={200}
            error={errors.location}
            onSubmitEditing={saveProfile}
          />
          <Button label={t("startUsing")} variant="accent" size="lg" full loading={busy} onPress={saveProfile} />
        </>
      )}

      {errors.form && (
        <AppText variant="bodySm" color="danger">
          {errors.form}
        </AppText>
      )}
    </Screen>
  );
}

function Title({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ gap: spacing["1"] }}>
      <AppText variant="h1">{title}</AppText>
      <AppText color="inkMuted">{subtitle}</AppText>
    </View>
  );
}
