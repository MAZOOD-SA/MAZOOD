// التنقّل: القائمة الجانبية للتابلت والكمبيوتر (تنطوي وتنفتح بحركة)، والغلاف اللي يحطها جنب المحتوى.
// في الجوال ما فيه قائمة جانبية: التبويبات تحت (app/(factory)/(tabs)/_layout.tsx).
// مكان القائمة: على يمين الشاشة في العربي وعلى يسارها في الإنجليزي، لأن الغلاف يتبع اتجاه اللغة.
// كل الألوان والمقاسات ومدة الحركة من @mazood/brand. ممنوع أي رقم أو لون مباشر للهوية هنا.
import { fontFamilyByWeight, layout, motion, radius, spacing, typography } from "@mazood/brand";
import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from "@/components/icons";
import { LogoMark } from "@/components/Logo";
import { useI18n } from "@/i18n/I18nProvider";
import { activeKey, type NavItem } from "@/lib/nav";
import { loadPref, savePref } from "@/lib/prefs";
import { useLayout } from "@/lib/useLayout";
import { useTheme } from "@/theme/ThemeProvider";
import { AppText } from "./ui";

// حالة الضغط في الموقع فيها hovered وfocused، وأنواع React Native ما تذكرهم.
type InteractionState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** يحط القائمة الجانبية جنب المحتوى في التابلت والكمبيوتر. في الجوال يرجع المحتوى بس. */
export function NavShell({
  items,
  footerItems = [],
  badges,
  children,
}: {
  items: NavItem[];
  footerItems?: NavItem[];
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  const { hasSidebar } = useLayout();
  // نفس ترتيب العناصر دائمًا (القائمة قبل المحتوى)، عشان تغيير المقاس ما يعيد بناء الشاشات ويضيّع مكان المستخدم.
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      {hasSidebar ? <Sidebar items={items} footerItems={footerItems} badges={badges} /> : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** حالة الطي: اختيار المستخدم محفوظ على جهازه، وبدونه تكون منطوية في التابلت ومفتوحة في الكمبيوتر. */
function useCollapsed(): [boolean, (v: boolean) => void] {
  const { size } = useLayout();
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => {
    loadPref("sidebar").then((v) => {
      if (v === "collapsed" || v === "expanded") setSaved(v === "collapsed");
    });
  }, []);
  const collapsed = saved ?? size === "tablet";
  return [
    collapsed,
    (v) => {
      setSaved(v);
      savePref("sidebar", v ? "collapsed" : "expanded");
    },
  ];
}

/** لو المستخدم طالب تقليل الحركة من إعدادات جهازه، القائمة تنطوي بدون حركة. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

function Sidebar({ items, footerItems, badges }: { items: NavItem[]; footerItems: NavItem[]; badges?: Record<string, number> }) {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useCollapsed();
  const reducedMotion = useReducedMotion();
  const active = activeKey(pathname, [...items, ...footerItems]);

  const width = useRef(new Animated.Value(collapsed ? layout.sidebarCollapsed : layout.sidebarExpanded)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: collapsed ? layout.sidebarCollapsed : layout.sidebarExpanded,
      duration: reducedMotion ? 0 : motion.durationBase,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // العرض ما ينحرّك بالمحرك الأصلي
    }).start();
  }, [collapsed, reducedMotion, width]);
  // النصوص تختفي تدريجيًا مع الطي، وتطلع مع الفتح.
  const labelOpacity = width.interpolate({
    inputRange: [layout.sidebarCollapsed, layout.sidebarExpanded],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // الأيقونة تتبع جهة القائمة: يمين في العربي، ويسار في الإنجليزي.
  const ToggleIcon = isRTL
    ? collapsed
      ? IconLayoutSidebarRightExpand
      : IconLayoutSidebarRightCollapse
    : collapsed
      ? IconLayoutSidebarLeftExpand
      : IconLayoutSidebarLeftCollapse;

  const renderItem = (item: NavItem) => (
    <SidebarItem
      key={item.key}
      item={item}
      active={active === item.key}
      collapsed={collapsed}
      labelOpacity={labelOpacity}
      badge={badges?.[item.key] ?? 0}
    />
  );

  return (
    <Animated.View
      accessibilityRole="navigation"
      accessibilityLabel={t("navMain")}
      style={{
        width,
        backgroundColor: colors.surface,
        // الخط الفاصل على جهة المحتوى (نهاية السطر)، فيتبع اتجاه اللغة.
        borderEndWidth: 1,
        borderEndColor: colors.line,
        paddingTop: spacing["3"],
        paddingBottom: spacing["3"] + insets.bottom,
        paddingHorizontal: spacing["3"],
        gap: spacing["1"],
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"], minHeight: layout.touchMin, marginBottom: spacing["3"] }}>
        {!collapsed && (
          <Animated.View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing["2"], opacity: labelOpacity, paddingStart: spacing["2"] }}>
            <LogoMark size={28} />
            <AppText variant="h2" numberOfLines={1}>
              {t("appName")}
            </AppText>
          </Animated.View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? t("navExpand") : t("navCollapse")}
          accessibilityState={{ expanded: !collapsed }}
          onPress={() => setCollapsed(!collapsed)}
          style={(s) => {
            const { hovered, pressed, focused } = s as InteractionState;
            return {
              width: layout.touchMin,
              height: layout.touchMin,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.md,
              backgroundColor: hovered || pressed ? colors.surfaceAlt : "transparent",
              ...focusRing(focused, colors.ink),
            };
          }}
        >
          <ToggleIcon size={22} color={colors.inkMuted} strokeWidth={1.75} />
        </Pressable>
      </View>

      {items.map(renderItem)}

      <View style={{ flex: 1 }} />
      {footerItems.length > 0 && <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing["2"] }} />}
      {footerItems.map(renderItem)}
    </Animated.View>
  );
}

function SidebarItem({
  item,
  active,
  collapsed,
  labelOpacity,
  badge,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  labelOpacity: Animated.AnimatedInterpolation<number>;
  badge: number;
}) {
  const { colors } = useTheme();
  const { t, num, isRTL } = useI18n();
  const Icon = item.icon;
  const label = t(item.label);
  const color = active ? colors.ink : colors.inkMuted;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={badge > 0 ? `${label} (${num(badge)})` : label}
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (!active) router.navigate(item.href as never);
      }}
      style={(s) => {
        const { hovered, pressed, focused } = s as InteractionState;
        return {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing["3"],
          minHeight: layout.touchMin,
          paddingHorizontal: spacing["3"],
          borderRadius: radius.md,
          backgroundColor: active || hovered || pressed ? colors.surfaceAlt : "transparent",
          ...focusRing(focused, colors.ink),
        };
      }}
    >
      {/* شريط كهرماني رفيع على حافة الشاشة للعنصر المحدد. الكهرماني هنا خلفية مو نص (قاعدة ٢). */}
      {active && (
        <View
          style={[
            { position: "absolute", top: spacing["2"], bottom: spacing["2"], width: 3, borderRadius: radius.full, backgroundColor: colors.accent },
            isRTL ? { right: 0 } : { left: 0 },
          ]}
        />
      )}
      <View>
        <Icon size={22} color={color} strokeWidth={active ? 2 : 1.75} />
        {badge > 0 && collapsed && (
          <View style={{ position: "absolute", top: -2, end: -2, width: 9, height: 9, borderRadius: radius.full, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surface }} />
        )}
      </View>
      {!collapsed && (
        <Animated.View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing["2"], opacity: labelOpacity }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: fontFamilyByWeight[active ? 600 : 500],
              fontSize: typography.label.fontSize,
              lineHeight: typography.label.lineHeight,
              color,
            }}
          >
            {label}
          </Text>
          {badge > 0 && <CountBadge count={badge} />}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** عدد صغير (مثل التنبيهات غير المقروءة): خلفية كهرمانية والنص بلون on-accent. */
export function CountBadge({ count }: { count: number }) {
  const { colors } = useTheme();
  const { num } = useI18n();
  return (
    <View style={{ minWidth: 20, paddingHorizontal: spacing["1"], borderRadius: radius.full, backgroundColor: colors.accent, alignItems: "center" }}>
      <Text style={{ fontFamily: fontFamilyByWeight[700], fontSize: typography.caption.fontSize, lineHeight: typography.caption.lineHeight, color: colors.onAccent }}>
        {num(count > 99 ? 99 : count)}
      </Text>
    </View>
  );
}

// الإطار يطلع لما يتنقّل المستخدم بالكيبورد (Tab) بس، مو لما يضغط بالماوس.
let usingKeyboard = false;
if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => { if (e.key === "Tab") usingKeyboard = true; }, true);
  window.addEventListener("mousedown", () => { usingKeyboard = false; }, true);
}

/** إطار واضح على العنصر اللي عليه التركيز بالكيبورد في الموقع. */
function focusRing(focused: boolean | undefined, color: string): ViewStyle {
  return focused && usingKeyboard ? ({ outlineWidth: 2, outlineStyle: "solid", outlineColor: color, outlineOffset: 1 } as ViewStyle) : {};
}
