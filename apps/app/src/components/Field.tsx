// حقل إدخال بتسمية ورسالة خطأ، بألوان الهوية.
import { fontFamilyByWeight, radius, spacing, typography } from "@mazood/brand";
import type { ComponentProps } from "react";
import { TextInput, View } from "react-native";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AppText } from "./ui";

/** حقل إدخال بتسمية ورسالة خطأ. */
export function Field({
  label,
  error,
  ltr,
  multiline,
  ...rest
}: ComponentProps<typeof TextInput> & { label: string; error?: string | null; ltr?: boolean }) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  return (
    <View style={{ gap: spacing["1"] }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        {...rest}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.inkMuted}
        style={{
          fontFamily: fontFamilyByWeight[400],
          fontSize: typography.body.fontSize,
          color: colors.ink,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.lineStrong,
          borderRadius: radius.md,
          paddingHorizontal: spacing["3"],
          paddingVertical: 10,
          minHeight: multiline ? 104 : undefined,
          textAlignVertical: multiline ? "top" : "center",
          // أرقام الجوال والرموز تُكتب من اليسار لليمين حتى في العربي.
          textAlign: ltr ? (isRTL ? "right" : "left") : undefined,
          writingDirection: ltr ? "ltr" : undefined,
        }}
      />
      {error && (
        <AppText variant="bodySm" color="danger">
          {error}
        </AppText>
      )}
    </View>
  );
}
