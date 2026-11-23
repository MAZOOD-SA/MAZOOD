// تبويبات المزوّد بعد التوثيق: الطلبات المتاحة، وشغلي، والسوق (القرار ٥٧)، وحسابي (docs/plans/phase-4.md، القسم ٦).
// قبل التوثيق ما يوصل هنا: يرجع لشاشة حالة التوثيق (/provider)، وهي الشاشة الوحيدة له.
// في التابلت والكمبيوتر التبويبات تختفي والقائمة الجانبية (app/_layout.tsx) تاخذ مكانها.
import { fontFamilyByWeight } from "@mazood/brand";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconBriefcase, IconListDetails, IconShoppingBag, IconUser } from "@/components/icons";
import { SkeletonList } from "@/components/layout";
import { useProvider } from "@/data/useProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { useLayout } from "@/lib/layout";
import { useTheme } from "@/theme/ThemeProvider";

export default function ProviderTabs() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { sidebar } = useLayout();
  const insets = useSafeAreaInsets();
  const { provider } = useProvider();
  if (provider === undefined) return <SkeletonList />;
  if (!provider?.verified) return <Redirect href="/provider" />;
  return (
    <Tabs
      tabBar={sidebar ? () => null : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 66 + insets.bottom, paddingTop: 4, paddingBottom: 4 + insets.bottom },
        tabBarLabelStyle: { fontFamily: fontFamilyByWeight[600], fontSize: 11, lineHeight: 16 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="requests" options={{ title: t("tabAvailable"), tabBarIcon: ({ color }) => <IconListDetails size={22} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="work" options={{ title: t("tabWork"), tabBarIcon: ({ color }) => <IconBriefcase size={22} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="market" options={{ title: t("tabMarket"), tabBarIcon: ({ color }) => <IconShoppingBag size={22} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="account" options={{ title: t("tabAccount"), tabBarIcon: ({ color }) => <IconUser size={22} color={color} strokeWidth={1.75} /> }} />
    </Tabs>
  );
}
