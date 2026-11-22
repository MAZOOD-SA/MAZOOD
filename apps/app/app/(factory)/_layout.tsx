// شاشات المصنع كلها (التبويبات، وتفاصيل الطلب، والفاتورة، والإعدادات): للمصنع الداخل بس.
// في التابلت والكمبيوتر تبقى القائمة الجانبية ثابتة وأنت تتنقّل بين الشاشات.
import { Redirect, Stack } from "expo-router";
import { NavShell } from "@/components/nav";
import { useStore } from "@/data/store";
import { homeRouteFor } from "@/lib/home-route";
import { FACTORY_NAV, settingsItem } from "@/lib/nav";
import { useTheme } from "@/theme/ThemeProvider";

export default function FactoryLayout() {
  const { colors } = useTheme();
  const { state, ready, role } = useStore();

  if (!ready) return null;
  if (!state.signedIn) return <Redirect href="/login" />;
  // المزوّد والموظف يروحون لشاشاتهم.
  if (role && role !== "factory") return <Redirect href={homeRouteFor(role)} />;

  const unread = state.notifications.filter((n) => !n.read).length;
  return (
    <NavShell items={FACTORY_NAV} footerItems={[settingsItem("/settings")]} badges={{ notifications: unread }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
    </NavShell>
  );
}
