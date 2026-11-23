// أدوار فريق الإدارة وصلاحياتها (حسب جدول «جاهزية فريق الإدارة» في CLAUDE.md).
// الخادم هو اللي يطبّق الصلاحيات. الواجهة تستخدم نفس الجدول بس عشان تخفي الأزرار اللي ما تخصك.
import { z } from "zod";
import { phoneSchema } from "./schemas.ts";

export const STAFF_ROLES = ["owner", "general_manager", "verification", "support", "finance"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = {
  /** يشوف قائمة التوثيق ويراجع المستندات ويوثّق أو يرفض */
  "providers.review": ["owner", "general_manager", "verification"],
  /** يشوف قائمة المزوّدين (بدون المستندات) */
  "providers.view": ["owner", "general_manager", "verification", "support"],
  /** يوقف مزوّد مخالف أو يرجّعه */
  "providers.suspend": ["owner", "general_manager"],
  /** يفتح ملفات المستندات (الهويات والسجلات) */
  "documents.view": ["owner", "general_manager", "verification"],
  /** يضيف موظفين ويوقفهم (المدير العام ما يقدر يضيف أو يوقف مدير عام: هذا قرار المالك) */
  "staff.manage": ["owner", "general_manager"],
  /** يتابع البلاغات: يقرأها، ويكتب ملاحظات (منها الداخلية)، ويقرر فيها (المرحلة ٤، نسخة أولى) */
  "disputes.manage": ["owner", "general_manager", "support"],
  /** يشوف العملاء (المنشآت والأفراد) وبياناتهم، بدون رقم الهوية كامل (القرار ٤١) */
  "customers.view": ["owner", "general_manager", "verification", "support"],
  /** يشوف رقم هوية الفرد كامل (الاطلاع ينكتب في السجل)، ويأكّد الهوية يدويًا لين يجهز نفاذ */
  "customers.identity": ["owner", "general_manager", "verification"],
  /** يراجع سجل المصنع البائع ويوثّقه أو يرفضه (سوق المنتجات) */
  "sellers.review": ["owner", "general_manager", "verification"],
  /** يخفي منتج مخالف مع السبب، أو يرجّعه */
  "market.moderate": ["owner", "general_manager", "support"],
  /** يسجّل دفعات الاشتراك ويشوف الاشتراكات */
  "subscriptions.manage": ["owner", "general_manager", "finance"],
  /** يعدّل سعر الباقات وحدودها */
  "plans.manage": ["owner", "general_manager"],
  /** يشوف أرقام السوق والاشتراكات شهر بشهر */
  "market.reports": ["owner", "general_manager", "finance"],
  /** يشوف سجل الإجراءات */
  "audit.view": ["owner", "general_manager"],
  /** ينفّذ طلب حذف الحساب أو يرفضه */
  "accounts.delete": ["owner", "general_manager"],
  /** يعدّل إعدادات المنصة من اللوحة (ما عدا العمولة) */
  "settings.manage": ["owner", "general_manager"],
  /** يغيّر نسبة العمولة: قرار المالك بس (CLAUDE.md). مقفولة: ما تتغيّر من شاشة الصلاحيات */
  "settings.commission": ["owner"],
  /** يغيّر صلاحيات الأدوار من اللوحة. مقفولة للمالك */
  "permissions.manage": ["owner"],
  /** يشوف أرقام المنصة شهر بشهر (الخدمات والسوق). قرار المالك: الثلاثة الحين، وقابل للتغيير */
  "reports.view": ["owner", "general_manager", "finance"],
} as const satisfies Record<string, readonly StaffRole[]>;
export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/**
 * صلاحيات ما تتغيّر من شاشة الصلاحيات أبدًا: قرارات المالك (CLAUDE.md). تبقى على الجدول فوق.
 * staff.manage مقفولة بعد، لأن إضافة مدير عام وإزالته قرار المالك (canManageRole تحت).
 */
export const LOCKED_PERMISSIONS: readonly Permission[] = ["settings.commission", "permissions.manage", "staff.manage"];

/** جدول الصلاحيات الفعلي: مين له كل صلاحية. يبدأ من PERMISSIONS ويتعدّل بإعداد rolePermissions. */
export type PermissionMap = Record<Permission, readonly StaffRole[]>;

/** تعديلات المالك على الجدول (من شاشة الصلاحيات). أي صلاحية ما تنذكر تبقى على الافتراضي. */
export const rolePermissionsSchema = z
  .record(z.string(), z.array(z.enum(STAFF_ROLES)).max(STAFF_ROLES.length))
  .refine((o) => Object.keys(o).every((k) => (PERMISSION_KEYS as string[]).includes(k)), { message: "permission_unknown" });
export type RolePermissions = Partial<Record<Permission, StaffRole[]>>;

/**
 * يركّب الجدول الفعلي: الافتراضي + تعديلات المالك. القواعد الثابتة:
 * - المالك عنده كل صلاحية دائمًا (ما ينشال منه شي).
 * - الصلاحيات المقفولة (LOCKED_PERMISSIONS) تبقى على الافتراضي مهما كان المحفوظ.
 */
export function resolvePermissions(overrides: RolePermissions | null | undefined): PermissionMap {
  const out = {} as Record<Permission, StaffRole[]>;
  for (const p of PERMISSION_KEYS) {
    const custom = overrides?.[p];
    const base = (LOCKED_PERMISSIONS.includes(p) || !custom ? PERMISSIONS[p] : custom) as readonly StaffRole[];
    out[p] = STAFF_ROLES.filter((r) => r === "owner" || base.includes(r));
  }
  return out;
}

export const DEFAULT_PERMISSION_MAP: PermissionMap = resolvePermissions(null);

/** هل الدور عنده الصلاحية؟ بدون جدول: الافتراضي. الخادم يمرّر الجدول الفعلي من الإعدادات. */
export function can(role: StaffRole | null | undefined, permission: Permission, map: PermissionMap = DEFAULT_PERMISSION_MAP): boolean {
  return !!role && map[permission].includes(role);
}

/** صلاحيات دور معيّن كقائمة (للواجهة: تخفي اللي ما يخصك). */
export function permissionsOf(role: StaffRole, map: PermissionMap = DEFAULT_PERMISSION_MAP): Permission[] {
  return PERMISSION_KEYS.filter((p) => map[p].includes(role));
}

/** مين يقدر يضيف أو يوقف أي دور. المالك ما يُضاف من اللوحة (نقل الملكية له خطوات خاصة). */
export function canManageRole(actor: StaffRole, target: StaffRole): boolean {
  if (target === "owner") return false;
  if (target === "general_manager") return actor === "owner";
  return actor === "owner" || actor === "general_manager";
}

export const addStaffBody = z
  .object({ phone: phoneSchema, role: z.enum(STAFF_ROLES), name: z.string().trim().min(2).max(80) })
  .strict();
