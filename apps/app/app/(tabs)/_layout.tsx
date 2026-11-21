// التبويبات السفلية للمصنع: الرئيسية، وطلباتي، والفواتير، وحسابي (كما في brand/reference.html).
import { fontFamilyByWeight } from "@mazood/brand";
import { IconClipboardList, IconFileInvoice, IconHome, IconUser } from "@/components/icons";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { state, me } = useAuth();
  const insets = useSafeAreaInsets();

  // الشاشات هذي للمستخدم الداخل اللي كمّل بيانات مصنعه بس.
  // (هذا للتنقل فقط: الخادم نفسه يرفض أي طلب بدون جلسة صالحة.)
  if (state.status === "loading") return null;
  if (!me) return <Redirect href="/login" />;
  if (!me.factory) return <Redirect href="/complete-profile" />;

  return (
    <Tabs
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
