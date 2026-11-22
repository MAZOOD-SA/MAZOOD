// التبويبات السفلية للمصنع في الجوال: الرئيسية، وطلباتي، والتنبيهات، والفواتير، وحسابي.
// في التابلت والكمبيوتر تختفي، والقائمة الجانبية تقوم مقامها (app/(factory)/_layout.tsx).
// العناصر نفسها من FACTORY_NAV في src/lib/nav.ts، عشان القائمتين ما يختلفون.
import { fontFamilyByWeight, layout } from "@mazood/brand";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useI18n } from "@/i18n/I18nProvider";
import { FACTORY_NAV } from "@/lib/nav";
import { useLayout } from "@/lib/useLayout";
import { useTheme } from "@/theme/ThemeProvider";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t, num } = useI18n();
  const { state } = useStore();
  const { hasSidebar } = useLayout();
  const insets = useSafeAreaInsets();
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <Tabs
      tabBar={hasSidebar ? () => null : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkMuted,
        // خط IBM Plex العربي أطول من الخطوط العادية، فنعطي الشريط ارتفاع كافي عشان ما تنقص الكلمات.
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: layout.tabbarHeight + insets.bottom, paddingTop: 4, paddingBottom: 4 + insets.bottom },
        tabBarLabelStyle: { fontFamily: fontFamilyByWeight[600], fontSize: 11, lineHeight: 16 },
        tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onAccent, fontFamily: fontFamilyByWeight[700], fontSize: 11 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      {FACTORY_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <Tabs.Screen
            key={item.key}
            name={item.key}
            options={{
              title: t(item.label),
              tabBarIcon: ({ color, focused }) => <Icon size={22} color={color} strokeWidth={focused ? 2 : 1.75} />,
              tabBarBadge: item.key === "notifications" && unread > 0 ? num(unread) : undefined,
            }}
          />
        );
      })}
    </Tabs>
  );
}
