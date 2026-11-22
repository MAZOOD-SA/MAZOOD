// لوحة الإدارة (/admin): لموظفين الإدارة الفعّالين بس. الصلاحيات الفعلية تُفحص في الخادم لكل طلب.
import { Redirect, Stack } from "expo-router";
import { useStore } from "@/data/store";
import { homeRouteFor } from "@/lib/home-route";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminLayout() {
  const { state, ready, role } = useStore();
  const { colors } = useTheme();
  if (!ready) return null;
  if (!state.signedIn) return <Redirect href="/login" />;
  if (role !== "staff") return <Redirect href={homeRouteFor(role)} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}
