// التنقّل حسب المقاس: في الجوال تبويبات تحت (من expo-router)، وفي التابلت والكمبيوتر قائمة جانبية.
// القائمة أول عنصر في صف، والصف يتبع اتجاه اللغة: على اليمين في العربي، وعلى اليسار في الإنجليزي.
import { layout, radius, spacing } from "@mazood/brand";
import { router, usePathname, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { IconComponent } from "@/data/categories";
import { useLayout } from "@/lib/layout";
import { useTheme } from "@/theme/ThemeProvider";
import { LogoMark } from "./Logo";
import { AppText, focusRing } from "./ui";
import { useI18n } from "@/i18n/I18nProvider";
import type { StringKey } from "@/i18n/strings";
import type { Permission } from "@mazood/shared";
import {
  IconBriefcase,
  IconBuildingStore,
  IconShoppingBag,
  IconClipboardList,
  IconFileInvoice,
  IconHistory,
  IconHome,
  IconListDetails,
  IconLogout,
  IconShieldCheck,
  IconUser,
  IconUsers,
} from "./icons";

export type NavItem = {
  href: Href & string;
  label: string;
  icon: IconComponent;
  /** مسارات ثانية تخلّي العنصر مختار (مثل تفاصيل الطلب تحت «طلباتي»). */
  also?: string[];
  /** رقم صغير جنب العنصر (مثل عدد العروض الجديدة). */
  badge?: number;
};

export function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  // المسارات الإضافية: «/provider» يطابق نفسه بس، والباقي يطابق اللي تحته (مثل /request/123).
  return (item.also ?? []).some((p) => pathname === p || (p !== "/provider" && pathname.startsWith(`${p}/`)));
}

/** الغلاف: قائمة جانبية + المحتوى في التابلت والكمبيوتر، والمحتوى بس في الجوال. */
export function NavShell({ items, action, footer, children }: { items: NavItem[]; action?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const { sidebar } = useLayout();
  if (!sidebar || items.length === 0) return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <Sidebar items={items} action={action} footer={footer} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/**
 * القائمة الجانبية: الشعار، وإجراء سريع (مثل «طلب جديد» للمصنع)، والروابط مع أرقام اللي ينتظر
 * (مثل العروض الجديدة)، وبطاقة الحساب تحت مع الخروج.
 */
export function Sidebar({ items, action, footer }: { items: NavItem[]; action?: ReactNode; footer?: ReactNode }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <View
      accessibilityRole="menu"
      style={{ width: layout.sidebar, backgroundColor: colors.surfaceAlt, borderEndWidth: 1, borderEndColor: colors.line }}
    >
      <ScrollView contentContainerStyle={{ padding: spacing["4"], gap: spacing["1"], flexGrow: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"], paddingBottom: spacing["4"], paddingHorizontal: spacing["2"] }}>
          <LogoMark size={30} />
          <AppText variant="h2" weight={700}>
            {t("appName")}
          </AppText>
        </View>
        {action && <View style={{ paddingBottom: spacing["4"] }}>{action}</View>}
        {items.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(pathname, item)} />
        ))}
        {footer && <View style={{ marginTop: "auto", paddingTop: spacing["4"] }}>{footer}</View>}
      </ScrollView>
    </View>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const { colors } = useTheme();
  const { num } = useI18n();
  const Icon = item.icon;
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      onPress={() => router.navigate(item.href)}
      style={(state) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing["3"],
          minHeight: layout.touchMin,
          paddingHorizontal: spacing["3"],
          borderRadius: radius.md,
          backgroundColor: active ? colors.surface : (state as { hovered?: boolean }).hovered ? colors.line : "transparent",
          borderWidth: 1,
          borderColor: active ? colors.line : "transparent",
        },
        focusRing(state, colors),
      ]}
    >
      <Icon size={20} color={active ? colors.ink : colors.inkMuted} strokeWidth={1.75} />
      <AppText variant="label" weight={active ? 600 : 500} color={active ? "ink" : "inkMuted"} style={{ flex: 1 }}>
        {item.label}
      </AppText>
      {!!item.badge && (
        <View style={{ minWidth: 22, paddingHorizontal: spacing["1"], borderRadius: radius.full, backgroundColor: colors.accent, alignItems: "center" }}>
          <AppText variant="caption" weight={700} color="onAccent">
            {num(item.badge)}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/**
 * عناصر القائمة لكل نوع حساب. مكان واحد: التبويبات في الجوال والقائمة الجانبية في الكمبيوتر
 * تاخذ من هنا، فما يختلف الترتيب بين الجهازين.
 */
export function navItemsFor(
  role: "factory" | "provider" | "staff" | null,
  t: (k: StringKey) => string,
  allowed: (p: Permission) => boolean,
  counts: { newOffers?: number; seller?: boolean } = {},
): NavItem[] {
  if (role === "factory")
    return [
      { href: "/home", label: t("tabHome"), icon: IconHome, also: ["/request/new", "/notifications"] },
      { href: "/requests", label: t("tabRequests"), icon: IconClipboardList, also: ["/request", "/purchase"], badge: counts.newOffers },
      { href: "/shop", label: t("tabMarket"), icon: IconShoppingBag, also: ["/market"] },
      ...(counts.seller ? [{ href: "/store" as const, label: t("tabStore"), icon: IconBuildingStore, also: ["/seller"] }] : []),
      { href: "/account", label: t("tabAccount"), icon: IconUser, also: ["/factory-profile", "/invoices", "/invoice"] },
    ];
  if (role === "provider")
    return [
      { href: "/provider/requests", label: t("tabAvailable"), icon: IconListDetails, also: ["/provider/request"] },
      { href: "/provider/work", label: t("tabWork"), icon: IconBriefcase, also: ["/provider/job"] },
      { href: "/provider/account", label: t("tabAccount"), icon: IconUser, also: ["/provider/profile", "/provider/upload", "/provider"] },
    ];
  if (role === "staff")
    return [
      { href: "/admin", label: t("navVerification"), icon: IconShieldCheck, also: ["/admin/provider"] },
      ...(allowed("staff.manage") ? [{ href: "/admin/staff" as const, label: t("staffTitle"), icon: IconUsers }] : []),
      ...(allowed("audit.view") ? [{ href: "/admin/audit" as const, label: t("auditTitle"), icon: IconHistory }] : []),
    ];
  return [];
}

/** بطاقة الحساب أسفل القائمة الجانبية: الاسم ونوع الحساب، وزر الخروج. */
export function AccountCard({ title, subtitle, onSignOut }: { title: string; subtitle: string; onSignOut: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"], padding: spacing["3"], borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
        <IconUser size={18} color={colors.inkMuted} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" color="inkMuted" numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("signOut")}
        onPress={onSignOut}
        style={(state) => [{ minWidth: layout.touchMin, minHeight: layout.touchMin, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, focusRing(state, colors)]}
      >
        <IconLogout size={20} color={colors.inkMuted} strokeWidth={1.75} />
      </Pressable>
    </View>
  );
}
