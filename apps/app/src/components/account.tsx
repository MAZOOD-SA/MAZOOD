// أجزاء «حسابي» المشتركة بين المصنع والمزوّد: اللغة، والمظهر، و«اطلب حذف الحساب»، والخروج.
import { spacing } from "@mazood/brand";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import type { DeletionRequest } from "@/api/types";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/lib/format";
import { useTheme, type ThemeMode } from "@/theme/ThemeProvider";
import { ConfirmDialog } from "./ConfirmDialog";
import { Field } from "./Field";
import { IconLogout, IconTrash } from "./icons";
import { SectionTitle } from "./layout";
import { AppText, Button, Card, Chips, Notice } from "./ui";

export function PreferencesSection() {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  return (
    <View style={{ gap: spacing["3"] }}>
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
    </View>
  );
}

/**
 * «اطلب حذف الحساب» (قرار المالك، 22 نوفمبر 2026): الطلب يوصل للوحة الإدارة، والبيانات الشخصية تنمسح،
 * والفواتير والسجل تنحفظ (نظام حماية البيانات الشخصية يسمح بحفظ اللي يلزم نظامًا). ما ينمسح شي فورًا.
 */
export function DeleteAccountSection() {
  const { t, date } = useI18n();
  const { authed } = useStore();
  const [request, setRequest] = useState<DeletionRequest | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authed<{ request: DeletionRequest }>("/v1/account/deletion")
      .then((r) => setRequest(r.request))
      .catch(() => setRequest(null));
  }, [authed]);

  if (request === undefined) return null;
  if (request?.status === "pending") return <Notice text={t("deletionPending", { date: date(request.requestedAt) })} />;

  return (
    <>
      <Button label={t("requestDeletion")} icon={IconTrash} variant="ghost" tone="danger" onPress={() => setOpen(true)} />
      <ConfirmDialog
        visible={open}
        title={t("requestDeletion")}
        body={t("deletionBody")}
        confirmLabel={t("sendDeletion")}
        cancelLabel={t("back")}
        busy={busy}
        error={error}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await authed<{ request: DeletionRequest }>("/v1/account/deletion", { method: "POST", body: reason.trim() ? { reason: reason.trim() } : {} });
            setRequest(r.request);
            setOpen(false);
          } catch (e) {
            setError(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
          }
          setBusy(false);
        }}
      >
        <Field label={t("reasonOptional")} value={reason} onChangeText={setReason} multiline maxLength={500} />
      </ConfirmDialog>
    </>
  );
}

export function SignOutButton() {
  const { t } = useI18n();
  const { signOut } = useStore();
  return (
    <Button
      label={t("signOut")}
      variant="secondary"
      icon={IconLogout}
      onPress={async () => {
        await signOut();
        router.replace("/login");
      }}
    />
  );
}

/** بطاقة بسيطة بعنوان صغير. */
export function InfoCard({ caption, title, children }: { caption: string; title: string; children?: React.ReactNode }) {
  return (
    <Card style={{ gap: spacing["2"] }}>
      <AppText variant="caption" color="inkMuted">
        {caption}
      </AppText>
      <AppText variant="h2">{title}</AppText>
      {children}
    </Card>
  );
}
