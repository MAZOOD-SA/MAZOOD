// بيانات المصنع: تنعبّى مرة وحدة بعد أول دخول، وتتعدل بعدها من «حسابي».
// الخادم يتحقق من كل خانة، ويربط المصنع بالمستخدم من الجلسة (ما يقبل رقم مصنع من التطبيق).
import { spacing } from "@mazood/brand";
import { factoryProfileSchema } from "@mazood/shared";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Field } from "@/components/Field";
import { Screen } from "@/components/layout";
import { AppText, Button } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import { api, ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

type FieldName = "name" | "city" | "contactName" | "commercialRegister" | "vatNumber";

/** رسالة كل خانة إذا قيمتها غلط. */
const FIELD_ERRORS: Record<FieldName, StringKey> = {
  name: "nameRequired",
  city: "nameRequired",
  contactName: "nameRequired",
  commercialRegister: "crInvalid",
  vatNumber: "vatInvalid",
};

export default function CompleteProfile() {
  const { t } = useI18n();
  const { me, factorySaved } = useAuth();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const existing = me?.factory;
  const [form, setForm] = useState<Record<FieldName, string>>({
    name: existing?.name ?? "",
    city: existing?.city ?? "",
    contactName: existing?.contactName ?? "",
    commercialRegister: existing?.commercialRegister ?? "",
    vatNumber: existing?.vatNumber ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!me) return <Redirect href="/login" />;
  const editing = !!edit && !!existing;

  const set = (k: FieldName) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function fieldErrors(issues: { path: string }[]) {
    const next: Partial<Record<FieldName, string>> = {};
    for (const i of issues) {
      const k = i.path.split(".")[0] as FieldName;
      if (k in FIELD_ERRORS) next[k] = t(FIELD_ERRORS[k]);
    }
    return next;
  }

  async function submit() {
    // نفس قواعد الخادم (packages/shared)، عشان الرسالة تطلع فورًا.
    const check = factoryProfileSchema.safeParse(form);
    if (!check.success) return setErrors(fieldErrors(check.error.issues.map((i) => ({ path: i.path.join(".") }))));
    setSaving(true);
    setFormError(null);
    try {
      factorySaved(await api.saveFactory(form));
      if (editing && router.canGoBack()) router.back();
      else router.replace("/home");
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_input" && e.body.issues) setErrors(fieldErrors(e.body.issues));
      else setFormError(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title={editing ? t("profileTitle") : undefined}
      back={editing}
      footer={<Button label={editing ? t("saveChanges") : t("saveProfile")} variant="accent" size="lg" full loading={saving} disabled={saving} onPress={submit} />}
    >
      {!editing && (
        <View style={{ gap: spacing["1"], paddingTop: spacing["4"] }}>
          <AppText variant="h1">{t("profileTitle")}</AppText>
          <AppText color="inkMuted">{t("profileSubtitle")}</AppText>
        </View>
      )}
      <Field label={t("factoryNameLabel")} value={form.name} onChangeText={set("name")} maxLength={120} error={errors.name} />
      <Field label={t("cityLabel")} value={form.city} onChangeText={set("city")} maxLength={60} error={errors.city} />
      <Field label={t("contactNameLabel")} value={form.contactName} onChangeText={set("contactName")} maxLength={80} autoComplete="name" error={errors.contactName} />
      <Field
        label={t("crLabel")}
        value={form.commercialRegister}
        onChangeText={set("commercialRegister")}
        keyboardType="number-pad"
        maxLength={10}
        error={errors.commercialRegister}
        ltr
      />
      <Field label={t("vatLabel")} value={form.vatNumber} onChangeText={set("vatNumber")} keyboardType="number-pad" maxLength={15} error={errors.vatNumber} ltr />
      {formError && (
        <AppText variant="bodySm" color="danger">
          {formError}
        </AppText>
      )}
    </Screen>
  );
}
