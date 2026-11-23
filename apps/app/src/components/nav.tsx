// التنقّل حسب المقاس: في الجوال تبويبات تحت (من expo-router)، وفي التابلت والكمبيوتر قائمة جانبية.
// القائمة أول عنصر في صف، والصف يتبع اتجاه اللغة: على اليمين في العربي، وعلى اليسار في الإنجليزي.
import { layout, radius, spacing } from "@mazood/brand";
import { router, usePathname, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { Category, IconComponent } from "@/data/categories";
import { DOC_LABELS } from "@/data/labels";
import type { NextStep } from "@/lib/next-step";
import { CategoryIcon } from "./CategoryIcon";
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
  IconLayoutDashboard,
  IconBuildingFactory2,
  IconFlag,
  IconUserX,
  IconChartBar,
  IconSettings,
  IconKey,
  IconBell,
  IconChevronLeft,
  IconChevronRight,
  IconLanguage,
  IconMoon,
  IconSun,
} from "./icons";
import type { DocType } from "@mazood/shared";

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
export function NavShell({ items, children, ...extras }: SidebarExtras & { items: NavItem[]; children: ReactNode }) {
  const { sidebar } = useLayout();
  if (!sidebar || items.length === 0) return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <Sidebar items={items} {...extras} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** الإضافات الاختيارية في القائمة الجانبية (docs/plans/design-phase.md، القسم ٢). */
export type SidebarExtras = {
  /** إجراء سريع تحت الشعار (مثل «طلب جديد» للعميل). */
  action?: ReactNode;
  /** بطاقة «خطوتك الجاية»: تطلع بس إذا فيه شي ينتظر. */
  next?: NextStep | null;
  /** قائمة الأقسام: كل الأقسام للعميل، وأقسام المزوّد بس للمزوّد. */
  categories?: { category: Category; onPress: () => void }[];
  /** أدوات تحت: المساعدة واللغة والمظهر. */
  tools?: ReactNode;
  /** بطاقة الحساب مع الخروج. */
  footer?: ReactNode;
};

/**
 * القائمة الجانبية، بالترتيب: الشعار، والإجراء، وبطاقة «خطوتك الجاية»، والروابط مع أرقام اللي ينتظر،
 * والأقسام، وتحت: الأدوات وبطاقة الحساب. الروابط تبقى فوق عشان «طلباتي» تبان من أول نظرة.
 */
export function Sidebar({ items, action, next, categories, tools, footer }: SidebarExtras & { items: NavItem[] }) {
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
        {action && <View style={{ paddingBottom: spacing["3"] }}>{action}</View>}
        {next && (
          <View style={{ paddingBottom: spacing["3"] }}>
            <NextStepCard step={next} />
          </View>
        )}
        {items.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(pathname, item)} />
        ))}
        {!!categories?.length && (
          <View style={{ paddingTop: spacing["4"], gap: 2 }}>
            <AppText variant="caption" weight={600} color="inkMuted" style={{ paddingHorizontal: spacing["2"], paddingBottom: spacing["1"] }}>
              {t("categories")}
            </AppText>
            {categories.map(({ category, onPress }) => (
              <SidebarCategory key={category.id} category={category} onPress={onPress} />
            ))}
          </View>
        )}
      </ScrollView>
      {/* الأدوات وبطاقة الحساب ثابتة تحت دائمًا، والجزء اللي فوقها يتمرّر لو ما كفّت الشاشة. */}
      {(tools || footer) && (
        <View style={{ padding: spacing["4"], paddingTop: spacing["3"], gap: spacing["2"], borderTopWidth: 1, borderTopColor: colors.line }}>
          {tools}
          {footer}
        </View>
      )}
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

/** نص بطاقة «خطوتك الجاية» حسب نوعها. */
function nextStepText(step: NextStep, t: (k: StringKey, v?: Record<string, string>) => string, tl: (l: { ar: string; en: string }) => string, num: (n: number) => string) {
  switch (step.kind) {
    case "completeProfile":
      return { title: t("nextCompleteProfile"), hint: t("nextCompleteProfileHint") };
    case "offers":
      return { title: t("nextOffers", { n: num(step.count) }), hint: t("nextOffersHint") };
    case "docExpired":
      return { title: t("nextDocExpired", { doc: tl(DOC_LABELS[step.docType as DocType]) }), hint: t("nextDocExpiredHint") };
    case "docExpiring": {
      const doc = tl(DOC_LABELS[step.docType as DocType]);
      return { title: step.daysLeft === 0 ? t("nextDocExpiringToday", { doc }) : t("nextDocExpiring", { doc, n: num(step.daysLeft) }), hint: t("nextDocExpiringHint") };
    }
    case "newRequests":
      return { title: t("nextNewRequests", { n: num(step.count) }), hint: t("nextNewRequestsHint") };
  }
}

