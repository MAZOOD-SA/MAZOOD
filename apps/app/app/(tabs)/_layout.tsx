// تنقّل المصنع: الرئيسية، وطلباتي، والفواتير، وحسابي (كما في brand/reference.html).
// في الجوال تبويبات تحت، وفي التابلت والكمبيوتر القائمة الجانبية (NavShell في app/_layout.tsx) والتبويبات تختفي.
import { fontFamilyByWeight } from "@mazood/brand";
import { IconClipboardList, IconFileInvoice, IconHome, IconUser } from "@/components/icons";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useLayout } from "@/lib/layout";
import { homeRouteFor } from "@/lib/home-route";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { state, ready, role } = useStore();
  const insets = useSafeAreaInsets();
  const { sidebar } = useLayout();

  // الشاشات هذي للمستخدم الداخل بس.
  if (!ready) return null;
  if (!state.signedIn) return <Redirect href="/login" />;
  // شاشات المصنع للمصنع بس. المزوّد والموظف يروحون لشاشاتهم.
  if (role && role !== "factory") return <Redirect href={homeRouteFor(role)} />;

  return (
    <Tabs
      tabBar={sidebar ? () => null : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkMuted,
        // خط IBM Plex العربي أطول من الخطوط العادية، فنعطي الشريط ارتفاع كافي عشان ما تنقص الكلمات.
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 66 + insets.bottom, paddingTop: 4, paddingBottom: 4 + insets.bottom },
        tabBarLabelStyle: { fontFamily: fontFamilyByWeight[600], fontSize: 11, lineHeight: 16 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t("tabHome"), tabBarIcon: ({ color }) => <IconHome size={22} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="requests" options={{ title: t("tabRequests"), tabBarIcon: ({ color }) => <IconClipboardList size={22} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="invoices" options={{ title: t("tabInvoices"), tabBarIcon: ({ color }) => <IconFileInvoice size={22} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="account" options={{ title: t("tabAccount"), tabBarIcon: ({ color }) => <IconUser size={22} color={color} strokeWidth={1.75} /> }} />
    </Tabs>
  );
}
