// بيانات الحساب للعميل: منشأة أو فرد (القرار ٤١).
//  - أول مرة: «أنت منشأة أو فرد؟»، وبعدها نموذج البيانات الرسمية حسب النوع.
//  - المنشأة: الاسم والمدينة والسجل التجاري والرقم الضريبي.
//  - الفرد: الاسم الكامل والمدينة والهوية الوطنية أو الإقامة (تنحفظ مشفّرة في الخادم).
// العميل يدخل بياناته بنفسه. ما نطلبها في المحادثة، والكود ما يحتوي أي بيانات حقيقية.
import { spacing } from "@mazood/brand";
import { factoryProfileBody, type CustomerKind } from "@mazood/shared";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { Field } from "@/components/Field";
import { IconBuildingFactory2, IconUser } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Card, Chips, Notice } from "@/components/ui";
import { useStore } from "@/data/store";
import type { StringKey } from "@/i18n/strings";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();

/** رسالة كل خطأ في النموذج حسب الخانة ونوع الخطأ. */
const FIELD_ERRORS: Record<string, StringKey> = {
  "name:business": "nameRequired",
  "name:individual": "fullNameRequired",
  commercialRegister: "crInvalid",
  vatNumber: "vatInvalid",
  idNumber: "idInvalid",
  "idNumber:id_type_mismatch": "idTypeMismatch",
};

export default function FactoryProfile() {
  const { t, tl } = useI18n();
  const { factory, saveProfile } = useStore();
  // النوع: المحفوظ، أو فاضي لين يختار (أول مرة).
  const [kind, setKind] = useState<CustomerKind | null>(factory.kind);
  const [name, setName] = useState(tl(factory.name));
  const [cr, setCr] = useState(factory.commercialRegister);
  const [vat, setVat] = useState(factory.vatNumber);
  const [idType, setIdType] = useState<"national_id" | "iqama">(factory.idType ?? "national_id");
  // رقم الهوية ما يرجع من الخادم أبدًا، فالخانة تبدأ فاضية ويكتبه من جديد لو عدّل.
  const [idNumber, setIdNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // لو انفتحت الشاشة قبل ما توصل بيانات الحساب (مثلًا تحديث الصفحة)، نعبّي الخانات أول ما توصل.
  const filled = useRef(!!factory.kind);
  useEffect(() => {
    if (filled.current || !factory.kind) return;
    filled.current = true;
    setKind(factory.kind);
    setName(tl(factory.name));
    setCr(factory.commercialRegister);
    setVat(factory.vatNumber);
    if (factory.idType) setIdType(factory.idType);
  }, [factory, tl]);

  if (!kind) return <KindChoice onChoose={(k) => ((filled.current = true), setKind(k))} />;

  async function submit() {
    if (busy || !kind) return;
    const input =
      kind === "business"
        ? { kind, name: name.trim(), commercialRegister: toLatin(cr), vatNumber: toLatin(vat) }
        : { kind, name: name.trim(), idType, idNumber: toLatin(idNumber) };
    // نفس قواعد الخادم (من الحزمة المشتركة)، عشان تطلع الرسالة قبل ما نرسل شي.
    const parsed = factoryProfileBody.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        const key = FIELD_ERRORS[`${field}:${issue.message}`] ?? FIELD_ERRORS[`${field}:${kind}`] ?? FIELD_ERRORS[field];
        next[field] = key ? t(key) : t("serverError");
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
      <AppText color="inkMuted">{t("profileHintRequired")}</AppText>
      {failure && <Notice text={failure} />}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <AppText weight={600}>{t(kind === "business" ? "kindBusiness" : "kindIndividual")}</AppText>
        <Button label={t("changeKind")} variant="ghost" onPress={() => setKind(null)} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />
      </View>
      <Field
        label={t(kind === "business" ? "factoryNameLabel" : "fullNameLabel")}
        value={name}
        onChangeText={setName}
        maxLength={120}
        error={errors.name}
      />
      {/* المدينة: وحدة بس الحين (سدير)، فتنحط تلقائيًا. خانة الاختيار تظهر لما تنضاف مدينة ثانية (القرار ٢٠). */}
      {!!tl(factory.city) && (
        <AppText color="inkMuted">
          {t("cityLabel")}: {tl(factory.city)}
        </AppText>
      )}
      {kind === "business" ? (
        <>
          <Field label={t("crLabel")} value={cr} onChangeText={setCr} keyboardType="number-pad" maxLength={10} error={errors.commercialRegister} ltr />
          <Field label={t("vatLabel")} value={vat} onChangeText={setVat} keyboardType="number-pad" maxLength={15} error={errors.vatNumber} ltr />
        </>
      ) : (
        <>
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
            error={errors.idNumber}
            placeholder={factory.idNumberMasked ?? undefined}
            ltr
          />
          <AppText variant="bodySm" color="inkMuted">
            {t("idPrivacy")}
          </AppText>
        </>
      )}
    </Screen>
  );
}

/** «أنت منشأة أو فرد؟»: بطاقتين، والاختيار يفتح النموذج المناسب. */
function KindChoice({ onChoose }: { onChoose: (k: CustomerKind) => void }) {
  const { t } = useI18n();
  return (
    <Screen title={t("profileTitle")} back contentStyle={{ gap: spacing["3"] }}>
      <AppText variant="h2" weight={700}>
        {t("kindTitle")}
      </AppText>
      <AppText color="inkMuted">{t("kindHint")}</AppText>
      <KindCard icon={IconBuildingFactory2} title={t("kindBusiness")} hint={t("kindBusinessHint")} onPress={() => onChoose("business")} />
      <KindCard icon={IconUser} title={t("kindIndividual")} hint={t("kindIndividualHint")} onPress={() => onChoose("individual")} />
    </Screen>
  );
}

function KindCard({ icon: Icon, title, hint, onPress }: { icon: typeof IconUser; title: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: spacing["3"] }}>
      <Icon size={28} color={colors.primary} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight={700}>{title}</AppText>
        <AppText variant="bodySm" color="inkMuted">
          {hint}
        </AppText>
      </View>
    </Card>
  );
}
