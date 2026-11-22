// حسابي: بيانات المصنع وتعديلها، واللغة، والمظهر، والأجهزة المسجّل دخولها، والخروج.
import { spacing } from "@mazood/brand";
import { localMobile } from "@mazood/shared";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiRequestError } from "@/api/client";
import { useRevokeOtherSessions, useRevokeSession, useSessions } from "@/api/sessions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSession } from "@/api/session";
import { SkeletonList, useToast } from "@/components/feedback";
import { Field } from "@/components/Field";
import { IconDeviceMobile, IconInfoCircle, IconLogout } from "@/components/icons";
import { Screen, SectionTitle } from "@/components/layout";
import { AppText, Button, Card, Chips, Divider, Notice, Row } from "@/components/ui";
import { errorMessage } from "@/i18n/errors";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/lib/format";
import { useTheme, type ThemeMode } from "@/theme/ThemeProvider";

export default function Account() {
  const { t, locale, setLocale, digits, code } = useI18n();
  const { mode, setMode } = useTheme();
  const { me, config, signOut, saveFactory } = useSession();
  const factory = me?.factory;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", commercialRegister: "", vatNumber: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function startEdit() {
    setForm({
      name: factory?.name ?? "",
      location: factory?.location ?? "",
      commercialRegister: factory?.commercialRegister ?? "",
      vatNumber: factory?.vatNumber ?? "",
    });
    setErrors({});
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      await saveFactory(form);
      setEditing(false);
      toast.show(t("toastSaved"));
    } catch (err) {
      const field = err instanceof ApiRequestError && err.field ? err.field : "form";
      setErrors({ [field]: errorMessage(err, t) });
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Screen title={t("accountTitle")}>
      <Card style={{ gap: spacing["2"] }}>
        <AppText variant="caption" color="inkMuted">
          {t("factory")}
        </AppText>
        {editing ? (
          <View style={{ gap: spacing["3"] }}>
            <Field label={t("factoryNameLabel")} value={form.name} onChangeText={set("name")} maxLength={120} error={errors.name} />
            <Field label={t("factoryLocationLabel")} value={form.location} onChangeText={set("location")} maxLength={200} error={errors.location} />
            <Field label={t("crLabel")} value={form.commercialRegister} onChangeText={set("commercialRegister")} keyboardType="number-pad" maxLength={10} error={errors.commercialRegister} ltr />
            <Field label={t("vatLabel")} value={form.vatNumber} onChangeText={set("vatNumber")} keyboardType="number-pad" maxLength={15} error={errors.vatNumber} ltr />
            {errors.form && (
              <AppText variant="bodySm" color="danger">
                {errors.form}
              </AppText>
            )}
            <View style={{ flexDirection: "row", gap: spacing["2"] }}>
              <Button label={t("saveChanges")} variant="primary" loading={busy} onPress={save} />
              <Button label={t("cancel")} variant="ghost" onPress={() => setEditing(false)} />
            </View>
          </View>
        ) : (
          <>
            <AppText variant="h2">{factory?.name}</AppText>
            <AppText variant="bodySm" color="inkMuted">
              {factory?.location}
            </AppText>
            <AppText variant="bodySm" color="inkMuted" style={{ writingDirection: "ltr", textAlign: locale === "ar" ? "right" : "left" }}>
              {me ? digits(localMobile(me.phone)) : ""}
            </AppText>
            <Divider />
            <InfoRow label={t("commercialRegister")} value={factory?.commercialRegister ? code(factory.commercialRegister) : t("notProvided")} />
            <InfoRow label={t("vatNumber")} value={factory?.vatNumber ? code(factory.vatNumber) : t("notProvided")} />
            <Button label={t("editFactory")} variant="secondary" onPress={startEdit} />
          </>
        )}
      </Card>

      <SectionTitle title={t("language")} />
      <Chips<Locale>
        value={locale}
        onChange={setLocale}
        options={[
          { value: "ar", label: "العربية" },
          { value: "en", label: "English" },
        ]}
      />

      <SectionTitle title={t("appearance")} />
      <Chips<ThemeMode>
        value={mode}
        onChange={setMode}
        options={[
          { value: "system", label: t("themeSystem") },
          { value: "light", label: t("themeLight") },
          { value: "dark", label: t("themeDark") },
        ]}
      />

      <Devices />

      {config?.demoMode && <Notice icon={IconInfoCircle} text={t("demoNote")} />}

      <Button
        label={t("signOut")}
        variant="secondary"
        icon={IconLogout}
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      />
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing["2"] }}>
      <AppText variant="bodySm" color="inkMuted">
        {label}
      </AppText>
      <AppText variant="bodySm" style={{ writingDirection: "ltr" }}>
        {value}
      </AppText>
    </View>
  );
}

/** «أجهزتي»: الأجهزة الداخلة على الحساب، مع تسجيل خروج جهاز أو كل الأجهزة الأخرى. */
function Devices() {
  const { t, relative, isRTL } = useI18n();
  const { colors } = useTheme();
  const toast = useToast();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const [confirmOthers, setConfirmOthers] = useState(false);
  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current);

  return (
    <View style={{ gap: spacing["3"] }}>
      <SectionTitle title={t("devicesTitle")} />
      <AppText variant="bodySm" color="inkMuted">
        {t("devicesHint")}
      </AppText>
      {sessions.isPending ? (
        <SkeletonList count={1} />
      ) : (
        <Card style={{ gap: spacing["3"] }}>
          {list.map((s, i) => (
            <View key={s.id} style={{ gap: spacing["3"] }}>
              {i > 0 && <Divider />}
              <Row style={{ justifyContent: "space-between" }}>
                <Row style={{ flex: 1 }}>
                  <IconDeviceMobile size={20} color={colors.inkMuted} strokeWidth={1.75} />
                  <View style={{ flex: 1 }}>
                    {/* اسم الجهاز غالبًا بحروف لاتينية: نثبّت محاذاته مع اتجاه الواجهة. */}
                    <AppText variant="bodySm" weight={600} align={isRTL ? "right" : "left"}>
                      {s.deviceName ?? t("unknownDevice")}
                    </AppText>
                    <AppText variant="caption" color="inkMuted">
                      {s.current ? t("thisDevice") : t("lastActive", { time: relative(s.lastUsedAt) })}
                    </AppText>
                  </View>
                </Row>
                {!s.current && (
                  <Button
                    label={t("signOutDevice")}
                    variant="ghost"
                    tone="danger"
                    loading={revoke.isPending && revoke.variables === s.id}
                    onPress={() => revoke.mutate(s.id, { onSuccess: () => toast.show(t("toastDeviceSignedOut")) })}
                  />
                )}
              </Row>
            </View>
          ))}
        </Card>
      )}
      {others.length > 0 && <Button label={t("signOutOthers")} variant="secondary" onPress={() => setConfirmOthers(true)} />}
      <ConfirmDialog
        visible={confirmOthers}
        title={t("signOutOthersTitle")}
        body={t("signOutOthersBody")}
        confirmLabel={t("signOutOthers")}
        cancelLabel={t("keepRequest")}
        onCancel={() => setConfirmOthers(false)}
        onConfirm={() =>
          revokeOthers.mutate(undefined, {
            onSuccess: () => toast.show(t("toastOthersSignedOut")),
            onSettled: () => setConfirmOthers(false),
          })
        }
      />
    </View>
  );
}