/** بطاقة «خطوتك الجاية»: خلفية accentSoft (تنبيه، مو زر كهرماني)، والضغط يوديه للشاشة اللي فيها الشي. */
function NextStepCard({ step }: { step: NextStep }) {
  const { colors } = useTheme();
  const { t, tl, num, isRTL } = useI18n();
  const { title, hint } = nextStepText(step, t, tl, num);
  const Forward = isRTL ? IconChevronLeft : IconChevronRight;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${t("nextStepTitle")}: ${title}. ${hint}`}
      onPress={() => router.navigate(step.href)}
      style={(state) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing["3"],
          padding: spacing["3"],
          borderRadius: radius.md,
          backgroundColor: colors.accentSoft,
          opacity: state.pressed ? 0.85 : 1,
        },
        focusRing(state, colors),
      ]}
    >
      <IconBell size={20} color={colors.onAccentSoft} strokeWidth={1.75} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText variant="caption" weight={600} style={{ color: colors.onAccentSoft }}>
          {t("nextStepTitle")}
        </AppText>
        <AppText variant="label" weight={700} style={{ color: colors.onAccentSoft }}>
          {title}
        </AppText>
        <AppText variant="caption" style={{ color: colors.onAccentSoft }}>
          {hint}
        </AppText>
      </View>
      <Forward size={18} color={colors.onAccentSoft} strokeWidth={1.75} />
    </Pressable>
  );
}

/** صف قسم في القائمة: دائرة القسم بلونه مع الاسم. ارتفاعه ٣٦ (حسب الخطة) ومساحة اللمس ٤٤ بالـhitSlop. */
function SidebarCategory({ category, onPress }: { category: Category; onPress: () => void }) {
  const { colors } = useTheme();
  const { tl } = useI18n();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={tl(category.name)}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={(state) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing["3"],
          minHeight: 36,
          paddingHorizontal: spacing["2"],
          borderRadius: radius.md,
          backgroundColor: (state as { hovered?: boolean }).hovered ? colors.line : "transparent",
        },
        focusRing(state, colors),
      ]}
    >
      <CategoryIcon category={category} size={26} />
      <AppText variant="label" weight={500} color="ink" numberOfLines={1} style={{ flex: 1 }}>
        {tl(category.name)}
      </AppText>
    </Pressable>
  );
}

/** زر صغير في أدوات القائمة (مساعدة، اللغة، المظهر). */
export function SidebarTool({ icon: Icon, label, accessibilityLabel, onPress }: { icon: IconComponent; label: string; accessibilityLabel?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={(state) => [
        {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing["2"],
          minHeight: layout.touchMin,
          paddingHorizontal: spacing["2"],
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: (state as { hovered?: boolean }).hovered ? colors.lineStrong : colors.line,
        },
        focusRing(state, colors),
      ]}
    >
      <Icon size={18} color={colors.inkMuted} strokeWidth={1.75} />
      <AppText variant="caption" weight={500} color="ink" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * أدوات القائمة: أي زر إضافي (مثل «مساعدة») في صف لحاله، وتحته اللغة والمظهر جنب بعض.
 * المظهر يتبدّل بين الفاتح والداكن حسب الظاهر الحين.
 */
export function LanguageThemeTools({ children }: { children?: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const { name, setMode } = useTheme();
  const target = name === "dark" ? "light" : "dark";
  const targetLabel = t(target === "dark" ? "themeDark" : "themeLight");
  return (
    <View style={{ gap: spacing["2"] }}>
      {children && <View style={{ flexDirection: "row" }}>{children}</View>}
      <View style={{ flexDirection: "row", gap: spacing["2"] }}>
      <SidebarTool icon={IconLanguage} label={t("langToggle")} accessibilityLabel={t("langToggleLabel")} onPress={() => setLocale(locale === "ar" ? "en" : "ar")} />
        <SidebarTool
          icon={target === "dark" ? IconMoon : IconSun}
          label={targetLabel}
          accessibilityLabel={t("themeToggleLabel", { mode: targetLabel })}
          onPress={() => setMode(target)}
        />
      </View>
    </View>
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
      // كل قسم يظهر بس لو الدور له صلاحيته (والخادم يفحص كل طلب بنفسه). الترتيب: الشغل اليومي أول، والإعدادات آخر.
      { href: "/admin", label: t("navOverview"), icon: IconLayoutDashboard },
      ...(allowed("providers.view") || allowed("sellers.review")
        ? [{ href: "/admin/verification" as const, label: t("navVerification"), icon: IconShieldCheck, also: ["/admin/provider", "/admin/seller"] }]
        : []),
      ...(allowed("customers.view") ? [{ href: "/admin/customers" as const, label: t("navCustomers"), icon: IconBuildingFactory2, also: ["/admin/customer"] }] : []),
      ...(allowed("disputes.manage") ? [{ href: "/admin/disputes" as const, label: t("navDisputes"), icon: IconFlag, also: ["/admin/dispute"] }] : []),
      ...(allowed("market.moderate") || allowed("subscriptions.manage")
        ? [{ href: "/admin/market" as const, label: t("navMarketAdmin"), icon: IconBuildingStore }]
        : []),
      ...(allowed("accounts.delete") ? [{ href: "/admin/deletions" as const, label: t("navDeletions"), icon: IconUserX }] : []),
      ...(allowed("reports.view") ? [{ href: "/admin/stats" as const, label: t("navStats"), icon: IconChartBar }] : []),
      ...(allowed("staff.manage") ? [{ href: "/admin/staff" as const, label: t("staffTitle"), icon: IconUsers }] : []),
      ...(allowed("settings.manage") ? [{ href: "/admin/settings" as const, label: t("navSettings"), icon: IconSettings }] : []),
      ...(allowed("permissions.manage") ? [{ href: "/admin/permissions" as const, label: t("navPermissions"), icon: IconKey }] : []),
      ...(allowed("audit.view") ? [{ href: "/admin/audit" as const, label: t("auditTitle"), icon: IconHistory }] : []),
    ];
  return [];
}

/** بطاقة الحساب أسفل القائمة الجانبية: الاسم ونوع الحساب، وزر الخروج. */
export function AccountCard({ title, subtitle, onSignOut }: { title: string; subtitle: string; onSignOut: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing["2"], padding: spacing["3"], borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceRaised }}>
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
