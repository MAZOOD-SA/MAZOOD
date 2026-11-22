// إعطاء أدوار الإدارة. في المرحلة ٣ تصير من لوحة الإدارة (المالك والمدير العام).
// الحين تُستخدم من أداة سطر الأوامر لتأسيس أول مالك للمنصة (scripts/grant-staff.ts).
import { normalizeSaudiMobile, STAFF_ROLES, type StaffRole } from "@mazood/shared";
import { audit } from "./audit";
import type { Db } from "./db";

export async function grantStaffRole(db: Db, phoneInput: string, role: StaffRole, grantedById: string | null = null) {
  const phone = normalizeSaudiMobile(phoneInput);
  if (!phone) throw new Error("رقم الجوال غير صحيح");
  if (!STAFF_ROLES.includes(role)) throw new Error(`الدور غير معروف: ${role}`);

  const existing = await db.user.findUnique({ where: { phone } });
  // حساب الموظف منفصل عن حسابات العملاء: رقم مستخدم كمصنع أو مزوّد ما يصير موظف.
  if (existing && existing.role !== "staff") {
    throw new Error("هذا الرقم مسجّل كمصنع أو مزوّد. استخدم رقمًا مخصصًا لحساب الموظف.");
  }
  const user = existing ?? (await db.user.create({ data: { phone, role: "staff" } }));
  await db.staffMember.upsert({
    where: { userId_role: { userId: user.id, role } },
    create: { userId: user.id, role, grantedById },
    update: {},
  });
  await audit(db, { actorUserId: grantedById, action: "staff.role_granted", entityType: "user", entityId: user.id, metadata: { role, via: grantedById ? "admin" : "cli" } });
  return user;
}
