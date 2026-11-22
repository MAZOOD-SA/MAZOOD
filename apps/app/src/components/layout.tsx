// هيكل الشاشات: الغلاف، والعنوان مع زر الرجوع، والشريط التجريبي.
import { LIVE } from "@/api/client";
import { useServerReachable } from "@/api/connection";
import { layout, radius, spacing } from "@mazood/brand";
import { IconArrowLeft, IconArrowRight } from "@/components/icons";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n/I18nProvider";
import { useLayout } from "@/lib/layout";
import { useTheme } from "@/theme/ThemeProvider";
import { AppText } from "./ui";

/** أقصى عرض للنماذج والنصوص الطويلة (من التوكنز). */
export const CONTENT_MAX_WIDTH = layout.contentMax;

/** عرض المحتوى: content للنماذج والنصوص (٦٤٠)، وpage للقوائم والعمودين في الكمبيوتر. */
export type ScreenWidth = "content" | "page";

/** عرض المحتوى والهامش حسب المقاس الحالي. */
export function useContentFrame(width: ScreenWidth = "content"): ViewStyle {
  const l = useLayout();
  const maxWidth = width === "page" ? l.maxWidth : layout.contentMax;
  return { width: "100%", maxWidth: maxWidth + l.gutter * 2, alignSelf: "center", paddingHorizontal: l.gutter };
}

export function Screen({
  children,
  title,
  back,
  scroll = true,
  contentStyle,
  footer,
  width = "content",
  headerAction,
  onRefresh,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  width?: ScreenWidth;
  /** زر أو عنصر في طرف العنوان (مثل «اطلب عرض» في الكمبيوتر). */
  headerAction?: ReactNode;
  /** السحب للتحديث (في الجوال). */
  onRefresh?: () => Promise<unknown>;
}) {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      tintColor={colors.inkMuted}
      onRefresh={async () => {
        setRefreshing(true);
        await onRefresh();
        setRefreshing(false);
      }}
    />
  ) : undefined;
  const frame = useContentFrame(width);
  const inner: ViewStyle = { ...frame, paddingVertical: spacing["4"], gap: spacing["4"] };
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {title !== undefined && <ScreenHeader title={title} back={back} width={width} action={headerAction} />}
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, contentStyle]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
          {children}
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
          <View style={[frame, { paddingVertical: spacing["4"] }]}>{footer}</View>
        </View>
      )}
    </View>
  );
}

export function ScreenHeader({ title, back, width = "content", action }: { title: string; back?: boolean; width?: ScreenWidth; action?: ReactNode }) {
  const { colors } = useTheme();
  const frame = useContentFrame(width);
  const { isRTL, t } = useI18n();
  // سهم الرجوع يشير لبداية السطر: يمين في العربي، ويسار في الإنجليزي.
  const BackIcon = isRTL ? IconArrowRight : IconArrowLeft;
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface }}>
      <View style={[frame, { flexDirection: "row", alignItems: "center", gap: spacing["2"], paddingVertical: spacing["3"] }]}>
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("back")}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            hitSlop={8}
            style={{ padding: spacing["1"], borderRadius: radius.sm, minWidth: layout.touchMin, minHeight: layout.touchMin, justifyContent: "center", alignItems: "center" }}
          >
            <BackIcon size={24} color={colors.ink} strokeWidth={2} />
          </Pressable>
        )}
        <AppText variant="h2" style={{ flex: 1 }}>
          {title}
        </AppText>
        {action}
      </View>
    </View>
  );
}

/** شريط رفيع أعلى كل الشاشات يوضّح إن هذي نسخة تجريبية ببيانات وهمية. */
export function PrototypeBanner() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.accentSoft, paddingTop: insets.top + 4, paddingBottom: 4, alignItems: "center" }}>
      <AppText variant="caption" color="onAccentSoft" weight={600}>
        {LIVE ? t("testBanner") : t("prototypeBanner")}
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

/** شريط يظهر لما ما نقدر نوصل للخادم: البيانات المعروضة آخر نسخة محفوظة على الجهاز. */
export function OfflineBanner() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reachable = useServerReachable();
  if (!LIVE || reachable) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing["2"], alignItems: "center" }}>
      <AppText variant="caption" weight={600}>
        {t("offlineBanner")}
      </AppText>
    </View>
  );
}

/** مكان محجوز رمادي وقت التحميل (بدل شاشة فاضية). */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const frame = useContentFrame("page");
  return (
    <View accessibilityLabel={t("loading")} style={[frame, { paddingVertical: spacing["4"], gap: spacing["3"] }]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }} />
      ))}
    </View>
  );
}

/**
 * عمودين في الكمبيوتر: المحتوى الأساسي، والعمود الجانبي (الخط الزمني وبيانات الطلب) بعرض ثابت من التوكنز.
 * في الجوال والتابلت: تحت بعض (الأساسي أول).
 */
export function TwoColumn({ main, side }: { main: ReactNode; side: ReactNode }) {
  const { split } = useLayout();
  if (!split) {
    return (
      <View style={{ gap: spacing["4"] }}>
        {main}
        {side}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing["6"] }}>
      <View style={{ flex: 1, minWidth: 0, gap: spacing["4"] }}>{main}</View>
      <View style={{ width: layout.sideColumn, gap: spacing["4"] }}>{side}</View>
    </View>
  );
}

/**
 * شبكة بطاقات: عدد الأعمدة يتحدد من العرض الفعلي (minItemWidth لكل بطاقة) وبالكثير max.
 * في الجوال غالبًا عمود واحد.
 */
export function Grid({ children, minItemWidth = 240, max = 3 }: { children: ReactNode[]; minItemWidth?: number; max?: number }) {
  const [width, setWidth] = useState(0);
  const gap = spacing["3"];
  const cols = width ? Math.max(1, Math.min(max, Math.floor((width + gap) / (minItemWidth + gap)))) : 1;
  const itemWidth = width ? (width - gap * (cols - 1)) / cols : undefined;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {children.map((child, i) => (
        <View key={i} style={{ width: cols === 1 ? "100%" : itemWidth }}>
          {child}
        </View>
      ))}
    </View>
  );
}
