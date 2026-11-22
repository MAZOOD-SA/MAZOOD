// لوحة الإدارة (/admin): لموظفين الإدارة الفعّالين بس. الصلاحيات الفعلية تُفحص في الخادم لكل طلب.
import { Redirect, Stack } from "expo-router";
import { NavShell } from "@/components/nav";
import { useCan } from "@/data/useAdmin";
import { useStore } from "@/data/store";
import { homeRouteFor } from "@/lib/home-route";
import { ADMIN_NAV, settingsItem } from "@/lib/nav";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminLayout() {
  const { state, ready, role } = useStore();
  const { colors } = useTheme();
  const allowed = useCan();
  if (!ready) return null;
  if (!state.signedIn) return <Redirect href="/login" />;
  if (role !== "staff") return <Redirect href={homeRouteFor(role)} />;
  // كل موظف يشوف في القائمة الأقسام اللي تسمح بها صلاحياته بس (والخادم يفحص كل طلب بنفسه).
  const items = ADMIN_NAV.filter((i) => !i.permission || allowed(i.permission));
  return (
    <NavShell items={items} footerItems={[settingsItem("/admin/settings")]}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
    </NavShell>
  );
}
