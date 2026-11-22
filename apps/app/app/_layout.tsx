// الغلاف الرئيسي للتطبيق: الخط، والوضع الفاتح والداكن، واللغة، والبيانات.
// نستورد الأوزان الأربعة المستخدمة بس (400 و500 و600 و700) عشان يصغر حجم الموقع.
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_500Medium } from "@expo-google-fonts/ibm-plex-sans-arabic/500Medium";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OfflineBanner, PrototypeBanner } from "@/components/layout";
import { AccountCard, NavShell, navItemsFor } from "@/components/nav";
import { useSellerEnabled } from "@/components/market";
import { Button } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { can } from "@mazood/shared";
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

function Shell() {
  const { colors, name } = useTheme();
  const { isRTL, t, tl, digits } = useI18n();
  const { state, role, staffRole, factory, profileComplete, signOut } = useStore();
  // القائمة الجانبية (تابلت وكمبيوتر) للمستخدم الداخل، على كل الشاشات بما فيها التفاصيل.
  // جنب «طلباتي»: عدد العروض اللي ما انفتحت، عشان المصنع يعرف من أي شاشة إن فيه جديد.
  const newOffers = state.requests.reduce((n, r) => n + (r.newOfferCount ?? 0), 0);
  const seller = useSellerEnabled();
  const items = state.signedIn ? navItemsFor(role, t, (p) => can(staffRole, p), { newOffers, seller }) : [];
  const phone = state.phone ? digits(`0${state.phone.slice(4)}`) : "";
  const accountTitle = role === "factory" && profileComplete ? tl(factory.name) : phone;
  const roleLabel = role === "factory" ? t("factory") : role === "provider" ? t("providerAccount") : t("staffAccount");
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
