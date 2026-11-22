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
  /** يشوف سجل الإجراءات */
  "audit.view": ["owner", "general_manager"],
} as const satisfies Record<string, readonly StaffRole[]>;
export type Permission = keyof typeof PERMISSIONS;

export function can(role: StaffRole | null | undefined, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly string[]).includes(role);
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
