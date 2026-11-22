// رفع طلب جديد. «إرسال الطلب» هو زر accent الوحيد في الشاشة.
// التحقق من المدخلات هنا للتجربة فقط. في المرحلة ٢ الخادم يتحقق من كل مدخل قبل الحفظ.
import { spacing } from "@mazood/brand";
import { IconAlertTriangle, IconPaperclip, IconSend } from "@/components/icons";
import { router, useLocalSearchParams } from "expo-router";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, saveDraft } from "@/api/draft";
import { View } from "react-native";
import { CategoryTile } from "@/components/domain";
import { Field } from "@/components/Field";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Chips, Notice } from "@/components/ui";
import { CATEGORIES, categoryById, type CategoryId } from "@/data/categories";
import { useStore } from "@/data/store";
import type { When } from "@/data/types";
import { useI18n } from "@/i18n/I18nProvider";
import { containsContactInfo } from "@mazood/shared";

const DEFAULT_LOCATION = { ar: "مدينة سدير الصناعية · مصنع 14", en: "Sudair Industrial City · Factory 14" };
const DEFAULT_AREA = { ar: "المرحلة الثانية", en: "Phase 2" };

export default function NewRequest() {
  const { t, tl } = useI18n();
  const { createRequest, profileComplete, factory } = useStore();
  // الفرد في بيته: «المنطقة» تصير «الحي»، وما نعبّي له عنوان افتراضي (القرار ٤١).
  const individual = factory.kind === "individual";
  const defaultArea = individual ? "" : tl(DEFAULT_AREA);
  const defaultLocation = individual ? "" : tl(DEFAULT_LOCATION);
  // «اطلب مرة ثانية»: الطلب الجديد يجي معبّى بنفس تفاصيل الطلب القديم (docs/product.md، القسم ٢).
  const params = useLocalSearchParams<{ category?: string; typeId?: string; details?: string; area?: string; location?: string; when?: string }>();
  const initial = CATEGORIES.some((c) => c.id === params.category) ? (params.category as CategoryId) : null;
  const initialType = initial && categoryById(initial).types.some((x) => x.id === params.typeId) ? params.typeId! : initial ? categoryById(initial).types[0].id : null;

  const [category, setCategory] = useState<CategoryId | null>(initial);
  const [typeId, setTypeId] = useState<string | null>(initialType);
  const [details, setDetails] = useState(params.details ?? "");
  const [area, setArea] = useState(params.area ?? defaultArea);
  const [location, setLocation] = useState(params.location ?? defaultLocation);
  const [when, setWhen] = useState<When>(params.when === "today" || params.when === "this_week" ? params.when : "tomorrow");
  const [errors, setErrors] = useState<{ category?: string; details?: string; area?: string }>({});
  const [attachNote, setAttachNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // لو وصلت بيانات الحساب بعد فتح الشاشة (تحديث الصفحة) والعميل فرد: نشيل عنوان المنشأة الافتراضي.
  useEffect(() => {
    if (!individual) return;
    setArea((a) => (a === tl(DEFAULT_AREA) ? "" : a));
    setLocation((l) => (l === tl(DEFAULT_LOCATION) ? "" : l));
  }, [individual, tl]);

  const cat = category ? categoryById(category) : null;

  // المسودة: نرجّعها لو المستخدم طلع قبل الإرسال (إلا لو فتح الشاشة من قسم معيّن)، ونحفظها مع كل تعديل.
  const [restored, setRestored] = useState(false);
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (initial) {
      draftLoaded.current = true;
      return;
    }
    loadDraft().then((d) => {
      draftLoaded.current = true;
      if (!d) return;
      const c = CATEGORIES.some((x) => x.id === d.category) ? (d.category as CategoryId) : null;
      setCategory(c);
      setTypeId(c && categoryById(c).types.some((x) => x.id === d.typeId) ? d.typeId : c ? categoryById(c).types[0].id : null);
      setDetails(d.details);
      if (d.area) setArea(d.area);
      if (d.location) setLocation(d.location);
      setWhen(d.when);
      setRestored(true);
    });
  }, [initial]);
  useEffect(() => {
    if (!draftLoaded.current) return;
    const id = setTimeout(() => saveDraft({ category, typeId, details, area, location, when }), 400);
    return () => clearTimeout(id);
  }, [category, typeId, details, area, location, when]);

  function discardDraft() {
    clearDraft();
    setRestored(false);
    setCategory(null);
    setTypeId(null);
    setDetails("");
    setArea(defaultArea);
    setLocation(defaultLocation);
    setWhen("tomorrow");
  }

  function pickCategory(id: CategoryId) {
    setCategory(id);
    setTypeId(categoryById(id).types[0].id);
    setErrors((e) => ({ ...e, category: undefined }));
  }

  async function submit() {
    if (busy) return;
    const next: typeof errors = {};
    if (!category || !typeId) next.category = t("categoryRequired");
    if (details.trim().length < 10) next.details = t("detailsTooShort");
    if (area.trim().length < 2) next.area = t("areaRequired");
    setErrors(next);
    if (next.category || next.details || next.area || !category || !typeId) return;

    const type = categoryById(category).types.find((x) => x.id === typeId)!;
    setBusy(true);
    setSubmitError(null);
    let created: { id: string; reach: number };
    try {
      created = await createRequest({
        category,
        typeId,
        title: type.name,
        details: details.trim(),
        area: area.trim(),
        location: { ar: location.trim(), en: location.trim() },
        when,
      });
    } catch (e) {
      setSubmitError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
      setBusy(false);
      return;
    }
    // المكافأة الفورية: تفاصيل الطلب تفتح وفيها «وصل طلبك لـ X مزوّد موثّق» (الرقم يعدّ لين يوقف).
    router.replace({ pathname: "/request/[id]", params: { id: created.id, created: "1", reach: String(created.reach) } });
  }

  // قبل أول طلب لازم تكتمل بيانات الحساب (الخادم يرفض بـ profile_incomplete). نوجّهه بزر واضح بدل نموذج ما ينرسل.
  if (!profileComplete) {
    return (
      <Screen title={t("newRequestTitle")} back contentStyle={{ gap: spacing["3"] }}>
        <AppText variant="h2" weight={700}>
          {t("completeProfileFirst")}
        </AppText>
        <AppText color="inkMuted">{t("completeProfileFirstHint")}</AppText>
        <Button label={t("completeProfile")} variant="primary" size="lg" full onPress={() => router.push("/factory-profile")} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t("newRequestTitle")}
      back
      footer={<Button label={t("submitRequest")} icon={IconSend} variant="accent" size="lg" full onPress={submit} disabled={busy} />}
    >
      {restored && (
        <View style={{ gap: spacing["2"] }}>
          <Notice text={t("draftRestored")} />
          <Button label={t("draftDiscard")} variant="ghost" onPress={discardDraft} />
        </View>
      )}
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
      {(containsContactInfo(details) || containsContactInfo(area)) && <Notice icon={IconAlertTriangle} text={t("noContactInRequest")} />}

      <Field
        label={t(individual ? "areaLabelIndividual" : "areaLabel")}
        value={area}
        onChangeText={(v) => {
          setArea(v);
          if (errors.area) setErrors((e) => ({ ...e, area: undefined }));
        }}
        maxLength={120}
        error={errors.area}
      />
      <AppText variant="caption" color="inkMuted">
        {t(individual ? "areaHintIndividual" : "areaHint")}
      </AppText>
      <Field label={t("locationLabel")} value={location} onChangeText={setLocation} maxLength={200} />
      <AppText variant="caption" color="inkMuted">
        {t("locationHint")}
      </AppText>

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

      {submitError && (
        <AppText variant="bodySm" color="danger">
          {submitError}
        </AppText>
      )}

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
