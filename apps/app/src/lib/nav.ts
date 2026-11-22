// عناصر التنقّل لكل نوع مستخدم، في مكان واحد.
// نفس العناصر تطلع تبويبات تحت في الجوال، وقائمة جانبية في التابلت والكمبيوتر.
import type { Permission } from "@mazood/shared";
import {
  IconBell,
  IconClipboardList,
  IconFileInvoice,
  IconHistory,
  IconHome,
  IconSettings,
  IconShieldCheck,
  IconUser,
  IconUsers,
} from "@/components/icons";
import type { IconComponent } from "@/data/categories";
import type { StringKey } from "@/i18n/strings";

export type NavItem = {
  key: string;
  href: string;
  label: StringKey;
  icon: IconComponent;
  /** مسارات ثانية يكون فيها العنصر هو المحدد، مثل تفاصيل الطلب تحت «طلباتي». */
  alsoActiveOn?: string[];
  /** للإدارة: العنصر يظهر بس لمن عنده الصلاحية. */
  permission?: Permission;
};

/** المصنع: خمس تبويبات، مثل التطبيقات الحكومية اللي تعوّد عليها الناس. */
export const FACTORY_NAV: NavItem[] = [
  { key: "home", href: "/home", label: "tabHome", icon: IconHome, alsoActiveOn: ["/request/new"] },
  { key: "requests", href: "/requests", label: "tabRequests", icon: IconClipboardList, alsoActiveOn: ["/request"] },
  { key: "notifications", href: "/notifications", label: "tabNotifications", icon: IconBell },
  { key: "invoices", href: "/invoices", label: "tabInvoices", icon: IconFileInvoice, alsoActiveOn: ["/invoice"] },
  { key: "account", href: "/account", label: "tabAccount", icon: IconUser, alsoActiveOn: ["/factory-profile"] },
];

/** المزوّد: الرئيسية للحين. «الطلبات المتاحة» و«شغلي» ينضافون مع شاشاتهم (الخطوة ١١، الجزء ج). */
export const PROVIDER_NAV: NavItem[] = [
  { key: "home", href: "/provider", label: "navProviderHome", icon: IconHome, alsoActiveOn: ["/provider/profile", "/provider/upload"] },
];

export const ADMIN_NAV: NavItem[] = [
  { key: "queue", href: "/admin", label: "adminTitle", icon: IconShieldCheck, alsoActiveOn: ["/admin/provider"] },
  { key: "staff", href: "/admin/staff", label: "staffTitle", icon: IconUsers, permission: "staff.manage" },
  { key: "audit", href: "/admin/audit", label: "auditTitle", icon: IconHistory, permission: "audit.view" },
];

/** الإعدادات: في أسفل القائمة الجانبية، وفي الجوال من زر الترس في «حسابي». */
export function settingsItem(href: string): NavItem {
  return { key: "settings", href, label: "settingsTitle", icon: IconSettings };
}

function matches(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(path.endsWith("/") ? path : `${path}/`);
}

/**
 * أي عنصر محدد في المسار الحالي. الأدق يفوز: «/admin/staff» يحدد «الموظفين» مو «التوثيق».
 */
export function activeKey(pathname: string, items: NavItem[]): string | null {
  let best: { key: string; len: number } | null = null;
  for (const item of items) {
    for (const path of [item.href, ...(item.alsoActiveOn ?? [])]) {
      if (matches(pathname, path) && (!best || path.length > best.len)) best = { key: item.key, len: path.length };
    }
  }
  return best?.key ?? null;
}
