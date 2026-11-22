// الغلاف الرئيسي للتطبيق: الخط، والوضع الفاتح والداكن، واللغة، والجلسة والاتصال بالخادم.
// نستورد الأوزان الأربعة المستخدمة بس (400 و500 و600 و700) عشان يصغر حجم الموقع.
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_500Medium } from "@expo-google-fonts/ibm-plex-sans-arabic/500Medium";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { useFonts } from "expo-font";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/api/session";
import { DemoBanner } from "@/components/layout";
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
          <SessionProvider>
            <Shell />
          </SessionProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { colors, name } = useTheme();
  const { isRTL } = useI18n();
  const { loading } = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, direction: isRTL ? "rtl" : "ltr" }}>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <DemoBanner />
      <View style={{ flex: 1 }}>
        {/* ننتظر نقرأ الجلسة المحفوظة قبل ما تفتح أي شاشة، عشان ما تطلب بيانات بدون رمز الدخول. */}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : (
          <>
            <AuthGuard />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
          </>
        )}
      </View>
    </View>
  );
}

/**
 * يرجّع للدخول أي شخص يفتح شاشة تحتاج دخول (مثل رابط طلب) وهو مو داخل.
 * هذا للراحة بس: الأمان الحقيقي في الخادم، اللي يرفض أي طلب بدون جلسة صالحة.
 */
function AuthGuard() {
  const { me } = useSession();
  const segments = useSegments();
  const first = segments[0] as string | undefined;
  const isPublic = first === undefined || first === "login";
  useEffect(() => {
    if (isPublic) return;
    if (!me) router.replace("/login");
    else if (!me.factory) router.replace({ pathname: "/login", params: { step: "profile" } });
  }, [me, isPublic]);
  return null;
}
