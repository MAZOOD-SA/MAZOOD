// الغلاف الرئيسي للتطبيق: الخط، والوضع الفاتح والداكن، واللغة، والبيانات.
// نستورد الأوزان الأربعة المستخدمة بس (400 و500 و600 و700) عشان يصغر حجم الموقع.
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_500Medium } from "@expo-google-fonts/ibm-plex-sans-arabic/500Medium";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OfflineBanner, PrototypeBanner } from "@/components/layout";
import { StoreProvider } from "@/data/store";
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
  const { isRTL } = useI18n();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, direction: isRTL ? "rtl" : "ltr" }}>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <PrototypeBanner />
      <OfflineBanner />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
      </View>
    </View>
  );
}
