// شاشات العميل الداخل بس: بدون دخول تروح لشاشة الدخول (الخادم يرفض على كل حال، هذا للتجربة).
import { Redirect, Stack } from "expo-router";
import { useStore } from "@/data/store";
import { useTheme } from "@/theme/ThemeProvider";

export default function SignedInOnly() {
  const { state, ready } = useStore();
  const { colors } = useTheme();
  if (!ready) return null;
  if (!state.signedIn) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}
