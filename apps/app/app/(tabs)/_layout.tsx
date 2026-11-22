// التبويبات السفلية للمصنع: الرئيسية (فيها الطلبات والتنبيهات)، والفواتير، وحسابي.
// كانت ٤ تبويبات في المرحلة ١، وانضم «طلباتي» للرئيسية حسب docs/product.md (القسم ٣).
import { fontFamilyByWeight } from "@mazood/brand";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/api/session";
import { IconFileInvoice, IconHome, IconUser } from "@/components/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { loading, me } = useSession();
  const insets = useSafeAreaInsets();

  // الشاشات هذي لمستخدم المصنع الداخل اللي كمّل بيانات مصنعه بس.
  // (الخادم يرفض أي طلب بدون جلسة صالحة، وهذا التحويل للراحة بس، مو للأمان.)
  if (loading) return null;
  if (!me) return <Redirect href="/login" />;
  if (!me.factory) return <Redirect href={{ pathname: "/login", params: { step: "profile" } }} />;

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
      <Tabs.Screen name="invoices" options={{ title: t("tabInvoices"), tabBarIcon: ({ color }) => <IconFileInvoice size={22} color={color} strokeWidth={1.75} /> }} />
      <Tabs.Screen name="account" options={{ title: t("tabAccount"), tabBarIcon: ({ color }) => <IconUser size={22} color={color} strokeWidth={1.75} /> }} />
    </Tabs>
  );
}
