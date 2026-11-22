// جدول الأدوار والصلاحيات: مين يقدر يسوي وش في المنصة. المرجع الوحيد للصلاحيات.
//
// الخادم يتحقق منه قبل أي إجراء (requirePermission في apps/api/src/auth.ts)، والتطبيق ولوحة
// الإدارة يعرضون الأزرار حسبه. والاختبارات (permissions.test.ts) تتأكد من كل دور × كل صلاحية.
//
// الأدوار مأخوذة من CLAUDE.md:
//   - المصنع، والمزوّد (قبل التوثيق وبعده).
//   - فريق الإدارة: خمسة أدوار هي **أنواع شغل، مو أشخاص**. الشخص الواحد ممكن يمسك أكثر من دور،
//     وفي البداية المالك يمسكها كلها.
//
// للتوسّع (سوق منتجات المصانع، المرحلة ٩): المصنع البائع ياخذ صلاحيات «البيع» فوق صلاحياته الحالية،
// بإضافة نوع جديد هنا، بدون ما نغيّر باقي الجدول.

export const STAFF_ROLES = ["owner", "general_manager", "verification", "support", "finance"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  // ─── المصنع (على مصنعه بس) ───
  "factory.profile.edit",
  "request.create",
  "request.view_own",
  "request.manage_own", // قبول عرض، والإلغاء، وتأكيد الاستلام، والبلاغ

  // ─── المزوّد (على نفسه بس) ───
  "provider.profile.edit",
  "provider.documents.upload",
  "provider.requests.view", // طلبات أقسامه ومناطقه: بعد التوثيق بس
  "provider.offers.submit", // بعد التوثيق بس
  "provider.work.update", // «بدأت التنفيذ» و«تم التنفيذ»: بعد التوثيق بس
  "provider.payouts.view",

  // ─── فريق الإدارة ───
  "admin.access", // يدخل لوحة الإدارة أصلًا
  "providers.view",
  "providers.verify", // يقبل أو يرفض المستندات مع السبب
  "providers.suspend",
  "requests.view_all",
  "requests.cancel_any",
  "disputes.manage",
  "notes.internal", // ملاحظات داخلية ما يشوفها العميل
  "tickets.manage",
  "invoices.view",
  "refunds.create", // لين الحد اللي يحدده المالك
  "refunds.approve_over_limit", // فوق الحد: المالك بس
  "payouts.manage",
  "reports.view",
  "reports.export", // تصدير الجداول إلى Excel
  "content.edit", // الأقسام، والنصوص، والأسئلة الشائعة، والرسائل
  "staff.manage", // إضافة موظفين وتحديد أدوارهم (ما عدا المدير العام)
  "staff.manage_general_manager", // إضافة مدير عام أو إزالته: المالك بس
  "audit.view",
  "settings.commission", // نسبة العمولة: المالك بس
  "settings.cancel_policy",
  "data.export_all", // تصدير كل بيانات المنصة: المالك بس
  "ownership.transfer", // نقل ملكية المنصة: المالك بس
  "owner.dashboard",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** من هو صاحب الطلب (يبنيه الخادم من الجلسة، والتطبيق من /me). */
export type Principal =
  | { kind: "factory" }
  | { kind: "provider"; verified: boolean }
  | { kind: "staff"; roles: StaffRole[] };

const FACTORY: Permission[] = ["factory.profile.edit", "request.create", "request.view_own", "request.manage_own"];

const PROVIDER_PENDING: Permission[] = ["provider.profile.edit", "provider.documents.upload"];
const PROVIDER_VERIFIED: Permission[] = [...PROVIDER_PENDING, "provider.requests.view", "provider.offers.submit", "provider.work.update", "provider.payouts.view"];

/** قرارات المالك فقط (CLAUDE.md، قسم «قرارات المالك فقط»). */
export const OWNER_ONLY: Permission[] = [
  "settings.commission",
  "staff.manage_general_manager",
  "refunds.approve_over_limit",
  "data.export_all",
  "ownership.transfer",
  "owner.dashboard",
];

const STAFF: Record<StaffRole, Permission[]> = {
  verification: ["admin.access", "providers.view", "providers.verify", "notes.internal"],
  support: ["admin.access", "providers.view", "requests.view_all", "requests.cancel_any", "disputes.manage", "notes.internal", "tickets.manage"],
  finance: ["admin.access", "requests.view_all", "notes.internal", "invoices.view", "refunds.create", "payouts.manage", "reports.view", "reports.export"],
  // المدير العام: كل صلاحيات الإدارة ما عدا قرارات المالك.
  general_manager: [],
  owner: [],
};
const ALL_STAFF = PERMISSIONS.filter((p) => !p.startsWith("factory.") && !p.startsWith("request.") && !p.startsWith("provider."));
STAFF.general_manager = ALL_STAFF.filter((p) => !OWNER_ONLY.includes(p));
STAFF.owner = [...ALL_STAFF];

/** كل صلاحيات صاحب الطلب. */
export function permissionsFor(p: Principal): Set<Permission> {
  switch (p.kind) {
    case "factory":
      return new Set(FACTORY);
    case "provider":
      return new Set(p.verified ? PROVIDER_VERIFIED : PROVIDER_PENDING);
    case "staff":
      return new Set(p.roles.flatMap((r) => STAFF[r]));
  }
}

export function can(p: Principal, permission: Permission): boolean {
  return permissionsFor(p).has(permission);
}

/** صلاحيات دور إداري واحد (لعرض الجدول في التوثيق ولوحة الإدارة). */
export function staffRolePermissions(role: StaffRole): Permission[] {
  return [...STAFF[role]];
}
