// شاشات المزوّد: للمزوّد الداخل بس. أي نوع حساب ثاني يرجع لشاشاته.
import { Redirect, Stack } from "expo-router";
import { useStore } from "@/data/store";
import { homeRouteFor } from "@/lib/home-route";
import { useTheme } from "@/theme/ThemeProvider";

export default function ProviderLayout() {
  const { state, ready, role } = useStore();
  const { colors } = useTheme();
  if (!ready) return null;
  if (!state.signedIn) return <Redirect href={{ pathname: "/login", params: { as: "provider" } }} />;
  if (role !== "provider") return <Redirect href={homeRouteFor(role)} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}
