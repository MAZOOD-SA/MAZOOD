// تسجيل بيانات المزوّد: الاسم التجاري، واسم صاحب الحساب، والهوية، والسجل التجاري، والأقسام.
// القواعد نفس قواعد الخادم (الحزمة المشتركة). رقم الهوية يُشفَّر في الخادم ولا يرجع كامل للجوال.
import { spacing } from "@mazood/brand";
import { providerProfileBody } from "@mazood/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { Field } from "@/components/Field";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Chips, Notice } from "@/components/ui";
import { CATEGORIES, type CategoryId } from "@/data/categories";
import { useStore } from "@/data/store";
import { useProvider } from "@/data/useProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { radius } from "@mazood/brand";

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();

export default function ProviderProfile() {
  const { t, tl } = useI18n();
  const { colors } = useTheme();
  const { authed } = useStore();
  const { provider } = useProvider();
  const [tradeName, setTradeName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [idType, setIdType] = useState<"national_id" | "iqama">("national_id");
  const [idNumber, setIdNumber] = useState("");
  const [cr, setCr] = useState("");
  const [categories, setCategories] = useState<CategoryId[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // تعبئة البيانات الحالية (ما عدا رقم الهوية: يعيد كتابته إذا عدّل).
  useEffect(() => {
    if (!provider) return;
    setTradeName(provider.tradeName);
    setOwnerName(provider.ownerName);
    setIdType(provider.idType);
    setCr(provider.commercialRegister);
    setCategories(provider.categories as CategoryId[]);
  }, [provider]);

  const toggle = (c: CategoryId) => setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  async function submit() {
    if (busy) return;
    const input = { tradeName, ownerName, idType, idNumber: toLatin(idNumber), commercialRegister: toLatin(cr), categories };
    const parsed = providerProfileBody.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        next[k] = { tradeName: t("nameRequired"), ownerName: t("nameRequired"), idNumber: t("idInvalid"), commercialRegister: t("crInvalid"), categories: t("categoriesRequired") }[k] ?? t("errValidation");
      }
      return setErrors(next);
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      await authed("/v1/provider/profile", { method: "PUT", body: parsed.data });
      router.back();
    } catch (e) {
      setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t("providerProfileTitle")}
      back
      footer={<Button label={t("saveProfile")} variant="accent" size="lg" full onPress={submit} disabled={busy} />}
    >
      <AppText color="inkMuted">{t("providerProfileHint")}</AppText>
      {failure && <Notice text={failure} />}
      <Field label={t("tradeNameLabel")} value={tradeName} onChangeText={setTradeName} maxLength={120} error={errors.tradeName} />
      <Field label={t("ownerNameLabel")} value={ownerName} onChangeText={setOwnerName} maxLength={120} error={errors.ownerName} />
      <SectionTitle title={t("idTypeLabel")} />
      <Chips
        value={idType}
        onChange={(v) => setIdType(v)}
        options={[
          { value: "national_id", label: t("nationalId") },
          { value: "iqama", label: t("iqama") },
        ]}
      />
      <Field
        label={t("idNumberLabel")}
        value={idNumber}
        onChangeText={setIdNumber}
        keyboardType="number-pad"
        maxLength={10}
        placeholder={provider ? provider.idNumberMasked : ""}
        error={errors.idNumber}
        ltr
      />
      <Field label={t("crLabel")} value={cr} onChangeText={setCr} keyboardType="number-pad" maxLength={10} error={errors.commercialRegister} ltr />
      <SectionTitle title={t("categoriesLabel")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
        {CATEGORIES.map((c) => {
          const on = categories.includes(c.id);
          return (
            <Pressable
              key={c.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(c.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing["1"],
                paddingHorizontal: spacing["3"],
                paddingVertical: spacing["2"],
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: on ? colors.primary : colors.lineStrong,
                backgroundColor: on ? colors.surfaceAlt : colors.surface,
              }}
            >
              <c.icon size={18} color={on ? colors.primary : colors.inkMuted} />
              <AppText variant="label" weight={on ? 600 : 400}>
                {tl(c.name)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {errors.categories && (
        <AppText variant="bodySm" color="danger">
          {errors.categories}
        </AppText>
      )}
      <AppText variant="caption" color="inkMuted">
        {t("privacyIdNote")}
      </AppText>
    </Screen>
  );
}
