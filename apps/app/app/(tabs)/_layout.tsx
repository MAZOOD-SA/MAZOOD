// تنقّل العميل: الرئيسية، وطلباتي، والسوق، ومتجري (للمنشأة اللي فعّلت البيع)، وحسابي (خطة السوق، القسم ٥).
// الفواتير انتقلت داخل «حسابي» عشان التبويبات ما تزيد عن ٥.
// في الجوال تبويبات تحت، وفي التابلت والكمبيوتر القائمة الجانبية (NavShell في app/_layout.tsx) والتبويبات تختفي.
import { fontFamilyByWeight } from "@mazood/brand";
import { IconBuildingStore, IconClipboardList, IconHome, IconShoppingBag, IconUser } from "@/components/icons";
import { useSellerEnabled } from "@/components/market";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useLayout } from "@/lib/layout";
import { homeRouteFor } from "@/lib/home-route";
import { useI18n } from "@/i18n/I18nProvider";
import { useTheme } from "@/theme/ThemeProvider";

/** تبويب موجود (رابطه يشتغل) بس زرّه مخفي من الشريط. */
const HIDDEN = { tabBarButton: () => null, tabBarItemStyle: { display: "none" as const } };

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { state, ready, role } = useStore();
  const insets = useSafeAreaInsets();
  const { sidebar } = useLayout();
  const seller = useSellerEnabled();

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
      <Tabs.Screen name="shop" options={{ title: t("tabMarket"), tabBarIcon: ({ color }) => <IconShoppingBag size={22} color={color} strokeWidth={1.75} /> }} />
      {/* نخفي الزر بس (مو href: null)، عشان الرابط المباشر للشاشة يشتغل (مثل /invoices بعد تحديث الصفحة). */}
      <Tabs.Screen
        name="store"
        options={{ title: t("tabStore"), tabBarIcon: ({ color }) => <IconBuildingStore size={22} color={color} strokeWidth={1.75} />, ...(seller ? {} : HIDDEN) }}
      />
      <Tabs.Screen name="invoices" options={{ title: t("tabInvoices"), ...HIDDEN }} />
      <Tabs.Screen name="account" options={{ title: t("tabAccount"), tabBarIcon: ({ color }) => <IconUser size={22} color={color} strokeWidth={1.75} /> }} />
    </Tabs>
  );
}
