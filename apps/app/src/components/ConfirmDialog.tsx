// نافذة تأكيد قبل أي إجراء مهم (قبول عرض، إلغاء طلب). تشتغل بنفس الشكل في الموقع والجوال.
import { radius, spacing } from "@mazood/brand";
import { Modal, Pressable, View } from "react-native";
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
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  onCancel: () => void;
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
          style={{
            width: "100%",
            maxWidth: 400,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.line,
            padding: spacing["6"],
            gap: spacing["3"],
          }}
        >
          <AppText variant="h2">{title}</AppText>
          <AppText variant="bodySm" color="inkMuted">
            {body}
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing["2"], marginTop: spacing["2"] }}>
            <Button label={confirmLabel} variant={confirmVariant} onPress={onConfirm} />
            <Button label={cancelLabel} variant="ghost" onPress={onCancel} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
