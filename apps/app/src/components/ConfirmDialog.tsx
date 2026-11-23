// نافذة تأكيد قبل أي إجراء مهم (قبول عرض، إلغاء طلب). تشتغل بنفس الشكل في الموقع والجوال.
// فيها مكان لحقول (children) للنوافذ اللي تطلب سبب أو سعر. Esc يقفلها في الموقع (onRequestClose).
import { radius, spacing } from "@mazood/brand";
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { AppText, Button, type ButtonVariant } from "./ui";

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  confirmVariant = "primary",
  onConfirm,
  onCancel,
  children,
  busy,
  error,
  confirmDisabled,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  busy?: boolean;
  error?: string | null;
  confirmDisabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* الخلفية المعتمة: الكحلي بشفافية، من التوكنز */}
      <Pressable
        accessibilityLabel={cancelLabel}
        onPress={onCancel}
        style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: spacing["6"] }}
      >
        <View style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.navy, opacity: 0.5 }} />
        <Pressable
          onPress={() => {}}
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 440,
            maxHeight: "90%",
            backgroundColor: colors.surfaceRaised,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.line,
            padding: spacing["6"],
            gap: spacing["3"],
          }}
        >
          <ScrollView contentContainerStyle={{ gap: spacing["3"] }} keyboardShouldPersistTaps="handled">
            <AppText variant="h2">{title}</AppText>
            {!!body && (
              <AppText variant="bodySm" color="inkMuted">
                {body}
              </AppText>
            )}
            {children}
            {!!error && (
              <AppText variant="bodySm" color="danger">
                {error}
              </AppText>
            )}
          </ScrollView>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing["2"], marginTop: spacing["2"] }}>
            <Button label={confirmLabel} variant={confirmVariant} onPress={onConfirm} loading={busy} disabled={confirmDisabled} />
            <Button label={cancelLabel} variant="ghost" onPress={onCancel} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
