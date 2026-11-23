// مكوّنات مشتركة لشاشات لوحة الإدارة: فتح ملف برابط مؤقت، ونافذة «اكتب السبب»، وبطاقة رقم، ورسم النمو.
// كل الألوان من التوكنز (CLAUDE.md، القاعدة ١).
import { radius, spacing } from "@mazood/brand";
import { useState, type ReactNode } from "react";
import { Linking, Platform, View } from "react-native";
import { API_URL, ApiClientError } from "@/api/client";
import { errorKey } from "@/api/mapping";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Field } from "@/components/Field";
import { IconExternalLink } from "@/components/icons";
import { AppText, Button, Card, Notice } from "@/components/ui";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

/** زر يطلب رابط مؤقت من الخادم ويفتح الملف (السجل أو الهوية). الفتح ينسجل في الخادم. */
export function OpenFileButton({ linkPath, label }: { linkPath: string; label: string }) {
  const { t } = useI18n();
  const { authed } = useStore();
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <View style={{ gap: spacing["1"] }}>
      <Button
        label={label}
        icon={IconExternalLink}
        variant="secondary"
        onPress={async () => {
          // في المتصفح نفتح التبويب فورًا (قبل انتظار الخادم)، وإلا يحجبه مانع النوافذ المنبثقة.
          const tab = Platform.OS === "web" ? window.open("about:blank", "_blank") : null;
          try {
            const link = await authed<{ path?: string; url?: string }>(linkPath);
            const url = `${API_URL ?? ""}${link.path ?? link.url ?? ""}`;
            if (tab) {
              tab.opener = null;
              tab.location.href = url;
            } else await Linking.openURL(url);
          } catch (e) {
            tab?.close();
            setFailure(t(errorKey(e instanceof ApiClientError ? e.code : "server")));
          }
        }}
      />
      {failure && (
        <AppText variant="bodySm" color="danger">
          {failure}
        </AppText>
      )}
    </View>
  );
}

/**
 * نافذة تطلب سبب قبل الإجراء (رفض، إخفاء، إيقاف، قرار). السبب يوصل للطرف الثاني أو ينحفظ في السجل.
 * onSubmit يرجّع true لو نجح، والنافذة تنقفل.
 */
export function ReasonDialog({
  visible,
  title,
  confirmLabel,
  minLength = 5,
  danger,
  busy,
  error,
  onSubmit,
  onCancel,
  children,
}: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  minLength?: number;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (reason: string) => Promise<boolean>;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      visible={visible}
      title={title}
      confirmLabel={confirmLabel}
      cancelLabel={t("cancelAction")}
      confirmVariant={danger ? "secondary" : "primary"}
      busy={busy}
      error={error}
      confirmDisabled={reason.trim().length < minLength}
      onCancel={() => {
        setReason("");
        onCancel();
      }}
      onConfirm={async () => {
        if (await onSubmit(reason.trim())) setReason("");
      }}
    >
      {children}
      <Field label={t("reasonLabel")} value={reason} onChangeText={setReason} multiline maxLength={500} placeholder={t("reasonPlaceholder")} />
    </ConfirmDialog>
  );
}

/** رسائل نتيجة الإجراء: نجاح أو سبب الرفض. */
export function ActionNotices({ error, failure, done }: { error?: string | null; failure?: string | null; done?: string | null }) {
  return (
    <>
      {error && <Notice text={error} />}
      {failure && <Notice text={failure} />}
      {done && <Notice text={done} />}
    </>
  );
}

/** بطاقة رقم: العنوان، والرقم كبير، وسطر صغير تحته (مقارنة بالشهر اللي قبله مثلًا). */
export function StatTile({ label, value, sub, onPress }: { label: string; value: string; sub?: string; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={{ gap: spacing["1"], flexGrow: 1, flexBasis: 160 }}>
      <AppText variant="bodySm" color="inkMuted">
        {label}
      </AppText>
      <AppText variant="h2" weight={700}>
        {value}
      </AppText>
      {sub ? (
        <AppText variant="caption" color="inkMuted">
          {sub}
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * رسم أعمدة بسيط للنمو شهر بشهر (بدون مكتبة رسم). الشهر الحالي بلون النص الأساسي، والباقي أخف.
 * كل عمود له وصف للقارئ الصوتي (الشهر والرقم).
 */
export function MonthBars({ data, caption }: { data: { month: string; value: number }[]; caption: string }) {
  const { colors } = useTheme();
  const { num, digits } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.value));
  const HEIGHT = 120;
  return (
    <Card style={{ gap: spacing["2"] }}>
      <AppText variant="bodySm" color="inkMuted">
        {caption}
      </AppText>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing["1"], height: HEIGHT + 20 }}>
        {data.map((d, i) => {
          const current = i === data.length - 1;
          return (
            <View key={d.month} accessible accessibilityLabel={`${digits(d.month)}: ${num(d.value)}`} style={{ flex: 1, alignItems: "center", gap: 2 }}>
              <AppText variant="caption" color="inkMuted" numberOfLines={1}>
                {d.value > 0 ? num(d.value) : ""}
              </AppText>
              <View
                style={{
                  width: "100%",
                  maxWidth: 28,
                  height: Math.max(2, Math.round((d.value / max) * HEIGHT)),
                  borderTopLeftRadius: radius.sm,
                  borderTopRightRadius: radius.sm,
                  backgroundColor: current ? colors.ink : colors.lineStrong,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: spacing["1"] }}>
        {data.map((d) => (
          <AppText key={d.month} variant="caption" color="inkMuted" align="center" style={{ flex: 1 }} numberOfLines={1}>
            {digits(d.month.slice(5))}
          </AppText>
        ))}
      </View>
    </Card>
  );
}
