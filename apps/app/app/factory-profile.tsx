// بيانات المصنع (الاسم، والمدينة، والسجل التجاري، والرقم الضريبي).
// المصنع يدخلها بنفسه. ما نطلبها في المحادثة، والكود ما يحتوي أي بيانات شركة حقيقية.
import { spacing } from "@mazood/brand";
import { factoryProfileBody } from "@mazood/shared";
import { router } from "expo-router";
import { useState } from "react";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { Field } from "@/components/Field";
import { Screen } from "@/components/layout";
import { AppText, Button, Notice } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();

export default function FactoryProfile() {
  const { t, tl } = useI18n();
  const { factory, saveProfile } = useStore();
  const [name, setName] = useState(tl(factory.name));
  const [city, setCity] = useState(tl(factory.city));
  const [cr, setCr] = useState(factory.commercialRegister);
  const [vat, setVat] = useState(factory.vatNumber);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const input = { name: name.trim(), city: city.trim(), commercialRegister: toLatin(cr), vatNumber: toLatin(vat) };
    // نفس قواعد الخادم (من الحزمة المشتركة)، عشان تطلع الرسالة قبل ما نرسل شي.
    const parsed = factoryProfileBody.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        next[key] = { name: t("nameRequired"), city: t("cityRequired"), commercialRegister: t("crInvalid"), vatNumber: t("vatInvalid") }[key] ?? t("serverError");
      }
      return setErrors(next);
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      await saveProfile(parsed.data);
      router.back();
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t("profileTitle")}
      back
      contentStyle={{ gap: spacing["4"] }}
      footer={<Button label={t("saveProfile")} variant="primary" size="lg" full onPress={submit} disabled={busy} />}
    >
      <AppText color="inkMuted">{t("profileHint")}</AppText>
      {failure && <Notice text={failure} />}
      <Field label={t("factoryNameLabel")} value={name} onChangeText={setName} maxLength={120} error={errors.name} />
      <Field label={t("cityLabel")} value={city} onChangeText={setCity} maxLength={80} error={errors.city} />
      <Field label={t("crLabel")} value={cr} onChangeText={setCr} keyboardType="number-pad" maxLength={10} error={errors.commercialRegister} ltr />
      <Field label={t("vatLabel")} value={vat} onChangeText={setVat} keyboardType="number-pad" maxLength={15} error={errors.vatNumber} ltr />
    </Screen>
  );
}
