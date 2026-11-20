// رفع طلب جديد. «إرسال الطلب» هو زر accent الوحيد في الشاشة.
// التحقق من المدخلات هنا للتجربة فقط. في المرحلة ٢ الخادم يتحقق من كل مدخل قبل الحفظ.
import { spacing } from "@mazood/brand";
import { IconPaperclip, IconSend } from "@/components/icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { CategoryTile } from "@/components/domain";
import { Field } from "@/components/Field";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Chips } from "@/components/ui";
import { CATEGORIES, categoryById, type CategoryId } from "@/data/categories";
import { useStore } from "@/data/store";
import type { When } from "@/data/types";
import { useI18n } from "@/i18n/I18nProvider";

const DEFAULT_LOCATION = { ar: "مدينة سدير الصناعية · مصنع 14", en: "Sudair Industrial City · Factory 14" };

export default function NewRequest() {
  const { t, tl } = useI18n();
  const { createRequest } = useStore();
  const params = useLocalSearchParams<{ category?: string }>();
  const initial = CATEGORIES.some((c) => c.id === params.category) ? (params.category as CategoryId) : null;

  const [category, setCategory] = useState<CategoryId | null>(initial);
  const [typeId, setTypeId] = useState<string | null>(initial ? categoryById(initial).types[0].id : null);
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState(tl(DEFAULT_LOCATION));
  const [when, setWhen] = useState<When>("tomorrow");
  const [errors, setErrors] = useState<{ category?: string; details?: string }>({});
  const [attachNote, setAttachNote] = useState(false);

  const cat = category ? categoryById(category) : null;

  function pickCategory(id: CategoryId) {
    setCategory(id);
    setTypeId(categoryById(id).types[0].id);
    setErrors((e) => ({ ...e, category: undefined }));
  }

  function submit() {
    const next: typeof errors = {};
    if (!category || !typeId) next.category = t("categoryRequired");
    if (details.trim().length < 10) next.details = t("detailsTooShort");
    setErrors(next);
    if (next.category || next.details || !category || !typeId) return;

    const type = categoryById(category).types.find((x) => x.id === typeId)!;
    const id = createRequest({
      category,
      typeId,
      title: type.name,
      details: details.trim(),
      location: { ar: location.trim(), en: location.trim() },
      when,
    });
    router.replace({ pathname: "/request/[id]", params: { id, created: "1" } });
  }

  return (
    <Screen
      title={t("newRequestTitle")}
      back
      footer={<Button label={t("submitRequest")} icon={IconSend} variant="accent" size="lg" full onPress={submit} />}
    >
      <SectionTitle title={t("chooseCategory")} />
      {cat ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"] }}>
          <View style={{ flex: 1 }}>
            <CategoryTile category={cat} onPress={() => setCategory(null)} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"] }}>
          {CATEGORIES.map((c) => (
            <View key={c.id} style={{ width: "31.5%", flexGrow: 1 }}>
              <CategoryTile compact category={c} onPress={() => pickCategory(c.id)} />
            </View>
          ))}
        </View>
      )}
      {errors.category && (
        <AppText variant="bodySm" color="danger">
          {errors.category}
        </AppText>
      )}

      {cat && cat.types.length > 1 && (
        <>
          <SectionTitle title={t("chooseType")} />
          <Chips value={typeId} onChange={setTypeId} options={cat.types.map((x) => ({ value: x.id, label: tl(x.name) }))} />
        </>
      )}

      <Field
        label={t("detailsLabel")}
        value={details}
        onChangeText={(v) => {
          setDetails(v);
          if (errors.details) setErrors((e) => ({ ...e, details: undefined }));
        }}
        placeholder={t("detailsPlaceholder")}
        multiline
        maxLength={1000}
        error={errors.details}
      />

      <Field label={t("locationLabel")} value={location} onChangeText={setLocation} maxLength={200} />

      <SectionTitle title={t("whenLabel")} />
      <Chips<When>
        value={when}
        onChange={setWhen}
        options={[
          { value: "today", label: t("whenToday") },
          { value: "tomorrow", label: t("whenTomorrow") },
          { value: "this_week", label: t("whenThisWeek") },
        ]}
      />

      <SectionTitle title={t("attachments")} />
      <Button label={t("addAttachment")} icon={IconPaperclip} variant="secondary" onPress={() => setAttachNote(true)} />
      {attachNote && (
        <AppText variant="bodySm" color="inkMuted">
          {t("attachmentsLater")}
        </AppText>
      )}
    </Screen>
  );
}
