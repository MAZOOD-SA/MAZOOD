// هيكل الشاشات: الغلاف، والعنوان مع زر الرجوع، والشريط التجريبي.
import { radius, spacing } from "@mazood/brand";
import { IconArrowLeft, IconArrowRight } from "@/components/icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { AppText } from "./ui";

/** أقصى عرض للمحتوى على الشاشات الكبيرة (الكمبيوتر)، عشان يبقى مريح للقراءة. */
export const CONTENT_MAX_WIDTH = 640;

export function Screen({
  children,
  title,
  back,
  scroll = true,
  contentStyle,
  footer,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const inner: ViewStyle = { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", padding: spacing["4"], gap: spacing["4"] };
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {title !== undefined && <ScreenHeader title={title} back={back} />}
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, contentStyle]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
          <View style={{ width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", padding: spacing["4"] }}>{footer}</View>
        </View>
      )}
    </View>
  );
}

export function ScreenHeader({ title, back }: { title: string; back?: boolean }) {
  const { colors } = useTheme();
  const { isRTL, t } = useI18n();
  // سهم الرجوع يشير لبداية السطر: يمين في العربي، ويسار في الإنجليزي.
  const BackIcon = isRTL ? IconArrowRight : IconArrowLeft;
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface }}>
      <View
        style={{
          width: "100%",
          maxWidth: CONTENT_MAX_WIDTH,
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: spacing["2"],
          paddingHorizontal: spacing["4"],
          paddingVertical: spacing["3"],
        }}
      >
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("back")}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            hitSlop={8}
            style={{ padding: spacing["1"], borderRadius: radius.sm }}
          >
            <BackIcon size={24} color={colors.ink} strokeWidth={2} />
          </Pressable>
        )}
        <AppText variant="h2" style={{ flex: 1 }}>
          {title}
        </AppText>
      </View>
    </View>
  );
}

/** شريط رفيع أعلى كل الشاشات يوضّح إن هذي نسخة تطوير، وإن العروض والفواتير تجريبية. */
export function PrototypeBanner() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.accentSoft, paddingTop: insets.top + 4, paddingBottom: 4, alignItems: "center" }}>
      <AppText variant="caption" color="onAccentSoft" weight={600}>
        {t("prototypeBanner")}
      </AppText>
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <AppText variant="body" weight={600}>
        {title}
      </AppText>
      {action}
    </View>
  );
}
