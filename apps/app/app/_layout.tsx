// الغلاف الرئيسي للتطبيق: الخط، والوضع الفاتح والداكن، واللغة، والبيانات.
// نستورد الأوزان الأربعة المستخدمة بس (400 و500 و600 و700) عشان يصغر حجم الموقع.
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_500Medium } from "@expo-google-fonts/ibm-plex-sans-arabic/500Medium";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { useFonts } from "expo-font";
import { router, Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OfflineBanner, PrototypeBanner } from "@/components/layout";
import { AccountCard, LanguageThemeTools, NavShell, SidebarTool, navItemsFor } from "@/components/nav";
import { useSellerEnabled } from "@/components/market";
import { Button } from "@/components/ui";
import { IconHelpCircle, IconPlus } from "@/components/icons";
import { useCan } from "@/data/useAdmin";
import { CATEGORIES, categoryById, type CategoryId } from "@/data/categories";
import type { ProviderView } from "@/data/provider-types";
import type { OpenRequest } from "@/api/types";
import { useLayout } from "@/lib/layout";
import { nextStep } from "@/lib/next-step";
import { StoreProvider, useStore } from "@/data/store";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <StoreProvider>
            <Shell />
          </StoreProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * بيانات المزوّد اللي تحتاجها القائمة الجانبية: أقسامه، ومستنداته القريبة من الانتهاء، والطلبات اللي ما رد عليها.
 * Shell برا الـStack، فما نقدر نستخدم useFocusEffect: نعيد الجلب كل ما تغيّر المسار بدالها.
 * ما تشتغل إلا للمزوّد وفي المقاسات اللي فيها قائمة جانبية (الجوال ما يحتاجها).
 */
function useSidebarProviderData(enabled: boolean) {
  const { authed } = useStore();
  const pathname = usePathname();
  const [data, setData] = useState<{ provider: ProviderView | null; open: OpenRequest[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all([
      authed<{ provider: ProviderView | null }>("/v1/provider/me"),
      authed<{ requests: OpenRequest[] }>("/v1/provider/requests"),
    ])
      .then(([me, reqs]) => alive && setData({ provider: me.provider, open: reqs.requests }))
      .catch(() => {
        // القائمة تكمل بدون البطاقة والأقسام لو تعذّر الجلب، والشاشة نفسها تعرض الخطأ.
      });
    return () => {
      alive = false;
    };
  }, [enabled, authed, pathname]);
  return enabled ? data : null;
}

function Shell() {
  const { colors, name } = useTheme();
  const { isRTL, t, tl, digits } = useI18n();
  const { state, role, staffRole, factory, profileComplete, signOut } = useStore();
  // القائمة الجانبية (تابلت وكمبيوتر) للمستخدم الداخل، على كل الشاشات بما فيها التفاصيل.
  // جنب «طلباتي»: عدد العروض اللي ما انفتحت والرسائل اللي ما انقرت، عشان المصنع يعرف من أي شاشة إن فيه جديد.
  const newOffers = state.requests.reduce((n, r) => n + (r.newOfferCount ?? 0) + (r.unreadMessages ?? 0), 0);
  const seller = useSellerEnabled();
  const allowed = useCan();
  const items = state.signedIn ? navItemsFor(role, t, allowed, { newOffers, seller }) : [];
  const phone = state.phone ? digits(`0${state.phone.slice(4)}`) : "";
  const accountTitle = role === "factory" && profileComplete ? tl(factory.name) : phone;
  const roleLabel = role === "factory" ? t("factory") : role === "provider" ? t("providerAccount") : t("staffAccount");
  const { sidebar } = useLayout();
  const providerData = useSidebarProviderData(state.signedIn && role === "provider" && sidebar);
  const next = state.signedIn
    ? nextStep({
        role,
        profileComplete,
        newOffers,
        newRequests: providerData?.open.filter((r) => !r.myOffer).length ?? 0,
        expiring: providerData?.provider?.expiring ?? [],
        today: new Date().toISOString().slice(0, 10),
      })
    : null;
  // الأقسام: العميل يشوف السبعة ويفتح طلب جديد في القسم، والمزوّد يشوف أقسامه ويفلتر الطلبات المتاحة.
  const sidebarCategories =
    role === "factory"
      ? CATEGORIES.map((c) => ({ category: c, onPress: () => router.push({ pathname: "/request/new", params: { category: c.id } }) }))
      : role === "provider"
        ? ((providerData?.provider?.categories ?? []) as CategoryId[]).map((id) => ({
            category: categoryById(id),
            onPress: () => router.navigate({ pathname: "/provider/requests", params: { category: id } }),
          }))
        : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, direction: isRTL ? "rtl" : "ltr" }}>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <PrototypeBanner />
      <OfflineBanner />
      <View style={{ flex: 1 }}>
        <NavShell
          items={items}
          // «طلب جديد» زر عادي (مو كهرماني)، لأن الكهرماني واحد بس في الشاشة وهو «اطلب عرض» في الرئيسية.
          action={role === "factory" ? <Button label={t("newRequestShort")} icon={IconPlus} variant="secondary" full onPress={() => router.push("/request/new")} /> : undefined}
          next={next}
          categories={sidebarCategories}
          tools={
            <LanguageThemeTools>
              <SidebarTool icon={IconHelpCircle} label={t("help")} onPress={() => router.navigate("/help")} />
            </LanguageThemeTools>
          }
          footer={
            <AccountCard
              title={accountTitle}
              subtitle={roleLabel}
              onSignOut={async () => {
                await signOut();
                router.replace("/login");
              }}
            />
          }
        >
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
        </NavShell>
      </View>
    </View>
  );
}
