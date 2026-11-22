// رفع طلب جديد. «إرسال الطلب» هو زر accent الوحيد في الشاشة.
// التحقق هنا يعطي رسالة سريعة بس. الخادم يتحقق من كل مدخل من جديد قبل الحفظ (packages/shared/src/schemas.ts).
//
// «اطلب مرة ثانية» يفتح هذي الشاشة معبّية من طلب سابق (params: from).
import { spacing } from "@mazood/brand";
import { WHEN_OPTIONS, type When } from "@mazood/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiRequestError } from "@/api/client";
import { useCreateRequest } from "@/api/requests";
import { useSession } from "@/api/session";
import { CategoryTile } from "@/components/domain";
import { Field } from "@/components/Field";
import { IconPaperclip, IconSend } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Chips } from "@/components/ui";
import { CATEGORIES, categoryById, type CategoryId } from "@/data/categories";
import { errorMessage } from "@/i18n/errors";
import { useI18n } from "@/i18n/I18nProvider";

type Params = { category?: string; typeId?: string; details?: string; location?: string; when?: string };

export default function NewRequest() {
  const { t, tl } = useI18n();
  const { me } = useSession();
  const create = useCreateRequest();
  const p = useLocalSearchParams<Params>();
  const initial = CATEGORIES.some((c) => c.id === p.category) ? (p.category as CategoryId) : null;
  const initialType = initial && categoryById(initial).types.some((x) => x.id === p.typeId) ? p.typeId! : initial ? categoryById(initial).types[0].id : null;

  const [category, setCategory] = useState<CategoryId | null>(initial);
  const [typeId, setTypeId] = useState<string | null>(initialType);
  const [details, setDetails] = useState(p.details ?? "");
  const [location, setLocation] = useState(p.location ?? me?.factory?.location ?? "");
  const [when, setWhen] = useState<When>(WHEN_OPTIONS.includes(p.when as When) ? (p.when as When) : "tomorrow");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
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
    if (location.trim().length < 2) next.location = t("err_location_invalid");
    setErrors(next);
    if (Object.values(next).some(Boolean) || !category || !typeId) return;

    create.mutate(
      { category, typeId, details: details.trim(), location: location.trim(), when },
      {
        onSuccess: (r) => router.replace({ pathname: "/request/[id]", params: { id: r.id, created: "1" } }),
        onError: (err) => {
          const field = err instanceof ApiRequestError && err.field ? err.field : "form";
          setErrors({ [field]: errorMessage(err, t) });
        },
      },
    );
  }

  return (
    <Screen
      title={t("newRequestTitle")}
      back
      footer={
        <View style={{ gap: spacing["2"] }}>
          {errors.form && (
            <AppText variant="bodySm" color="danger">
              {errors.form}
            </AppText>
          )}
          <Button label={t("submitRequest")} icon={IconSend} variant="accent" size="lg" full loading={create.isPending} onPress={submit} />
        </View>
      }
    >
      <SectionTitle title={t("chooseCategory")} />
      {cat ? (
        <CategoryTile category={cat} onPress={() => setCategory(null)} />
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

      <Field label={t("locationLabel")} value={location} onChangeText={setLocation} maxLength={200} error={errors.location} />

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
