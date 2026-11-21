// رفع طلب جديد. «إرسال الطلب» هو زر accent الوحيد في الشاشة.
// التحقق هنا بنفس قواعد الخادم (packages/shared) عشان الرسالة تطلع فورًا، والخادم يتحقق مرة ثانية قبل الحفظ.
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
import { newRequestSchema } from "@mazood/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useRequests } from "@/data/requests";
import type { When } from "@/data/types";
import { useI18n } from "@/i18n/I18nProvider";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export default function NewRequest() {
  const { t, tl } = useI18n();
  const { me } = useAuth();
  const requests = useRequests();
  const params = useLocalSearchParams<{ category?: string }>();
  const initial = CATEGORIES.some((c) => c.id === params.category) ? (params.category as CategoryId) : null;

  const [category, setCategory] = useState<CategoryId | null>(initial);
  const [typeId, setTypeId] = useState<string | null>(initial ? categoryById(initial).types[0].id : null);
  const [details, setDetails] = useState("");
  // الموقع الافتراضي: المصنع نفسه، ويقدر يغيّره.
  const [location, setLocation] = useState(me?.factory ? `${me.factory.name}، ${me.factory.city}` : "");
  const [when, setWhen] = useState<When>("tomorrow");
  const [errors, setErrors] = useState<{ category?: string; details?: string; location?: string; form?: string }>({});
  const [sending, setSending] = useState(false);
  const [attachNote, setAttachNote] = useState(false);

  const cat = category ? categoryById(category) : null;

  function pickCategory(id: CategoryId) {
    setCategory(id);
    setTypeId(categoryById(id).types[0].id);
    setErrors((e) => ({ ...e, category: undefined }));
  }

  /** يحوّل أخطاء التحقق (من التطبيق أو الخادم) لرسالة تحت كل خانة. */
  function fieldErrors(paths: string[]): typeof errors {
    const next: typeof errors = {};
    if (paths.some((p) => p === "category" || p === "typeId")) next.category = t("categoryRequired");
    if (paths.includes("details")) next.details = t("detailsTooShort");
    if (paths.includes("location")) next.location = t("locationRequired");
    return next;
  }

  async function submit() {
    const input = { category: category ?? "", typeId: typeId ?? "", details, location, when };
    const check = newRequestSchema.safeParse(input);
    if (!check.success) return setErrors(fieldErrors(check.error.issues.map((i) => String(i.path[0]))));
    setErrors({});
    setSending(true);
    try {
      const created = await requests.create(check.data);
      router.replace({ pathname: "/request/[id]", params: { id: created.id, created: "1" } });
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_input" && e.body.issues) setErrors(fieldErrors(e.body.issues.map((i) => i.path)));
      else setErrors({ form: errorMessage(t, e) });
    } finally {
      setSending(false);
    }
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
          <Button label={t("submitRequest")} icon={IconSend} variant="accent" size="lg" full loading={sending} disabled={sending} onPress={submit} />
        </View>
      }
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

      <Field
        label={t("locationLabel")}
        value={location}
        onChangeText={(v) => {
          setLocation(v);
          if (errors.location) setErrors((e) => ({ ...e, location: undefined }));
        }}
        maxLength={200}
        error={errors.location}
      />

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
